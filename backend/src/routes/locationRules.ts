import { Router, Response } from 'express';
import pool from '../db';
import { sendPush } from '../push';
import { sendZapSequence } from '../pavlok';
import { AuthRequest, DeviceRow, LocationPresenceRow, LocationRuleRow } from '../types';

const router = Router();

// iOS のジオフェンスは1アプリ20か所まで
const MAX_RULES_PER_USER = 20;

async function findOwnRule(ruleId: string, userId: string): Promise<LocationRuleRow | null> {
  const result = await pool.query<LocationRuleRow>(
    `SELECT * FROM location_rules WHERE id = $1 AND owner_user_id = $2`,
    [ruleId, userId]
  );
  return result.rows[0] ?? null;
}

/** 滞在が確認できた時に Pavlok で Zap し、本人に通知する */
async function zapForStay(rule: LocationRuleRow): Promise<void> {
  let zapped = false;
  try {
    const pavlokResult = await pool.query<{ pavlok_token: string | null }>(
      `SELECT pavlok_token FROM users WHERE id = $1`,
      [rule.owner_user_id]
    );
    const pavlokToken = pavlokResult.rows[0]?.pavlok_token;

    if (pavlokToken) {
      zapped = await sendZapSequence(pavlokToken);
      console.log(`[location] Pavlok zap ${zapped ? 'succeeded' : 'failed'} rule=${rule.id} owner=${rule.owner_user_id}`);
    } else {
      console.log(`[location] No Pavlok token for owner=${rule.owner_user_id}, skipping Pavlok zap`);
    }
  } catch (err) {
    console.error(`[location] Pavlok API error rule=${rule.id}:`, err);
  }

  try {
    const devicesResult = await pool.query<DeviceRow>(
      `SELECT * FROM devices WHERE user_id = $1`,
      [rule.owner_user_id]
    );
    await Promise.all(
      devicesResult.rows.map((device) =>
        sendPush(
          device,
          zapped
            ? {
                title: '⚡ Zapされました！',
                body: `「${rule.title}」に${rule.dwell_minutes}分以上滞在しました`,
              }
            : {
                title: `📍 「${rule.title}」に${rule.dwell_minutes}分以上滞在しました`,
                body: 'Pavlokが未連携、または送信に失敗したためZapできませんでした',
              },
          { ruleId: rule.id, type: 'location_zapped' }
        ).catch((err) => {
          console.error(`[location] Push failed for device ${device.id}:`, err);
        })
      )
    );
  } catch (err) {
    console.error(`[location] Push error rule=${rule.id}:`, err);
  }
}

