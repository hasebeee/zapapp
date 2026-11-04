import Foundation
import CoreLocation

// MARK: - LocationRule

/// 指定の場所に一定時間滞在したら自動で Zap する設定
struct LocationRule: Codable, Identifiable, Hashable {
    let id: String
    let ownerUserId: String
    let title: String
    let latitude: Double
    let longitude: Double
    let radiusMeters: Int
    let dwellMinutes: Int
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case ownerUserId  = "owner_user_id"
        case title
        case latitude
        case longitude
        case radiusMeters = "radius_meters"
        case dwellMinutes = "dwell_minutes"
        case createdAt    = "created_at"
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    /// iOS のジオフェンスとして登録する領域（identifier はルールID）
    var region: CLCircularRegion {
        let region = CLCircularRegion(center: coordinate, radius: CLLocationDistance(radiusMeters), identifier: id)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        return region
    }
}
