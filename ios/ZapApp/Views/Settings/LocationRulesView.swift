import SwiftUI
import CoreLocation

/// 「場所でZap」の場所一覧
struct LocationRulesView: View {
    @State private var rules: [LocationRule] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var showAddRule = false
    @State private var authorizationStatus = LocationMonitor.shared.authorizationStatus

    var body: some View {
        List {
            if authorizationStatus != .authorizedAlways {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("位置情報を「常に」許可してください", systemImage: "location.slash")
                            .font(.subheadline.bold())
                            .foregroundStyle(.orange)
                        Text("アプリを閉じている間も場所への出入りを検知するために必要です。")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button(authorizationStatus == .notDetermined ? "許可する" : "設定を開く") {
                            if authorizationStatus == .notDetermined {
                                LocationMonitor.shared.requestAlwaysAuthorization()
                            } else if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                        .font(.subheadline)
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                if rules.isEmpty && !isLoading {
                    Text("登録した場所はありません")
                        .foregroundStyle(.secondary)
                }
                ForEach(rules) { rule in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rule.title)
                            .font(.body.bold())
                        Text("半径\(rule.radiusMeters)m・\(rule.dwellMinutes)分滞在でZap")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
                .onDelete(perform: deleteRules)
            } footer: {
                Text("登録した場所に指定の時間いると自動でZapされます。電源オフ・機内モードなどで位置を確認できない時はZapされません。最大20か所まで登録できます。")
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .navigationTitle("場所でZap")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddRule = true
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(rules.count >= 20)
            }
        }
        .overlay {
            if isLoading && rules.isEmpty {
                ProgressView()
            }
        }
        .sheet(isPresented: $showAddRule, onDismiss: {
            Task { await load() }
        }) {
            AddLocationRuleView()
        }
        .task {
            await load()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            authorizationStatus = LocationMonitor.shared.authorizationStatus
        }
        .refreshable {
            await load()
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        authorizationStatus = LocationMonitor.shared.authorizationStatus
        do {
            rules = try await APIClient.shared.getLocationRules()
            errorMessage = nil
            LocationMonitor.shared.sync(rules: rules)
        } catch {
            errorMessage = "読み込みに失敗しました: \(error.localizedDescription)"
        }
    }

    private func deleteRules(at offsets: IndexSet) {
        let targets = offsets.map { rules[$0] }
        rules.remove(atOffsets: offsets)
        Task {
            for rule in targets {
                do {
                    try await APIClient.shared.deleteLocationRule(ruleId: rule.id)
                } catch {
                    errorMessage = "削除に失敗しました: \(error.localizedDescription)"
                }
            }
            await load()
        }
    }
}

#Preview {
    NavigationStack {
        LocationRulesView()
    }
}
