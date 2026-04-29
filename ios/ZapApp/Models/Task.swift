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
        case .readyToZap:   return "判定待ち"
        case .waitingAck:   return "未報告"
        case .readyToReZap: return "再 Zap 可能"
        case .closed:       return "完了"
        }
    }
}

// MARK: - AppTask

struct AppTask: Codable, Identifiable, Hashable {
    let id: String
    let ownerUserId: String
    let controllerUserId: String?
    let title: String
    let dueAt: Date
    let createdAt: Date
    let closedAt: Date?
    let status: TaskStatus
    let reminderMinutes: Int

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case title
        case dueAt            = "due_at"
        case createdAt        = "created_at"
        case closedAt         = "closed_at"
        case status
        case reminderMinutes  = "reminder_minutes"
    }
}
