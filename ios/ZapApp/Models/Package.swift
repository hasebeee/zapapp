import Foundation

// MARK: - PackageItem

struct PackageItem: Codable, Identifiable, Hashable {
    let id: String
    let packageId: String
    let title: String
    let zapCriteria: String?
    let sortOrder: Int

    enum CodingKeys: String, CodingKey {
        case id
        case packageId   = "package_id"
        case title
        case zapCriteria = "zap_criteria"
        case sortOrder   = "sort_order"
    }
}

// MARK: - Package

/// 複数タスク＋固定監視者＋固定時刻をまとめて作成できるショートカット
struct Package: Codable, Identifiable, Hashable {
    let id: String
    let ownerUserId: String
    let controllerUserId: String?
    let title: String
    let timeOfDay: String
    let reminderMinutes: Int
    let createdAt: Date
    let items: [PackageItem]

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId      = "owner_user_id"
        case controllerUserId = "controller_user_id"
        case title
        case timeOfDay        = "time_of_day"
        case reminderMinutes  = "reminder_minutes"
        case createdAt        = "created_at"
        case items
    }

    /// "15:00:00" -> "作成当日 15:00"
    var timeOfDayLabel: String {
        let parts = timeOfDay.split(separator: ":")
        guard parts.count >= 2 else { return timeOfDay }
        return "作成当日 \(parts[0]):\(parts[1])"
    }

    /// time_of_day ("HH:MM:SS") を、今日の日付・端末のローカルタイムゾーンで
    /// 解釈した Date に変換する。サーバー側で計算するとサーバーのタイム
    /// ゾーンとユーザーのタイムゾーンがズレるため、必ずクライアント側で
    /// この変換を行ってから due_at として送る。
    var todayAtTimeOfDay: Date {
        let parts = timeOfDay.split(separator: ":").compactMap { Int($0) }
        var components = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        components.hour = parts.count > 0 ? parts[0] : 0
        components.minute = parts.count > 1 ? parts[1] : 0
        components.second = 0
        return Calendar.current.date(from: components) ?? .now
    }
}
