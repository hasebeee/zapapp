import Foundation

// MARK: - RoutineFrequency

enum RoutineFrequency: String, Codable, CaseIterable {
    case daily
    case weekly
    case monthly
    case custom

    var label: String {
        switch self {
        case .daily:   return "毎日"
        case .weekly:  return "毎週"
        case .monthly: return "毎月"
        case .custom:  return "カスタム"
        }
    }
}

// MARK: - Routine

struct Routine: Codable, Identifiable, Hashable {
    let id: String
    let ownerUserId: String
    let controllerUserId: String?
    let title: String
    let zapCriteria: String?
    let reminderMinutes: Int
    let frequency: RoutineFrequency
    let customDatetimes: [Date]?
    let isActive: Bool
    let createdAt: Date
    let nextRunAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case title
        case zapCriteria      = "zap_criteria"
        case reminderMinutes  = "reminder_minutes"
        case frequency
        case customDatetimes  = "custom_datetimes"
        case isActive         = "is_active"
        case createdAt        = "created_at"
        case nextRunAt        = "next_run_at"
    }

    /// 表示用スケジュール文字列
    func scheduleLabel(calendar: Calendar = .current) -> String {
        guard let next = nextRunAt else { return frequency.label }
        let time = DateFormatter.localizedString(from: next, dateStyle: .none, timeStyle: .short)
        switch frequency {
        case .daily:
            return "毎日 \(time)"
        case .weekly:
            let weekdaySymbols = ["日", "月", "火", "水", "木", "金", "土"]
            let weekday = calendar.component(.weekday, from: next) - 1
            return "毎週\(weekdaySymbols[weekday])曜 \(time)"
        case .monthly:
            let day = calendar.component(.day, from: next)
            return "毎月\(day)日 \(time)"
        case .custom:
            return "カスタム"
        }
    }
}
