import { sendAPNs } from './apns';
import { sendMessage } from './fcm';
import { getPendingJudgmentCount } from './badge';
import { DeviceRow } from './types';

export interface PushNotification {
  title: string;
  body: string;
}

/**
 * device.platform に応じて APNs (iOS) / FCM (Android) のどちらかにプッシュ通知を送信する。
 * iOS のアプリアイコンのバッジ数は、送信のたびに受信者本人の合否判定待ち件数を
 * 計算し直して載せる（固定値だと実際の件数と食い違ってしまうため）。
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
    let badge = 0;
    try {
      badge = await getPendingJudgmentCount(device.user_id);
    } catch (err) {
      console.error('[sendPush] Failed to compute badge count:', err);
    }

    await sendAPNs({
      token: device.push_token,
      environment: device.environment,
      notification,
      data,
      contentAvailable: options.contentAvailable,
      badge,
    });
  }
}
