import SwiftUI

struct AcceptInviteView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var token: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var isSuccess: Bool = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // アイコン
                Image(systemName: "link.badge.plus")
                    .font(.system(size: 72))
                    .foregroundStyle(.accentColor)

                // 説明
                VStack(spacing: 8) {
                    Text("招待を受諾する")
                        .font(.title2.bold())
                    Text("招待者から受け取ったトークンを入力してください。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                // 成功メッセージ
                if isSuccess {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)
                        Text("招待を受諾しました！")
                            .font(.headline)
                            .foregroundStyle(.green)
                    }
                    .transition(.scale.combined(with: .opacity))
                } else {
                    // トークン入力フォーム
                    VStack(spacing: 16) {
                        TextField("招待トークン", text: $token)
                            .textFieldStyle(.roundedBorder)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .font(.system(.body, design: .monospaced))
                            .padding(.horizontal)

                        if let errorMessage {
                            Text(errorMessage)
                                .foregroundStyle(.red)
                                .font(.caption)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }

                        Button {
                            Task { await acceptInvite() }
                        } label: {
                            Group {
                                if isLoading {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("受諾する")
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isLoading || token.isEmpty)
                        .padding(.horizontal)
                    }
                }

                Spacer()
                Spacer()
            }
            .navigationTitle("招待を受諾")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") {
                        dismiss()
                    }
                }
            }
            .animation(.spring(), value: isSuccess)
        }
    }

    // MARK: - Actions

    private func acceptInvite() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await APIClient.shared.acceptInvite(token: token)
            isSuccess = true
            // 2秒後に自動で閉じる
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    AcceptInviteView()
}
