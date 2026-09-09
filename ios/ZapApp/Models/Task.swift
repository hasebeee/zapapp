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
        case .scheduled:    return "Zap判定前"
        case .readyToZap:   return "監視者のZap判定待ち"
        case .waitingAck:   return "未報告"
        case .readyToReZap: return "Zap報告がなかったため再Zap可能"
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
    let zapCriteria: String?
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
        case zapCriteria      = "zap_criteria"
        case dueAt            = "due_at"
        case createdAt        = "created_at"
        case closedAt         = "closed_at"
        case status
        case reminderMinutes  = "reminder_minutes"
    }
}

// MARK: - PendingJudgmentTask

/// 監視者として合否判定待ちのタスク（全オーナー横断）。AppTask にオーナー表示名を加えたもの。
struct PendingJudgmentTask: Codable, Identifiable, Hashable {
    let id: String
    let ownerUserId: String
    let controllerUserId: String?
    let title: String
    let zapCriteria: String?
    let dueAt: Date
    let createdAt: Date
    let closedAt: Date?
    let status: TaskStatus
    let reminderMinutes: Int
    let ownerDisplayName: String

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case title
        case zapCriteria      = "zap_criteria"
        case dueAt            = "due_at"
        case createdAt        = "created_at"
        case closedAt         = "closed_at"
        case status
        case reminderMinutes  = "reminder_minutes"
        case ownerDisplayName = "owner_display_name"
    }

    var asAppTask: AppTask {
        AppTask(
            id: id,
            ownerUserId: ownerUserId,
            controllerUserId: controllerUserId,
            title: title,
            zapCriteria: zapCriteria,
            dueAt: dueAt,
            createdAt: createdAt,
            closedAt: closedAt,
            status: status,
            reminderMinutes: reminderMinutes
        )
    }
}
