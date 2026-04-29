import cron from 'node-cron';
import * as admin from 'firebase-admin';
import pool from '../db';
import { DeviceRow, TaskRow } from '../types';

// ──────────────────────────────────────────────
// ジョブ1：scheduled → readyToZap（毎分）
// dueAt を過ぎた scheduled タスクを readyToZap に更新し、Controllerに通知
// ──────────────────────────────────────────────
async function activateScheduledTasks(): Promise<void> {
  try {
    const result = await pool.query<TaskRow>(
      `UPDATE tasks
       SET status = 'readyToZap'
       WHERE status = 'scheduled' AND due_at <= NOW()
       RETURNING *`
    );

    if (!result.rowCount || result.rowCount === 0) return;

    console.log(`[cron] Activated ${result.rowCount} task(s) to readyToZap`);

    // 各タスクのControllerに通知
    for (const task of result.rows) {
      if (!task.controller_user_id) continue;

      try {
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [task.controller_user_id]
        );

        const pushPromises = devicesResult.rows.map((device) =>
          admin.messaging().send({
            token: device.push_token,
            notification: {
              title: '⚡ Zapできます！',
              body: `「${task.title}」の締切が来ました。Zapしましょう！`,
            },
            apns: {
              headers: {
                'apns-push-type': 'alert',
                'apns-priority': '10',
              },
              payload: {
                aps: { sound: 'default', badge: 1 },
                taskId: task.id,
                type: 'ready_to_zap',
              },
            },
          }).catch((err) => {
            console.error(`[cron] Push failed for device ${device.id}:`, err);
          })
        );

        await Promise.all(pushPromises);
        console.log(`[cron] Notified controller=${task.controller_user_id} for task=${task.id}`);
      } catch (err) {
        console.error(`[cron] Push error for task=${task.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[cron] activateScheduledTasks error:', err);
  }
}

// ──────────────────────────────────────────────
// ジョブ2：ACK期限切れ処理（毎分）
// waitingAck かつ ackDeadlineAt 超過 かつ acknowledged でないzap_requestを expired に
// 対応するタスクを readyToReZap に更新し、Controllerに通知
// ──────────────────────────────────────────────
async function expireAckDeadlines(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const expiredResult = await client.query<{ id: string; task_id: string }>(
      `UPDATE zap_requests
       SET status = 'expired'
       WHERE status IN ('created', 'executed')
         AND ack_deadline_at < NOW()
         AND task_id IN (
           SELECT id FROM tasks WHERE status = 'waitingAck'
         )
       RETURNING id, task_id`
    );

    if (!expiredResult.rowCount || expiredResult.rowCount === 0) {
      await client.query('COMMIT');
      return;
    }

    console.log(`[cron] Expired ${expiredResult.rowCount} zap_request(s)`);

    const taskIds = [...new Set(expiredResult.rows.map((r) => r.task_id))];

    const updatedTasks = await client.query<TaskRow>(
      `UPDATE tasks
       SET status = 'readyToReZap'
       WHERE id = ANY($1) AND status = 'waitingAck'
       RETURNING *`,
      [taskIds]
    );

    console.log(`[cron] Updated ${taskIds.length} task(s) to readyToReZap`);

    await client.query('COMMIT');

    // 各タスクのControllerに再Zap通知
    for (const task of updatedTasks.rows) {
      if (!task.controller_user_id) continue;

      try {
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [task.controller_user_id]
        );

        const pushPromises = devicesResult.rows.map((device) =>
          admin.messaging().send({
            token: device.push_token,
            notification: {
              title: '⚡ 再Zapできます！',
              body: `「${task.title}」の受領期限が切れました。再度Zapしましょう！`,
            },
            apns: {
              headers: {
                'apns-push-type': 'alert',
                'apns-priority': '10',
              },
              payload: {
                aps: { sound: 'default', badge: 1 },
                taskId: task.id,
                type: 'ready_to_rezap',
              },
            },
          }).catch((err) => {
            console.error(`[cron] Push failed for device ${device.id}:`, err);
          })
        );

        await Promise.all(pushPromises);
        console.log(`[cron] Notified controller=${task.controller_user_id} for re-zap task=${task.id}`);
      } catch (err) {
        console.error(`[cron] Push error for task=${task.id}:`, err);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cron] expireAckDeadlines error:', err);
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────
// ジョブ3：締切前リマインダー通知（毎分）
// reminder_minutes前になったらオーナーに通知（1回のみ）
// ──────────────────────────────────────────────
async function sendReminderNotifications(): Promise<void> {
  try {
    const result = await pool.query<TaskRow>(
      `UPDATE tasks
       SET reminder_sent_at = NOW()
       WHERE status = 'scheduled'
         AND reminder_sent_at IS NULL
         AND due_at > NOW()
         AND due_at <= NOW() + (reminder_minutes * interval '1 minute')
       RETURNING *`
    );

    if (!result.rowCount || result.rowCount === 0) return;

    console.log(`[cron] Sending reminders for ${result.rowCount} task(s)`);

    for (const task of result.rows) {
      try {
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [task.owner_user_id]
        );

        const pushPromises = devicesResult.rows.map((device) =>
          admin.messaging().send({
            token: device.push_token,
            notification: {
              title: '⏰ もうすぐ締切です！',
              body: `「${task.title}」の締切まで ${task.reminder_minutes} 分を切りました。`,
            },
            apns: {
              headers: {
                'apns-push-type': 'alert',
                'apns-priority': '10',
              },
              payload: {
                aps: { sound: 'default', badge: 1 },
                taskId: task.id,
                type: 'reminder',
              },
            },
          }).catch((err) => {
            console.error(`[cron] Reminder push failed for device ${device.id}:`, err);
          })
        );

        await Promise.all(pushPromises);
        console.log(`[cron] Reminder sent to owner=${task.owner_user_id} for task=${task.id}`);
      } catch (err) {
        console.error(`[cron] Reminder push error for task=${task.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[cron] sendReminderNotifications error:', err);
  }
}

// ──────────────────────────────────────────────
// cronジョブ起動
// ──────────────────────────────────────────────
export function startCronJobs(): void {
  cron.schedule('* * * * *', async () => {
    await activateScheduledTasks();
    await expireAckDeadlines();
    await sendReminderNotifications();
  });

  console.log('[cron] Cron jobs started');
}
