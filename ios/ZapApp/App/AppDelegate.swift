import UIKit
import UserNotifications
import FirebaseMessaging

final class AppDelegate: NSObject, UIApplicationDelegate {

    // MARK: - Launch

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // FCM デリゲート設定
        Messaging.messaging().delegate = self

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

    // MARK: - APNs トークン取得 → Firebase に渡す

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Messaging.messaging().apnsToken = deviceToken
        print("[AppDelegate] APNs token set to Firebase Messaging")
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[AppDelegate] Failed to register for remote notifications: \(error)")
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

        // Zap通知タップ時はポーラーを即座に起動
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

// MARK: - MessagingDelegate

extension AppDelegate: MessagingDelegate {

    /// FCM トークンが取得 / 更新されたらバックエンドに登録
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        print("[AppDelegate] FCM token: \(fcmToken)")
        Task {
            try? await APIClient.shared.registerDevice(pushToken: fcmToken)
        }
    }
}
