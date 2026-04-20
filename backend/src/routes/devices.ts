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

  console.log(`[POST /devices] userId=${userId} pushToken=${push_token ? push_token.slice(0, 8) + '...' : 'none'}`);

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
      console.log(`[POST /devices] Updated last_seen_at for device id=${existing.rows[0].id}`);
    } else {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO devices (id, user_id, platform, push_token, created_at, last_seen_at)
         VALUES (uuid_generate_v4(), $1, 'ios', $2, NOW(), NOW())
         RETURNING id`,
        [userId, push_token]
      );
      console.log(`[POST /devices] Registered new device id=${inserted.rows[0].id} for userId=${userId}`);
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /devices] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
