import Foundation
import CoreLocation
import UIKit

// MARK: - LocationMonitor

/// 「場所でZap」のジオフェンスを管理するシングルトン。
///
/// - 登録した場所への出入りを iOS のジオフェンス（領域監視）で検知し、サーバーへ送る。
///   アプリが終了していても、出入りの時に OS がアプリをバックグラウンドで起動してくれる。
/// - 滞在時間のカウントとZapの判定はサーバー側で行う。滞在時間に達すると
///   サーバーから `location_check` のプッシュが届くので、その時点の現在地を確認して返す。
///
/// 起動直後に OS から届く出入りイベントを取りこぼさないよう、
/// AppDelegate の didFinishLaunching で `shared` を生成しておくこと。
final class LocationMonitor: NSObject {

    static let shared = LocationMonitor()

    private let manager = CLLocationManager()

    /// requestLocation の結果待ち
    private var locationContinuations: [CheckedContinuation<CLLocation?, Never>] = []

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    // MARK: - Authorization

    var authorizationStatus: CLAuthorizationStatus {
        manager.authorizationStatus
    }

    /// 「常に許可」をリクエストする（アプリを閉じていても出入りを検知するため）
    func requestAlwaysAuthorization() {
        manager.requestAlwaysAuthorization()
    }

    // MARK: - Sync

    /// サーバーのルール一覧を取得し、ジオフェンスの登録内容を揃える
    func syncFromServer() async {
        do {
            let rules = try await APIClient.shared.getLocationRules()
            sync(rules: rules)
        } catch {
            print("[LocationMonitor] Failed to fetch location rules: \(error)")
        }
    }

    /// ルール一覧に合わせてジオフェンスを登録・解除する
    func sync(rules: [LocationRule]) {
        let ruleIds = Set(rules.map(\.id))

        for region in manager.monitoredRegions where !ruleIds.contains(region.identifier) {
            manager.stopMonitoring(for: region)
        }

        for rule in rules {
            manager.startMonitoring(for: rule.region)
            // 登録時に既に中にいる場合は入場イベントが来ないため、現在の状態を問い合わせる
            manager.requestState(for: rule.region)
        }
        print("[LocationMonitor] Monitoring \(rules.count) region(s)")
    }

    /// ログアウト時などにすべてのジオフェンスを解除する
    func stopAll() {
        for region in manager.monitoredRegions {
            manager.stopMonitoring(for: region)
        }
    }

    // MARK: - Stay Confirmation

    /// サーバーからの滞在確認（location_check プッシュ）に応答する。
    /// 現在地を取得して、まだ範囲内にいるかをサーバーへ返す。
    /// 位置が取れない・精度が悪い時は「離れた」扱いで返す（誤Zapを防ぐため）。
    func confirmPresence(ruleId: String) async {
        guard let region = manager.monitoredRegions.first(where: { $0.identifier == ruleId }) as? CLCircularRegion else {
            print("[LocationMonitor] Region not monitored for rule=\(ruleId)")
            try? await APIClient.shared.confirmLocation(ruleId: ruleId, inside: false)
            return
        }

        let inside: Bool
        if let location = await currentLocation(), location.horizontalAccuracy >= 0, location.horizontalAccuracy <= 200 {
            let center = CLLocation(latitude: region.center.latitude, longitude: region.center.longitude)
            inside = location.distance(from: center) <= region.radius
        } else {
            inside = false
        }

        print("[LocationMonitor] Confirm rule=\(ruleId) inside=\(inside)")
        do {
            try await APIClient.shared.confirmLocation(ruleId: ruleId, inside: inside)
        } catch {
            print("[LocationMonitor] Failed to confirm location: \(error)")
        }
    }

    /// 現在地を1回だけ取得する（失敗時は nil）
    private func currentLocation() async -> CLLocation? {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async {
                self.locationContinuations.append(continuation)
                if self.locationContinuations.count == 1 {
                    self.manager.requestLocation()
                }
            }
        }
    }

    private func resolveLocation(_ location: CLLocation?) {
        let continuations = locationContinuations
        locationContinuations.removeAll()
        continuations.forEach { $0.resume(returning: location) }
    }

    // MARK: - Enter / Exit

    /// 出入りをサーバーへ送る。バックグラウンドで起こされた時も送信を終えられるよう
    /// バックグラウンドタスクとして実行する
    private func report(ruleId: String, inside: Bool) {
        let taskId = UIApplication.shared.beginBackgroundTask(withName: "LocationReport")
        Task {
            do {
                if inside {
                    try await APIClient.shared.enterLocation(ruleId: ruleId)
                } else {
                    try await APIClient.shared.exitLocation(ruleId: ruleId)
                }
                print("[LocationMonitor] Reported \(inside ? "enter" : "exit") rule=\(ruleId)")
            } catch {
                print("[LocationMonitor] Failed to report \(inside ? "enter" : "exit"): \(error)")
            }
            UIApplication.shared.endBackgroundTask(taskId)
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationMonitor: CLLocationManagerDelegate {

    /// 境界をまたいだ時と requestState の結果の両方で呼ばれる。
    /// サーバー側で重複を吸収するので、ここでは状態をそのまま送る
    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        switch state {
        case .inside:
            report(ruleId: region.identifier, inside: true)
        case .outside:
            report(ruleId: region.identifier, inside: false)
        case .unknown:
            break
        @unknown default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        print("[LocationMonitor] Monitoring failed for \(region?.identifier ?? "nil"): \(error)")
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        resolveLocation(locations.last)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[LocationMonitor] Location error: \(error)")
        resolveLocation(nil)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        print("[LocationMonitor] Authorization changed: \(manager.authorizationStatus.rawValue)")
    }
}
