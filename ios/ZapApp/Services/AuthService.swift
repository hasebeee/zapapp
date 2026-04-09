import Foundation
import FirebaseAuth

// MARK: - AuthService

/// Firebase Auth のラッパー。
/// サインイン / サインアップ / サインアウト を提供する。
final class AuthService {

    static let shared = AuthService()
    private init() {}

    // MARK: - Sign Up

    /// メールアドレスとパスワードで新規ユーザー登録
    func signUp(email: String, password: String) async throws -> FirebaseAuth.User {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return result.user
    }

    // MARK: - Sign In

    /// メールアドレスとパスワードでサインイン
    func signIn(email: String, password: String) async throws -> FirebaseAuth.User {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return result.user
    }

    // MARK: - Sign Out

    func signOut() throws {
        try Auth.auth().signOut()
    }

    // MARK: - Current User

    var currentUser: FirebaseAuth.User? {
        Auth.auth().currentUser
    }

    var isSignedIn: Bool {
        currentUser != nil
    }

    // MARK: - ID Token

    /// 現在のユーザーの ID Token を取得
    func getIDToken() async throws -> String {
        guard let user = currentUser else {
            throw AppError.notAuthenticated
        }
        return try await user.getIDToken()
    }

    // MARK: - Password Reset

    func sendPasswordReset(email: String) async throws {
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }
}
