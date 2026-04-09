import Foundation

// MARK: - InviteStatus

enum InviteStatus: String, Codable {
    case pending
    case accepted
    case expired
    case revoked
}

// MARK: - Invite

struct Invite: Codable, Identifiable {
    let id: String
    let inviterUserId: String
    let inviteeEmail: String
    let token: String
    let status: InviteStatus
    let createdAt: Date
    let expiresAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case inviterUserId = "owner_user_id"
        case inviteeEmail  = "invitee_email"
        case token
        case status
        case createdAt     = "created_at"
        case expiresAt     = "expires_at"
    }
}

// MARK: - Response wrappers

struct InviteResponse: Codable {
    let invite: Invite
}
