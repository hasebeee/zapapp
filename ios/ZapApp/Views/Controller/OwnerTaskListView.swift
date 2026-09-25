import SwiftUI

struct OwnerTaskListView: View {
    let ownerUserId: String
    let ownerName: String

    @EnvironmentObject private var appState: AppState

    @State private var tasks: [AppTask] = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showZapAlert: Bool = false
    @State private var taskToZap: AppTask? = nil
    @State private var isZapping: Bool = false
    @State private var zapNotStartedTaskId: String? = nil
    @State private var showApproveAlert: Bool = false
    @State private var taskToApprove: AppTask? = nil
    @State private var isApproving: Bool = false
    @State private var showDeleteAlert: Bool = false
    @State private var taskToDelete: AppTask? = nil
    @State private var isDeleting: Bool = false

    var body: some View {
        Group {
            if isLoading && tasks.isEmpty {
                ProgressView("読み込み中...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if activeTasks.isEmpty {
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
        .alert("合格にしますか？", isPresented: $showApproveAlert, actions: {
            Button("合格にする") {
                Task { await approveTask() }
            }
            Button("キャンセル", role: .cancel) {
                taskToApprove = nil
            }
        }, message: {
            if let task = taskToApprove {
                Text("「\(task.title)」を合格にします。\nZapせずにタスクを完了します。")
            }
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
        .alert("タスクを削除しますか？", isPresented: $showDeleteAlert, actions: {
            Button("削除する", role: .destructive) {
                Task { await deleteTask() }
            }
            Button("キャンセル", role: .cancel) {
                taskToDelete = nil
            }
        }, message: {
            if let task = taskToDelete {
                Text("「\(task.title)」を削除します。\nOwnerに通知が送られます。この操作は取り消せません。")
            }
        })
        .task {
            await loadTasks()
        }
        .refreshable {
            await loadTasks()
        }
        .onReceive(NotificationCenter.default.publisher(for: .pushNotificationReceived)) { _ in
            Task { await loadTasks() }
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

    private var activeTasks: [AppTask] {
        tasks.filter { $0.status != .closed }
    }

    private var taskList: some View {
        List(activeTasks) { task in
            ControllerTaskCardView(
                task: task,
                isZapping: isZapping && taskToZap?.id == task.id,
                isApproving: isApproving && taskToApprove?.id == task.id,
                isDeleting: isDeleting && taskToDelete?.id == task.id,
                showNotStartedWarning: zapNotStartedTaskId == task.id
            ) {
                taskToApprove = task
                showApproveAlert = true
            } onZap: {
                taskToZap = task
                showZapAlert = true
            } onDelete: {
                taskToDelete = task
                showDeleteAlert = true
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if task.status != .closed && task.status != .waitingAck {
                    Button(role: .destructive) {
                        taskToDelete = task
                        showDeleteAlert = true
                    } label: {
                        Label("削除", systemImage: "trash")
                    }
                }
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

        // このオーナーだけでなく全オーナー横断の件数でアプリアイコンのバッジを同期する
        if let pending = try? await APIClient.shared.getPendingJudgments() {
            appState.syncAppIconBadge(count: pending.count)
        }
    }

    private func approveTask() async {
        guard let task = taskToApprove else { return }
        isApproving = true
        defer { isApproving = false }

        do {
            try await APIClient.shared.approveTask(taskId: task.id)
            await loadTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
        taskToApprove = nil
    }

    private func sendZap() async {
        guard let task = taskToZap else { return }
        isZapping = true
        zapNotStartedTaskId = nil
        defer { isZapping = false }

        do {
            let response = try await APIClient.shared.sendZap(taskId: task.id)
            if response.zapRequest.status == .notStarted {
                zapNotStartedTaskId = task.id
            }
            await loadTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
        taskToZap = nil
    }

    private func deleteTask() async {
        guard let task = taskToDelete else { return }
        isDeleting = true
        defer { isDeleting = false }

        do {
            try await APIClient.shared.deleteTask(taskId: task.id)
            await loadTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
        taskToDelete = nil
    }
}

// MARK: - ControllerTaskCardView

struct ControllerTaskCardView: View {
    let task: AppTask
    var ownerName: String? = nil
    let isZapping: Bool
    let isApproving: Bool
    let isDeleting: Bool
    let showNotStartedWarning: Bool
    let onApprove: () -> Void
    let onZap: () -> Void
    var onDelete: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    if let ownerName {
                        Text(ownerName)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.accentColor)
                    }
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

                if task.status != .readyToZap && task.status != .readyToReZap {
                    actionButtons
                }
            }

            if let criteria = task.zapCriteria, !criteria.isEmpty {
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "text.quote")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 1)
                    Text(criteria)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(8)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
            }

            if task.status == .readyToZap || task.status == .readyToReZap {
                SwipeJudgeControl(
                    isLoading: isZapping || isApproving,
                    onApprove: onApprove,
                    onZap: onZap
                )
            }

            if showNotStartedWarning {
                Text("送信できませんでした。Pavlok連携が未設定か、Pavlok APIへの送信に失敗した可能性があります。")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .padding(8)
                    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            }

            if task.status == .waitingAck {
                HStack(spacing: 4) {
                    Image(systemName: "hourglass")
                    Text("未報告")
                }
                .font(.caption)
                .foregroundStyle(.orange)
            }

            if let onDelete, task.status != .closed && task.status != .waitingAck {
                Button {
                    onDelete()
                } label: {
                    HStack(spacing: 6) {
                        if isDeleting {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "trash")
                            Text("タスクを削除")
                                .fontWeight(.medium)
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(.red, in: Capsule())
                }
                .buttonStyle(.borderless)
                .disabled(isDeleting)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var actionButtons: some View {
        switch task.status {
        case .readyToZap, .readyToReZap:
            EmptyView()

        case .scheduled:
            Text("締切後に押せます")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.secondary.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))

        case .waitingAck:
            Text("未報告")
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

// MARK: - SwipeJudgeControl

struct SwipeJudgeControl: View {
    let isLoading: Bool
    let onApprove: () -> Void  // 左スワイプ = 合格
    let onZap: () -> Void      // 右スワイプ = 不合格

    @State private var offset: CGFloat = 0

    private let threshold: CGFloat = 70

    private var progress: CGFloat {
        min(1, max(-1, offset / threshold))
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(backgroundColor)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color(.separator), lineWidth: 1)
                        .opacity(progress == 0 ? 1 : 0)
                )
                .frame(maxWidth: .infinity)
                .frame(height: 44)

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                    Text("合格")
                }
                .fontWeight(.bold)
                .foregroundStyle(progress < 0 ? Color.white : Color.green)
                .opacity(progress < 0 ? Double(-progress) : 0.5)

                Spacer()

                HStack(spacing: 4) {
                    Text("不合格")
                    Image(systemName: "bolt.fill")
                }
                .fontWeight(.bold)
                .foregroundStyle(progress > 0 ? Color.white : Color.red)
                .opacity(progress > 0 ? Double(progress) : 0.5)
            }
            .padding(.horizontal, 16)

            if isLoading {
                ProgressView()
                    .tint(.secondary)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.left").font(.caption)
                    Image(systemName: "bolt.fill").font(.subheadline).foregroundStyle(.orange)
                    Image(systemName: "chevron.right").font(.caption)
                }
                .foregroundStyle(Color(.tertiaryLabel))
                .offset(x: offset * 0.25)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    guard !isLoading else { return }
                    withAnimation(.interactiveSpring()) {
                        offset = value.translation.width
                    }
                }
                .onEnded { value in
                    guard !isLoading else { return }
                    let predicted = value.predictedEndTranslation.width
                    if predicted < -threshold {
                        onApprove()
                    } else if predicted > threshold {
                        onZap()
                    }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        offset = 0
                    }
                }
        )
        .disabled(isLoading)
    }

    private var backgroundColor: Color {
        if progress < 0 {
            return .green.opacity(Double(-progress) * 0.85)
        } else if progress > 0 {
            return .red.opacity(Double(progress) * 0.85)
        }
        return Color(.secondarySystemGroupedBackground)
    }
}

#Preview {
    NavigationStack {
        OwnerTaskListView(ownerUserId: "u1", ownerName: "田中 太郎")
    }
}
