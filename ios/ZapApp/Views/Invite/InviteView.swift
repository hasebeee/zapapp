import SwiftUI

struct InviteView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var inviteeEmail: String = ""
    @State private var invites: [Invite] = []
    @State private var isLoadingInvites: Bool = false
    @State private var isSendingInvite: Bool = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil
    @State private var showAcceptInvite: Bool = false

    var body: some View {
        NavigationStack {
            Form {
                // MARK: 招待送信セクション
                Section {
                    TextField("招待したい相手のメールアドレス", text: $inviteeEmail)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .textContentType(.emailAddress)

                    Button {
                        Task { await sendInvite() }
                    } label: {
                        HStack {
                            Spacer()
                            if isSendingInvite {
                                ProgressView()
                                    .scaleEffect(0.9)
                            } else {
                                Text("招待を送る")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isSendingInvite || inviteeEmail.isEmpty)
                } header: {
                    Text("招待を送信")
                } footer: {
                    if let successMessage {
                        Text(successMessage)
                            .foregroundStyle(.green)
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                // MARK: 招待を受け取った場合
                Section {
                    Button {
                        showAcceptInvite = true
                    } label: {
                        HStack {
                            Image(systemName: "qrcode.viewfinder")
                            Text("招待トークンを入力して受諾する")
                        }
                    }
                } header: {
                    Text("招待を受け取った場合")
                }

                // MARK: 送信済み招待一覧
                Section {
                    if isLoadingInvites {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else if invites.isEmpty {
                        Text("送信済みの招待はありません")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    } else {
                        ForEach(invites) { invite in
                            InviteRowView(invite: invite)
                        }
                    }
                } header: {
                    HStack {
                        Text("送信済み招待")
                        Spacer()
                        Button {
                            Task { await loadInvites() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.caption)
                        }
                    }
                }
            }
            .navigationTitle("招待管理")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showAcceptInvite) {
                AcceptInviteView()
            }
            .task {
                await loadInvites()
            }
        }
    }

    // MARK: - Actions

    private func sendInvite() async {
        isSendingInvite = true
        errorMessage = nil
        successMessage = nil
        defer { isSendingInvite = false }

        do {
            _ = try await APIClient.shared.createInvite(inviteeEmail: inviteeEmail)
            successMessage = "\(inviteeEmail) に招待を送りました"
            inviteeEmail = ""
            await loadInvites()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadInvites() async {
        isLoadingInvites = true
        defer { isLoadingInvites = false }

        do {
            invites = try await APIClient.shared.getInvites()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - InviteRowView

struct InviteRowView: View {
    let invite: Invite

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(invite.inviteeEmail)
                    .font(.subheadline.bold())
                Spacer()
                statusBadge
            }
            HStack(spacing: 4) {
                Image(systemName: "clock")
                    .font(.caption2)
                Text(invite.createdAt, style: .date)
                    .font(.caption)
            }
            .foregroundStyle(.secondary)

            // トークン表示（pending のみ）
            if invite.status == .pending {
                HStack(spacing: 4) {
                    Text("トークン:")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(invite.token)
                        .font(.caption.monospaced())
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button {
                        UIPasteboard.general.string = invite.token
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .font(.caption)
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var statusBadge: some View {
        Text(statusLabel)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(statusColor.opacity(0.2))
            .foregroundStyle(statusColor)
            .clipShape(Capsule())
    }

    private var statusLabel: String {
        switch invite.status {
        case .pending:   return "保留中"
        case .accepted:  return "承諾済み"
        case .expired:   return "期限切れ"
        case .revoked: return "キャンセル"
        }
    }

    private var statusColor: Color {
        switch invite.status {
        case .pending:   return .blue
        case .accepted:  return .green
        case .expired:   return .gray
        case .revoked: return .red
        }
    }
}

#Preview {
    InviteView()
}