// ──────────────────────────────────────────────
// GET /location_rules  — 自分の場所ルール一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  try {
    const result = await pool.query<LocationRuleRow>(
      `SELECT * FROM location_rules WHERE owner_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /location_rules] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /location_rules  — 場所ルール作成
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { title, latitude, longitude, radius_meters, dwell_minutes } = req.body as {
    title?: string;
    latitude?: number;
    longitude?: number;
    radius_meters?: number;
    dwell_minutes?: number;
  };

  if (
    !title?.trim() ||
    typeof latitude !== 'number' || latitude < -90 || latitude > 90 ||
    typeof longitude !== 'number' || longitude < -180 || longitude > 180 ||
    !Number.isInteger(radius_meters) || radius_meters! < 100 || radius_meters! > 1000 ||
    !Number.isInteger(dwell_minutes) || dwell_minutes! < 1 || dwell_minutes! > 720
  ) {
    res.status(400).json({
      error: 'title, latitude, longitude, radius_meters (100-1000), dwell_minutes (1-720) are required',
    });
    return;
  }

  try {
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM location_rules WHERE owner_user_id = $1`,
      [userId]
    );
    if (parseInt(countResult.rows[0].count, 10) >= MAX_RULES_PER_USER) {
      res.status(409).json({ error: `場所は${MAX_RULES_PER_USER}か所まで登録できます` });
      return;
    }

    const result = await pool.query<LocationRuleRow>(
      `INSERT INTO location_rules (id, owner_user_id, title, latitude, longitude, radius_meters, dwell_minutes, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [userId, title.trim(), latitude, longitude, radius_meters, dwell_minutes]
    );
    console.log(`[POST /location_rules] Created rule=${result.rows[0].id} owner=${userId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /location_rules] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /location_rules/:ruleId  — 場所ルール削除
// ──────────────────────────────────────────────
router.delete('/:ruleId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { ruleId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM location_rules WHERE id = $1 AND owner_user_id = $2`,
      [ruleId, userId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Location rule not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /location_rules/:ruleId] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /location_rules/:ruleId/enter  — ジオフェンスに入った（端末から）
// 出ていない滞在が既にあれば、それをそのまま使う（入場通知の重複対策）
// ──────────────────────────────────────────────
router.post('/:ruleId/enter', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { ruleId } = req.params;
  try {
    const rule = await findOwnRule(ruleId, userId);
    if (!rule) {
      res.status(404).json({ error: 'Location rule not found' });
      return;
    }

    const existing = await pool.query<LocationPresenceRow>(
      `SELECT * FROM location_presences WHERE rule_id = $1 AND exited_at IS NULL ORDER BY entered_at DESC LIMIT 1`,
      [ruleId]
    );
    if (existing.rows.length > 0) {
      res.json(existing.rows[0]);
      return;
    }

    const result = await pool.query<LocationPresenceRow>(
      `INSERT INTO location_presences (id, rule_id, owner_user_id, status, entered_at)
       VALUES (uuid_generate_v4(), $1, $2, 'inside', NOW())
       RETURNING *`,
      [ruleId, userId]
    );
    console.log(`[POST /location_rules/:ruleId/enter] rule=${ruleId} owner=${userId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /location_rules/:ruleId/enter] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /location_rules/:ruleId/exit  — ジオフェンスから出た（端末から）
// ──────────────────────────────────────────────
router.post('/:ruleId/exit', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { ruleId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE location_presences
       SET exited_at = NOW(),
           status = CASE WHEN status IN ('inside', 'confirming') THEN 'left' ELSE status END
       WHERE rule_id = $1 AND owner_user_id = $2 AND exited_at IS NULL`,
      [ruleId, userId]
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[POST /location_rules/:ruleId/exit] rule=${ruleId} owner=${userId}`);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /location_rules/:ruleId/exit] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /location_rules/:ruleId/confirm  — 滞在確認への応答（端末から）
// body: { inside: boolean }
// まだ中にいれば Zap、外にいれば退出扱い
// ──────────────────────────────────────────────
router.post('/:ruleId/confirm', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { ruleId } = req.params;
  const { inside } = req.body as { inside?: boolean };

  if (typeof inside !== 'boolean') {
    res.status(400).json({ error: 'inside (boolean) is required' });
    return;
  }

  try {
    const rule = await findOwnRule(ruleId, userId);
    if (!rule) {
      res.status(404).json({ error: 'Location rule not found' });
      return;
    }

    // confirming のものだけを原子的に確定させる（応答の重複で二重Zapしないため）
    const result = await pool.query<LocationPresenceRow>(
      inside
        ? `UPDATE location_presences SET status = 'zapped'
           WHERE rule_id = $1 AND status = 'confirming'
           RETURNING *`
        : `UPDATE location_presences SET status = 'left', exited_at = NOW()
           WHERE rule_id = $1 AND status = 'confirming'
           RETURNING *`,
      [ruleId]
    );

    if (result.rows.length === 0) {
      res.json({ zapped: false });
      return;
    }

    console.log(`[POST /location_rules/:ruleId/confirm] rule=${ruleId} inside=${inside}`);
    res.json({ zapped: inside });

    // Pavlok のシーケンスは数秒かかるので、端末のバックグラウンド実行時間を
    // 使い切らないようレスポンスを返してから実行する
    if (inside) {
      void zapForStay(rule);
    }
  } catch (err) {
    console.error('[POST /location_rules/:ruleId/confirm] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
