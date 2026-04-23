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

  console.log(`[POST /tasks] userId=${userId} title=${title} due_at=${due_at} controller_user_id=${controller_user_id ?? 'none'}`);

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
        console.warn(`[POST /tasks] No active relationship: owner=${userId} controller=${controller_user_id}`);
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

    const task = result.rows[0];
    console.log(`[POST /tasks] Created task id=${task.id} status=${task.status}`);

    res.status(201).json(task);

    // Controllerへプッシュ通知（レスポンス後に非同期で送信）
    if (controller_user_id) {
      try {
        // Ownerの表示名を取得
        const ownerResult = await pool.query<{ display_name: string }>(
          `SELECT display_name FROM users WHERE id = $1`,
          [userId]
        );
        const ownerName = ownerResult.rows[0]?.display_name || 'オーナー';

        // Controllerのデバイス一覧を取得
        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [controller_user_id]
        );
        console.log(`[POST /tasks] Sending push to ${devicesResult.rows.length} device(s) for controller=${controller_user_id}`);

        const pushPromises = devicesResult.rows.map((device) =>
          admin.messaging().send({
            token: device.push_token,
            notification: {
              title: '新しいタスクが作成されました',
              body: `${ownerName}さんが「${task.title}」を追加しました`,
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
                taskId: task.id,
                type: 'task_created',
              },
            },
          }).catch((pushErr) => {
            console.error(`[POST /tasks] Push failed for device ${device.id}:`, pushErr);
          })
        );

        await Promise.all(pushPromises);
        console.log(`[POST /tasks] Notified controller=${controller_user_id} about task=${task.id}`);
      } catch (pushErr) {
        console.error('[POST /tasks] Push notification error:', pushErr);
      }
    }
  } catch (err) {
    console.error('[POST /tasks] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /tasks?status=...  — 自分のタスク一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusQuery = req.query.status as string | undefined;

  console.log(`[GET /tasks] userId=${userId} status=${statusQuery ?? 'all'}`);

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
    console.log(`[GET /tasks] Returning ${result.rows.length} task(s) for userId=${userId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /tasks] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /tasks/:taskId  — タスク詳細
// ──────────────────────────────────────────────
router.get('/:taskId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { taskId } = req.params;

  console.log(`[GET /tasks/:taskId] userId=${userId} taskId=${taskId}`);

  try {
    const result = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1 AND owner_user_id = $2`,
      [taskId, userId]
    );

    if (result.rows.length === 0) {
      console.warn(`[GET /tasks/:taskId] Not found: taskId=${taskId} userId=${userId}`);
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    console.log(`[GET /tasks/:taskId] Found task id=${taskId} status=${result.rows[0].status}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[GET /tasks/:taskId] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /tasks/:taskId/self_complete  — 自分でタスク完了
// ──────────────────────────────────────────────
router.post('/:taskId/self_complete', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { taskId } = req.params;

  console.log(`[POST /tasks/:taskId/self_complete] userId=${userId} taskId=${taskId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1 AND owner_user_id = $2`,
      [taskId, userId]
    );

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/self_complete] Not found: taskId=${taskId} userId=${userId}`);
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

    if (task.status === 'closed') {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/self_complete] Already closed: taskId=${taskId}`);
      res.status(409).json({ reason: 'already_closed' });
      return;
    }

    if (task.status === 'scheduled') {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/self_complete] Not started yet: taskId=${taskId}`);
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
      console.log(`[POST /tasks/:taskId/self_complete] Expired in-progress zap_requests for taskId=${taskId}`);
    }

    const updatedTask = await client.query<TaskRow>(
      `UPDATE tasks SET status = 'closed', closed_at = NOW() WHERE id = $1 RETURNING *`,
      [taskId]
    );

    await client.query('COMMIT');
    console.log(`[POST /tasks/:taskId/self_complete] Task closed: taskId=${taskId}`);

    res.json(updatedTask.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /tasks/:taskId/self_complete] Error:', err);
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

  console.log(`[POST /tasks/:taskId/zap] controllerUserId=${controllerUserId} taskId=${taskId}`);

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
      console.warn(`[POST /tasks/:taskId/zap] Task not found: taskId=${taskId}`);
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];
    console.log(`[POST /tasks/:taskId/zap] Task status=${task.status} owner=${task.owner_user_id}`);

    // relationship active確認
    const relResult = await client.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [task.owner_user_id, controllerUserId]
    );

    if (relResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/zap] No active relationship: owner=${task.owner_user_id} controller=${controllerUserId}`);
      res.status(403).json({ error: 'No active relationship' });
      return;
    }

    // 指定されたControllerのみZap可能
    if (task.controller_user_id && task.controller_user_id !== controllerUserId) {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/zap] Not assigned controller: assigned=${task.controller_user_id} requester=${controllerUserId}`);
      res.status(403).json({ error: 'You are not the assigned controller for this task' });
      return;
    }

    // タスク状態確認
    if (task.status === 'closed') {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/zap] Task already closed: taskId=${taskId}`);
      res.status(409).json({ reason: 'closed' });
      return;
    }

    if (task.status === 'waitingAck') {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/zap] Task waiting ack: taskId=${taskId}`);
      res.status(409).json({ reason: 'waiting_ack' });
      return;
    }

    if (task.status !== 'readyToZap' && task.status !== 'readyToReZap') {
      await client.query('ROLLBACK');
      console.warn(`[POST /tasks/:taskId/zap] Task not available: taskId=${taskId} status=${task.status}`);
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
      console.warn(`[POST /tasks/:taskId/zap] Concurrent update conflict: taskId=${taskId}`);
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
    console.log(`[POST /tasks/:taskId/zap] ZapRequest created id=${zapRequest.id} taskId=${taskId} owner=${task.owner_user_id}`);

    // オーナーの全デバイスへAPNsサイレントpush送信
    try {
      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [task.owner_user_id]
      );
      console.log(`[POST /tasks/:taskId/zap] Sending silent push to ${devicesResult.rows.length} device(s) for owner=${task.owner_user_id}`);

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
          console.error(`[POST /tasks/:taskId/zap] Push failed for device ${device.id}:`, pushErr);
        })
      );

      await Promise.all(pushPromises);
      console.log(`[POST /tasks/:taskId/zap] Silent push sent for zapRequest=${zapRequest.id}`);
    } catch (pushErr) {
      console.error('[POST /tasks/:taskId/zap] Push notification error:', pushErr);
      // push失敗はクリティカルではないので続行
    }

    res.status(201).json({ zap_request: zapRequest });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /tasks/:taskId/zap] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// DELETE /tasks/:taskId  — タスク削除（割り当てられたControllerのみ）
