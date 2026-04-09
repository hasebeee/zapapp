import SwiftUI

struct OwnerHomeView: View {
    @EnvironmentObject private var appState: AppState

    @State private var tasks: [AppTask] = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showCreateTask: Bool = false
    @State private var showInvite: Bool = false
    @State private var selectedTask: AppTask? = nil

    // ステータスでグループ化する順序
    private let statusOrder: [TaskStatus] = [
        .readyToZap, .readyToReZap, .waitingAck, .scheduled, .closed
    ]

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && tasks.isEmpty {
                    ProgressView("読み込み中...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if tasks.isEmpty {
                    emptyView
                } else {
                    taskList
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
                        showCreateTask = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await loadTasks() }
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
            .sheet(isPresented: $showInvite) {
                InviteView()
            }
            .navigationDestination(item: $selectedTask) { task in
                TaskDetailView(task: task, onUpdate: {
                    Task { await loadTasks() }
                })
            }
            .alert("エラー", isPresented: .constant(errorMessage != nil), actions: {
                Button("OK") { errorMessage = nil }
            }, message: {
                Text(errorMessage ?? "")
            })
            .task {
                await loadTasks()
            }
            .refreshable {
                await loadTasks()
            }
        }
    }

    // MARK: - Subviews

    private var emptyView: some View {
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
        List {
            ForEach(statusOrder, id: \.self) { status in
                let filtered = tasks.filter { $0.status == status }
                if !filtered.isEmpty {
                    Section(header: Text(status.label)) {
                        ForEach(filtered) { task in
                            TaskRowView(task: task)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    selectedTask = task
                                }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Data Loading

    private func loadTasks() async {
        isLoading = true
        defer { isLoading = false }

        do {
            tasks = try await APIClient.shared.getTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
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

#Preview {
    OwnerHomeView()
        .environmentObject(AppState())
}
