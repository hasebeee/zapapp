import SwiftUI

struct OwnerTaskListView: View {
    let ownerUserId: String
    let ownerName: String

    @State private var tasks: [AppTask] = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showZapAlert: Bool = false
    @State private var taskToZap: AppTask? = nil
    @State private var isZapping: Bool = false
    @State private var zapNotStartedTaskId: String? = nil

    var body: some View {
        Group {
            if isLoading && tasks.isEmpty {
                ProgressView("読み込み中...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if tasks.isEmpty {
                emptyView
            } else {
                taskList
            }
        }
        .navigationTitle("\(ownerName) のタスク")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await loadTasks() }
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
        .alert("Zapを送信しますか？", isPresented: $showZapAlert, actions: {
            Button("Zapする", role: .destructive) {
                Task { await sendZap() }
            }
            Button("キャンセル", role: .cancel) {
                taskToZap = nil
            }
        }, message: {
            if let task = taskToZap {
                Text("「\(task.title)」に Zap を送信します。\n本当に Zap しますか？")
            }
        })
        .task {
            await loadTasks()
        }
        .refreshable {
            await loadTasks()
        }
    }

    // MARK: - Subviews

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("タスクがありません")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var taskList: some View {
        List(tasks) { task in
            ControllerTaskCardView(
                task: task,
                isZapping: isZapping && taskToZap?.id == task.id,
                showNotStartedWarning: zapNotStartedTaskId == task.id
            ) {
                taskToZap = task
                showZapAlert = true
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Actions

    private func loadTasks() async {
        isLoading = true
        defer { isLoading = false }

        do {
            tasks = try await APIClient.shared.getOwnerTasks(ownerUserId: ownerUserId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func sendZap() async {
        guard let task = taskToZap else { return }
        isZapping = true
        zapNotStartedTaskId = nil
        defer { isZapping = false }

        do {
            let response = try await APIClient.shared.sendZap(taskId: task.id)
            // not_started の場合は警告表示
            if response.zapRequest.status == .notStarted {
                zapNotStartedTaskId = task.id
            }
            await loadTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
        taskToZap = nil
    }
}

// MARK: - ControllerTaskCardView

struct ControllerTaskCardView: View {
    let task: AppTask
    let isZapping: Bool
    let showNotStartedWarning: Bool
    let onZap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // タスク情報
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(task.title)
                        .font(.body.bold())
                        .lineLimit(2)

                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.caption)
                        Text(task.dueAt, style: .relative)
                            .font(.caption)
                        + Text(" 締切")
                            .font(.caption)
                    }
                    .foregroundStyle(.secondary)
                }
                Spacer()

                // Zap ボタン
                zapButton
            }

            // not_started 警告
            if showNotStartedWarning {
                Text("送信できませんでした。本人の端末がオフライン、通知制限中、またはPavlokがBluetooth未接続の可能性があります。")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .padding(8)
                    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            }

            // waitingAck: 感電報告待ちと残り時間
            if task.status == .waitingAck {
                HStack(spacing: 4) {
                    Image(systemName: "hourglass")
                    Text("感電報告待ち")
                }
                .font(.caption)
                .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var zapButton: some View {
        switch task.status {
        case .readyToZap, .readyToReZap:
            Button {
                onZap()
            } label: {
                Group {
                    if isZapping {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.8)
                    } else {
                        HStack(spacing: 4) {
                            Image(systemName: "bolt.fill")
                            Text("Zap")
                        }
                        .fontWeight(.bold)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .disabled(isZapping)

        case .scheduled:
            Text("締切後に押せます")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.secondary.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))

        case .waitingAck:
            Text("感電報告待ち")
                .font(.caption)
                .foregroundStyle(.orange)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))

        case .closed:
            Text("完了済み")
                .font(.caption)
                .foregroundStyle(.green)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

#Preview {
    NavigationStack {
        OwnerTaskListView(ownerUserId: "u1", ownerName: "田中 太郎")
    }
}
