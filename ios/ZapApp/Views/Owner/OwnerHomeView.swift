import SwiftUI

// MARK: - DueDateFilter

enum DueDateFilter: String, CaseIterable {
    case all     = "すべて"
    case today   = "今日"
    case week    = "今週"
    case month   = "今月"

    func matches(_ date: Date) -> Bool {
        let cal = Calendar.current
        let now = Date.now
        switch self {
        case .all:   return true
        case .today: return cal.isDate(date, inSameDayAs: now)
        case .week:  return cal.isDate(date, equalTo: now, toGranularity: .weekOfYear)
        case .month: return cal.isDate(date, equalTo: now, toGranularity: .month)
        }
    }
}

// MARK: - HomeTab

enum HomeTab: String, CaseIterable {
    case tasks    = "タスク"
    case packages = "パッケージ"
}

// MARK: - OwnerHomeView

struct OwnerHomeView: View {
    @EnvironmentObject private var appState: AppState

    @State private var activeTab: HomeTab = .tasks

    // Tasks
    @State private var tasks: [AppTask] = []
    @State private var relationships: [Relationship] = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showCreateTask: Bool = false
    @State private var showInvite: Bool = false
    @State private var selectedTask: AppTask? = nil
    @State private var selectedControllerFilter: String? = nil
    @State private var selectedDueDateFilter: DueDateFilter = .all
    @State private var showOtherStatuses: Bool = false

    // Packages
    @State private var packages: [Package] = []
    @State private var showCreatePackage: Bool = false
    @State private var selectedPackage: Package? = nil

    private let statusOrder: [TaskStatus] = [.scheduled]
    private let dropdownStatusOrder: [TaskStatus] = [.readyToZap, .readyToReZap, .waitingAck]

    private var filteredTasks: [AppTask] {
        tasks.filter { task in
            guard task.status != .closed else { return false }
            let controllerMatch: Bool = {
                guard let filter = selectedControllerFilter else { return true }
                return task.controllerUserId == filter
            }()
            let dateMatch = selectedDueDateFilter.matches(task.dueAt)
            return controllerMatch && dateMatch
        }
    }

