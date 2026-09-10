import SwiftUI

/// 起動直後に表示する、パッケージから即タスク作成できる画面。
/// 複数のパッケージを選択して、まとめてタスク作成できる。
struct QuickPackageView: View {
    let onFinished: () -> Void

    @State private var packages: [Package] = []
    @State private var isLoading: Bool = true
    @State private var selectedIds: Set<String> = []
    @State private var isCreating: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showCreatePackage: Bool = false
    @State private var showCreateTask: Bool = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("読み込み中...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if packages.isEmpty {
                    emptyView
                } else {
                    packageList
                }
            }
            .navigationTitle("パッケージでタスク作成")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("スキップ") { onFinished() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if !selectedIds.isEmpty {
                        Button {
                            Task { await createFromSelected() }
                        } label: {
                            HStack {
                                Spacer()
                                if isCreating {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("選択した\(selectedIds.count)件でタスク作成")
                                        .fontWeight(.semibold)
                                }
                                Spacer()
                            }
                            .frame(height: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isCreating)
                    }
                    Button("新しいパッケージを作る") { showCreatePackage = true }
                        .font(.subheadline)
                    Button("通常のタスクを作成") { showCreateTask = true }
                        .font(.subheadline)
                }
                .padding()
                .background(.bar)
            }
            .alert("エラー", isPresented: .constant(errorMessage != nil), actions: {
                Button("OK") { errorMessage = nil }
            }, message: {
                Text(errorMessage ?? "")
            })
            .sheet(isPresented: $showCreatePackage, onDismiss: {
                Task { await load() }
            }) {
                CreatePackageView()
            }
            .sheet(isPresented: $showCreateTask, onDismiss: {
                onFinished()
            }) {
                CreateTaskView()
            }
            .task {
                await load()
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "shippingbox")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("まだパッケージがありません")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var packageList: some View {
        List(packages) { pkg in
            Button {
                toggleSelect(pkg.id)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: selectedIds.contains(pkg.id) ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selectedIds.contains(pkg.id) ? Color.accentColor : .secondary)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(pkg.title)
                            .font(.body.bold())
                            .foregroundStyle(.primary)
                        Text("\(pkg.items.count)件 ・ \(pkg.timeOfDayLabel)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }
            .disabled(isCreating)
        }
        .listStyle(.insetGrouped)
    }

    private func toggleSelect(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let result = try await APIClient.shared.getPackages()
            packages = result
            let validIds = Set(result.map { $0.id })
            selectedIds = selectedIds.filter { validIds.contains($0) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createFromSelected() async {
        let selected = packages.filter { selectedIds.contains($0.id) }
        guard !selected.isEmpty else { return }

        isCreating = true
        errorMessage = nil
        defer { isCreating = false }

        var failed: [Package] = []

        await withTaskGroup(of: (Package, Bool).self) { group in
            for pkg in selected {
                group.addTask {
                    do {
                        _ = try await APIClient.shared.usePackage(packageId: pkg.id, dueAt: pkg.todayAtTimeOfDay)
                        return (pkg, true)
                    } catch {
                        return (pkg, false)
                    }
                }
            }
            for await (pkg, success) in group {
                if !success {
                    failed.append(pkg)
                }
            }
        }

        if failed.isEmpty {
            onFinished()
            return
        }

        selectedIds = Set(failed.map { $0.id })
        let titles = failed.map { $0.title }.joined(separator: "、")
        errorMessage = "\(failed.count)件の作成に失敗しました（\(titles)）。他は作成済みです。"
    }
}

#Preview {
    QuickPackageView(onFinished: {})
}
