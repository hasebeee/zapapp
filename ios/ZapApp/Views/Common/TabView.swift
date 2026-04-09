import SwiftUI

/// メインのタブビュー。
/// タブ1: マイタスク（本人 side）
/// タブ2: 監視する（他人 side）
struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var poller = ZapRequestPoller.shared

    var body: some View {
        TabView {
            OwnerHomeView()
                .tabItem {
                    Label("マイタスク", systemImage: "checklist")
                }

            ControllerHomeView()
                .tabItem {
                    Label("監視する", systemImage: "bolt.fill")
                }

            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gearshape")
                }
        }
        .onAppear {
            // ポーリング開始（本人 side でのみ必要: Pavlok 所持者）
            ZapRequestPoller.shared.start()
        }
        .onDisappear {
            ZapRequestPoller.shared.stop()
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
}
