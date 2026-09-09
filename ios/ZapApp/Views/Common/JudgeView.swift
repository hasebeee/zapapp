import SwiftUI

/// 起動直後に表示する、監視者としての合否判定待ちタスク一覧（全オーナー横断）。
/// 全件処理し終えると自動で onFinished を呼ぶ。
struct JudgeView: View {
    let onFinished: () -> Void

    @EnvironmentObject private var appState: AppState

    @State private var tasks: [PendingJudgmentTask] = []
    @State private var isLoading: Bool = true
    @State private var errorMessage: String? = nil

    @State private var taskToApprove: PendingJudgmentTask? = nil
    @State private var showApproveAlert: Bool = false
    @State private var isApproving: Bool = false

    @State private var taskToZap: PendingJudgmentTask? = nil
    @State private var showZapAlert: Bool = false
    @State private var isZapping: Bool = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && tasks.isEmpty {
                    ProgressView("読み込み中...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(tasks) { task in
                        ControllerTaskCardView(
                            task: task.asAppTask,
                            ownerName: task.ownerDisplayName,
                            isZapping: isZapping && taskToZap?.id == task.id,
                            isApproving: isApproving && taskToApprove?.id == task.id,
                            isDeleting: false,
                            showNotStartedWarning: false
                        ) {
                            taskToApprove = task
                            showApproveAlert = true
                        } onZap: {
                            taskToZap = task
                            showZapAlert = true
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("合否判定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("あとで") { onFinished() }
                }
            }
            .alert("エラー", isPresented: .constant(errorMessage != nil), actions: {
                Button("OK") { errorMessage = nil }
            }, message: {
                Text(errorMessage ?? "")
            })
            .alert("合格にしますか？", isPresented: $showApproveAlert, actions: {
                Button("合格にする") {
                    Task { await approve() }
                }
                Button("キャンセル", role: .cancel) { taskToApprove = nil }
            }, message: {
                if let task = taskToApprove {
                    Text("「\(task.title)」を合格にします。\nZapせずにタスクを完了します。")
                }
            })
            .alert("Zapを送信しますか？", isPresented: $showZapAlert, actions: {
                Button("Zapする", role: .destructive) {
                    Task { await zap() }
                }
                Button("キャンセル", role: .cancel) { taskToZap = nil }
            }, message: {
                if let task = taskToZap {
                    Text("「\(task.title)」に Zap を送信します。\n本当に Zap しますか？")
                }
            })
            .task {
                await load()
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            tasks = try await APIClient.shared.getPendingJudgments()
            appState.controllerBadgeCount = 0
            if tasks.isEmpty {
                onFinished()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func approve() async {
        guard let task = taskToApprove else { return }
        isApproving = true
        defer { isApproving = false }
        do {
            try await APIClient.shared.approveTask(taskId: task.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        taskToApprove = nil
    }

    private func zap() async {
        guard let task = taskToZap else { return }
        isZapping = true
        defer { isZapping = false }
        do {
            _ = try await APIClient.shared.sendZap(taskId: task.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        taskToZap = nil
    }
}

#Preview {
    JudgeView(onFinished: {})
}
