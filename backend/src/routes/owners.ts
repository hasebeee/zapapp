import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, TaskRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// GET /owners/:ownerUserId/tasks?status=...  — 他人のタスク閲覧
// ──────────────────────────────────────────────
router.get('/:ownerUserId/tasks', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: controllerUserId } = req.user!;
  const { ownerUserId } = req.params;
  const statusQuery = req.query.status as string | undefined;

  try {
    // relationship active確認
    const relResult = await pool.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [ownerUserId, controllerUserId]
    );

    if (relResult.rows.length === 0) {
      res.status(403).json({ error: 'No active relationship with this owner' });
      return;
    }

    let query: string;
    let params: unknown[];

    if (statusQuery) {
      const statuses = statusQuery.split(',').map((s) => s.trim());
      query = `SELECT * FROM tasks WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = ANY($3) ORDER BY created_at DESC`;
      params = [ownerUserId, controllerUserId, statuses];
    } else {
      query = `SELECT * FROM tasks WHERE owner_user_id = $1 AND controller_user_id = $2 ORDER BY created_at DESC`;
      params = [ownerUserId, controllerUserId];
    }

    const result = await pool.query<TaskRow>(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /owners/:ownerUserId/tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
