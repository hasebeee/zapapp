import UIKit
import UserNotifications
import FirebaseMessaging

final class AppDelegate: NSObject, UIApplicationDelegate {

    // MARK: - Launch

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // 通知デリゲート設定（タップ検知用）
        UNUserNotificationCenter.current().delegate = self

        // 通知権限リクエスト
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                print("[AppDelegate] Notification permission error: \(error)")
                return
            }
            guard granted else {
                print("[AppDelegate] Notification permission denied")
                return
            }
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
        return true
    }

    // MARK: - APNs トークン取得 → バックエンドに登録

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let apnsToken = deviceToken.map { String(format: "%02x", $0) }.joined()
        let environment = Self.apnsEnvironment
        print("[AppDelegate] APNs token: \(apnsToken.prefix(16))... environment: \(environment)")
        Task {
            try? await APIClient.shared.registerDevice(apnsToken: apnsToken, environment: environment)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[AppDelegate] Failed to register for remote notifications: \(error)")
    }

    // MARK: - APNs Environment Detection

    /// embedded.mobileprovision の aps-environment を読んで sandbox/production を判定する
    private static var apnsEnvironment: String {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let content = String(data: data, encoding: .ascii) else {
            #if DEBUG
            return "sandbox"
            #else
            return "production"
            #endif
        }
        if let keyRange = content.range(of: "aps-environment</key>") {
            let tail = content[keyRange.upperBound...]
            if let valueStart = tail.range(of: "<string>"),
               let valueEnd = tail.range(of: "</string>"),
               valueStart.upperBound < valueEnd.lowerBound {
                let value = String(tail[valueStart.upperBound..<valueEnd.lowerBound])
                return value == "development" ? "sandbox" : "production"
            }
        }
        return "production"
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    /// 通知バナーをタップしてアプリが起動・フォアグラウンドになった時
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        print("[AppDelegate] Notification tapped: \(userInfo)")
        completionHandler()
    }

    /// フォアグラウンド中に通知が届いた時もバナー表示する
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}
