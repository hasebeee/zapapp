import SwiftUI

/// メインのタブビュー。
/// タブ1: マイタスク（本人 side）
/// タブ2: 監視する（他人 side）
/// タブ3: 履歴
/// タブ4: ギフト
/// タブ5: 設定
struct MainTabView: View {
    @EnvironmentObject private var appState: AppState

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

            HistoryView()
                .tabItem {
                    Label("履歴", systemImage: "clock.arrow.circlepath")
                }

            GiftView()
                .tabItem {
                    Label("ギフト", systemImage: "gift")
                }

            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gearshape")
                }
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
}
