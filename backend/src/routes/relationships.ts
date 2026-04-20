import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, RelationshipRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// GET /relationships  — 自分が関わるリレーションシップ一覧（ユーザー情報付き）
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;

  console.log(`[GET /relationships] userId=${userId}`);

  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.owner_user_id,
         r.controller_user_id,
         r.status,
         r.created_at,
         json_build_object(
           'id',           ou.id,
           'email',        ou.email,
           'display_name', ou.display_name
         ) AS owner_user,
         json_build_object(
           'id',           cu.id,
           'email',        cu.email,
           'display_name', cu.display_name
         ) AS controller_user
       FROM relationships r
       JOIN users ou ON ou.id = r.owner_user_id
       JOIN users cu ON cu.id = r.controller_user_id
       WHERE (r.owner_user_id = $1 OR r.controller_user_id = $1)
         AND r.status = 'active'
       ORDER BY r.created_at DESC`,
      [userId]
    );

    console.log(`[GET /relationships] Returning ${result.rows.length} relationship(s) for userId=${userId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /relationships] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /relationships/:relationshipId  — ブロック
// ownerUserId または controllerUserId がログイン中ユーザーなら許可
// ──────────────────────────────────────────────
router.delete('/:relationshipId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { relationshipId } = req.params;

  console.log(`[DELETE /relationships/:relationshipId] userId=${userId} relationshipId=${relationshipId}`);

  try {
    // 関係を取得
    const result = await pool.query<RelationshipRow>(
      `SELECT * FROM relationships WHERE id = $1`,
      [relationshipId]
    );

    if (result.rows.length === 0) {
      console.warn(`[DELETE /relationships/:relationshipId] Not found: id=${relationshipId}`);
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }

    const rel = result.rows[0];

    // 権限確認
    if (rel.owner_user_id !== userId && rel.controller_user_id !== userId) {
      console.warn(`[DELETE /relationships/:relationshipId] Forbidden: userId=${userId} relationshipId=${relationshipId}`);
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (rel.status === 'blocked') {
      console.warn(`[DELETE /relationships/:relationshipId] Already blocked: id=${relationshipId}`);
      res.status(400).json({ error: 'Relationship is already blocked' });
      return;
    }

    // blocked に更新
    const updated = await pool.query<{ status: string }>(
      `UPDATE relationships
       SET status = 'blocked', blocked_at = NOW(), blocked_by_user_id = $1
       WHERE id = $2
       RETURNING status`,
      [userId, relationshipId]
    );

    console.log(`[DELETE /relationships/:relationshipId] Blocked: id=${relationshipId}`);
    res.json({ status: updated.rows[0].status });
  } catch (err) {
    console.error('[DELETE /relationships/:relationshipId] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
