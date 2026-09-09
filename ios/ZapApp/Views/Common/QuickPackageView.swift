import SwiftUI

/// 起動直後に表示する、パッケージから即タスク作成できる画面。
struct QuickPackageView: View {
    let onFinished: () -> Void

    @State private var packages: [Package] = []
    @State private var isLoading: Bool = true
    @State private var usingPackageId: String? = nil
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
                    Button("新しいパッケージを作る") { showCreatePackage = true }
                    Button("通常のタスクを作成") { showCreateTask = true }
                }
                .font(.subheadline)
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
                Task { await use(pkg) }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(pkg.title)
                            .font(.body.bold())
                            .foregroundStyle(.primary)
                        Text("\(pkg.items.count)件 ・ \(pkg.timeOfDayLabel)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if usingPackageId == pkg.id {
                        ProgressView()
                    } else {
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(usingPackageId != nil)
        }
        .listStyle(.insetGrouped)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            packages = try await APIClient.shared.getPackages()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func use(_ pkg: Package) async {
        usingPackageId = pkg.id
        errorMessage = nil
        do {
            _ = try await APIClient.shared.usePackage(packageId: pkg.id, dueAt: pkg.todayAtTimeOfDay)
            onFinished()
        } catch {
            errorMessage = error.localizedDescription
            usingPackageId = nil
        }
    }
}

#Preview {
    QuickPackageView(onFinished: {})
}
