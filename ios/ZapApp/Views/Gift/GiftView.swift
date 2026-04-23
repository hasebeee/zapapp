import SwiftUI

struct GiftView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedTab: GiftTab = .send

    enum GiftTab {
        case send, receive
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("タブ", selection: $selectedTab) {
                    Text("送る").tag(GiftTab.send)
                    Text("受け取る").tag(GiftTab.receive)
                }
                .pickerStyle(.segmented)
                .padding()

                if selectedTab == .send {
                    SendGiftView()
                } else {
                    ReceiveGiftView()
                }
            }
            .navigationTitle("ギフト")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - SendGiftView（Owner → Controller にギフトを送る）

struct SendGiftView: View {
    @EnvironmentObject private var appState: AppState

    @State private var relationships: [Relationship] = []
    @State private var selectedRelationship: Relationship? = nil
    @State private var message: String = ""
    @State private var sentGifts: [Gift] = []
    @State private var isLoadingRelationships = false
    @State private var isLoadingGifts = false
    @State private var isSending = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil

    var body: some View {
        List {
            // 送信フォーム
            Section("ギフトを送る") {
                if isLoadingRelationships {
                    HStack {
                        ProgressView()
                        Text("読み込み中...")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Picker("送り先", selection: $selectedRelationship) {
                        Text("選択してください").tag(Optional<Relationship>.none)
                        ForEach(ownerRelationships) { rel in
                            Text(rel.controllerUser?.displayName ?? rel.controllerUser?.email ?? rel.controllerUserId)
                                .tag(Optional(rel))
                        }
                    }
                    .pickerStyle(.menu)

                    TextField("メッセージ（任意）", text: $message)
                }

                if let successMessage {
                    Text(successMessage)
                        .foregroundStyle(.green)
                        .font(.caption)
                }
                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }

                Button {
                    Task { await sendGift() }
                } label: {
                    HStack {
                        Spacer()
                        if isSending {
                            ProgressView()
                        } else {
                            Label("ギフトを送る", systemImage: "gift")
                                .fontWeight(.semibold)
                        }
                        Spacer()
                    }
                }
                .disabled(isSending || selectedRelationship == nil)
            }

            // 送信済み一覧
            Section {
                if isLoadingGifts {
                    HStack {
                        ProgressView()
                        Text("読み込み中...")
                            .foregroundStyle(.secondary)
                    }
                } else if sentGifts.isEmpty {
                    Text("送ったギフトはありません")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(sentGifts) { gift in
                        SentGiftRowView(gift: gift)
                    }
                }
            } header: {
                HStack {
                    Text("送信済みギフト")
                    Spacer()
                    Button {
                        Task { await loadSentGifts() }
                    } label: {
                        Image(systemName: "arrow.clockwise").font(.caption)
                    }
                }
            }
        }
        .task {
            await loadRelationships()
            await loadSentGifts()
        }
        .refreshable {
            await loadRelationships()
            await loadSentGifts()
        }
    }

    private var ownerRelationships: [Relationship] {
        relationships.filter { $0.ownerUserId == appState.dbUserId }
    }

    private func loadRelationships() async {
        isLoadingRelationships = true
        defer { isLoadingRelationships = false }
        do {
            relationships = try await APIClient.shared.getRelationships()
        } catch {}
    }

