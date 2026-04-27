import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showLogoutConfirm = false
    @State private var showInvite = false
    @State private var showPavlokConnect = false

    var body: some View {
        NavigationStack {
            List {
                // アカウント情報
                Section {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(appState.displayName)
                                .font(.body.bold())
                            if let email = appState.currentUser?.email {
                                Text(email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                } header: {
                    Text("アカウント")
                }

                // 招待管理
                Section {
                    Button {
                        showInvite = true
                    } label: {
                        HStack {
                            Image(systemName: "person.badge.plus")
                            Text("招待管理")
                        }
                        .foregroundStyle(.primary)
                    }
                } header: {
                    Text("つながり")
                }

                // Pavlok連携
                Section {
                    Button {
                        showPavlokConnect = true
                    } label: {
                        HStack {
                            Image(systemName: "bolt.circle.fill")
                                .foregroundStyle(appState.pavlokConnected ? AnyShapeStyle(.yellow) : AnyShapeStyle(.secondary))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Pavlokアカウント連携")
                                if appState.pavlokConnected {
                                    Text("連携済み（Zapを受け取れます）")
                                        .font(.caption)
                                        .foregroundStyle(.green)
                                } else {
                                    Text("未連携")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                } header: {
                    Text("Pavlok連携")
                }

                // ログアウト
                Section {
                    Button(role: .destructive) {
                        showLogoutConfirm = true
                    } label: {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("ログアウト")
                        }
                    }
                }
            }
            .sheet(isPresented: $showInvite) {
                InviteView()
            }
            .sheet(isPresented: $showPavlokConnect) {
                PavlokConnectView()
            }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("ログアウトしますか？", isPresented: $showLogoutConfirm, titleVisibility: .visible) {
                Button("ログアウト", role: .destructive) {
                    appState.signOut()
                }
                Button("キャンセル", role: .cancel) {}
            }
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
