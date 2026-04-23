import SwiftUI

struct PavlokRegistrationView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    @State private var isScanning: Bool = false
    @State private var isSaving: Bool = false
    @State private var isVerifying: Bool = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil

    @ObservedObject private var pavlokService = PavlokService.shared

    var body: some View {
        NavigationStack {
            ScrollView {
            VStack(spacing: 24) {
                Spacer(minLength: 16)

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
                        VStack(alignment: .leading, spacing: 2) {
                            Text("見つかったデバイス (\(pavlokService.discoveredPeripherals.count)台)")
                                .font(.headline)
                            Text("Pavlokに近づいて、一番電波が強いデバイスを選んでください")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal)

                        ForEach(pavlokService.discoveredPeripherals, id: \.id) { device in
                            Button {
                                Task { await registerDevice(id: device.id, name: device.name) }
                            } label: {
                                HStack {
                                    Image(systemName: device.isPavlok ? "bolt.circle.fill" : "questionmark.circle")
                                        .foregroundStyle(device.isPavlok ? Color.yellow : Color.secondary)
                                        .font(.title2)
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(device.name)
                                                .font(.body.bold())
                                                .foregroundStyle(.primary)
                                            if device.isPavlok {
                                                Text("Pavlok")
                                                    .font(.caption2.bold())
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(Color.yellow.opacity(0.2))
                                                    .foregroundStyle(Color.orange)
                                                    .clipShape(Capsule())
                                            }
                                        }
                                        Text(device.id.prefix(8) + "...")
                                            .font(.caption.monospaced())
                                            .foregroundStyle(.secondary)
                                        Text(device.rssiLabel)
                                            .font(.caption2)
                                            .foregroundStyle(device.isPavlok ? Color.orange : Color.blue)
                                    }
                                    Spacer()
                                    if isSaving || isVerifying {
                                        VStack(spacing: 2) {
                                            ProgressView()
                                            Text(isVerifying ? "確認中..." : "保存中...")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                    } else {
                                        Text("登録")
                                            .font(.subheadline.bold())
                                            .foregroundStyle(.blue)
                                    }
                                }
                                .padding()
                                .background(device.isPavlok ? AnyShapeStyle(Color.yellow.opacity(0.07)) : AnyShapeStyle(.regularMaterial), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .strokeBorder(device.isPavlok ? Color.orange.opacity(0.4) : Color.clear, lineWidth: 1.5)
                                )
                                .padding(.horizontal)
                            }
                            .disabled(isSaving || isVerifying)
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

                Spacer(minLength: 16)
            }
            } // ScrollView
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
        errorMessage = nil
        successMessage = nil
        pavlokService.stopRegistrationScan()
        isScanning = false

        // Step 1: 接続してPavlokか確認（先に検証してからサーバー保存）
        isVerifying = true
        do {
            try await pavlokService.verifyAsPavlok(peripheralId: id)
        } catch PavlokError.serviceNotFound, PavlokError.characteristicNotFound {
            isVerifying = false
            errorMessage = "このデバイスはPavlokではありません。Pavlokに近づいて別のデバイスを選んでください。"
            return
        } catch {
            isVerifying = false
            errorMessage = "Pavlokへの接続を確認できませんでした。Pavlokの電源を確認して再試行してください。（\(error.localizedDescription)）"
            return
        }
        isVerifying = false

        // Step 2: 確認できたらサーバーに保存
        isSaving = true
        defer { isSaving = false }
        do {
            try await APIClient.shared.savePavlokPeripheralId(id)
            appState.pavlokPeripheralId = id
            successMessage = "✓ Pavlokを確認しました！「\(name)」を登録しました"
        } catch {
            errorMessage = "保存に失敗しました: \(error.localizedDescription)"
        }
    }
}

#Preview {
    PavlokRegistrationView()
        .environmentObject(AppState())
}
