import SwiftUI
import UserNotifications
import FirebaseAuth
import FirebaseMessaging

/// アプリ全体のグローバル状態を管理するクラス。
/// EnvironmentObject として各 View に注入する。
@MainActor
final class AppState: ObservableObject {

    // MARK: - Published Properties

    /// ログイン済みか否か
    @Published var isLoggedIn: Bool = false

    /// 現在ログイン中の Firebase User
    @Published var currentUser: FirebaseAuth.User? = nil

    /// ユーザー表示名 or メールアドレス
    var displayName: String {
        currentUser?.displayName ?? currentUser?.email ?? "Unknown"
    }

    /// Firebase UID
    var uid: String? {
        currentUser?.uid
    }

    /// DB上のPostgreSQL UUID
    @Published var dbUserId: String? = nil

    /// PavlokアカウントAPI連携済みか
    @Published var pavlokConnected: Bool = false

    /// マイタスクタブのバッジ数
    @Published var ownerBadgeCount: Int = 0

    /// 監視するタブのバッジ数
    @Published var controllerBadgeCount: Int = 0

    // MARK: - Private

    private var authStateHandle: AuthStateDidChangeListenerHandle?

    private static let controllerPushTypes: Set<String> = [
        "task_created", "task_controller_assigned", "ready_to_zap", "ready_to_rezap", "gift_received",
    ]

    // MARK: - Init

    init() {
        NotificationCenter.default.addObserver(
            forName: .pushNotificationReceived,
            object: nil,
            queue: nil
        ) { [weak self] note in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let type = note.userInfo?["type"] as? String ?? ""
                if Self.controllerPushTypes.contains(type) {
                    self.controllerBadgeCount += 1
                } else {
                    self.ownerBadgeCount += 1
                }
            }
        }

        // Firebase Auth の状態変化を監視
        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.currentUser = user
                self?.isLoggedIn = user != nil
                if user != nil {
                    // DBのUUIDとPavlok登録情報を取得
                    if let profile = try? await APIClient.shared.getMyProfile() {
                        self?.dbUserId = profile.id
                        self?.pavlokConnected = profile.pavlokConnected
                    }
                    // ログイン後にAPNsトークンを再登録（起動時にログイン前で失敗した場合の補完）
                    if let apnsToken = AppDelegate.storedAPNsToken {
                        try? await APIClient.shared.registerDevice(apnsToken: apnsToken, environment: AppDelegate.storedAPNsEnvironment)
                    }
                } else {
                    self?.dbUserId = nil
                    self?.pavlokConnected = false
                }
            }
        }
    }

    deinit {
        if let handle = authStateHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }

    // MARK: - Public Methods

    /// サインアウト
    func signOut() {
        do {
            try Auth.auth().signOut()
        } catch {
            print("[AppState] signOut error: \(error)")
        }
    }

    /// アカウント削除（DB削除 → Firebase削除 → サインアウト）
    func deleteAccount() async throws {
        try await APIClient.shared.deleteAccount()
        try await Auth.auth().currentUser?.delete()
        signOut()
    }

    /// 現在のユーザーの ID Token を取得（APIClient で使用）
    func getIDToken() async throws -> String {
        guard let user = Auth.auth().currentUser else {
            throw AppError.notAuthenticated
        }
        return try await user.getIDToken()
    }

    /// ホーム画面のアプリアイコンのバッジ数を実際の件数に同期する。
    /// プッシュ通知が届いた時は OS が自動でバッジを更新してくれるが、
    /// アプリ内で判定を終えた直後など、次のプッシュを待たずに
    /// 即座に反映したい場合はここから呼ぶ。
    func syncAppIconBadge(count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(count)
    }
}

// MARK: - AppError

enum AppError: LocalizedError {
    case notAuthenticated
    case invalidResponse
    case serverError(String)
    case decodingError(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "ログインが必要です。"
        case .invalidResponse:
            return "不正なサーバーレスポンスです。"
        case .serverError(let msg):
            return "サーバーエラー: \(msg)"
        case .decodingError(let msg):
            return "データの解析に失敗しました: \(msg)"
        }
    }
}