    private func loadSentGifts() async {
        isLoadingGifts = true
        defer { isLoadingGifts = false }
        do {
            sentGifts = try await APIClient.shared.getSentGifts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func sendGift() async {
        guard let rel = selectedRelationship else { return }
        isSending = true
        errorMessage = nil
        successMessage = nil
        defer { isSending = false }

        do {
            _ = try await APIClient.shared.sendGift(
                controllerUserId: rel.controllerUserId,
                message: message
            )
            successMessage = "\(rel.controllerUser?.displayName ?? rel.controllerUser?.email ?? "相手")さんにギフトを送りました"
            message = ""
            selectedRelationship = nil
            await loadSentGifts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - ReceiveGiftView（Controller がギフトを使ってタスクを作成）

struct ReceiveGiftView: View {
    @State private var receivedGifts: [Gift] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var giftToUse: Gift? = nil
    @State private var showUseGiftSheet = false

    var body: some View {
        List {
            if isLoading && receivedGifts.isEmpty {
                HStack {
                    ProgressView()
                    Text("読み込み中...")
                        .foregroundStyle(.secondary)
                }
            } else if receivedGifts.isEmpty {
                Text("受け取ったギフトはありません")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
            } else {
                Section("受け取ったギフト") {
                    ForEach(receivedGifts) { gift in
                        ReceivedGiftRowView(gift: gift) {
                            giftToUse = gift
                            showUseGiftSheet = true
                        }
                    }
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
        .task {
            await loadReceivedGifts()
        }
        .refreshable {
            await loadReceivedGifts()
        }
        .sheet(isPresented: $showUseGiftSheet, onDismiss: {
            Task { await loadReceivedGifts() }
        }) {
            if let gift = giftToUse {
                UseGiftView(gift: gift)
            }
        }
    }

    private func loadReceivedGifts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            receivedGifts = try await APIClient.shared.getReceivedGifts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - UseGiftView（タスク作成シート）

struct UseGiftView: View {
    let gift: Gift
    @Environment(\.dismiss) private var dismiss

    @State private var title: String = ""
    @State private var dueAt: Date = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var isSuccess = false

    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && dueAt > .now
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: "gift.fill")
                            .font(.system(size: 36))
                            .foregroundStyle(.pink)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(gift.ownerUser?.displayName ?? gift.ownerUser?.email ?? "オーナー")さんからのギフト")
                                .font(.subheadline.bold())
                            if !gift.message.isEmpty {
                                Text(gift.message)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("タスクを作成") {
                    TextField("タスク名", text: $title)
                        .submitLabel(.done)

                    DatePicker("締切日時",
                               selection: $dueAt,
                               in: Date.now...,
                               displayedComponents: [.date, .hourAndMinute])
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("ギフトを使う")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("タスクを作成") {
                        Task { await useGift() }
                    }
                    .disabled(isLoading || !isFormValid)
                    .overlay {
                        if isLoading { ProgressView().scaleEffect(0.8) }
                    }
                }
            }
            .alert("タスクを作成しました！", isPresented: $isSuccess) {
                Button("OK") { dismiss() }
            } message: {
                Text("\(gift.ownerUser?.displayName ?? "オーナー")さんに通知が送られます。")
            }
        }
    }

    private func useGift() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await APIClient.shared.useGift(
                giftId: gift.id,
                title: title.trimmingCharacters(in: .whitespaces),
                dueAt: dueAt
            )
            isSuccess = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Row Views

struct SentGiftRowView: View {
    let gift: Gift

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: gift.status == .used ? "gift" : "gift.fill")
                .foregroundStyle(gift.status == .used ? AnyShapeStyle(.secondary) : AnyShapeStyle(.pink))
                .font(.title2)

            VStack(alignment: .leading, spacing: 4) {
                Text(gift.controllerUser?.displayName ?? gift.controllerUser?.email ?? "相手")
                    .font(.subheadline.bold())
                if !gift.message.isEmpty {
                    Text(gift.message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Text(gift.createdAt, style: .date)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(gift.status == .used ? "使用済み" : "未使用")
                .font(.caption2)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(gift.status == .used ? Color.secondary.opacity(0.2) : Color.pink.opacity(0.2))
                .foregroundStyle(gift.status == .used ? AnyShapeStyle(.secondary) : AnyShapeStyle(.pink))
                .clipShape(Capsule())
        }
        .padding(.vertical, 2)
    }
}

struct ReceivedGiftRowView: View {
    let gift: Gift
    let onUse: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: gift.status == .used ? "gift" : "gift.fill")
                .foregroundStyle(gift.status == .used ? AnyShapeStyle(.secondary) : AnyShapeStyle(.pink))
                .font(.title2)

            VStack(alignment: .leading, spacing: 4) {
                Text(gift.ownerUser?.displayName ?? gift.ownerUser?.email ?? "オーナー")
                    .font(.subheadline.bold())
                if !gift.message.isEmpty {
                    Text(gift.message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Text(gift.createdAt, style: .date)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if gift.status == .pending {
                Button {
                    onUse()
                } label: {
                    Text("使う")
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(.pink, in: Capsule())
                }
                .buttonStyle(.borderless)
            } else {
                Text("使用済み")
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.secondary.opacity(0.2))
                    .foregroundStyle(.secondary)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    GiftView()
        .environmentObject(AppState())
}
