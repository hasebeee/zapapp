import SwiftUI

struct PavlokConnectView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isLoading = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "bolt.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.yellow)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Pavlokアカウントを連携する")
                                .font(.headline)
                            Text("メールアドレスとパスワードでログインすると、監視者がZapボタンを押したとき自動でZapが送られます。")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                }

                if appState.pavlokConnected {
                    Section {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text("連携済みです")
                                .foregroundStyle(.green)
                        }

                        Button(role: .destructive) {
                            Task { await disconnect() }
                        } label: {
                            HStack {
                                Spacer()
                                if isLoading {
                                    ProgressView()
                                } else {
                                    Text("連携を解除する")
                                }
                                Spacer()
                            }
                        }
                        .disabled(isLoading)
                    }
                } else {
                    Section("Pavlokアカウント情報") {
                        TextField("メールアドレス", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)

                        SecureField("パスワード", text: $password)
                            .textContentType(.password)
                    }

                    Section {
                        Button {
                            Task { await connect() }
                        } label: {
                            HStack {
                                Spacer()
                                if isLoading {
                                    ProgressView()
                                } else {
                                    Text("連携する")
                                        .fontWeight(.semibold)
                                }
                                Spacer()
                            }
                        }
                        .disabled(isLoading || email.isEmpty || password.isEmpty)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Pavlok連携")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") { dismiss() }
                }
            }
        }
    }

    private func connect() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await APIClient.shared.connectPavlok(email: email, password: password)
            appState.pavlokConnected = true
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func disconnect() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await APIClient.shared.disconnectPavlok()
            appState.pavlokConnected = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    PavlokConnectView()
        .environmentObject(AppState())
}
