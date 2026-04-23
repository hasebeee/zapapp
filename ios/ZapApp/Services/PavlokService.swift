import Foundation
import CoreBluetooth
import Combine

// MARK: - PavlokService

/// CoreBluetooth を使って Pavlok デバイスと BLE 通信するサービス。
/// UUID は仮実装（実機入手後に差し替え）。
@MainActor
final class PavlokService: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = PavlokService()

    // MARK: - Constants (実機 Venus_E05A1BAE79CA から取得)

    static let pavlokServiceUUID        = CBUUID(string: "06AA1910-F22A-11E3-9DAA-0002A5D5C51B")
    static let zapCharacteristicUUID    = CBUUID(string: "06AA3A41-F22A-11E3-9DAA-0002A5D5C51B")

    // MARK: - Published State

    @Published var connectionState: ConnectionState = .disconnected
    @Published var lastError: String? = nil
    @Published var discoveredPeripherals: [DiscoveredPeripheral] = []

    // MARK: - Private

    private var centralManager: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var zapCharacteristic: CBCharacteristic?

    /// 接続完了を待つ continuation
    private var connectContinuation: CheckedContinuation<Void, Error>?
    /// write 完了を待つ continuation
    private var writeContinuation: CheckedContinuation<Void, Error>?
    /// 登録スキャン中かどうか
    private var isRegistrationScanning: Bool = false
    /// 接続先として指定されたperipheral UUID
    private var targetPeripheralId: String? = nil

    // MARK: - Init

    private override init() {
        super.init()
        // CBCentralManager の初期化は非同期コールバックを伴うため main queue で行う
        centralManager = CBCentralManager(delegate: self, queue: .main)
    }

    // MARK: - Public API

    /// スキャン開始 → Pavlok を発見したら接続（registeredIdが指定された場合はそのデバイスのみ）
    func connect(registeredPeripheralId: String? = nil) async throws {
        guard centralManager.state == .poweredOn else {
            throw PavlokError.bluetoothUnavailable
        }
        if connectionState == .connected { return }

        connectionState = .scanning
        lastError = nil
        targetPeripheralId = registeredPeripheralId

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            self.connectContinuation = cont
            // withServices: nil で全デバイスをスキャン（PavlokはServiceUUIDをアドバタイズしないため）
            self.centralManager.scanForPeripherals(
                withServices: nil,
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
            )
            // タイムアウト: 15秒（scanning/connecting/サービス探索中いずれでもハングしたら強制終了）
            Task.detached {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                await MainActor.run {
                    guard self.connectContinuation != nil else { return }
                    self.centralManager.stopScan()
                    if let p = self.peripheral {
                        self.centralManager.cancelPeripheralConnection(p)
                        self.peripheral = nil
                    }
                    let error = PavlokError.scanTimeout
                    self.connectContinuation?.resume(throwing: error)
                    self.connectContinuation = nil
                    self.connectionState = .error
                    self.lastError = error.localizedDescription
                    self.targetPeripheralId = nil
                }
            }
        }
    }

    /// 登録用スキャン開始
    /// 1. まずiOSシステムに接続済みのPavlokを即座に取得（公式アプリ経由で接続中ならここで見つかる）
    /// 2. 追加で全BLEデバイスをスキャンして広告パケットのLocalNameやServiceUUIDでも判別
    func startRegistrationScan() {
        guard centralManager.state == .poweredOn else { return }
        discoveredPeripherals = []
        isRegistrationScanning = true

        // Step 1: システムに既接続のPavlokを検索（公式アプリが繋いでいれば即ヒット）
        let connected = centralManager.retrieveConnectedPeripherals(withServices: [Self.pavlokServiceUUID])
        for p in connected {
            let id = p.identifier.uuidString
            let name = p.name ?? "Pavlok"
            if !discoveredPeripherals.contains(where: { $0.id == id }) {
                discoveredPeripherals.append(DiscoveredPeripheral(id: id, name: name, rssi: 0, isPavlok: true))
            }
            print("[PavlokService] Found connected Pavlok: \(name) (\(id))")
        }

        // Step 2: 追加スキャン（まだ見つかっていない場合の補完）
        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    /// 登録用スキャン停止
    func stopRegistrationScan() {
        centralManager.stopScan()
        isRegistrationScanning = false
    }

    /// 指定したIDのデバイスがPavlokかどうか確認する（接続 → サービス検出 → 即切断）
    func verifyAsPavlok(peripheralId: String) async throws {
        try await connect(registeredPeripheralId: peripheralId)
        // 接続成功 = Pavlokサービスとキャラクタリスティックが見つかった証拠
        disconnect()
    }

    /// Zap を送信する（最大 `count` 回、`interval` 秒間隔）
    /// - Returns: (attempted, succeeded)
    func sendZap(strength: UInt8 = 0xFF,
                 count: Int = 3,
                 interval: TimeInterval = 2.0) async throws -> (attempted: Int, succeeded: Int) {
        guard connectionState == .connected,
              let char = zapCharacteristic else {
            throw PavlokError.notConnected
        }

        var attempted = 0
        var succeeded = 0

        for i in 0..<count {
            if i > 0 {
                try await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
            attempted += 1
            do {
                try await writeZapCommand(strength: strength, characteristic: char)
                succeeded += 1
            } catch {
                print("[PavlokService] Zap \(i + 1) failed: \(error)")
                lastError = error.localizedDescription
            }
        }

        return (attempted, succeeded)
    }

    /// 切断
    func disconnect() {
        if let p = peripheral {
            centralManager.cancelPeripheralConnection(p)
        }
        peripheral = nil
        zapCharacteristic = nil
        connectionState = .disconnected
    }

    // MARK: - Private Helpers

    private func writeZapCommand(strength: UInt8,
                                 characteristic: CBCharacteristic) async throws {
        // 仮実装: 0xFF = 最大強度のプレースホルダーコマンド
        // 実機入手後に Pavlok のプロトコル仕様に合わせて差し替える
        let commandData = Data([0x03, strength, 0x00])

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            self.writeContinuation = cont
            self.peripheral?.writeValue(commandData,
                                        for: characteristic,
                                        type: .withResponse)
            // write タイムアウト: 5秒
            Task {
                try await Task.sleep(nanoseconds: 5_000_000_000)
                if self.writeContinuation != nil {
                    self.writeContinuation?.resume(throwing: PavlokError.writeTimeout)
                    self.writeContinuation = nil
                }
            }
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension PavlokService: CBCentralManagerDelegate {

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                print("[PavlokService] BT powered on")
            case .poweredOff:
                self.connectionState = .disconnected
                self.lastError = "Bluetooth がオフです"
            case .unauthorized:
                self.connectionState = .error
                self.lastError = "Bluetooth の使用が許可されていません"
            case .unsupported:
                self.connectionState = .error
                self.lastError = "この端末は Bluetooth をサポートしていません"
            default:
                break
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String: Any],
                                    rssi RSSI: NSNumber) {
        Task { @MainActor in
            print("[PavlokService] Discovered: \(peripheral.name ?? "Unknown") (\(peripheral.identifier.uuidString))")

            // 登録スキャン中の場合はリストに追加
            if self.isRegistrationScanning {
                let id = peripheral.identifier.uuidString
                let rssi = RSSI.intValue

                // 広告パケットからPavlokか判定
                let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
                let advertisedServices = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
                let hasPavlokService = advertisedServices.contains(Self.pavlokServiceUUID)
                let isPavlok = hasPavlokService
                    || (localName ?? "").lowercased().contains("pavlok")
                    || (peripheral.name ?? "").lowercased().contains("pavlok")

                let displayName: String
                if isPavlok {
                    displayName = localName ?? peripheral.name ?? "Pavlok"
                } else {
                    displayName = localName ?? peripheral.name ?? "不明なデバイス"
                }

                print("[PavlokService] Scan: \(displayName) (\(id)) RSSI=\(rssi) isPavlok=\(isPavlok)")

                if let idx = self.discoveredPeripherals.firstIndex(where: { $0.id == id }) {
                    self.discoveredPeripherals[idx] = DiscoveredPeripheral(id: id, name: displayName, rssi: rssi, isPavlok: isPavlok)
                } else {
                    self.discoveredPeripherals.append(DiscoveredPeripheral(id: id, name: displayName, rssi: rssi, isPavlok: isPavlok))
                }
                // Pavlokを上に、次に電波強度順
                self.discoveredPeripherals.sort {
                    if $0.isPavlok != $1.isPavlok { return $0.isPavlok }
                    return $0.rssi > $1.rssi
                }
                return
            }

            // 登録済みIDが指定されている場合はそのデバイスのみ接続
            if let targetId = self.targetPeripheralId,
               peripheral.identifier.uuidString != targetId {
                return
            }

            central.stopScan()
            self.peripheral = peripheral
            self.peripheral?.delegate = self
            self.connectionState = .connecting
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            print("[PavlokService] Connected: \(peripheral.name ?? "Unknown")")
            peripheral.discoverServices([Self.pavlokServiceUUID])
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didFailToConnect peripheral: CBPeripheral,
                                    error: Error?) {
        Task { @MainActor in
            let err = error ?? PavlokError.connectionFailed
            self.connectionState = .error
            self.lastError = err.localizedDescription
            self.connectContinuation?.resume(throwing: err)
            self.connectContinuation = nil
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDisconnectPeripheral peripheral: CBPeripheral,
                                    error: Error?) {
        Task { @MainActor in
            print("[PavlokService] Disconnected")
            self.connectionState = .disconnected
            self.zapCharacteristic = nil
        }
    }
}

// MARK: - CBPeripheralDelegate

extension PavlokService: CBPeripheralDelegate {

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverServices error: Error?) {
        Task { @MainActor in
            if let error {
                self.connectionState = .error
                self.lastError = error.localizedDescription
                self.connectContinuation?.resume(throwing: error)
                self.connectContinuation = nil
                return
            }
            guard let service = peripheral.services?.first(where: {
                $0.uuid == Self.pavlokServiceUUID
            }) else {
                let err = PavlokError.serviceNotFound
                self.connectionState = .error
                self.lastError = err.localizedDescription
                self.connectContinuation?.resume(throwing: err)
                self.connectContinuation = nil
                return
            }
            peripheral.discoverCharacteristics([Self.zapCharacteristicUUID], for: service)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        Task { @MainActor in
            if let error {
                self.connectionState = .error
                self.lastError = error.localizedDescription
                self.connectContinuation?.resume(throwing: error)
                self.connectContinuation = nil
                return
            }
            guard let char = service.characteristics?.first(where: {
                $0.uuid == Self.zapCharacteristicUUID
            }) else {
                let err = PavlokError.characteristicNotFound
                self.connectionState = .error
                self.lastError = err.localizedDescription
                self.connectContinuation?.resume(throwing: err)
                self.connectContinuation = nil
                return
            }
            self.zapCharacteristic = char
            self.connectionState = .connected
            self.connectContinuation?.resume()
            self.connectContinuation = nil
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didWriteValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        Task { @MainActor in
            if let error {
                self.writeContinuation?.resume(throwing: error)
            } else {
                self.writeContinuation?.resume()
            }
            self.writeContinuation = nil
        }
    }
}

// MARK: - DiscoveredPeripheral

struct DiscoveredPeripheral: Identifiable {
    let id: String
    let name: String
    var rssi: Int       // dBm。0に近いほど電波が強い（近い）
    var isPavlok: Bool  // Pavlokと判定されたか

    var rssiLabel: String {
        if rssi == 0    { return "接続済み" }
        if rssi >= -65  { return "電波強 ▶▶▶" }
        if rssi >= -80  { return "電波中 ▶▶" }
        return "電波弱 ▶"
    }
}

// MARK: - PavlokError

enum PavlokError: LocalizedError {
    case bluetoothUnavailable
    case notConnected
    case scanTimeout
    case connectionFailed
    case serviceNotFound
    case characteristicNotFound
    case writeTimeout

    var errorDescription: String? {
        switch self {
        case .bluetoothUnavailable:     return "Bluetooth が利用できません"
        case .notConnected:             return "Pavlok に接続されていません"
        case .scanTimeout:              return "Pavlok が見つかりませんでした（タイムアウト）"
        case .connectionFailed:         return "Pavlok への接続に失敗しました"
        case .serviceNotFound:          return "Pavlok サービスが見つかりません"
        case .characteristicNotFound:   return "Zap キャラクタリスティックが見つかりません"
        case .writeTimeout:             return "Zap コマンドの送信がタイムアウトしました"
        }
    }
}
