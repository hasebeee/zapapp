import SwiftUI

struct ControllerHomeView: View {
    @EnvironmentObject private var appState: AppState

    @State private var relationships: [Relationship] = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && relationships.isEmpty {
                    ProgressView("読み込み中...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if relationships.isEmpty {
                    emptyView
                } else {
                    relationshipList
                }
            }
            .navigationTitle("監視する")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await loadRelationships() }
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
            .task {
                await loadRelationships()
            }
            .refreshable {
                await loadRelationships()
            }
        }
    }

    // MARK: - Subviews

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "bolt.slash.fill")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("監視対象がいません")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("相手からの招待を受諾するか、招待を送って接続しましょう。")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var relationshipList: some View {
        List(ownerRelationships) { relationship in
            NavigationLink {
                OwnerTaskListView(
                    ownerUserId: relationship.ownerUserId,
                    ownerName: ownerDisplayName(for: relationship)
                )
            } label: {
                RelationshipRowView(relationship: relationship,
                                    myUserId: appState.uid ?? "")
            }
        }
        .listStyle(.insetGrouped)
    }

    /// 自分が Controller 側のリレーションシップのみ抽出
    private var ownerRelationships: [Relationship] {
        relationships.filter { $0.controllerUserId == appState.uid }
    }

    private func ownerDisplayName(for relationship: Relationship) -> String {
        relationship.ownerUser?.displayName
            ?? relationship.ownerUser?.email
            ?? relationship.ownerUserId
    }

    // MARK: - Data Loading

    private func loadRelationships() async {
        isLoading = true
        defer { isLoading = false }

        do {
            relationships = try await APIClient.shared.getRelationships()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - RelationshipRowView

struct RelationshipRowView: View {
    let relationship: Relationship
    let myUserId: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(.accentColor)

            VStack(alignment: .leading, spacing: 4) {
                Text(displayName)
                    .font(.body.bold())
                Text(email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var displayName: String {
        if relationship.controllerUserId == myUserId {
            return relationship.ownerUser?.displayName
                ?? relationship.ownerUser?.email
                ?? "不明なユーザー"
        } else {
            return relationship.controllerUser?.displayName
                ?? relationship.controllerUser?.email
                ?? "不明なユーザー"
        }
    }

    private var email: String {
        if relationship.controllerUserId == myUserId {
            return relationship.ownerUser?.email ?? relationship.ownerUserId
        } else {
            return relationship.controllerUser?.email ?? relationship.controllerUserId
        }
    }
}

#Preview {
    ControllerHomeView()
        .environmentObject(AppState())
}
