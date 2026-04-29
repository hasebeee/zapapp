import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, ZapRequestRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// GET /zap_requests?status=created  — 自分のzap_requests
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusFilter = req.query.status as string | undefined;

  console.log(`[GET /zap_requests] userId=${userId} status=${statusFilter ?? 'all'}`);

  try {
    let query: string;
    let params: unknown[];

    if (statusFilter) {
      query = `SELECT * FROM zap_requests WHERE owner_user_id = $1 AND status = $2 ORDER BY created_at DESC`;
      params = [userId, statusFilter];
    } else {
      query = `SELECT * FROM zap_requests WHERE owner_user_id = $1 ORDER BY created_at DESC`;
      params = [userId];
    }

    const result = await pool.query<ZapRequestRow>(query, params);
    console.log(`[GET /zap_requests] Returning ${result.rows.length} record(s) for userId=${userId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /zap_requests] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /zap_requests/:id/ack  — ACK（本人）
// ──────────────────────────────────────────────
router.post('/:id/ack', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { id } = req.params;

  console.log(`[POST /zap_requests/:id/ack] userId=${userId} zapRequestId=${id}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE id = $1 AND owner_user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[POST /zap_requests/:id/ack] Not found: id=${id} userId=${userId}`);
      res.status(404).json({ error: 'Zap request not found' });
      return;
    }

    const zapRequest = result.rows[0];

    // executedのみACK可能（Pavlok未実行のcreatedは不可）
    if (zapRequest.status !== 'executed') {
      await client.query('ROLLBACK');
      console.warn(`[POST /zap_requests/:id/ack] Cannot ack: status=${zapRequest.status} id=${id}`);
      res.status(400).json({ error: `Cannot ack: zap_request status is ${zapRequest.status}` });
      return;
    }

    // zap_request更新
    await client.query(
      `UPDATE zap_requests SET status = 'acknowledged' WHERE id = $1`,
      [id]
    );

    // task完了
    const now = new Date();
    await client.query(
      `UPDATE tasks SET status = 'closed', closed_at = $1 WHERE id = $2`,
      [now, zapRequest.task_id]
    );

    // ack_events記録
    await client.query(
      `INSERT INTO ack_events (id, zap_request_id, owner_user_id, created_at)
       VALUES (uuid_generate_v4(), $1, $2, NOW())`,
      [id, userId]
    );

    await client.query('COMMIT');
    console.log(`[POST /zap_requests/:id/ack] ACK completed: zapRequestId=${id} taskId=${zapRequest.task_id}`);

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /zap_requests/:id/ack] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
