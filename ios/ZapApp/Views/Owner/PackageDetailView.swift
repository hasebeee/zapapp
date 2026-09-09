import SwiftUI

struct PackageDetailView: View {
    let package: Package
    let onUpdate: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var current: Package
    @State private var isEditing: Bool = false
    @State private var isSaving: Bool = false
    @State private var isDeleting: Bool = false
    @State private var isUsing: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showDeleteConfirm: Bool = false
    @State private var showUseConfirm: Bool = false

    struct DraftItem: Identifiable {
        let id: String
        var title: String
        var zapCriteria: String
    }

    @State private var editTitle: String = ""
    @State private var editItems: [DraftItem] = []

    init(package: Package, onUpdate: @escaping () -> Void) {
        self.package = package
        self.onUpdate = onUpdate
        _current = State(initialValue: package)
    }

    private var validEditItems: [DraftItem] {
        editItems.filter { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private var itemsSectionTitle: String {
        let count = isEditing ? editItems.count : current.items.count
        return "タスク一覧（\(count)件）"
    }

    var body: some View {
        List {
            Section("基本情報") {
                if isEditing {
                    TextField("パッケージ名", text: $editTitle)
                } else {
                    LabeledContent("パッケージ名", value: current.title)
                }
                LabeledContent("時刻", value: current.timeOfDayLabel)
            }

            Section(header: Text(itemsSectionTitle)) {
                if isEditing {
                    ForEach($editItems) { $item in
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("タスク名", text: $item.title)
                            TextField("Zapの基準（任意）", text: $item.zapCriteria, axis: .vertical)
                                .lineLimit(2...4)
                                .font(.subheadline)
                        }
                        .padding(.vertical, 2)
                    }
                    .onDelete { offsets in
                        guard editItems.count > 1 else { return }
                        editItems.remove(atOffsets: offsets)
                    }
                    Button {
                        editItems.append(DraftItem(id: UUID().uuidString, title: "", zapCriteria: ""))
                    } label: {
                        Label("タスクを追加", systemImage: "plus")
                    }
                } else {
                    ForEach(Array(current.items.enumerated()), id: \.element.id) { index, item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(index + 1). \(item.title)")
                            if let criteria = item.zapCriteria, !criteria.isEmpty {
                                Text(criteria)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
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

            if !isEditing {
                Section {
                    Button {
                        showUseConfirm = true
                    } label: {
                        HStack {
                            Spacer()
                            if isUsing {
                                ProgressView()
                            } else {
                                Text("今すぐこのパッケージでタスク作成")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .tint(.green)
                }

                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        HStack {
                            Spacer()
                            if isDeleting {
                                ProgressView()
                            } else {
                                Text("パッケージを削除")
                            }
                            Spacer()
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("パッケージ詳細")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isEditing {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") {
                        isEditing = false
                        resetEditState()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task { await saveEdits() }
                    }
                    .disabled(isSaving || editTitle.trimmingCharacters(in: .whitespaces).isEmpty || validEditItems.isEmpty)
                    .overlay {
                        if isSaving { ProgressView().scaleEffect(0.8) }
                    }
                }
            } else {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("編集") {
                        resetEditState()
                        isEditing = true
                    }
                }
            }
        }
        .confirmationDialog("パッケージを削除しますか？", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                Task { await deletePackage() }
            }
            Button("キャンセル", role: .cancel) {}
        }
        .confirmationDialog(
            "「\(current.title)」の\(current.items.count)件のタスクを今すぐ作成します。",
            isPresented: $showUseConfirm,
            titleVisibility: .visible
        ) {
            Button("作成する") {
                Task { await usePackage() }
            }
            Button("キャンセル", role: .cancel) {}
        }
    }

    private func resetEditState() {
        editTitle = current.title
        editItems = current.items.map { DraftItem(id: $0.id, title: $0.title, zapCriteria: $0.zapCriteria ?? "") }
    }

    private func saveEdits() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let updated = try await APIClient.shared.updatePackage(
                packageId: current.id,
                title: editTitle.trimmingCharacters(in: .whitespaces),
                items: validEditItems.map {
                    APIClient.PackageItemInput(
                        title: $0.title.trimmingCharacters(in: .whitespaces),
                        zapCriteria: $0.zapCriteria.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0.zapCriteria
                    )
                }
            )
            current = updated
            isEditing = false
            onUpdate()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func usePackage() async {
        isUsing = true
        errorMessage = nil
        defer { isUsing = false }
        do {
            _ = try await APIClient.shared.usePackage(packageId: current.id, dueAt: current.todayAtTimeOfDay)
            onUpdate()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deletePackage() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await APIClient.shared.deletePackage(packageId: current.id)
            onUpdate()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        PackageDetailView(
            package: Package(
                id: "1",
                ownerUserId: "u1",
                controllerUserId: nil,
                title: "朝のルーティン",
                timeOfDay: "07:00:00",
                reminderMinutes: 5,
                createdAt: .now,
                items: [
                    PackageItem(id: "i1", packageId: "1", title: "ストレッチ", zapCriteria: nil, sortOrder: 0),
                    PackageItem(id: "i2", packageId: "1", title: "読書", zapCriteria: "10ページ以上", sortOrder: 1),
                ]
            ),
            onUpdate: {}
        )
    }
}