// ──────────────────────────────────────────────
router.delete('/:taskId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: controllerUserId } = req.user!;
  const { taskId } = req.params;

  console.log(`[DELETE /tasks/:taskId] controllerUserId=${controllerUserId} taskId=${taskId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[DELETE /tasks/:taskId] Not found: taskId=${taskId}`);
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

    // 割り当てられたControllerのみ削除可能
    if (task.controller_user_id !== controllerUserId) {
      await client.query('ROLLBACK');
      console.warn(`[DELETE /tasks/:taskId] Forbidden: assigned=${task.controller_user_id} requester=${controllerUserId}`);
      res.status(403).json({ error: 'Only the assigned controller can delete this task' });
      return;
    }

    // アクティブなrelationship確認
    const relResult = await client.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [task.owner_user_id, controllerUserId]
    );

    if (relResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[DELETE /tasks/:taskId] No active relationship: owner=${task.owner_user_id} controller=${controllerUserId}`);
      res.status(403).json({ error: 'No active relationship' });
      return;
    }

    // 関連するzap_requestsを削除
    await client.query(`DELETE FROM zap_requests WHERE task_id = $1`, [taskId]);

    // タスク削除
    await client.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

    await client.query('COMMIT');
    console.log(`[DELETE /tasks/:taskId] Deleted taskId=${taskId} by controller=${controllerUserId}`);

    res.json({ ok: true });

    // Ownerへプッシュ通知（レスポンス後に非同期）
    try {
      const controllerResult = await pool.query<{ display_name: string }>(
        `SELECT display_name FROM users WHERE id = $1`,
        [controllerUserId]
      );
      const controllerName = controllerResult.rows[0]?.display_name || '監視者';

      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [task.owner_user_id]
      );
      console.log(`[DELETE /tasks/:taskId] Sending push to ${devicesResult.rows.length} device(s) for owner=${task.owner_user_id}`);

      const pushPromises = devicesResult.rows.map((device) =>
        admin.messaging().send({
          token: device.push_token,
          notification: {
            title: 'タスクが削除されました',
            body: `${controllerName}さんが「${task.title}」を削除しました`,
          },
          apns: {
            payload: {
              aps: { sound: 'default' },
              type: 'task_deleted',
            },
          },
        }).catch((pushErr) => {
          console.error(`[DELETE /tasks/:taskId] Push failed for device ${device.id}:`, pushErr);
        })
      );

      await Promise.all(pushPromises);
      console.log(`[DELETE /tasks/:taskId] Notified owner=${task.owner_user_id} about deletion`);
    } catch (pushErr) {
      console.error('[DELETE /tasks/:taskId] Push notification error:', pushErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DELETE /tasks/:taskId] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// GET /tasks/:taskId/latest_zap_request  — 最新zap_request取得
// ──────────────────────────────────────────────
router.get('/:taskId/latest_zap_request', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { taskId } = req.params;

  console.log(`[GET /tasks/:taskId/latest_zap_request] userId=${userId} taskId=${taskId}`);

  try {
    // タスク取得
    const taskResult = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      console.warn(`[GET /tasks/:taskId/latest_zap_request] Task not found: taskId=${taskId}`);
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

    // オーナー本人 または アクティブなControllerであればアクセス可
    const isOwner = task.owner_user_id === userId;
    if (!isOwner) {
      const relResult = await pool.query(
        `SELECT id FROM relationships
         WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
        [task.owner_user_id, userId]
      );
      if (relResult.rows.length === 0) {
        console.warn(`[GET /tasks/:taskId/latest_zap_request] Forbidden: userId=${userId} taskId=${taskId}`);
        res.status(403).json({ error: 'No active relationship' });
        return;
      }
    }

    const zapResult = await pool.query<ZapRequestRow>(
      `SELECT * FROM zap_requests WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );

    if (zapResult.rows.length === 0) {
      console.log(`[GET /tasks/:taskId/latest_zap_request] No zap request yet for taskId=${taskId}`);
      res.status(404).json({ error: 'No zap request found' });
      return;
    }

    console.log(`[GET /tasks/:taskId/latest_zap_request] Found zapRequest id=${zapResult.rows[0].id} status=${zapResult.rows[0].status}`);
    res.json(zapResult.rows[0]);
  } catch (err) {
    console.error('[GET /tasks/:taskId/latest_zap_request] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
