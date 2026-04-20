import SwiftUI

struct PavlokRegistrationView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    @State private var isScanning: Bool = false
    @State private var isSaving: Bool = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil

    @ObservedObject private var pavlokService = PavlokService.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 64))
                    .foregroundStyle(.blue)

                VStack(spacing: 8) {
                    Text("Pavlokを登録する")
                        .font(.title2.bold())
                    Text("近くのPavlokをスキャンして、自分のデバイスを選んでください。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                // 登録済み表示
                if let registeredId = appState.pavlokPeripheralId {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("登録済み: \(registeredId.prefix(8))...")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                }

                // スキャンボタン
                Button {
                    if isScanning {
                        pavlokService.stopRegistrationScan()
                        isScanning = false
                    } else {
                        pavlokService.startRegistrationScan()
                        isScanning = true
                        errorMessage = nil
                        successMessage = nil
                    }
                } label: {
                    HStack {
                        if isScanning {
                            ProgressView()
                                .tint(.white)
                                .scaleEffect(0.9)
                            Text("スキャン中... (タップで停止)")
                        } else {
                            Image(systemName: "antenna.radiowaves.left.and.right")
                            Text("スキャン開始")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(isScanning ? .gray : .blue)
                .padding(.horizontal)

                // 見つかったデバイス一覧
                if !pavlokService.discoveredPeripherals.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("見つかったデバイス")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(pavlokService.discoveredPeripherals, id: \.id) { device in
                            Button {
                                Task { await registerDevice(id: device.id, name: device.name) }
                            } label: {
                                HStack {
                                    Image(systemName: "bolt.circle.fill")
                                        .foregroundStyle(.yellow)
                                        .font(.title2)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(device.name)
                                            .font(.body.bold())
                                            .foregroundStyle(.primary)
                                        Text(device.id.prefix(8) + "...")
                                            .font(.caption.monospaced())
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if isSaving {
                                        ProgressView()
                                    } else {
                                        Text("登録")
                                            .font(.subheadline.bold())
                                            .foregroundStyle(.blue)
                                    }
                                }
                                .padding()
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                                .padding(.horizontal)
                            }
                            .disabled(isSaving)
                        }
                    }
                }

                if let successMessage {
                    Text(successMessage)
                        .foregroundStyle(.green)
                        .font(.subheadline)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Spacer()
            }
            .navigationTitle("Pavlok登録")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") {
                        pavlokService.stopRegistrationScan()
                        dismiss()
                    }
                }
            }
            .onDisappear {
                pavlokService.stopRegistrationScan()
            }
        }
    }

    private func registerDevice(id: String, name: String) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await APIClient.shared.savePavlokPeripheralId(id)
            appState.pavlokPeripheralId = id
            pavlokService.stopRegistrationScan()
            isScanning = false
            successMessage = "「\(name)」を登録しました"
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    PavlokRegistrationView()
        .environmentObject(AppState())
}
