import SwiftUI

struct CreateTaskView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    @State private var title: String = ""
    @State private var dueAt: Date = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
    @State private var selectedRelationship: Relationship? = nil
    @State private var relationships: [Relationship] = []
    @State private var isLoading: Bool = false
    @State private var isLoadingRelationships: Bool = false
    @State private var errorMessage: String? = nil

    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && dueAt > .now
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("タスク情報") {
                    TextField("タスク名", text: $title)
                        .submitLabel(.done)

                    DatePicker("締切日時",
                               selection: $dueAt,
                               in: Date.now...,
                               displayedComponents: [.date, .hourAndMinute])
                }

                Section("監視してもらう人") {
                    if isLoadingRelationships {
                        HStack {
                            ProgressView()
                            Text("読み込み中...")
                                .foregroundStyle(.secondary)
                        }
                    } else if relationships.isEmpty {
                        Text("まだ関係者がいません")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("監視者", selection: $selectedRelationship) {
                            Text("選択しない").tag(Optional<Relationship>.none)
                            ForEach(relationships.filter { $0.ownerUserId == appState.uid }) { rel in
                                Text(rel.controllerUser?.displayName ?? rel.controllerUser?.email ?? rel.controllerUserId)
                                    .tag(Optional(rel))
                            }
                        }
                        .pickerStyle(.menu)
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
            .navigationTitle("タスク作成")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("作成") {
                        Task { await createTask() }
                    }
                    .disabled(isLoading || !isFormValid)
                    .overlay {
                        if isLoading {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                    }
                }
            }
            .task {
                await loadRelationships()
            }
        }
    }

    // MARK: - Actions

    private func loadRelationships() async {
        isLoadingRelationships = true
        defer { isLoadingRelationships = false }
        do {
            relationships = try await APIClient.shared.getRelationships()
        } catch {
            // 取得失敗は無視（監視者なしで作成可能）
        }
    }

    private func createTask() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await APIClient.shared.createTask(
                title: title.trimmingCharacters(in: .whitespaces),
                dueAt: dueAt,
                controllerUserId: selectedRelationship?.controllerUserId
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    CreateTaskView()
}
