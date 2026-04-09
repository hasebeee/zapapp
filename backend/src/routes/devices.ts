import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// POST /devices  — APNs プッシュトークン登録/更新
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { push_token } = req.body as { push_token?: string };

  if (!push_token) {
    res.status(400).json({ error: 'push_token is required' });
    return;
  }

  try {
    // 同じトークンが登録済みなら last_seen_at を更新、なければ新規挿入
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM devices WHERE user_id = $1 AND push_token = $2`,
      [userId, push_token]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE devices SET last_seen_at = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO devices (id, user_id, platform, push_token, created_at, last_seen_at)
         VALUES (uuid_generate_v4(), $1, 'ios', $2, NOW(), NOW())`,
        [userId, push_token]
      );
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST /devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
