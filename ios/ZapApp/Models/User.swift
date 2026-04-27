import Foundation

struct AppUser: Codable, Identifiable {
    let id: String
    let email: String
    let displayName: String?
    let createdAt: Date
    let pavlokPeripheralId: String?
    let pavlokConnected: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case displayName        = "display_name"
        case createdAt          = "created_at"
        case pavlokPeripheralId = "pavlok_peripheral_id"
        case pavlokConnected    = "pavlok_connected"
    }
}
