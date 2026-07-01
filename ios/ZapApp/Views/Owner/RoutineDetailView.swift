import SwiftUI

struct RoutineDetailView: View {
    let routine: Routine
    let onUpdate: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var current: Routine
    @State private var isEditing: Bool = false
    @State private var isSaving: Bool = false
    @State private var isDeleting: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showDeleteConfirm: Bool = false
    @State private var showCustomDatePicker: Bool = false
    @State private var newCustomDate: Date = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now

    // 編集用ステート
    @State private var editTitle: String = ""
    @State private var editZapCriteria: String = ""
    @State private var editCustomDatetimes: [Date] = []
    @State private var editIsActive: Bool = true

    init(routine: Routine, onUpdate: @escaping () -> Void) {
        self.routine = routine
        self.onUpdate = onUpdate
        _current = State(initialValue: routine)
    }

    var body: some View {
        List {
            // 基本情報
            Section("基本情報") {
                if isEditing {
                    TextField("タスク名", text: $editTitle)
                } else {
                    LabeledContent("タスク名", value: current.title)
                }

                LabeledContent("繰り返し", value: current.frequency.label)

                if let next = current.nextRunAt {
                    LabeledContent("次回実行") {
                        Text(next.formatted(date: .abbreviated, time: .shortened))
                    }
                } else {
                    LabeledContent("次回実行", value: "—")
                }

                HStack {
                    Text("有効")
                    Spacer()
                    if isEditing {
                        Toggle("", isOn: $editIsActive)
                            .labelsHidden()
                    } else {
                        Toggle("", isOn: Binding(
                            get: { current.isActive },
                            set: { _ in Task { await toggleActive() } }
                        ))
                        .labelsHidden()
                    }
                }

                LabeledContent("スケジュール", value: current.scheduleLabel())
            }

            // Zapの基準
            Section("Zapの基準（任意）") {
                if isEditing {
                    TextField("例：提出していなければZap", text: $editZapCriteria, axis: .vertical)
                        .lineLimit(3...6)
                } else {
                    Text(current.zapCriteria?.isEmpty == false ? current.zapCriteria! : "未設定")
                        .foregroundStyle(current.zapCriteria?.isEmpty == false ? .primary : .secondary)
                }
            }

            // カスタム日時
            if current.frequency == .custom {
                Section("実行日時リスト") {
                    if isEditing {
                        ForEach(editCustomDatetimes.indices, id: \.self) { i in
                            HStack {
                                Text(editCustomDatetimes[i].formatted(date: .abbreviated, time: .shortened))
                                Spacer()
                                Button(role: .destructive) {
                                    editCustomDatetimes.remove(at: i)
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .foregroundStyle(.red)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        Button {
                            showCustomDatePicker = true
                        } label: {
                            Label("日時を追加", systemImage: "plus")
                        }
                    } else {
                        let datetimes = current.customDatetimes ?? []
                        if datetimes.isEmpty {
                            Text("日時がありません")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(datetimes.indices, id: \.self) { i in
                                Text(datetimes[i].formatted(date: .abbreviated, time: .shortened))
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

            // 削除
            if !isEditing {
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        HStack {
                            Spacer()
                            if isDeleting {
                                ProgressView()
                            } else {
                                Text("ルーティーンを削除")
                            }
                            Spacer()
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("ルーティーン詳細")
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
                    .disabled(isSaving || editTitle.trimmingCharacters(in: .whitespaces).isEmpty)
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
        .confirmationDialog("ルーティーンを削除しますか？", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                Task { await deleteRoutine() }
            }
            Button("キャンセル", role: .cancel) {}
        }
        .sheet(isPresented: $showCustomDatePicker) {
            NavigationStack {
                Form {
                    DatePicker(
                        "日時を選択",
                        selection: $newCustomDate,
                        in: Date.now...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .datePickerStyle(.graphical)
                }
                .navigationTitle("日時を追加")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("キャンセル") { showCustomDatePicker = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("追加") {
                            editCustomDatetimes.append(newCustomDate)
                            editCustomDatetimes.sort()
                            showCustomDatePicker = false
                        }
                    }
                }
            }
        }
    }

    private func resetEditState() {
        editTitle = current.title
        editZapCriteria = current.zapCriteria ?? ""
        editCustomDatetimes = current.customDatetimes ?? []
        editIsActive = current.isActive
    }

    private func toggleActive() async {
        do {
            let updated = try await APIClient.shared.updateRoutine(
                routineId: current.id,
                isActive: !current.isActive
            )
            current = updated
            onUpdate()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func saveEdits() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let updated = try await APIClient.shared.updateRoutine(
                routineId: current.id,
                title: editTitle.trimmingCharacters(in: .whitespaces),
                zapCriteria: editZapCriteria.trimmingCharacters(in: .whitespaces),
                isActive: editIsActive,
                customDatetimes: current.frequency == .custom ? editCustomDatetimes : nil
            )
            current = updated
            isEditing = false
            onUpdate()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteRoutine() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await APIClient.shared.deleteRoutine(routineId: current.id)
            onUpdate()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        RoutineDetailView(
            routine: Routine(
                id: "1",
                ownerUserId: "u1",
                controllerUserId: nil,
                title: "毎日の運動",
                zapCriteria: "30分以上運動しなければZap",
                reminderMinutes: 15,
                frequency: .daily,
                customDatetimes: nil,
                isActive: true,
                createdAt: .now,
                nextRunAt: Calendar.current.date(byAdding: .day, value: 1, to: .now)
            ),
            onUpdate: {}
        )
    }
}
