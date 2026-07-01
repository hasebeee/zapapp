import cron from 'node-cron';
import pool from '../db';
import { sendPush } from '../push';
import { DeviceRow, RoutineRow, TaskRow } from '../types';
import { calculateNextRunAt } from '../routes/routines';

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
// ジョブ4：ルーティーンからタスク自動作成（毎分）
// next_run_at を過ぎたアクティブなルーティーンに対してタスクを作成し、
// 次回実行時刻を更新する
// ──────────────────────────────────────────────
async function createTasksFromRoutines(): Promise<void> {
  try {
    const result = await pool.query<RoutineRow>(
      `SELECT * FROM routines WHERE is_active = true AND next_run_at IS NOT NULL AND next_run_at <= NOW()`
    );

    if (!result.rowCount || result.rowCount === 0) return;

    console.log(`[cron] Creating tasks for ${result.rowCount} routine(s)`);

    for (const routine of result.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // タスク作成（due_at = next_run_at）
        await client.query<TaskRow>(
          `INSERT INTO tasks
             (id, owner_user_id, controller_user_id, title, zap_criteria, due_at, created_at, status, reminder_minutes)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), 'scheduled', $6)`,
          [
            routine.owner_user_id,
            routine.controller_user_id,
            routine.title,
            routine.zap_criteria,
            routine.next_run_at,
            routine.reminder_minutes,
          ]
        );

        // 次回実行時刻を計算
        const nextRunAt = calculateNextRunAt(
          routine.frequency,
          routine.next_run_at!,
          routine.custom_datetimes
        );

        if (nextRunAt) {
          await client.query(
            `UPDATE routines SET next_run_at = $1 WHERE id = $2`,
            [nextRunAt, routine.id]
          );
        } else {
          // custom でこれ以上日程がない場合は非アクティブ化
          await client.query(
            `UPDATE routines SET is_active = false, next_run_at = NULL WHERE id = $1`,
            [routine.id]
          );
        }

        await client.query('COMMIT');
        console.log(
          `[cron] Created task from routine=${routine.id} next_run_at=${nextRunAt?.toISOString() ?? 'none'}`
        );
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[cron] Failed to create task from routine=${routine.id}:`, err);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[cron] createTasksFromRoutines error:', err);
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
    await createTasksFromRoutines();
  });

  console.log('[cron] Cron jobs started');
}
