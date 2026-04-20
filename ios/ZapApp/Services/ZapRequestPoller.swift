import Foundation
import Combine

// MARK: - ZapRequestPoller

/// バックグラウンドで定期的に未処理の ZapRequest をポーリングし、
/// Pavlok への Zap 送信と API コールバックを行う。
@MainActor
final class ZapRequestPoller: ObservableObject {

    // MARK: - Singleton

    static let shared = ZapRequestPoller()

    // MARK: - Constants

    private let pollingInterval: TimeInterval = 10.0 // 10秒

    // MARK: - Published

    @Published var isPolling: Bool = false
    @Published var lastPollError: String? = nil

    // MARK: - Private

    private var pollingTask: Task<Void, Never>?
    private let apiClient = APIClient.shared
    private let pavlokService = PavlokService.shared

    /// 登録済みPavlok peripheral UUID（AppStateから設定）
    var registeredPeripheralId: String? = nil

    /// 処理中の ZapRequest ID セット（多重実行防止）
    private var processingIds: Set<String> = []

    // MARK: - Init

    private init() {}

    // MARK: - Public API

    func start() {
        guard !isPolling else { return }
        isPolling = true
        pollingTask = Task { [weak self] in
            await self?.pollLoop()
        }
        print("[ZapRequestPoller] Started")
    }

    func stop() {
        pollingTask?.cancel()
        pollingTask = nil
        isPolling = false
        print("[ZapRequestPoller] Stopped")
    }

    // MARK: - Private

    private func pollLoop() async {
        while !Task.isCancelled {
            await poll()
            try? await Task.sleep(nanoseconds: UInt64(pollingInterval * 1_000_000_000))
        }
    }

    private func poll() async {
        do {
            let requests = try await apiClient.getMyZapRequests(status: "created")
            lastPollError = nil

            for zapRequest in requests {
                guard !processingIds.contains(zapRequest.id) else { continue }
                processingIds.insert(zapRequest.id)
                Task {
                    await self.processZapRequest(zapRequest)
                    self.processingIds.remove(zapRequest.id)
                }
            }
        } catch {
            lastPollError = error.localizedDescription
            print("[ZapRequestPoller] Poll error: \(error)")
        }
    }

    private func processZapRequest(_ zapRequest: ZapRequest) async {
        print("[ZapRequestPoller] Processing ZapRequest: \(zapRequest.id)")

        // Step 1: Pavlok に接続（登録済みIDがあればそのデバイスに限定）
        do {
            try await pavlokService.connect(registeredPeripheralId: registeredPeripheralId)
        } catch {
            // 接続できなかった → not_started を報告
            print("[ZapRequestPoller] Cannot connect: \(error)")
            await reportNotStarted(zapRequestId: zapRequest.id,
                                   errorCode: "BLE_NOT_CONNECTED",
                                   errorMessage: error.localizedDescription)
            return
        }

        // Step 2: 1回目の Zap 試行開始を通知 → /start
        do {
            try await apiClient.startZapRequest(id: zapRequest.id)
        } catch {
            print("[ZapRequestPoller] Failed to call /start: \(error)")
            // /start が失敗しても Zap 送信は続行する
        }

        // Step 3: Zap 送信（最大3回、2秒間隔）
        var attempted = 0
        var succeeded = 0
        var lastErrorCode: String? = nil
        var lastErrorMessage: String? = nil

        do {
            let result = try await pavlokService.sendZap(strength: 0xFF, count: 3, interval: 2.0)
            attempted = result.attempted
            succeeded = result.succeeded
            if succeeded < attempted {
                lastErrorCode = "UNKNOWN"
                lastErrorMessage = "一部の Zap 送信に失敗しました"
            }
        } catch {
            // sendZap 自体がエラーを投げた場合（接続が切れた等）
            attempted = max(attempted, 1)
            lastErrorCode = "BLE_TIMEOUT"
            lastErrorMessage = error.localizedDescription
            print("[ZapRequestPoller] sendZap error: \(error)")
        }

        // Step 4: 結果を /result で報告
        do {
            try await apiClient.resultZapRequest(
                id: zapRequest.id,
                attemptedZaps: attempted,
                succeededZaps: succeeded,
                lastErrorCode: lastErrorCode,
                lastErrorMessage: lastErrorMessage
            )
        } catch {
            print("[ZapRequestPoller] Failed to call /result: \(error)")
        }
    }

    private func reportNotStarted(zapRequestId: String,
                                  errorCode: String,
                                  errorMessage: String?) async {
        do {
            try await apiClient.notStartedZapRequest(
                id: zapRequestId,
                lastErrorCode: errorCode,
                lastErrorMessage: errorMessage
            )
        } catch {
            print("[ZapRequestPoller] Failed to call /not_started: \(error)")
        }
    }
}
