import Foundation

// MARK: - ConnectionState

enum ConnectionState: String {
    case disconnected
    case scanning
    case connecting
    case connected
    case error
}

// MARK: - Device (永続化が必要な場合のモデル)

struct Device: Codable, Identifiable {
    let id: String          // Peripheral UUID 文字列
    let name: String?
    let lastConnectedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case lastConnectedAt = "last_connected_at"
    }
}
