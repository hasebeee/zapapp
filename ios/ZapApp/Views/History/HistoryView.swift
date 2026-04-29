import SwiftUI

// MARK: - HistoryScope

enum HistoryScope: String, CaseIterable {
    case owner      = "自分のタスク"
    case controller = "監視したタスク"
}

// MARK: - HistoryView

struct HistoryView: View {
    @EnvironmentObject private var appState: AppState

    @State private var scope: HistoryScope = .owner
    @State private var myClosedTasks: [AppTask] = []
    @State private var monitoredSections: [(ownerName: String, tasks: [AppTask])] = []
    @State private var relationships: [Relationship] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // セグメントピッカー
                Picker("", selection: $scope) {
                    ForEach(HistoryScope.allCases, id: \.self) { s in
                        Text(s.rawValue).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(Color(.systemGroupedBackground))

                if isLoading {
                    ProgressView("読み込み中...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    switch scope {
                    case .owner:      ownerHistoryList
                    case .controller: controllerHistoryList
                    }
                }
            }
            .navigationTitle("履歴")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await loadAll() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .alert("エラー", isPresented: .constant(errorMessage != nil), actions: {
                Button("OK") { errorMessage = nil }
            }, message: {
                Text(errorMessage ?? "")
            })
            .task { await loadAll() }
            .refreshable { await loadAll() }
        }
    }

    // MARK: - Owner History

    private var ownerHistoryList: some View {
        Group {
            if myClosedTasks.isEmpty {
                emptyView(
                    icon: "checkmark.circle",
                    message: "完了したタスクはありません",
                    sub: "タスクを完了すると、ここに履歴が残ります。"
                )
            } else {
                List {
                    Section {
                        ForEach(myClosedTasks) { task in
                            HistoryTaskRow(
                                task: task,
                                personLabel: controllerName(for: task).map { "監視: \($0)" }
                            )
                        }
                    } header: {
                        Text("完了済み \(myClosedTasks.count) 件")
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    // MARK: - Controller History

    private var controllerHistoryList: some View {
        let allEmpty = monitoredSections.allSatisfy { $0.tasks.isEmpty }
        return Group {
            if allEmpty {
                emptyView(
                    icon: "bolt.circle",
                    message: "監視したタスクの履歴はありません",
                    sub: "監視中のオーナーがタスクを完了すると、ここに表示されます。"
                )
            } else {
                List {
                    ForEach(monitoredSections, id: \.ownerName) { section in
                        if !section.tasks.isEmpty {
                            Section {
                                ForEach(section.tasks) { task in
                                    HistoryTaskRow(task: task, personLabel: nil)
                                }
                            } header: {
                                HStack(spacing: 6) {
                                    Image(systemName: "person.fill")
                                    Text(section.ownerName)
                                    Spacer()
                                    Text("\(section.tasks.count) 件")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    // MARK: - Empty View

    private func emptyView(icon: String, message: String, sub: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 56))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.title3.bold())
                .foregroundStyle(.secondary)
            Text(sub)
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helpers

    private func controllerName(for task: AppTask) -> String? {
        guard let cid = task.controllerUserId else { return nil }
        return relationships
            .first(where: { $0.controllerUserId == cid })
            .flatMap { $0.controllerUser }
            .map { $0.displayName ?? $0.email }
    }

    // MARK: - Data Loading

    private func loadAll() async {
        isLoading = true
        defer { isLoading = false }

        // リレーションシップを先に取得
        do {
            relationships = try await APIClient.shared.getRelationships()
        } catch {}

        await withTaskGroup(of: Void.self) { group in
            group.addTask { await loadMyClosedTasks() }
            group.addTask { await loadMonitoredClosedTasks() }
        }
    }

    private func loadMyClosedTasks() async {
        do {
            let tasks = try await APIClient.shared.getTasks(status: [.closed])
            let sorted = tasks.sorted {
                ($0.closedAt ?? $0.dueAt) > ($1.closedAt ?? $1.dueAt)
            }
            await MainActor.run { myClosedTasks = sorted }
        } catch {
            await MainActor.run { errorMessage = error.localizedDescription }
        }
    }

    private func loadMonitoredClosedTasks() async {
        let myOwnerRels = relationships.filter { $0.controllerUserId == appState.dbUserId }

        var result: [(ownerName: String, tasks: [AppTask])] = []
        await withTaskGroup(of: (String, [AppTask]).self) { group in
            for rel in myOwnerRels {
                let name = rel.ownerUser?.displayName ?? rel.ownerUser?.email ?? rel.ownerUserId
                let ownerUserId = rel.ownerUserId
                group.addTask {
                    let tasks = (try? await APIClient.shared.getOwnerTasks(
                        ownerUserId: ownerUserId,
                        status: [.closed]
                    )) ?? []
                    let sorted = tasks.sorted {
                        ($0.closedAt ?? $0.dueAt) > ($1.closedAt ?? $1.dueAt)
                    }
                    return (name, sorted)
                }
            }
            for await (name, tasks) in group {
                result.append((ownerName: name, tasks: tasks))
            }
        }
        let sorted = result.sorted { $0.ownerName < $1.ownerName }
        await MainActor.run { monitoredSections = sorted }
    }
}

// MARK: - HistoryTaskRow

struct HistoryTaskRow: View {
    let task: AppTask
    let personLabel: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // タイトル
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.body)
                    .padding(.top, 2)
                Text(task.title)
                    .font(.body.bold())
                    .lineLimit(2)
            }

            // 日付・人物ラベル
            HStack(spacing: 14) {
                if let closedAt = task.closedAt {
                    Label {
                        Text(closedAt.formatted(.dateTime.month().day().hour().minute()))
                            .font(.caption)
                            .foregroundStyle(.green)
                    } icon: {
                        Image(systemName: "flag.checkered")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }

                Label {
                    Text(task.dueAt.formatted(.dateTime.month().day().hour().minute()))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } icon: {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let label = personLabel {
                Label {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } icon: {
                    Image(systemName: "bolt.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    HistoryView()
        .environmentObject(AppState())
}
