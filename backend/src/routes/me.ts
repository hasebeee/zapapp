import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, ZapRequestRow, UserRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// GET /me/profile  — 自分のプロフィール（DB上のUUID含む）
// ──────────────────────────────────────────────
router.get('/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  try {
    const result = await pool.query<UserRow>(
      `SELECT * FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /me/profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /me/zap_requests?status=created  — 自分のzap_requests
// ──────────────────────────────────────────────
router.get('/zap_requests', async (req: AuthRequest, res: Response): Promise<void> => {
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
    console.error('GET /me/zap_requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
