import { Router, Response } from 'express';
import pool from '../db';
import { sendAPNs } from '../apns';
import { AuthRequest, TaskRow, ZapRequestRow, DeviceRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// POST /tasks  — タスク作成
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { title, due_at, controller_user_id, reminder_minutes } = req.body as {
    title?: string;
    due_at?: string;
    controller_user_id?: string;
    reminder_minutes?: number;
  };

  const reminderMins = typeof reminder_minutes === 'number' ? reminder_minutes : 5;

  console.log(
    `[POST /tasks] userId=${userId} title=${title} due_at=${due_at} controller_user_id=${controller_user_id ?? 'none'} reminder_minutes=${reminderMins}`
  );

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
        console.warn(
          `[POST /tasks] No active relationship: owner=${userId} controller=${controller_user_id}`
        );
        res.status(403).json({ error: 'No active relationship with this controller' });
        return;
      }
    }

    const result = await pool.query<TaskRow>(
      `INSERT INTO tasks (id, owner_user_id, controller_user_id, title, due_at, created_at, status, reminder_minutes)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW(), 'scheduled', $5)
       RETURNING *`,
      [userId, controller_user_id ?? null, title, due_at, reminderMins]
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
        console.log(
          `[POST /tasks] Sending push to ${devicesResult.rows.length} device(s) for controller=${controller_user_id}`
        );

        const pushPromises = devicesResult.rows.map((device) =>
          sendAPNs({
            token: device.push_token,
            environment: device.environment,
            notification: {
              title: '新しいタスクが作成されました',
              body: `${ownerName}さんが「${task.title}」を追加しました`,
            },
            data: { taskId: task.id, type: 'task_created' },
          }).catch((pushErr: unknown) => {
            console.error(`[POST /tasks] Push failed for device ${device.id}:`, pushErr);
          })
        );

        await Promise.all(pushPromises);
        console.log(
          `[POST /tasks] Notified controller=${controller_user_id} about task=${task.id}`
        );
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
// PATCH /tasks/:taskId/controller  — 既存タスクにControllerを設定
// ──────────────────────────────────────────────
router.patch('/:taskId/controller', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { taskId } = req.params;
  const { controller_user_id } = req.body as {
    controller_user_id?: string;
  };

  console.log(
    `[PATCH /tasks/:taskId/controller] userId=${userId} taskId=${taskId} controller_user_id=${controller_user_id ?? 'none'}`
  );

  if (!controller_user_id) {
    res.status(400).json({ error: 'controller_user_id is required' });
    return;
  }

  try {
    const taskResult = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1 AND owner_user_id = $2`,
      [taskId, userId]
    );

    if (taskResult.rows.length === 0) {
      console.warn(
        `[PATCH /tasks/:taskId/controller] Task not found: taskId=${taskId} userId=${userId}`
      );
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];
    if (task.status === 'closed' || task.status === 'waitingAck') {
      console.warn(
        `[PATCH /tasks/:taskId/controller] Cannot update controller: taskId=${taskId} status=${task.status}`
      );
      res.status(400).json({ error: 'Cannot update controller for this task status' });
      return;
    }

    const relResult = await pool.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [userId, controller_user_id]
    );

    if (relResult.rows.length === 0) {
      console.warn(
        `[PATCH /tasks/:taskId/controller] No active relationship: owner=${userId} controller=${controller_user_id}`
      );
      res.status(403).json({ error: 'No active relationship with this controller' });
      return;
    }

    const updated = await pool.query<TaskRow>(
      `UPDATE tasks
       SET controller_user_id = $1
       WHERE id = $2 AND owner_user_id = $3
       RETURNING *`,
      [controller_user_id, taskId, userId]
    );

    const updatedTask = updated.rows[0];
    console.log(
      `[PATCH /tasks/:taskId/controller] Updated task=${taskId} controller=${controller_user_id}`
    );

    res.json(updatedTask);

    try {
      const ownerResult = await pool.query<{ display_name: string }>(
        `SELECT display_name FROM users WHERE id = $1`,
        [userId]
      );
      const ownerName = ownerResult.rows[0]?.display_name || 'オーナー';

      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [controller_user_id]
      );

      const pushPromises = devicesResult.rows.map((device) =>
        sendAPNs({
          token: device.push_token,
          environment: device.environment,
          notification: {
            title: 'タスクの監視者に設定されました',
            body: `${ownerName}さんが「${updatedTask.title}」の監視者に設定しました`,
          },
          data: { taskId: updatedTask.id, type: 'task_controller_assigned' },
        }).catch((pushErr: unknown) => {
          console.error(
            `[PATCH /tasks/:taskId/controller] Push failed for device ${device.id}:`,
            pushErr
          );
        })
      );

      await Promise.all(pushPromises);
    } catch (pushErr) {
      console.error('[PATCH /tasks/:taskId/controller] Push notification error:', pushErr);
    }
  } catch (err) {
    console.error('[PATCH /tasks/:taskId/controller] Error:', err);
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
      console.warn(
        `[POST /tasks/:taskId/self_complete] Not found: taskId=${taskId} userId=${userId}`
      );
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
      console.log(
        `[POST /tasks/:taskId/self_complete] Expired in-progress zap_requests for taskId=${taskId}`
      );
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
    const taskResult = await client.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);

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
      console.warn(
        `[POST /tasks/:taskId/zap] No active relationship: owner=${task.owner_user_id} controller=${controllerUserId}`
      );
      res.status(403).json({ error: 'No active relationship' });
      return;
    }

    // 指定されたControllerのみZap可能
    if (task.controller_user_id && task.controller_user_id !== controllerUserId) {
      await client.query('ROLLBACK');
      console.warn(
        `[POST /tasks/:taskId/zap] Not assigned controller: assigned=${task.controller_user_id} requester=${controllerUserId}`
      );
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
      console.warn(
        `[POST /tasks/:taskId/zap] Task not available: taskId=${taskId} status=${task.status}`
      );
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
    console.log(
      `[POST /tasks/:taskId/zap] ZapRequest created id=${zapRequest.id} taskId=${taskId} owner=${task.owner_user_id}`
    );

    // オーナーのPavlok APIトークンがあればZapを送信
    try {
      const pavlokResult = await pool.query<{ pavlok_token: string | null }>(
        `SELECT pavlok_token FROM users WHERE id = $1`,
        [task.owner_user_id]
      );
      const pavlokToken = pavlokResult.rows[0]?.pavlok_token;

      if (pavlokToken) {
        console.log(
          `[POST /tasks/:taskId/zap] Sending Pavlok sequence (beep×1 → vibe×3 → zap×1) for owner=${task.owner_user_id}`
        );
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const sendStimulus = async (type: 'zap' | 'beep' | 'vibration') => {
          return fetch('https://api.pavlok.com/api/v5/stimulus/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${pavlokToken}`,
            },
            body: JSON.stringify({ stimulus: { stimulusType: type, stimulusValue: 100 } }),
          });
        };

        // beep × 1
        await sendStimulus('beep');
        await sleep(1000);

        // vibration × 3
        for (let i = 0; i < 3; i++) {
          await sendStimulus('vibration');
          await sleep(1000);
        }

        // zap × 1
        const zapRes = await sendStimulus('zap');
        const succeededZaps = zapRes.ok ? 1 : 0;
        if (!zapRes.ok) {
          const errText = await zapRes.text();
          console.warn(
            `[POST /tasks/:taskId/zap] Pavlok zap failed: ${zapRes.status} ${errText}`
          );
        }
        console.log(
          `[POST /tasks/:taskId/zap] Pavlok sequence done: zap ${succeededZaps ? 'succeeded' : 'failed'} for owner=${task.owner_user_id}`
        );
        if (succeededZaps > 0) {
          await pool.query(
            `UPDATE zap_requests SET status = 'executed', attempted_zaps = 1, succeeded_zaps = 1 WHERE id = $1`,
            [zapRequest.id]
          );
        }
      } else {
        console.log(
          `[POST /tasks/:taskId/zap] No Pavlok token for owner=${task.owner_user_id}, skipping Pavlok zap`
        );
      }
    } catch (pavlokErr) {
      console.error('[POST /tasks/:taskId/zap] Pavlok API error:', pavlokErr);
      // Pavlok失敗はクリティカルではないので続行
    }

    // オーナーの全デバイスへアラート+サイレントpush送信
    try {
      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [task.owner_user_id]
      );
      console.log(
        `[POST /tasks/:taskId/zap] Sending push to ${devicesResult.rows.length} device(s) for owner=${task.owner_user_id}`
      );

      const pushPromises = devicesResult.rows.map((device) =>
        sendAPNs({
          token: device.push_token,
          environment: device.environment,
          notification: {
            title: '⚡ Zapされました！',
            body: `「${task.title}」のタスクにZapが届きました`,
          },
          data: { zapRequestId: zapRequest.id, taskId },
          contentAvailable: true,
        }).catch((pushErr: unknown) => {
          console.error(
            `[POST /tasks/:taskId/zap] Push failed for device ${device.id}:`,
            pushErr
          );
        })
      );

      await Promise.all(pushPromises);
      console.log(
        `[POST /tasks/:taskId/zap] Alert+silent push sent for zapRequest=${zapRequest.id}`
      );
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
// POST /tasks/:taskId/approve  — 合格（Zapなしで完了）
// ──────────────────────────────────────────────
router.post('/:taskId/approve', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: controllerUserId } = req.user!;
  const { taskId } = req.params;

  console.log(`[POST /tasks/:taskId/approve] controllerUserId=${controllerUserId} taskId=${taskId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = taskResult.rows[0];

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

    if (task.controller_user_id && task.controller_user_id !== controllerUserId) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'You are not the assigned controller for this task' });
      return;
    }

    if (task.status !== 'readyToZap' && task.status !== 'readyToReZap') {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Task cannot be approved in current status' });
      return;
    }

    const updated = await client.query<TaskRow>(
      `UPDATE tasks SET status = 'closed', closed_at = NOW()
       WHERE id = $1 AND status IN ('readyToZap', 'readyToReZap')
       RETURNING *`,
      [taskId]
    );

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Concurrent status change' });
      return;
    }

    await client.query('COMMIT');
    console.log(`[POST /tasks/:taskId/approve] Approved taskId=${taskId}`);

    res.json(updated.rows[0]);

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

      const pushPromises = devicesResult.rows.map((device) =>
        sendAPNs({
          token: device.push_token,
          environment: device.environment,
          notification: {
            title: '🎉 合格！',
            body: `${controllerName}さんが「${task.title}」を合格にしました`,
          },
          data: { taskId: task.id, type: 'task_approved' },
        }).catch((err) => {
          console.error(`[POST /tasks/:taskId/approve] Push failed for device ${device.id}:`, err);
        })
      );

      await Promise.all(pushPromises);
      console.log(`[POST /tasks/:taskId/approve] Notified owner=${task.owner_user_id}`);
    } catch (pushErr) {
      console.error('[POST /tasks/:taskId/approve] Push error:', pushErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /tasks/:taskId/approve] Error:', err);
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

    const taskResult = await client.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);

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
      console.warn(
        `[DELETE /tasks/:taskId] Forbidden: assigned=${task.controller_user_id} requester=${controllerUserId}`
      );
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
      console.warn(
        `[DELETE /tasks/:taskId] No active relationship: owner=${task.owner_user_id} controller=${controllerUserId}`
      );
      res.status(403).json({ error: 'No active relationship' });
      return;
    }

    // 関連するzap_requestsを削除
    await client.query(`DELETE FROM zap_requests WHERE task_id = $1`, [taskId]);

    // タスク削除
    await client.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

    await client.query('COMMIT');
    console.log(
      `[DELETE /tasks/:taskId] Deleted taskId=${taskId} by controller=${controllerUserId}`
    );

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
      console.log(
        `[DELETE /tasks/:taskId] Sending push to ${devicesResult.rows.length} device(s) for owner=${task.owner_user_id}`
      );

      const pushPromises = devicesResult.rows.map((device) =>
        sendAPNs({
          token: device.push_token,
          environment: device.environment,
          notification: {
            title: 'タスクが削除されました',
            body: `${controllerName}さんが「${task.title}」を削除しました`,
          },
          data: { type: 'task_deleted' },
        }).catch((pushErr: unknown) => {
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
router.get(
  '/:taskId/latest_zap_request',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { userId } = req.user!;
    const { taskId } = req.params;

    console.log(`[GET /tasks/:taskId/latest_zap_request] userId=${userId} taskId=${taskId}`);

    try {
      // タスク取得
      const taskResult = await pool.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [taskId]);

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
          console.warn(
            `[GET /tasks/:taskId/latest_zap_request] Forbidden: userId=${userId} taskId=${taskId}`
          );
          res.status(403).json({ error: 'No active relationship' });
          return;
        }
      }

      const zapResult = await pool.query<ZapRequestRow>(
        `SELECT * FROM zap_requests WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [taskId]
      );

      if (zapResult.rows.length === 0) {
        console.log(
          `[GET /tasks/:taskId/latest_zap_request] No zap request yet for taskId=${taskId}`
        );
        res.status(404).json({ error: 'No zap request found' });
        return;
      }

      console.log(
        `[GET /tasks/:taskId/latest_zap_request] Found zapRequest id=${zapResult.rows[0].id} status=${zapResult.rows[0].status}`
      );
      res.json(zapResult.rows[0]);
    } catch (err) {
      console.error('[GET /tasks/:taskId/latest_zap_request] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
