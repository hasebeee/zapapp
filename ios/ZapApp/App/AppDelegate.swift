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

    // MARK: - バックグラウンド Silent Push 受信 → ZapRequestPoller 起動

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        print("[AppDelegate] Silent push received, starting poller")
        Task { @MainActor in
            ZapRequestPoller.shared.start()
        }
        completionHandler(.newData)
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
        if userInfo["zapRequestId"] != nil {
            print("[AppDelegate] Zap notification tapped, starting poller immediately")
            Task { @MainActor in
                ZapRequestPoller.shared.start()
            }
        }

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