    private var isFiltering: Bool {
        selectedControllerFilter != nil || selectedDueDateFilter != .all
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // セグメントコントロール
                Picker("", selection: $activeTab) {
                    ForEach(HomeTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(Color(.systemGroupedBackground))

                if activeTab == .tasks {
                    taskContent
                } else {
                    packageContent
                }
            }
            .navigationTitle("マイタスク")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showInvite = true
                    } label: {
                        Label("招待", systemImage: "person.badge.plus")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        if activeTab == .tasks {
                            showCreateTask = true
                        } else {
                            showCreatePackage = true
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await loadAll() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .sheet(isPresented: $showCreateTask, onDismiss: {
                Task { await loadTasks() }
            }) {
                CreateTaskView()
            }
            .sheet(isPresented: $showCreatePackage, onDismiss: {
                Task { await loadPackages() }
            }) {
                CreatePackageView()
            }
            .sheet(isPresented: $showInvite) {
                InviteView()
            }
            .navigationDestination(item: $selectedTask) { task in
                TaskDetailView(task: task, onUpdate: {
                    Task { await loadTasks() }
                })
            }
            .navigationDestination(item: $selectedPackage) { pkg in
                PackageDetailView(package: pkg, onUpdate: {
                    Task { await loadPackages() }
                })
            }
            .alert("エラー", isPresented: .constant(errorMessage != nil), actions: {
                Button("OK") { errorMessage = nil }
            }, message: {
                Text(errorMessage ?? "")
            })
            .task {
                await loadAll()
                appState.ownerBadgeCount = 0
            }
            .refreshable {
                await loadAll()
            }
            .onReceive(NotificationCenter.default.publisher(for: .pushNotificationReceived)) { _ in
                Task {
                    await loadAll()
                    appState.ownerBadgeCount = 0
                }
            }
        }
    }

    // MARK: - Task Content

    @ViewBuilder
    private var taskContent: some View {
        Group {
            if isLoading && tasks.isEmpty {
                ProgressView("読み込み中...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredTasks.isEmpty && tasks.isEmpty {
                taskEmptyView
            } else {
                VStack(spacing: 0) {
                    filterBar
                    taskList
                }
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Menu {
                    Button {
                        selectedControllerFilter = nil
                    } label: {
                        Label("すべての監視者", systemImage: selectedControllerFilter == nil ? "checkmark" : "")
                    }
                    ForEach(controllerOptions, id: \.id) { option in
                        Button {
                            selectedControllerFilter = option.id
                        } label: {
                            Label(option.name, systemImage: selectedControllerFilter == option.id ? "checkmark" : "")
                        }
                    }
                } label: {
                    FilterChip(
                        label: controllerFilterLabel,
                        systemImage: "person.fill",
                        isActive: selectedControllerFilter != nil
                    )
                }

                Menu {
                    ForEach(DueDateFilter.allCases, id: \.self) { filter in
                        Button {
                            selectedDueDateFilter = filter
                        } label: {
                            Label(filter.rawValue, systemImage: selectedDueDateFilter == filter ? "checkmark" : "")
                        }
                    }
                } label: {
                    FilterChip(
                        label: selectedDueDateFilter.rawValue,
                        systemImage: "calendar",
                        isActive: selectedDueDateFilter != .all
                    )
                }

                if isFiltering {
                    Button {
                        selectedControllerFilter = nil
                        selectedDueDateFilter = .all
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .font(.title3)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(.systemGroupedBackground))
    }

    private var taskEmptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("タスクがありません")
                .font(.title3)
                .foregroundStyle(.secondary)
            Button("タスクを作成") {
                showCreateTask = true
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var taskList: some View {
        Group {
            if filteredTasks.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text("該当するタスクがありません")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("フィルターをリセット") {
                        selectedControllerFilter = nil
                        selectedDueDateFilter = .all
                    }
                    .font(.subheadline)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(statusOrder, id: \.self) { status in
                        let filtered = filteredTasks.filter { $0.status == status }
                        if !filtered.isEmpty {
                            Section(header: Text(status.label)) {
                                ForEach(filtered) { task in
                                    TaskRowView(task: task)
                                        .contentShape(Rectangle())
                                        .onTapGesture { selectedTask = task }
                                }
                            }
                        }
                    }

                    let otherTasks = dropdownStatusOrder.flatMap { status in
                        filteredTasks.filter { $0.status == status }
                    }
                    if !otherTasks.isEmpty {
                        Section {
                            DisclosureGroup(isExpanded: $showOtherStatuses) {
                                ForEach(dropdownStatusOrder, id: \.self) { status in
                                    let filtered = filteredTasks.filter { $0.status == status }
                                    if !filtered.isEmpty {
                                        Text(status.label)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .padding(.top, 4)
                                        ForEach(filtered) { task in
                                            TaskRowView(task: task)
                                                .contentShape(Rectangle())
                                                .onTapGesture { selectedTask = task }
                                        }
                                    }
                                }
                            } label: {
                                HStack {
                                    Text("その他")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Text("\(otherTasks.count)件")
                                        .font(.caption)
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

    // MARK: - Package Content

    @ViewBuilder
    private var packageContent: some View {
        if isLoading && packages.isEmpty {
            ProgressView("読み込み中...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if packages.isEmpty {
            packageEmptyView
        } else {
            packageList
        }
    }

    private var packageEmptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "shippingbox")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("パッケージがありません")
                .font(.title3)
                .foregroundStyle(.secondary)
            Button("パッケージを作成") {
                showCreatePackage = true
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var packageList: some View {
        List(packages) { pkg in
            PackageRowView(package: pkg)
                .contentShape(Rectangle())
                .onTapGesture { selectedPackage = pkg }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Helpers

    private var controllerOptions: [(id: String, name: String)] {
        let ids = Set(tasks.filter { $0.status != .closed }.compactMap { $0.controllerUserId })
        return ids.map { id in
            let name = relationships
                .first(where: { $0.controllerUserId == id })
                .flatMap { $0.controllerUser }
                .map { $0.displayName ?? $0.email }
                ?? String(id.prefix(8))
            return (id: id, name: name)
        }
        .sorted { $0.name < $1.name }
    }

    private var controllerFilterLabel: String {
        guard let id = selectedControllerFilter else { return "監視者" }
        return controllerOptions.first(where: { $0.id == id })?.name ?? String(id.prefix(8))
    }

    // MARK: - Data Loading

    private func loadAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await loadTasks() }
            group.addTask { await loadRelationships() }
            group.addTask { await loadPackages() }
        }
    }

    private func loadTasks() async {
        isLoading = true
        defer { isLoading = false }
        do {
            tasks = try await APIClient.shared.getTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadRelationships() async {
        do {
            relationships = try await APIClient.shared.getRelationships()
        } catch {}
    }

    private func loadPackages() async {
        do {
            packages = try await APIClient.shared.getPackages()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - FilterChip

struct FilterChip: View {
    let label: String
    let systemImage: String
    let isActive: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption)
            Text(label)
                .font(.subheadline)
            Image(systemName: "chevron.down")
                .font(.caption2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(isActive ? Color.accentColor.opacity(0.15) : Color(.secondarySystemGroupedBackground))
        .foregroundStyle(isActive ? Color.accentColor : .primary)
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .strokeBorder(isActive ? Color.accentColor.opacity(0.5) : Color(.separator), lineWidth: 1)
        )
    }
}

// MARK: - TaskRowView

struct TaskRowView: View {
    let task: AppTask

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(task.title)
                    .font(.body)
                    .lineLimit(2)
                Spacer()
                statusBadge
            }
            HStack {
                Image(systemName: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(task.dueAt, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                + Text(" 締切")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusBadge: some View {
        Text(task.status.label)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(statusColor.opacity(0.2))
            .foregroundStyle(statusColor)
            .clipShape(Capsule())
    }

    private var statusColor: Color {
        switch task.status {
        case .readyToZap, .readyToReZap: return .red
        case .waitingAck:                return .orange
        case .scheduled:                 return .blue
        case .closed:                    return .green
        }
    }
}

// MARK: - PackageRowView

struct PackageRowView: View {
    let package: Package

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(package.title)
                    .font(.body)
                    .lineLimit(2)
                Spacer()
                itemCountBadge
            }
            HStack {
                Image(systemName: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(package.timeOfDayLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var itemCountBadge: some View {
        Text("\(package.items.count)件")
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.blue.opacity(0.15))
            .foregroundStyle(Color.blue)
            .clipShape(Capsule())
    }
}

#Preview {
    OwnerHomeView()
        .environmentObject(AppState())
}
