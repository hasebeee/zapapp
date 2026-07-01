import SwiftUI

struct CreateRoutineView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    @State private var title: String = ""
    @State private var zapCriteria: String = ""
    @State private var frequency: RoutineFrequency = .daily
    @State private var firstRunAt: Date = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
    @State private var customDatetimes: [Date] = []
    @State private var showCustomDatePicker: Bool = false
    @State private var newCustomDate: Date = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
    @State private var selectedRelationship: Relationship? = nil
    @State private var relationships: [Relationship] = []
    @State private var reminderMinutes: Int = 5
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil

    private let reminderOptions: [(label: String, value: Int)] = [
        ("なし", 0), ("5分前", 5), ("10分前", 10), ("15分前", 15), ("30分前", 30), ("1時間前", 60),
    ]

    private var controllerRelationships: [Relationship] {
        relationships.filter { $0.ownerUserId == appState.dbUserId }
    }

    private var isFormValid: Bool {
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if frequency == .custom {
            return !customDatetimes.isEmpty && customDatetimes.contains { $0 > .now }
        }
        return firstRunAt > .now
    }

    private var schedulePreview: String {
        guard frequency != .custom else { return "選択した日時にタスクを作成します" }
        let time = DateFormatter.localizedString(from: firstRunAt, dateStyle: .none, timeStyle: .short)
        let weekdays = ["日", "月", "火", "水", "木", "金", "土"]
        switch frequency {
        case .daily:
            return "毎日 \(time) にタスクが自動作成されます"
        case .weekly:
            let wd = Calendar.current.component(.weekday, from: firstRunAt) - 1
            return "毎週\(weekdays[wd])曜 \(time) にタスクが自動作成されます"
        case .monthly:
            let d = Calendar.current.component(.day, from: firstRunAt)
            return "毎月\(d)日 \(time) にタスクが自動作成されます"
        case .custom:
            return ""
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("タスク情報") {
                    TextField("タスク名", text: $title)
                        .submitLabel(.next)
                }

                Section {
                    TextField("例：レポートを提出していなければZap", text: $zapCriteria, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("Zapの基準（任意）")
                }

                // 繰り返し設定
                Section("繰り返し設定") {
                    Picker("種別", selection: $frequency) {
                        ForEach(RoutineFrequency.allCases, id: \.self) { freq in
                            Text(freq.label).tag(freq)
                        }
                    }
                    .pickerStyle(.segmented)

                    if frequency != .custom {
                        DatePicker(
                            "最初の実行日時",
                            selection: $firstRunAt,
                            in: Date.now...,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        Text(schedulePreview)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // カスタム日時リスト
                if frequency == .custom {
                    Section {
                        ForEach(customDatetimes.indices, id: \.self) { i in
                            HStack {
                                Text(customDatetimes[i].formatted(date: .abbreviated, time: .shortened))
                                Spacer()
                                Button(role: .destructive) {
                                    customDatetimes.remove(at: i)
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
                    } header: {
                        Text("実行する日時リスト")
                    }
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

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("ルーティーン作成")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("作成") {
                        Task { await createRoutine() }
                    }
                    .disabled(isLoading || !isFormValid)
                    .overlay {
                        if isLoading { ProgressView().scaleEffect(0.8) }
                    }
                }
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
                                customDatetimes.append(newCustomDate)
                                customDatetimes.sort()
                                showCustomDatePicker = false
                                newCustomDate = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
                            }
                        }
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

    private func createRoutine() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            _ = try await APIClient.shared.createRoutine(
                title: title.trimmingCharacters(in: .whitespaces),
                zapCriteria: zapCriteria.trimmingCharacters(in: .whitespaces),
                controllerUserId: selectedRelationship?.controllerUserId,
                reminderMinutes: reminderMinutes,
                frequency: frequency,
                firstRunAt: frequency != .custom ? firstRunAt : nil,
                customDatetimes: frequency == .custom ? customDatetimes : nil
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    CreateRoutineView()
        .environmentObject(AppState())
}
