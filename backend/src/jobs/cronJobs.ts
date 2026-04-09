import cron from 'node-cron';
import pool from '../db';

// ──────────────────────────────────────────────
// ジョブ1：scheduled → readyToZap（毎分）
// dueAt を過ぎた scheduled タスクを readyToZap に更新
// ──────────────────────────────────────────────
async function activateScheduledTasks(): Promise<void> {
  try {
    const result = await pool.query(
      `UPDATE tasks
       SET status = 'readyToZap'
       WHERE status = 'scheduled' AND due_at <= NOW()
       RETURNING id`
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`[cron] Activated ${result.rowCount} task(s) to readyToZap`);
    }
  } catch (err) {
    console.error('[cron] activateScheduledTasks error:', err);
  }
}

// ──────────────────────────────────────────────
// ジョブ2：ACK期限切れ処理（毎分）
// waitingAck かつ ackDeadlineAt 超過 かつ acknowledged でないzap_requestを expired に
// 対応するタスクを readyToReZap に
// ──────────────────────────────────────────────
async function expireAckDeadlines(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 期限切れのzap_requestを取得（task_id も取得）
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

    if (expiredResult.rowCount && expiredResult.rowCount > 0) {
      console.log(`[cron] Expired ${expiredResult.rowCount} zap_request(s)`);

      // 対応するタスクを readyToReZap に更新
      const taskIds = [...new Set(expiredResult.rows.map((r) => r.task_id))];

      await client.query(
        `UPDATE tasks
         SET status = 'readyToReZap'
         WHERE id = ANY($1) AND status = 'waitingAck'`,
        [taskIds]
      );

      console.log(`[cron] Updated ${taskIds.length} task(s) to readyToReZap`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cron] expireAckDeadlines error:', err);
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────
// cronジョブ起動
// ──────────────────────────────────────────────
export function startCronJobs(): void {
  // 毎分実行
  cron.schedule('* * * * *', async () => {
    await activateScheduledTasks();
    await expireAckDeadlines();
  });

  console.log('[cron] Cron jobs started');
}
