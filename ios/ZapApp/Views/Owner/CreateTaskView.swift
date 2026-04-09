import SwiftUI

struct CreateTaskView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var title: String = ""
    @State private var dueAt: Date = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
    @State private var isLoading: Bool = false
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
        }
    }

    // MARK: - Actions

    private func createTask() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await APIClient.shared.createTask(
                title: title.trimmingCharacters(in: .whitespaces),
                dueAt: dueAt
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
