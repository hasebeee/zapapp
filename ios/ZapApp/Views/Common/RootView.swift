import SwiftUI

/// ログイン状態に応じて LoginView か 起動時フロー(合否判定/パッケージ選択) / MainTabView を表示するルートビュー。
struct RootView: View {
    @EnvironmentObject private var appState: AppState

    private enum LaunchGate {
        case loading
        case judge
        case quickPackage
        case home
    }

    @State private var gate: LaunchGate = .loading

    var body: some View {
        Group {
            if appState.isLoggedIn {
                switch gate {
                case .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .judge:
                    JudgeView(onFinished: { gate = .home })
                case .quickPackage:
                    QuickPackageView(onFinished: { gate = .home })
                case .home:
                    MainTabView()
                }
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut, value: appState.isLoggedIn)
        .task(id: appState.isLoggedIn) {
            if appState.isLoggedIn {
                await checkLaunchGate()
            } else {
                gate = .loading
            }
        }
    }

    /// 監視者として合否待ちのタスクがあれば judge へ、なければ quickPackage へ
    private func checkLaunchGate() async {
        do {
            let pending = try await APIClient.shared.getPendingJudgments()
            gate = pending.isEmpty ? .quickPackage : .judge
        } catch {
            // 取得に失敗してもホームに詰まらせない（quickPackage側に「スキップ」がある）
            gate = .quickPackage
        }
    }
}

#Preview {
    RootView()
        .environmentObject(AppState())
}
