import Foundation
import FirebaseAuth

// MARK: - APIClient

/// バックエンドとの通信を担うシングルトン。
/// Firebase Auth の ID Token を Bearer トークンとして全リクエストに付与する。
final class APIClient {

    // MARK: - Constants

    /// バックエンドのベース URL（後で変更可能な定数）
    static let baseURLString = "https://zapapp-iszt.onrender.com"

    static let shared = APIClient()

    // MARK: - Private

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        self.session = URLSession.shared

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            // ISO8601 with fractional seconds
            let isoFull = ISO8601DateFormatter()
            isoFull.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFull.date(from: str) { return date }
            // ISO8601 without fractional seconds
            let isoBasic = ISO8601DateFormatter()
            isoBasic.formatOptions = [.withInternetDateTime]
            if let date = isoBasic.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container,
                debugDescription: "Cannot decode date: \(str)")
        }
        self.decoder = dec

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

    // MARK: - Internal Helpers

    private func baseURL() throws -> URL {
        guard let url = URL(string: Self.baseURLString) else {
            throw AppError.invalidResponse
        }
        return url
    }

    /// ID Token を取得して Bearer ヘッダー付き URLRequest を構築
    private func authorizedRequest(path: String,
                                   method: String = "GET",
                                   queryItems: [URLQueryItem]? = nil) async throws -> URLRequest {
        guard let user = Auth.auth().currentUser else {
            throw AppError.notAuthenticated
        }
        let token = try await user.getIDToken()

        var components = URLComponents(url: try baseURL().appendingPathComponent(path),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = queryItems

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    /// リクエストを実行してデコード
    @discardableResult
    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw AppError.decodingError(error.localizedDescription)
        }
    }

    /// ボディ付きリクエストを実行してデコード
    @discardableResult
    private func perform<Body: Encodable, T: Decodable>(_ request: URLRequest,
                                                         body: Body) async throws -> T {
        var req = request
        req.httpBody = try encoder.encode(body)
        return try await perform(req)
    }

    /// レスポンスステータスコード検証
    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw AppError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw AppError.serverError("[\(http.statusCode)] \(msg)")
        }
    }

    /// 戻り値が不要なリクエスト（204 No Content など）
    private func performVoid(_ request: URLRequest) async throws {
        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
    }

    private func performVoid<Body: Encodable>(_ request: URLRequest, body: Body) async throws {
        var req = request
        req.httpBody = try encoder.encode(body)
        try await performVoid(req)
    }

    // MARK: - Device APIs

    func registerDevice(pushToken: String) async throws {
        let req = try await authorizedRequest(path: "/devices", method: "POST")
        try await performVoid(req, body: ["push_token": pushToken])
    }

    // MARK: - Me APIs

    func getMyProfile() async throws -> AppUser {
        let req = try await authorizedRequest(path: "/me/profile")
        return try await perform(req)
    }

    func connectPavlok(email: String, password: String) async throws {
        let req = try await authorizedRequest(path: "/me/pavlok/token", method: "POST")
        try await performVoid(req, body: ["email": email, "password": password])
    }

    func disconnectPavlok() async throws {
        let req = try await authorizedRequest(path: "/me/pavlok/token", method: "DELETE")
        try await performVoid(req)
    }

    // MARK: - Invite APIs

    func createInvite(inviteeEmail: String) async throws -> InviteResponse {
        let req = try await authorizedRequest(path: "/invites", method: "POST")
        return try await perform(req, body: ["invitee_email": inviteeEmail])
    }

    func getInvites(status: String? = nil) async throws -> [Invite] {
        var queryItems: [URLQueryItem]? = nil
        if let status {
            queryItems = [URLQueryItem(name: "status", value: status)]
        }
        let req = try await authorizedRequest(path: "/invites", queryItems: queryItems)
        return try await perform(req)
    }

    func acceptInvite(token: String) async throws -> RelationshipResponse {
        let req = try await authorizedRequest(path: "/invites/accept", method: "POST")
        return try await perform(req, body: ["token": token])
    }

    // MARK: - Relationship APIs

    func getRelationships() async throws -> [Relationship] {
        let req = try await authorizedRequest(path: "/relationships")
        return try await perform(req)
    }

    func deleteRelationship(relationshipId: String) async throws {
        let req = try await authorizedRequest(path: "/relationships/\(relationshipId)",
                                              method: "DELETE")
        try await performVoid(req)
    }

    // MARK: - Task APIs (Owner)

    func createTask(title: String, dueAt: Date, controllerUserId: String?, reminderMinutes: Int = 5) async throws -> AppTask {
        let req = try await authorizedRequest(path: "/tasks", method: "POST")
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let body = CreateTaskBody(
            title: title,
            dueAt: isoFormatter.string(from: dueAt),
            controllerUserId: controllerUserId,
            reminderMinutes: reminderMinutes
        )
        return try await perform(req, body: body)
    }

    private struct CreateTaskBody: Encodable {
        let title: String
        let dueAt: String
        let controllerUserId: String?
        let reminderMinutes: Int

        enum CodingKeys: String, CodingKey {
            case title
            case dueAt            = "due_at"
            case controllerUserId = "controller_user_id"
            case reminderMinutes  = "reminder_minutes"
        }
    }

    func getTasks(status: [TaskStatus]? = nil) async throws -> [AppTask] {
        var queryItems: [URLQueryItem]? = nil
        if let statuses = status, !statuses.isEmpty {
            let joined = statuses.map { $0.rawValue }.joined(separator: ",")
            queryItems = [URLQueryItem(name: "status", value: joined)]
        }
        let req = try await authorizedRequest(path: "/tasks", queryItems: queryItems)
        return try await perform(req)
    }

    func getTask(taskId: String) async throws -> AppTask {
        let req = try await authorizedRequest(path: "/tasks/\(taskId)")
        return try await perform(req)
    }

    func selfCompleteTask(taskId: String) async throws -> AppTask {
        let req = try await authorizedRequest(path: "/tasks/\(taskId)/self_complete",
                                              method: "POST")
        return try await perform(req)
    }

    // MARK: - Task APIs (Controller)

    func getOwnerTasks(ownerUserId: String, status: [TaskStatus]? = nil) async throws -> [AppTask] {
        var queryItems: [URLQueryItem]? = nil
        if let statuses = status, !statuses.isEmpty {
            let joined = statuses.map { $0.rawValue }.joined(separator: ",")
            queryItems = [URLQueryItem(name: "status", value: joined)]
        }
        let req = try await authorizedRequest(path: "/owners/\(ownerUserId)/tasks",
                                              queryItems: queryItems)
        return try await perform(req)
    }

    func deleteTask(taskId: String) async throws {
        let req = try await authorizedRequest(path: "/tasks/\(taskId)", method: "DELETE")
        try await performVoid(req)
    }

    func sendZap(taskId: String) async throws -> ZapResponse {
        let req = try await authorizedRequest(path: "/tasks/\(taskId)/zap", method: "POST")
        return try await perform(req)
    }

    // MARK: - ZapRequest APIs

    func getLatestZapRequest(taskId: String) async throws -> ZapRequest {
        let req = try await authorizedRequest(path: "/tasks/\(taskId)/latest_zap_request")
        return try await perform(req)
    }

    func getMyZapRequests(status: String? = nil) async throws -> [ZapRequest] {
        var queryItems: [URLQueryItem]? = nil
        if let status {
            queryItems = [URLQueryItem(name: "status", value: status)]
        }
        let req = try await authorizedRequest(path: "/me/zap_requests", queryItems: queryItems)
        return try await perform(req)
    }

    // MARK: - Gift APIs

    func sendGift(controllerUserId: String, message: String) async throws -> Gift {
        let req = try await authorizedRequest(path: "/gifts", method: "POST")
        return try await perform(req, body: ["controller_user_id": controllerUserId, "message": message])
    }

    func getSentGifts() async throws -> [Gift] {
        let req = try await authorizedRequest(path: "/gifts/sent")
        return try await perform(req)
    }

    func getReceivedGifts() async throws -> [Gift] {
        let req = try await authorizedRequest(path: "/gifts/received")
        return try await perform(req)
    }

    func useGift(giftId: String, title: String, dueAt: Date) async throws -> GiftUseResponse {
        let req = try await authorizedRequest(path: "/gifts/\(giftId)/use", method: "POST")
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let body: [String: String] = [
            "title": title,
            "due_at": isoFormatter.string(from: dueAt)
        ]
        return try await perform(req, body: body)
    }

    func ackZapRequest(id: String) async throws {
        let req = try await authorizedRequest(path: "/zap_requests/\(id)/ack", method: "POST")
        try await performVoid(req)
    }
}
