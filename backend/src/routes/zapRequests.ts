import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, ZapRequestRow, TaskRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// GET /zap_requests?status=created  — 自分のzap_requests
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusFilter = req.query.status as string | undefined;

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
    res.json(result.rows);
  } catch (err) {
    console.error('GET /zap_requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /zap_requests/:id/start  — Zap実行開始（冪等）
// ──────────────────────────────────────────────
router.post('/:id/start', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { id } = req.params;

  try {
    const result = await pool.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE id = $1 AND owner_user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Zap request not found' });
      return;
    }

    const zapRequest = result.rows[0];

    // 冪等: すでにexecutedなら200
    if (zapRequest.status === 'executed') {
      res.json({ ok: true });
      return;
    }

    await pool.query(
      `UPDATE zap_requests SET status = 'executed', attempted_zaps = 1 WHERE id = $1`,
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /zap_requests/:id/start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /zap_requests/:id/result  — Zap結果報告（冪等）
// ──────────────────────────────────────────────
router.post('/:id/result', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { id } = req.params;
  const {
    attempted_zaps: attemptedZaps,
    succeeded_zaps: succeededZaps,
    last_error_code: lastErrorCode,
    last_error_message: lastErrorMessage,
  } = req.body as {
    attempted_zaps?: number;
    succeeded_zaps?: number;
    last_error_code?: string;
    last_error_message?: string;
  };

  try {
    const result = await pool.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE id = $1 AND owner_user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Zap request not found' });
      return;
    }

    await pool.query(
      `UPDATE zap_requests
       SET attempted_zaps     = COALESCE($1, attempted_zaps),
           succeeded_zaps     = COALESCE($2, succeeded_zaps),
           last_error_code    = $3,
           last_error_message = $4
       WHERE id = $5`,
      [attemptedZaps ?? null, succeededZaps ?? null, lastErrorCode ?? null, lastErrorMessage ?? null, id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /zap_requests/:id/result error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /zap_requests/:id/not_started  — Zap未開始報告（冪等）
// ──────────────────────────────────────────────
router.post('/:id/not_started', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { id } = req.params;
  const {
    last_error_code: lastErrorCode,
    last_error_message: lastErrorMessage,
  } = req.body as {
    last_error_code?: string;
    last_error_message?: string;
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE id = $1 AND owner_user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Zap request not found' });
      return;
    }

    const zapRequest = result.rows[0];

    // 冪等: すでにnot_startedなら200
    if (zapRequest.status === 'not_started') {
      await client.query('ROLLBACK');
      res.json({ ok: true });
      return;
    }

    // zap_request更新
    await client.query(
      `UPDATE zap_requests
       SET status = 'not_started', attempted_zaps = 0,
           last_error_code = $1, last_error_message = $2
       WHERE id = $3`,
      [lastErrorCode ?? null, lastErrorMessage ?? null, id]
    );

    // 過去に expired なzap_requestが存在するか確認
    const expiredCheck = await client.query(
      `SELECT id FROM zap_requests
       WHERE task_id = $1 AND status = 'expired'
       LIMIT 1`,
      [zapRequest.task_id]
    );

    const newTaskStatus = expiredCheck.rows.length > 0 ? 'readyToReZap' : 'readyToZap';

    await client.query(
      `UPDATE tasks SET status = $1 WHERE id = $2`,
      [newTaskStatus, zapRequest.task_id]
    );

    await client.query('COMMIT');

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /zap_requests/:id/not_started error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// POST /zap_requests/:id/ack  — ACK（本人）
// ──────────────────────────────────────────────
router.post('/:id/ack', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE id = $1 AND owner_user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Zap request not found' });
      return;
    }

    const zapRequest = result.rows[0];

    if (zapRequest.status !== 'executed') {
      await client.query('ROLLBACK');
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

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /zap_requests/:id/ack error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
