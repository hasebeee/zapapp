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
    let isZapping: Bool
    let isApproving: Bool
    let isDeleting: Bool
    let showNotStartedWarning: Bool
    let onApprove: () -> Void
    let onZap: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
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

                actionButtons
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

            if task.status != .closed && task.status != .waitingAck {
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
            HStack(spacing: 8) {
                Button {
                    onApprove()
                } label: {
                    Group {
                        if isApproving {
                            ProgressView()
                                .tint(.white)
                                .scaleEffect(0.8)
                        } else {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark")
                                Text("合格")
                            }
                            .fontWeight(.bold)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(isZapping || isApproving)

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
                                Text("不合格")
                            }
                            .fontWeight(.bold)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(isZapping || isApproving)
            }

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

#Preview {
    NavigationStack {
        OwnerTaskListView(ownerUserId: "u1", ownerName: "田中 太郎")
    }
}
