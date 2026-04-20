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
            ZapRequestPoller.shared.registeredPeripheralId = appState.pavlokPeripheralId
            ZapRequestPoller.shared.start()
        }
        .onChange(of: appState.pavlokPeripheralId) { _, newId in
            ZapRequestPoller.shared.registeredPeripheralId = newId
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
