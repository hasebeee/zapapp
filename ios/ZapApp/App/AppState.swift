import SwiftUI
import FirebaseAuth

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

    /// 登録済みPavlokのperipheral UUID
    @Published var pavlokPeripheralId: String? = nil

    /// PavlokアカウントAPI連携済みか
    @Published var pavlokConnected: Bool = false

    // MARK: - Private

    private var authStateHandle: AuthStateDidChangeListenerHandle?

    // MARK: - Init

    init() {
        // Firebase Auth の状態変化を監視
        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.currentUser = user
                self?.isLoggedIn = user != nil
                if user != nil {
                    // DBのUUIDとPavlok登録情報を取得
                    if let profile = try? await APIClient.shared.getMyProfile() {
                        self?.dbUserId = profile.id
                        self?.pavlokPeripheralId = profile.pavlokPeripheralId
                        self?.pavlokConnected = profile.pavlokConnected
                    }
                } else {
                    self?.dbUserId = nil
                    self?.pavlokPeripheralId = nil
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

    /// 現在のユーザーの ID Token を取得（APIClient で使用）
    func getIDToken() async throws -> String {
        guard let user = Auth.auth().currentUser else {
            throw AppError.notAuthenticated
        }
        return try await user.getIDToken()
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
