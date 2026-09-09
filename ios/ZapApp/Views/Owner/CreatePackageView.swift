import SwiftUI

struct CreatePackageView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    struct DraftItem: Identifiable {
        let id = UUID()
        var title: String = ""
        var zapCriteria: String = ""
    }

    @State private var title: String = ""
    @State private var time: Date = .now
    @State private var reminderMinutes: Int = 5
    @State private var selectedRelationship: Relationship? = nil
    @State private var relationships: [Relationship] = []
    @State private var items: [DraftItem] = [DraftItem()]
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil

    private let reminderOptions: [(label: String, value: Int)] = [
        ("なし", 0), ("5分前", 5), ("10分前", 10), ("15分前", 15), ("30分前", 30), ("1時間前", 60),
    ]

    private var controllerRelationships: [Relationship] {
        relationships.filter { $0.ownerUserId == appState.dbUserId }
    }

    private var validItems: [DraftItem] {
        items.filter { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && !validItems.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("パッケージ名", text: $title)
                        .submitLabel(.next)

                    DatePicker("作成当日の時刻", selection: $time, displayedComponents: [.hourAndMinute])
                } header: {
                    Text("パッケージ情報")
                } footer: {
                    Text("このパッケージを使った日の、この時刻を締切にタスクを作成します。")
                }

                Section("通知設定") {
                    Picker("締切前リマインダー", selection: $reminderMinutes) {
                        ForEach(reminderOptions, id: \.value) { opt in
                            Text(opt.label).tag(opt.value)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("監視してもらう人") {
                    if controllerRelationships.isEmpty {
                        Text("まだ監視者がいません")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("監視者", selection: $selectedRelationship) {
                            Text("選択しない").tag(Optional<Relationship>.none)
                            ForEach(controllerRelationships) { rel in
                                Text(rel.controllerUser?.displayName ?? rel.controllerUser?.email ?? rel.controllerUserId)
                                    .tag(Optional(rel))
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                Section("タスク一覧") {
                    ForEach($items) { $item in
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("タスク名", text: $item.title)
                            TextField("Zapの基準（任意）", text: $item.zapCriteria, axis: .vertical)
                                .lineLimit(2...4)
                                .font(.subheadline)
                        }
                        .padding(.vertical, 2)
                    }
                    .onDelete { offsets in
                        guard items.count > 1 else { return }
                        items.remove(atOffsets: offsets)
                    }

                    Button {
                        items.append(DraftItem())
                    } label: {
                        Label("タスクを追加", systemImage: "plus")
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
            .navigationTitle("パッケージ作成")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("作成") {
                        Task { await createPackage() }
                    }
                    .disabled(isLoading || !isFormValid)
                    .overlay {
                        if isLoading { ProgressView().scaleEffect(0.8) }
                    }
                }
            }
            .task {
                await loadRelationships()
            }
        }
    }

    private func loadRelationships() async {
        do {
            relationships = try await APIClient.shared.getRelationships()
        } catch {}
    }

    private func createPackage() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let calendar = Calendar.current
        let comps = calendar.dateComponents([.hour, .minute], from: time)
        let hh = String(format: "%02d", comps.hour ?? 0)
        let mm = String(format: "%02d", comps.minute ?? 0)

        do {
            _ = try await APIClient.shared.createPackage(
                title: title.trimmingCharacters(in: .whitespaces),
                controllerUserId: selectedRelationship?.controllerUserId,
                timeOfDay: "\(hh):\(mm):00",
                reminderMinutes: reminderMinutes,
                items: validItems.map {
                    APIClient.PackageItemInput(
                        title: $0.title.trimmingCharacters(in: .whitespaces),
                        zapCriteria: $0.zapCriteria.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0.zapCriteria
                    )
                }
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    CreatePackageView()
        .environmentObject(AppState())
}
