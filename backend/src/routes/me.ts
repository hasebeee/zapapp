import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, ZapRequestRow, UserRow, PendingJudgmentTaskRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// GET /me/profile  — 自分のプロフィール（DB上のUUID含む）
// ──────────────────────────────────────────────
router.get('/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  console.log(`[GET /me/profile] userId=${userId}`);
  try {
    const result = await pool.query<Omit<UserRow, 'pavlok_token'> & { pavlok_connected: boolean }>(
      `SELECT id, email, display_name, created_at, last_login_at,
              (pavlok_token IS NOT NULL) AS pavlok_connected
       FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      console.warn(`[GET /me/profile] User not found: userId=${userId}`);
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.log(`[GET /me/profile] Found user: userId=${userId} email=${result.rows[0].email}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[GET /me/profile] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /me/pavlok/token  — PavlokアカウントでログインしてJWTをDB保存
// ──────────────────────────────────────────────
router.post('/pavlok/token', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { email, password } = req.body as { email?: string; password?: string };

  console.log(`[POST /me/pavlok/token] userId=${userId} email=${email ?? 'none'}`);

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    // Pavlok APIでログイン
    const loginRes = await fetch('https://api.pavlok.com/api/v5/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: { email, password } }),
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      console.warn(`[POST /me/pavlok/token] Pavlok login failed: ${loginRes.status} ${errText}`);
      res.status(401).json({ error: 'Pavlokのログインに失敗しました。メールアドレスとパスワードを確認してください。' });
      return;
    }

    const loginData = await loginRes.json() as { user?: { token?: string } };
    const token = loginData?.user?.token;

    if (!token) {
      console.warn(`[POST /me/pavlok/token] No token in Pavlok response`);
      res.status(502).json({ error: 'Pavlokからトークンを取得できませんでした。' });
      return;
    }

    // DBに保存
    await pool.query(
      `UPDATE users SET pavlok_token = $1 WHERE id = $2`,
      [token, userId]
    );

    console.log(`[POST /me/pavlok/token] Saved Pavlok token for userId=${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /me/pavlok/token] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /me/pavlok/token  — Pavlok連携を解除
// ──────────────────────────────────────────────
router.delete('/pavlok/token', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;

  console.log(`[DELETE /me/pavlok/token] userId=${userId}`);

  try {
    await pool.query(
      `UPDATE users SET pavlok_token = NULL WHERE id = $1`,
      [userId]
    );
    console.log(`[DELETE /me/pavlok/token] Cleared Pavlok token for userId=${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /me/pavlok/token] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /me  — アカウント削除
// ──────────────────────────────────────────────
router.delete('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;

  console.log(`[DELETE /me] userId=${userId}`);

  try {
    // CASCADE により関連データ（tasks, relationships, invites, devices, zap_requests等）も削除される
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    console.log(`[DELETE /me] Deleted user userId=${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /me] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /me/zap_requests?status=created  — 自分のzap_requests
// ──────────────────────────────────────────────
router.get('/zap_requests', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusFilter = req.query.status as string | undefined;

  console.log(`[GET /me/zap_requests] userId=${userId} status=${statusFilter ?? 'all'}`);

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
    console.log(`[GET /me/zap_requests] Returning ${result.rows.length} record(s) for userId=${userId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /me/zap_requests] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /me/pending_judgments  — 監視者として合否判定待ちの全タスク（全オーナー横断）
// ──────────────────────────────────────────────
router.get('/pending_judgments', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;

  console.log(`[GET /me/pending_judgments] userId=${userId}`);

  try {
    const result = await pool.query<PendingJudgmentTaskRow>(
      `SELECT tasks.*, users.display_name AS owner_display_name
       FROM tasks
       JOIN users ON users.id = tasks.owner_user_id
       JOIN relationships
         ON relationships.owner_user_id = tasks.owner_user_id
        AND relationships.controller_user_id = tasks.controller_user_id
        AND relationships.status = 'active'
       WHERE tasks.controller_user_id = $1
         AND tasks.status IN ('readyToZap', 'readyToReZap')
       ORDER BY tasks.due_at ASC`,
      [userId]
    );
    console.log(`[GET /me/pending_judgments] Returning ${result.rows.length} task(s) for userId=${userId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /me/pending_judgments] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
