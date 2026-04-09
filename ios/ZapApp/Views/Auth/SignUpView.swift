import SwiftUI

struct SignUpView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var confirmPassword: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer(minLength: 40)

                // Title
                VStack(spacing: 8) {
                    Image(systemName: "bolt.circle.fill")
                        .font(.system(size: 60))
                        .foregroundStyle(.yellow)
                    Text("アカウント作成")
                        .font(.title.bold())
                }

                // Form
                VStack(spacing: 16) {
                    TextField("メールアドレス", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .textFieldStyle(.roundedBorder)

                    SecureField("パスワード（6文字以上）", text: $password)
                        .textContentType(.newPassword)
                        .textFieldStyle(.roundedBorder)

                    SecureField("パスワード（確認）", text: $confirmPassword)
                        .textContentType(.newPassword)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal)

                // Error
                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                // Sign Up Button
                Button {
                    Task { await signUp() }
                } label: {
                    Group {
                        if isLoading {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(.white)
                        } else {
                            Text("アカウントを作成")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isLoading || !isFormValid)
                .padding(.horizontal)

                Button("ログインに戻る") {
                    dismiss()
                }
                .foregroundStyle(.secondary)

                Spacer(minLength: 40)
            }
        }
        .navigationTitle("アカウント作成")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Validation

    private var isFormValid: Bool {
        !email.isEmpty && password.count >= 6 && password == confirmPassword
    }

    // MARK: - Actions

    private func signUp() async {
        guard password == confirmPassword else {
            errorMessage = "パスワードが一致しません"
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await AuthService.shared.signUp(email: email, password: password)
            // AppState は Firebase Auth の状態変化リスナーで自動更新される
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        SignUpView()
    }
    .environmentObject(AppState())
}
