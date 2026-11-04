import cron from 'node-cron';
import pool from '../db';
import { sendPush } from '../push';
import { DeviceRow, LocationPresenceRow, TaskRow } from '../types';

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

    for (const task of result.rows) {
      if (!task.controller_user_id) continue;

      try {
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [task.controller_user_id]
        );

        const pushPromises = devicesResult.rows.map((device) =>
          sendPush(
            device,
            {
              title: '⚡ Zapできます！',
              body: `「${task.title}」の締切が来ました。Zapしましょう！`,
            },
            { taskId: task.id, type: 'ready_to_zap' }
          ).catch((err) => {
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

    for (const task of updatedTasks.rows) {
      if (!task.controller_user_id) continue;

      try {
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [task.controller_user_id]
        );

        const pushPromises = devicesResult.rows.map((device) =>
          sendPush(
            device,
            {
              title: '⚡ 再Zapできます！',
              body: `「${task.title}」の受領期限が切れました。再度Zapしましょう！`,
            },
            { taskId: task.id, type: 'ready_to_rezap' }
          ).catch((err) => {
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
         AND reminder_minutes > 0
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
          sendPush(
            device,
            {
              title: '⏰ もうすぐ締切です！',
              body: `「${task.title}」の締切まで ${task.reminder_minutes} 分を切りました。`,
            },
            { taskId: task.id, type: 'reminder' }
          ).catch((err) => {
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
// ジョブ4：場所の滞在確認（毎分）
// 滞在時間に到達した inside を confirming にし、端末に現在地の確認を依頼する。
// 端末から /location_rules/:id/confirm で「まだ中にいる」と返ってきたらZapする
// ──────────────────────────────────────────────
async function requestStayConfirmations(): Promise<void> {
  try {
    const result = await pool.query<LocationPresenceRow & { title: string; dwell_minutes: number }>(
      `UPDATE location_presences p
       SET status = 'confirming', check_sent_at = NOW()
       FROM location_rules r
       WHERE p.rule_id = r.id
         AND p.status = 'inside'
         AND p.entered_at + r.dwell_minutes * INTERVAL '1 minute' <= NOW()
       RETURNING p.*, r.title, r.dwell_minutes`
    );

    if (!result.rowCount || result.rowCount === 0) return;

    console.log(`[cron] Requesting stay confirmation for ${result.rowCount} presence(s)`);

    for (const presence of result.rows) {
      try {
        // 位置の確認ができるのは iOS アプリのみ
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1 AND platform = 'ios'`,
          [presence.owner_user_id]
        );

        await Promise.all(
          devicesResult.rows.map((device) =>
            sendPush(
              device,
              {
                title: `📍 「${presence.title}」に${presence.dwell_minutes}分滞在しています`,
                body: 'まだその場所にいる場合はZapされます',
              },
              { ruleId: presence.rule_id, type: 'location_check' },
              { contentAvailable: true }
            ).catch((err) => {
              console.error(`[cron] Location check push failed for device ${device.id}:`, err);
            })
          )
        );
      } catch (err) {
        console.error(`[cron] Location check push error for presence=${presence.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[cron] requestStayConfirmations error:', err);
  }
}

// ──────────────────────────────────────────────
// ジョブ5：滞在確認のタイムアウト（毎分）
// 確認に3分応答がなければ（電源オフ・機内モードなど）離れた扱いにする
// ──────────────────────────────────────────────
async function expireStayConfirmations(): Promise<void> {
  try {
    const result = await pool.query(
      `UPDATE location_presences
       SET status = 'unconfirmed', exited_at = NOW()
       WHERE status = 'confirming' AND check_sent_at <= NOW() - INTERVAL '3 minutes'`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[cron] ${result.rowCount} stay confirmation(s) timed out, treated as left`);
    }
  } catch (err) {
    console.error('[cron] expireStayConfirmations error:', err);
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
    await expireStayConfirmations();
    await requestStayConfirmations();
  });

  console.log('[cron] Cron jobs started');
}
