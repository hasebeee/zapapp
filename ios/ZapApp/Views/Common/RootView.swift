import SwiftUI

/// ログイン状態に応じて LoginView か MainTabView を表示するルートビュー。
struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if appState.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut, value: appState.isLoggedIn)
    }
}

#Preview {
    RootView()
        .environmentObject(AppState())
}
