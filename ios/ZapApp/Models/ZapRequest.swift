import Foundation

// MARK: - ZapRequestStatus

enum ZapRequestStatus: String, Codable {
    case created
    case executed
    case notStarted  = "not_started"
    case acknowledged
    case expired
}

// MARK: - ZapRequest

struct ZapRequest: Codable, Identifiable {
    let id: String
    let taskId: String
    let ownerUserId: String
    let controllerUserId: String
    let createdAt: Date
    let ackDeadlineAt: Date
    let status: ZapRequestStatus
    let attemptedZaps: Int
    let succeededZaps: Int
    let lastErrorCode: String?
    let lastErrorMessage: String?

    enum CodingKeys: String, CodingKey {
        case id
        case taskId           = "task_id"
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case createdAt        = "created_at"
        case ackDeadlineAt    = "ack_deadline_at"
        case status
        case attemptedZaps    = "attempted_zaps"
        case succeededZaps    = "succeeded_zaps"
        case lastErrorCode    = "last_error_code"
        case lastErrorMessage = "last_error_message"
    }
}

// MARK: - ZapResponse (sendZap の戻り値)

struct ZapResponse: Codable {
    let zapRequest: ZapRequest

    enum CodingKeys: String, CodingKey {
        case zapRequest = "zap_request"
    }
}
