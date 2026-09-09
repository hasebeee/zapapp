import { Router, Response } from 'express';
import pool from '../db';
import { sendPush } from '../push';
import { AuthRequest, DeviceRow, PackageItemRow, PackageRow, PackageWithItems, TaskRow } from '../types';

const router = Router();

type ItemInput = { title?: string; zap_criteria?: string | null };

async function fetchItems(packageId: string): Promise<PackageItemRow[]> {
  const result = await pool.query<PackageItemRow>(
    `SELECT * FROM package_items WHERE package_id = $1 ORDER BY sort_order ASC`,
    [packageId]
  );
  return result.rows;
}

function validateItems(items: unknown): items is ItemInput[] {
  return Array.isArray(items) && items.length > 0 && items.every((item) => typeof item?.title === 'string' && item.title.trim().length > 0);
}

// ──────────────────────────────────────────────
// GET /packages  — 自分のパッケージ一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  try {
    const packagesResult = await pool.query<PackageRow>(
      `SELECT * FROM packages WHERE owner_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const packages: PackageWithItems[] = await Promise.all(
      packagesResult.rows.map(async (pkg) => ({ ...pkg, items: await fetchItems(pkg.id) }))
    );

    res.json(packages);
  } catch (err) {
    console.error('[GET /packages] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /packages  — パッケージ作成
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { title, controller_user_id, time_of_day, reminder_minutes, items } = req.body as {
    title?: string;
    controller_user_id?: string | null;
    time_of_day?: string;
    reminder_minutes?: number;
    items?: ItemInput[];
  };

  if (!title || !time_of_day || !validateItems(items)) {
    res.status(400).json({ error: 'title, time_of_day and at least one item are required' });
    return;
  }

  const reminderMins = typeof reminder_minutes === 'number' ? reminder_minutes : 5;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (controller_user_id) {
      const relResult = await client.query(
        `SELECT id FROM relationships WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
        [userId, controller_user_id]
      );
      if (relResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'No active relationship with this controller' });
        return;
      }
    }

    const pkgResult = await client.query<PackageRow>(
      `INSERT INTO packages (id, owner_user_id, controller_user_id, title, time_of_day, reminder_minutes, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [userId, controller_user_id ?? null, title, time_of_day, reminderMins]
    );
    const pkg = pkgResult.rows[0];

    const insertedItems: PackageItemRow[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemResult = await client.query<PackageItemRow>(
        `INSERT INTO package_items (id, package_id, title, zap_criteria, sort_order, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())
         RETURNING *`,
        [pkg.id, item.title!.trim(), item.zap_criteria || null, i]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');

    const response: PackageWithItems = { ...pkg, items: insertedItems };
    res.status(201).json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /packages] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// GET /packages/:id  — パッケージ詳細
// ──────────────────────────────────────────────
router.get('/:packageId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { packageId } = req.params;
  try {
    const result = await pool.query<PackageRow>(
      `SELECT * FROM packages WHERE id = $1 AND owner_user_id = $2`,
      [packageId, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Package not found' });
      return;
    }
    const items = await fetchItems(packageId);
    res.json({ ...result.rows[0], items });
  } catch (err) {
    console.error('[GET /packages/:id] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// PATCH /packages/:id  — パッケージ更新（items は全置換）
// ──────────────────────────────────────────────
router.patch('/:packageId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { packageId } = req.params;
  const { title, controller_user_id, time_of_day, reminder_minutes, items } = req.body as {
    title?: string;
    controller_user_id?: string | null;
    time_of_day?: string;
    reminder_minutes?: number;
    items?: ItemInput[];
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<PackageRow>(
      `SELECT * FROM packages WHERE id = $1 AND owner_user_id = $2`,
      [packageId, userId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Package not found' });
      return;
    }
    const pkg = existing.rows[0];

    if (controller_user_id && controller_user_id !== pkg.controller_user_id) {
      const relResult = await client.query(
        `SELECT id FROM relationships WHERE owner_user_id = $1 AND controller_user_id = $2 AND status = 'active'`,
        [userId, controller_user_id]
      );
      if (relResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'No active relationship with this controller' });
        return;
      }
    }

    const newTitle = title ?? pkg.title;
    const newControllerUserId = controller_user_id !== undefined ? controller_user_id : pkg.controller_user_id;
    const newTimeOfDay = time_of_day ?? pkg.time_of_day;
    const newReminderMinutes = reminder_minutes ?? pkg.reminder_minutes;

    const updated = await client.query<PackageRow>(
      `UPDATE packages
       SET title = $1, controller_user_id = $2, time_of_day = $3, reminder_minutes = $4
       WHERE id = $5 AND owner_user_id = $6
       RETURNING *`,
      [newTitle, newControllerUserId, newTimeOfDay, newReminderMinutes, packageId, userId]
    );

    let resultItems: PackageItemRow[];
    if (items !== undefined) {
      if (!validateItems(items)) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'items must contain at least one entry with a title' });
        return;
      }
      await client.query(`DELETE FROM package_items WHERE package_id = $1`, [packageId]);
      resultItems = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemResult = await client.query<PackageItemRow>(
          `INSERT INTO package_items (id, package_id, title, zap_criteria, sort_order, created_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())
           RETURNING *`,
          [packageId, item.title!.trim(), item.zap_criteria || null, i]
        );
        resultItems.push(itemResult.rows[0]);
      }
    } else {
      resultItems = await fetchItems(packageId);
    }

    await client.query('COMMIT');
    res.json({ ...updated.rows[0], items: resultItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /packages/:id] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────
// DELETE /packages/:id
// ──────────────────────────────────────────────
router.delete('/:packageId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { packageId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM packages WHERE id = $1 AND owner_user_id = $2 RETURNING id`,
      [packageId, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Package not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /packages/:id] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /packages/:id/use  — パッケージの内容を一括タスク作成
// due_at はクライアントが「今日の日付 + パッケージの time_of_day」を
// 端末のローカルタイムゾーンで計算して渡す（サーバーのタイムゾーンで
// 計算すると、サーバーとユーザーのタイムゾーンが違う場合にズレるため）
// ──────────────────────────────────────────────
router.post('/:packageId/use', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { packageId } = req.params;
  const { due_at } = req.body as { due_at?: string };

  if (!due_at) {
    res.status(400).json({ error: 'due_at is required' });
    return;
  }
  const dueAt = new Date(due_at);
  if (isNaN(dueAt.getTime())) {
    res.status(400).json({ error: 'due_at is invalid' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pkgResult = await client.query<PackageRow>(
      `SELECT * FROM packages WHERE id = $1 AND owner_user_id = $2`,
      [packageId, userId]
    );
    if (pkgResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Package not found' });
      return;
    }
    const pkg = pkgResult.rows[0];
    const items = await fetchItems(packageId);

    const createdTasks: TaskRow[] = [];
    for (const item of items) {
      const taskResult = await client.query<TaskRow>(
        `INSERT INTO tasks (id, owner_user_id, controller_user_id, title, zap_criteria, due_at, created_at, status, reminder_minutes)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), 'scheduled', $6)
         RETURNING *`,
        [userId, pkg.controller_user_id, item.title, item.zap_criteria, dueAt, pkg.reminder_minutes]
      );
      createdTasks.push(taskResult.rows[0]);
    }

    await client.query('COMMIT');
    console.log(`[POST /packages/:id/use] Created ${createdTasks.length} task(s) from package=${packageId}`);
    res.status(201).json(createdTasks);

    // Controllerへプッシュ通知（レスポンス後に非同期で送信）
    if (pkg.controller_user_id && createdTasks.length > 0) {
      try {
        const ownerResult = await pool.query<{ display_name: string }>(
          `SELECT display_name FROM users WHERE id = $1`,
          [userId]
        );
        const ownerName = ownerResult.rows[0]?.display_name || 'オーナー';

        const devicesResult = await pool.query<DeviceRow>(
          `SELECT * FROM devices WHERE user_id = $1`,
          [pkg.controller_user_id]
        );

        const pushPromises = devicesResult.rows.map((device) =>
          sendPush(
            device,
            {
              title: '新しいタスクが作成されました',
              body: `${ownerName}さんが「${pkg.title}」から${createdTasks.length}件のタスクを追加しました`,
            },
            { type: 'package_used' }
          ).catch((pushErr: unknown) => {
            console.error(`[POST /packages/:id/use] Push failed for device ${device.id}:`, pushErr);
          })
        );

        await Promise.all(pushPromises);
      } catch (pushErr) {
        console.error('[POST /packages/:id/use] Push notification error:', pushErr);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /packages/:id/use] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
