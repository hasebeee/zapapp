import Foundation

// MARK: - GiftStatus

enum GiftStatus: String, Codable {
    case pending
    case used
}

// MARK: - Gift

struct Gift: Codable, Identifiable {
    let id: String
    let ownerUserId: String
    let controllerUserId: String
    let message: String
    let status: GiftStatus
    let createdAt: Date
    let usedAt: Date?
    let taskId: String?
    let ownerUser: GiftUser?
    let controllerUser: GiftUser?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case message
        case status
        case createdAt        = "created_at"
        case usedAt           = "used_at"
        case taskId           = "task_id"
        case ownerUser        = "owner_user"
        case controllerUser   = "controller_user"
    }
}

// MARK: - GiftUser

struct GiftUser: Codable {
    let id: String
    let email: String
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case displayName = "display_name"
    }
}

// MARK: - GiftUseResponse

struct GiftUseResponse: Codable {
    let gift: Gift
    let task: AppTask
}
