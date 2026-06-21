import { sendAPNs } from './apns';
import { sendMessage } from './fcm';
import { DeviceRow } from './types';

export interface PushNotification {
  title: string;
  body: string;
}

/**
 * device.platform に応じて APNs (iOS) / FCM (Android) のどちらかにプッシュ通知を送信する。
 */
export async function sendPush(
  device: DeviceRow,
  notification: PushNotification,
  data: Record<string, string> = {},
  options: { contentAvailable?: boolean } = {}
): Promise<void> {
  if (device.platform === 'android') {
    await sendMessage({
      token: device.push_token,
      notification,
      data,
    });
  } else {
    await sendAPNs({
      token: device.push_token,
      environment: device.environment,
      notification,
      data,
      contentAvailable: options.contentAvailable,
    });
  }
}
