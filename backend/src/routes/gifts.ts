import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import pool from '../db';
import { AuthRequest, GiftRow, TaskRow, DeviceRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// POST /gifts  — OwnerがControllerにギフトを送る
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: ownerUserId } = req.user!;
  const { controller_user_id, message } = req.body as {
    controller_user_id?: string;
    message?: string;
  };

  console.log(`[POST /gifts] ownerUserId=${ownerUserId} controllerUserId=${controller_user_id}`);

  if (!controller_user_id) {
    res.status(400).json({ error: 'controller_user_id is required' });
    return;
  }

  try {
    // アクティブなrelationship確認
    const relResult = await pool.query(
      `SELECT id FROM relationships
       WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
      [ownerUserId, controller_user_id]
    );

    if (relResult.rows.length === 0) {
      console.warn(`[POST /gifts] No active relationship: owner=${ownerUserId} controller=${controller_user_id}`);
      res.status(403).json({ error: 'No active relationship with this controller' });
      return;
    }

    const result = await pool.query<GiftRow>(
      `INSERT INTO gifts (id, owner_user_id, controller_user_id, message, status, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'pending', NOW())
       RETURNING *`,
      [ownerUserId, controller_user_id, message ?? '']
    );

    const gift = result.rows[0];
    console.log(`[POST /gifts] Created gift id=${gift.id}`);

    res.status(201).json(gift);

    // Controllerへプッシュ通知
    try {
      const ownerResult = await pool.query<{ display_name: string }>(
        `SELECT display_name FROM users WHERE id = $1`,
        [ownerUserId]
      );
      const ownerName = ownerResult.rows[0]?.display_name || 'オーナー';

      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [controller_user_id]
      );

      const pushPromises = devicesResult.rows.map((device) =>
        admin.messaging().send({
          token: device.push_token,
          notification: {
            title: '🎁 ギフトが届きました！',
            body: `${ownerName}さんからギフトが届きました。タスクを作成できます！`,
          },
          apns: {
            headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
            payload: {
              aps: { sound: 'default', badge: 1 },
              giftId: gift.id,
              type: 'gift_received',
            },
          },
        }).catch((err) => {
          console.error(`[POST /gifts] Push failed for device ${device.id}:`, err);
        })
      );

      await Promise.all(pushPromises);
      console.log(`[POST /gifts] Notified controller=${controller_user_id}`);
    } catch (pushErr) {
      console.error('[POST /gifts] Push error:', pushErr);
    }
  } catch (err) {
    console.error('[POST /gifts] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /gifts/sent  — 自分が送ったギフト一覧（Owner）
// ──────────────────────────────────────────────
router.get('/sent', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;

  console.log(`[GET /gifts/sent] userId=${userId}`);

  try {
    const result = await pool.query(
      `SELECT
         g.*,
         json_build_object('id', cu.id, 'email', cu.email, 'display_name', cu.display_name) AS controller_user
       FROM gifts g
       JOIN users cu ON cu.id = g.controller_user_id
       WHERE g.owner_user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    console.log(`[GET /gifts/sent] Returning ${result.rows.length} gift(s)`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /gifts/sent] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /gifts/received  — 自分が受け取ったギフト一覧（Controller）
// ──────────────────────────────────────────────
router.get('/received', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;

  console.log(`[GET /gifts/received] userId=${userId}`);

  try {
    const result = await pool.query(
      `SELECT
         g.*,
         json_build_object('id', ou.id, 'email', ou.email, 'display_name', ou.display_name) AS owner_user
       FROM gifts g
       JOIN users ou ON ou.id = g.owner_user_id
       WHERE g.controller_user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    console.log(`[GET /gifts/received] Returning ${result.rows.length} gift(s)`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /gifts/received] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /gifts/:giftId/use  — Controllerがギフトを使ってタスクを作成
// ──────────────────────────────────────────────
router.post('/:giftId/use', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId: controllerUserId } = req.user!;
  const { giftId } = req.params;
  const { title, due_at } = req.body as { title?: string; due_at?: string };

  console.log(`[POST /gifts/:giftId/use] controllerUserId=${controllerUserId} giftId=${giftId}`);

  if (!title || !due_at) {
    res.status(400).json({ error: 'title and due_at are required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const giftResult = await client.query<GiftRow>(
      `SELECT * FROM gifts WHERE id = $1 AND controller_user_id = $2`,
      [giftId, controllerUserId]
    );

    if (giftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[POST /gifts/:giftId/use] Not found: giftId=${giftId}`);
      res.status(404).json({ error: 'Gift not found' });
      return;
    }

    const gift = giftResult.rows[0];

    if (gift.status === 'used') {
      await client.query('ROLLBACK');
      console.warn(`[POST /gifts/:giftId/use] Already used: giftId=${giftId}`);
      res.status(409).json({ error: 'Gift has already been used' });
      return;
    }

    // Ownerのタスクを作成
    const taskResult = await client.query<TaskRow>(
      `INSERT INTO tasks (id, owner_user_id, controller_user_id, title, due_at, created_at, status)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW(), 'scheduled')
       RETURNING *`,
      [gift.owner_user_id, controllerUserId, title, due_at]
    );

    const task = taskResult.rows[0];

    // ギフトを使用済みに更新
    await client.query(
      `UPDATE gifts SET status = 'used', used_at = NOW(), task_id = $1 WHERE id = $2`,
      [task.id, giftId]
    );

    await client.query('COMMIT');
    console.log(`[POST /gifts/:giftId/use] Task created id=${task.id} from gift=${giftId}`);

    res.status(201).json({ gift: { ...gift, status: 'used', task_id: task.id }, task });

    // Ownerへプッシュ通知
    try {
      const controllerResult = await pool.query<{ display_name: string }>(
        `SELECT display_name FROM users WHERE id = $1`,
        [controllerUserId]
      );
      const controllerName = controllerResult.rows[0]?.display_name || '監視者';

      const devicesResult = await pool.query<DeviceRow>(
        `SELECT * FROM devices WHERE user_id = $1`,
        [gift.owner_user_id]
      );

      const pushPromises = devicesResult.rows.map((device) =>
        admin.messaging().send({
          token: device.push_token,
          notification: {
            title: '🎁 ギフトが使われました！',
            body: `${controllerName}さんが「${task.title}」というタスクを作成しました`,
          },
          apns: {
            headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
            payload: {
              aps: { sound: 'default', badge: 1 },
              taskId: task.id,
              type: 'gift_used',
            },
          },
        }).catch((err) => {
          console.error(`[POST /gifts/:giftId/use] Push failed for device ${device.id}:`, err);
        })
      );

      await Promise.all(pushPromises);
      console.log(`[POST /gifts/:giftId/use] Notified owner=${gift.owner_user_id}`);
    } catch (pushErr) {
      console.error('[POST /gifts/:giftId/use] Push error:', pushErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /gifts/:giftId/use] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
