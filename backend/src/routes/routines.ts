import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, RoutineFrequency, RoutineRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// Helper: 次回実行時刻を計算
// ──────────────────────────────────────────────
function calculateNextRunAt(
  frequency: RoutineFrequency,
  prevRunAt: Date,
  customDatetimes?: string[] | null
): Date | null {
  switch (frequency) {
    case 'daily': {
      const next = new Date(prevRunAt);
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    case 'weekly': {
      const next = new Date(prevRunAt);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case 'monthly': {
      const next = new Date(prevRunAt);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    }
    case 'custom': {
      const now = new Date();
      const all = (customDatetimes ?? []).map((d) => new Date(d));
      const future = all.filter((d) => d > now).sort((a, b) => a.getTime() - b.getTime());
      return future.length > 0 ? future[0] : null;
    }
  }
}

// ──────────────────────────────────────────────
// 初回 next_run_at を計算（新規作成時）
// ──────────────────────────────────────────────
function calculateInitialNextRunAt(
  frequency: RoutineFrequency,
  firstRunAt?: string,
  customDatetimes?: string[]
): Date | null {
  if (frequency === 'custom') {
    const now = new Date();
    const all = (customDatetimes ?? []).map((d) => new Date(d));
    const future = all.filter((d) => d > now).sort((a, b) => a.getTime() - b.getTime());
    return future.length > 0 ? future[0] : null;
  }
  if (!firstRunAt) return null;
  const d = new Date(firstRunAt);
  return isNaN(d.getTime()) ? null : d;
}

// ──────────────────────────────────────────────
// GET /routines  — 自分のルーティーン一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  try {
    const result = await pool.query<RoutineRow>(
      `SELECT * FROM routines WHERE owner_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /routines] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /routines  — ルーティーン作成
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const {
    title,
    zap_criteria,
    controller_user_id,
    reminder_minutes,
    frequency,
    first_run_at,
    custom_datetimes,
  } = req.body as {
    title?: string;
    zap_criteria?: string;
    controller_user_id?: string;
    reminder_minutes?: number;
    frequency?: RoutineFrequency;
    first_run_at?: string;
    custom_datetimes?: string[];
  };

  if (!title || !frequency) {
    res.status(400).json({ error: 'title and frequency are required' });
    return;
  }

  const validFrequencies: RoutineFrequency[] = ['daily', 'weekly', 'monthly', 'custom'];
  if (!validFrequencies.includes(frequency)) {
    res.status(400).json({ error: 'Invalid frequency' });
    return;
  }

  if (frequency !== 'custom' && !first_run_at) {
    res.status(400).json({ error: 'first_run_at is required for non-custom frequency' });
    return;
  }

  if (frequency === 'custom' && (!custom_datetimes || custom_datetimes.length === 0)) {
    res.status(400).json({ error: 'custom_datetimes is required for custom frequency' });
    return;
  }

  const reminderMins = typeof reminder_minutes === 'number' ? reminder_minutes : 5;
  const nextRunAt = calculateInitialNextRunAt(frequency, first_run_at, custom_datetimes);

  try {
    if (controller_user_id) {
      const relResult = await pool.query(
        `SELECT id FROM relationships WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
        [userId, controller_user_id]
      );
      if (relResult.rows.length === 0) {
        res.status(403).json({ error: 'No active relationship with this controller' });
        return;
      }
    }

    const result = await pool.query<RoutineRow>(
      `INSERT INTO routines
         (id, owner_user_id, controller_user_id, title, zap_criteria, reminder_minutes, frequency, custom_datetimes, is_active, created_at, next_run_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, true, NOW(), $8)
       RETURNING *`,
      [
        userId,
        controller_user_id ?? null,
        title,
        zap_criteria ?? null,
        reminderMins,
        frequency,
        custom_datetimes ? JSON.stringify(custom_datetimes) : null,
        nextRunAt,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /routines] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /routines/:id  — ルーティーン詳細
// ──────────────────────────────────────────────
router.get('/:routineId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { routineId } = req.params;
  try {
    const result = await pool.query<RoutineRow>(
      `SELECT * FROM routines WHERE id = $1 AND owner_user_id = $2`,
      [routineId, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[GET /routines/:id] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// PATCH /routines/:id  — ルーティーン更新
// ──────────────────────────────────────────────
router.patch('/:routineId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { routineId } = req.params;
  const {
    title,
    zap_criteria,
    controller_user_id,
    reminder_minutes,
    is_active,
    custom_datetimes,
  } = req.body as {
    title?: string;
    zap_criteria?: string | null;
    controller_user_id?: string | null;
    reminder_minutes?: number;
    is_active?: boolean;
    custom_datetimes?: string[];
  };

  try {
    const existing = await pool.query<RoutineRow>(
      `SELECT * FROM routines WHERE id = $1 AND owner_user_id = $2`,
      [routineId, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }

    const routine = existing.rows[0];

    const newTitle = title ?? routine.title;
    const newZapCriteria = zap_criteria !== undefined ? zap_criteria : routine.zap_criteria;
    const newControllerUserId =
      controller_user_id !== undefined ? controller_user_id : routine.controller_user_id;
    const newReminderMinutes = reminder_minutes ?? routine.reminder_minutes;
    const newIsActive = is_active ?? routine.is_active;

    let newCustomDatetimes = routine.custom_datetimes;
    let newNextRunAt = routine.next_run_at;

    if (custom_datetimes !== undefined && routine.frequency === 'custom') {
      newCustomDatetimes = custom_datetimes;
      const now = new Date();
      const future = custom_datetimes
        .map((d) => new Date(d))
        .filter((d) => d > now)
        .sort((a, b) => a.getTime() - b.getTime());
      newNextRunAt = future.length > 0 ? future[0] : null;
    }

    if (controller_user_id && controller_user_id !== routine.controller_user_id) {
      const relResult = await pool.query(
        `SELECT id FROM relationships WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
        [userId, controller_user_id]
      );
      if (relResult.rows.length === 0) {
        res.status(403).json({ error: 'No active relationship with this controller' });
        return;
      }
    }

    const result = await pool.query<RoutineRow>(
      `UPDATE routines
       SET title = $1,
           zap_criteria = $2,
           controller_user_id = $3,
           reminder_minutes = $4,
           is_active = $5,
           custom_datetimes = $6,
           next_run_at = $7
       WHERE id = $8 AND owner_user_id = $9
       RETURNING *`,
      [
        newTitle,
        newZapCriteria,
        newControllerUserId,
        newReminderMinutes,
        newIsActive,
        newCustomDatetimes ? JSON.stringify(newCustomDatetimes) : null,
        newNextRunAt,
        routineId,
        userId,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[PATCH /routines/:id] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /routines/:id  — ルーティーン削除
// ──────────────────────────────────────────────
router.delete('/:routineId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { routineId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM routines WHERE id = $1 AND owner_user_id = $2 RETURNING id`,
      [routineId, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /routines/:id] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { calculateNextRunAt };
export default router;
