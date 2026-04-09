import Foundation

struct Relationship: Codable, Identifiable {
    let id: String
    let ownerUserId: String
    let controllerUserId: String
    let createdAt: Date
    /// ペア相手の情報（サーバーがネストして返す場合）
    let ownerUser: RelationshipUser?
    let controllerUser: RelationshipUser?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case createdAt        = "created_at"
        case ownerUser        = "owner_user"
        case controllerUser   = "controller_user"
    }
}

struct RelationshipUser: Codable, Identifiable {
    let id: String
    let email: String
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case displayName = "display_name"
    }
}

// MARK: - Response wrappers

struct RelationshipResponse: Codable {
    let relationship: Relationship
}
