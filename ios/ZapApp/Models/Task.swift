import Foundation

// MARK: - TaskStatus

enum TaskStatus: String, Codable, CaseIterable {
    case scheduled
    case readyToZap
    case waitingAck
    case readyToReZap
    case closed

    /// 表示用ラベル
    var label: String {
        switch self {
        case .scheduled:    return "スケジュール済み"
        case .readyToZap:   return "Zap 可能"
        case .waitingAck:   return "受領待ち"
        case .readyToReZap: return "再 Zap 可能"
        case .closed:       return "完了"
        }
    }
}

// MARK: - AppTask

struct AppTask: Codable, Identifiable ,Hashable{
    let id: String
    let ownerUserId: String
    let title: String
    let dueAt: Date
    let createdAt: Date
    let closedAt: Date?
    let status: TaskStatus

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId  = "owner_user_id"
        case title
        case dueAt        = "due_at"
        case createdAt    = "created_at"
        case closedAt     = "closed_at"
        case status
    }
}
