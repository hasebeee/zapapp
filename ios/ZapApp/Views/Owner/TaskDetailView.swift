import SwiftUI

struct TaskDetailView: View {
    let task: AppTask
    var onUpdate: (() -> Void)? = nil

    @State private var currentTask: AppTask
    @State private var latestZapRequest: ZapRequest? = nil
    @State private var isLoading: Bool = false
    @State private var isAcking: Bool = false
    @State private var isSelfCompleting: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showSelfCompleteAlert: Bool = false
    @State private var showSuccessMessage: String? = nil

    init(task: AppTask, onUpdate: (() -> Void)? = nil) {
        self.task = task
        self.onUpdate = onUpdate
        self._currentTask = State(initialValue: task)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {

                // MARK: タスク情報カード
                taskInfoCard

                // MARK: ZapRequest 情報（最新）
                if let zapRequest = latestZapRequest {
                    zapRequestCard(zapRequest)
                }

                // MARK: アクションボタン
                actionButtons

                Spacer()
            }
            .padding()
        }
        .navigationTitle("タスク詳細")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await refreshTask() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .alert("エラー", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: {
            Text(errorMessage ?? "")
        })
        .alert("完了自己申告", isPresented: $showSelfCompleteAlert, actions: {
            Button("申告する", role: .destructive) {
                Task { await selfComplete() }
            }
            Button("キャンセル", role: .cancel) {}
        }, message: {
            Text("本当にタスクを完了済みとして申告しますか？\nZap は送信されなくなります。")
        })
        .task {
            await refreshTask()
        }
    }

    // MARK: - Subviews

    private var taskInfoCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(currentTask.title)
                .font(.title2.bold())

            Divider()

            InfoRow(label: "ステータス", value: currentTask.status.label)
            InfoRow(label: "締切", value: currentTask.dueAt.formatted(
                .dateTime.year().month().day().hour().minute()
            ))
            InfoRow(label: "作成日", value: currentTask.createdAt.formatted(
                .dateTime.year().month().day()
            ))
            if let closedAt = currentTask.closedAt {
                InfoRow(label: "完了日", value: closedAt.formatted(
                    .dateTime.year().month().day().hour().minute()
                ))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func zapRequestCard(_ zapRequest: ZapRequest) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最新の Zap リクエスト")
                .font(.headline)

            Divider()

            InfoRow(label: "ステータス", value: zapRequestStatusLabel(zapRequest.status))
            InfoRow(label: "試行回数", value: "\(zapRequest.attemptedZaps) 回")
            InfoRow(label: "成功回数", value: "\(zapRequest.succeededZaps) 回")

            if zapRequest.status == .notStarted {
                VStack(alignment: .leading, spacing: 4) {
                    Text("送信できませんでした")
                        .font(.subheadline.bold())
                        .foregroundStyle(.orange)
                    Text("Pavlok連携が未設定か、Pavlok APIへの送信に失敗した可能性があります。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 4)
            }

            // ACK 締切（waitingAck の場合）
            if currentTask.status == .waitingAck {
                let remaining = zapRequest.ackDeadlineAt.timeIntervalSinceNow
                if remaining > 0 {
                    HStack {
                        Image(systemName: "timer")
                        Text("ACK 締切まで ")
                        + Text(zapRequest.ackDeadlineAt, style: .relative)
                    }
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
            }

            if let errMsg = zapRequest.lastErrorMessage {
                Text("エラー: \(errMsg)")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            // ACK ボタン（waitingAck の時のみ）
            if currentTask.status == .waitingAck {
                Button {
                    Task { await ackRequest() }
                } label: {
                    HStack {
                        if isAcking {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "checkmark.circle.fill")
                        }
                        Text("受けました（ACK）")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
                .disabled(isAcking)
            }

            // 完了自己申告ボタン（readyToZap / readyToReZap / waitingAck の時）
            if [.readyToZap, .readyToReZap, .waitingAck].contains(currentTask.status) {
                Button {
                    showSelfCompleteAlert = true
                } label: {
                    HStack {
                        if isSelfCompleting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "flag.checkered")
                        }
                        Text("完了自己申告")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(isSelfCompleting)
            }
        }
    }

    // MARK: - Helpers

    private func zapRequestStatusLabel(_ status: ZapRequestStatus) -> String {
        switch status {
        case .created:      return "実行待ち"
        case .executed:     return "実行済み"
        case .notStarted:   return "未開始"
        case .acknowledged: return "受領済み"
        case .expired:      return "期限切れ"
        }
    }

    // MARK: - Actions

    private func refreshTask() async {
        isLoading = true
        defer { isLoading = false }

        async let taskResult = APIClient.shared.getTask(taskId: currentTask.id)
        async let zapResult = APIClient.shared.getLatestZapRequest(taskId: currentTask.id)

        do {
            currentTask = try await taskResult
        } catch {
            // タスク取得失敗は無視しない
            errorMessage = error.localizedDescription
        }

        do {
            latestZapRequest = try await zapResult
        } catch {
            // ZapRequest がまだない場合はエラーを無視
            latestZapRequest = nil
        }
    }

    private func ackRequest() async {
        guard let zapRequest = latestZapRequest else { return }
        isAcking = true
        defer { isAcking = false }

        do {
            try await APIClient.shared.ackZapRequest(id: zapRequest.id)
            await refreshTask()
            onUpdate?()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func selfComplete() async {
        isSelfCompleting = true
        defer { isSelfCompleting = false }

        do {
            currentTask = try await APIClient.shared.selfCompleteTask(taskId: currentTask.id)
            onUpdate?()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - InfoRow

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .foregroundStyle(.secondary)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.subheadline)
    }
}

#Preview {
    NavigationStack {
        TaskDetailView(task: AppTask(
            id: "1",
            ownerUserId: "u1",
            controllerUserId: nil,
            title: "サンプルタスク",
            dueAt: .now.addingTimeInterval(3600),
            createdAt: .now,
            closedAt: nil,
            status: .waitingAck,
            reminderMinutes: 5
        ))
    }
}
