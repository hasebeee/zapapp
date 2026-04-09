import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showLogoutConfirm = false

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
