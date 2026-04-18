import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import pool from '../db';
import { AuthRequest, TaskRow, ZapRequestRow, DeviceRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// POST /tasks  — タスク作成
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { title, due_at, controller_user_id } = req.body as {
    title?: string;
    due_at?: string;
    controller_user_id?: string;
  };

  if (!title || !due_at) {
    res.status(400).json({ error: 'title and due_at are required' });
    return;
  }

  try {
    // controller_user_id が指定された場合はアクティブな関係か確認
    if (controller_user_id) {
      const relResult = await pool.query(
        `SELECT id FROM relationships
         WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
        [userId, controller_user_id]
      );
      if (relResult.rows.length === 0) {
        res.status(403).json({ error: 'No active relationship with this controller' });
        return;
      }
    }

    const result = await pool.query<TaskRow>(
      `INSERT INTO tasks (id, owner_user_id, controller_user_id, title, due_at, created_at, status)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW(), 'scheduled')
       RETURNING *`,
      [userId, controller_user_id ?? null, title, due_at]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /tasks?status=...  — 自分のタスク一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusQuery = req.query.status as string | undefined;

  try {
    let query: string;
    let params: unknown[];

    if (statusQuery) {
      const statuses = statusQuery.split(',').map((s) => s.trim());
      query = `SELECT * FROM tasks WHERE owner_user_id = $1 AND status = ANY($2) ORDER BY created_at DESC`;
      params = [userId, statuses];
    } else {
      query = `SELECT * FROM tasks WHERE owner_user_id = $1 ORDER BY created_at DESC`;
      params = [userId];
    }

    const result = await pool.query<TaskRow>(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /tasks/:taskId  — タスク詳細
// ──────────────────────────────────────────────
router.get('/:taskId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { taskId } = req.params;

  try {
    const result = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1 AND owner_user_id = $2`,
      [taskId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /tasks/:taskId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /tasks/:taskId/self_complete  — 自分でタスク完了
// ──────────────────────────────────────────────
router.post('/:taskId/self_complete', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { taskId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1 AND owner_user_id = $2`,
      [taskId, userId]
    );

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

    if (task.status === 'closed') {
      await client.query('ROLLBACK');
      res.status(409).json({ reason: 'already_closed' });
      return;
    }

    if (task.status === 'scheduled') {
      await client.query('ROLLBACK');
      res.status(409).json({ reason: 'not_started_yet' });
      return;
    }

    // waitingAck中なら進行中のzap_requestをexpiredに
    if (task.status === 'waitingAck') {
      await client.query(
        `UPDATE zap_requests
         SET status = 'expired'
         WHERE task_id = $1 AND status IN ('created', 'executed')`,
        [taskId]
      );
    }

    const updatedTask = await client.query<TaskRow>(
      `UPDATE tasks SET status = 'closed', closed_at = NOW() WHERE id = $1 RETURNING *`,
      [taskId]
    );

    await client.query('COMMIT');

    res.json(updatedTask.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /tasks/:taskId/self_complete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// POST /tasks/:taskId/zap  — Zap要求（他人）
// ──────────────────────────────────────────────
router.post('/:taskId/zap', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: controllerUserId } = req.user!;
  const { taskId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // タスク取得
    const taskResult = await client.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

    // relationship active確認
    const relResult = await client.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [task.owner_user_id, controllerUserId]
    );

    if (relResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'No active relationship' });
      return;
    }

    // 指定されたControllerのみZap可能
    if (task.controller_user_id && task.controller_user_id !== controllerUserId) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'You are not the assigned controller for this task' });
      return;
    }

    // タスク状態確認
    if (task.status === 'closed') {
      await client.query('ROLLBACK');
      res.status(409).json({ reason: 'closed' });
      return;
    }

    if (task.status === 'waitingAck') {
      await client.query('ROLLBACK');
      res.status(409).json({ reason: 'waiting_ack' });
      return;
    }

    if (task.status !== 'readyToZap' && task.status !== 'readyToReZap') {
      await client.query('ROLLBACK');
      res.status(409).json({ reason: 'not_available_yet' });
      return;
    }

    // 原子的にtasks.status=waitingAckへ更新
    const updateTask = await client.query<{ id: string }>(
      `UPDATE tasks
       SET status = 'waitingAck'
       WHERE id = $1 AND status IN ('readyToZap', 'readyToReZap')
       RETURNING id`,
      [taskId]
    );

    if (updateTask.rows.length === 0) {
      // 別リクエストが先に更新した
      await client.query('ROLLBACK');
      res.status(409).json({ reason: 'waiting_ack' });
      return;
    }

    // ackDeadlineAt = now + 30分
    const ackDeadlineAt = new Date(Date.now() + 30 * 60 * 1000);

    const zapResult = await client.query<ZapRequestRow>(
      `INSERT INTO zap_requests
         (id, task_id, owner_user_id, controller_user_id, created_at, ack_deadline_at, status, attempted_zaps, succeeded_zaps)
       VALUES (uuid_generate_v4(), $1, $2, $3, NOW(), $4, 'created', 0, 0)
       RETURNING *`,
      [taskId, task.owner_user_id, controllerUserId, ackDeadlineAt]
    );

    const zapRequest = zapResult.rows[0];

    await client.query('COMMIT');

    // オーナーの全デバイスへAPNsサイレントpush送信
    try {
      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [task.owner_user_id]
      );

      const pushPromises = devicesResult.rows.map((device) =>
        admin.messaging().send({
          token: device.push_token,
          apns: {
            headers: {
              'apns-push-type': 'background',
              'apns-priority': '5',
            },
            payload: {
              aps: {
                'content-available': 1,
              },
              zapRequestId: zapRequest.id,
              taskId,
            },
          },
        }).catch((pushErr) => {
          console.error(`Push failed for device ${device.id}:`, pushErr);
        })
      );

      await Promise.all(pushPromises);
    } catch (pushErr) {
      console.error('Push notification error:', pushErr);
      // push失敗はクリティカルではないので続行
    }

    res.status(201).json({ zap_request: zapRequest });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /tasks/:taskId/zap error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// GET /tasks/:taskId/latest_zap_request  — 最新zap_request取得（他人）
// ──────────────────────────────────────────────
router.get('/:taskId/latest_zap_request', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: controllerUserId } = req.user!;
  const { taskId } = req.params;

  try {
    // タスク取得
    const taskResult = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

    // relationship active確認
    const relResult = await pool.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [task.owner_user_id, controllerUserId]
    );

    if (relResult.rows.length === 0) {
      res.status(403).json({ error: 'No active relationship' });
      return;
    }

    const zapResult = await pool.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );

    if (zapResult.rows.length === 0) {
      res.status(404).json({ error: 'No zap request found' });
      return;
    }

    res.json(zapResult.rows[0]);
  } catch (err) {
    console.error('GET /tasks/:taskId/latest_zap_request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
