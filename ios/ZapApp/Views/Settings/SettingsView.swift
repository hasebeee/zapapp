import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showLogoutConfirm = false
    @State private var showDeleteAccountConfirm = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: String? = nil
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

                // 場所でZap
                Section {
                    NavigationLink {
                        LocationRulesView()
                    } label: {
                        HStack {
                            Image(systemName: "mappin.and.ellipse")
                            Text("場所でZap")
                        }
                    }
                } header: {
                    Text("自動Zap")
                } footer: {
                    Text("登録した場所に一定時間いると自動でZapされます。")
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

                // アカウント削除
                Section {
                    Button(role: .destructive) {
                        showDeleteAccountConfirm = true
                    } label: {
                        HStack {
                            if isDeletingAccount {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "person.crop.circle.badge.minus")
                            }
                            Text("アカウントを削除")
                        }
                    }
                    .disabled(isDeletingAccount)

                    if let error = deleteAccountError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } footer: {
                    Text("アカウントを削除すると、すべてのタスク・つながり・データが完全に削除されます。この操作は取り消せません。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
            .confirmationDialog("アカウントを削除しますか？", isPresented: $showDeleteAccountConfirm, titleVisibility: .visible) {
                Button("削除する", role: .destructive) {
                    Task {
                        isDeletingAccount = true
                        deleteAccountError = nil
                        do {
                            try await appState.deleteAccount()
                        } catch {
                            deleteAccountError = "削除に失敗しました。もう一度お試しください。"
                        }
                        isDeletingAccount = false
                    }
                }
                Button("キャンセル", role: .cancel) {}
            } message: {
                Text("すべてのデータが完全に削除されます。この操作は取り消せません。")
            }
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
