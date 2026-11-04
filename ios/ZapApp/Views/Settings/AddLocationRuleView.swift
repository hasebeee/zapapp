import SwiftUI
import MapKit

/// 「場所でZap」の場所を登録する画面。
/// 地図を動かして中央のピンの位置を場所として登録する。
struct AddLocationRuleView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var radiusMeters = 150
    @State private var dwellMinutes = 15
    @State private var cameraPosition: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var center: CLLocationCoordinate2D? = nil
    @State private var isSaving = false
    @State private var errorMessage: String? = nil

    private static let radiusOptions = [100, 150, 200, 300, 500, 1000]

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && center != nil && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ZStack {
                        Map(position: $cameraPosition) {
                            UserAnnotation()
                            if let center {
                                MapCircle(center: center, radius: CLLocationDistance(radiusMeters))
                                    .foregroundStyle(.yellow.opacity(0.25))
                                    .stroke(.orange, lineWidth: 2)
                            }
                        }
                        .mapControls {
                            MapUserLocationButton()
                        }
                        .onMapCameraChange(frequency: .continuous) { context in
                            center = context.region.center
                        }

                        // 中央のピン（地図を動かして位置を合わせる）
                        Image(systemName: "mappin")
                            .font(.title)
                            .foregroundStyle(.red)
                            .offset(y: -12)
                            .allowsHitTesting(false)
                    }
                    .frame(height: 300)
                    .listRowInsets(EdgeInsets())
                } footer: {
                    Text("地図を動かして、ピンを登録したい場所に合わせてください。")
                }

                Section("場所の名前") {
                    TextField("例：コンビニ、ゲームセンター", text: $title)
                }

                Section {
                    Picker("範囲（半径）", selection: $radiusMeters) {
                        ForEach(Self.radiusOptions, id: \.self) { meters in
                            Text("\(meters)m").tag(meters)
                        }
                    }
                    Stepper("滞在時間：\(dwellMinutes)分", value: $dwellMinutes, in: 1...720, step: dwellMinutes < 10 ? 1 : 5)
                } footer: {
                    Text("GPSの誤差があるため、範囲は150m以上がおすすめです。")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("場所を追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("保存") { save() }
                            .disabled(!canSave)
                    }
                }
            }
            .onAppear {
                // 地図に現在地を出し、保存後すぐに出入りを検知できるよう許可を求めておく
                if LocationMonitor.shared.authorizationStatus == .notDetermined {
                    LocationMonitor.shared.requestAlwaysAuthorization()
                }
            }
        }
    }

    private func save() {
        guard let center else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                _ = try await APIClient.shared.createLocationRule(
                    title: title.trimmingCharacters(in: .whitespaces),
                    latitude: center.latitude,
                    longitude: center.longitude,
                    radiusMeters: radiusMeters,
                    dwellMinutes: dwellMinutes
                )
                dismiss()
            } catch {
                errorMessage = "保存に失敗しました: \(error.localizedDescription)"
            }
            isSaving = false
        }
    }
}

#Preview {
    AddLocationRuleView()
}
