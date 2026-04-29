import { Router, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { AuthRequest, InviteRow, RelationshipRow } from '../types';

const router = Router();

// ──────────────────────────────────────────────
// POST /invites  — オーナーが招待を作成
// ──────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { invitee_email: inviteeEmail } = req.body as { invitee_email?: string };

  console.log(`[POST /invites] userId=${userId} inviteeEmail=${inviteeEmail ?? 'none'}`);

  if (!inviteeEmail) {
    res.status(400).json({ error: 'invitee_email is required' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7日

  try {
    // すでにpendingの招待が存在する場合はエラー
    const existingInvite = await pool.query<{ id: string }>(
      `SELECT id FROM invites
       WHERE owner_user_id = $1 AND invitee_email = $2 AND status = 'pending' AND expires_at > NOW()`,
      [userId, inviteeEmail]
    );
    if (existingInvite.rows.length > 0) {
      console.warn(`[POST /invites] Pending invite already exists for email=${inviteeEmail}`);
      res.status(409).json({ error: 'このメールアドレスにはすでに招待を送っています。' });
      return;
    }

    // すでにアクティブなリレーションシップが存在する場合もエラー
    const existingRel = await pool.query<{ id: string }>(
      `SELECT r.id FROM relationships r
       JOIN users u ON u.id = r.controller_user_id
       WHERE r.owner_user_id = $1 AND u.email = $2 AND r.status = 'active'`,
      [userId, inviteeEmail]
    );
    if (existingRel.rows.length > 0) {
      console.warn(`[POST /invites] Active relationship already exists for email=${inviteeEmail}`);
      res.status(409).json({ error: 'このメールアドレスとはすでにつながっています。' });
      return;
    }

    const result = await pool.query<InviteRow>(
      `INSERT INTO invites (id, owner_user_id, invitee_email, token, status, expires_at, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'pending', $4, NOW())
       RETURNING *`,
      [userId, inviteeEmail, token, expiresAt]
    );

    console.log(`[POST /invites] Created invite id=${result.rows[0].id} for inviteeEmail=${inviteeEmail}`);
    res.status(201).json({ invite: result.rows[0] });
  } catch (err) {
    console.error('[POST /invites] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /invites?status=pending  — 自分のinvites一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusFilter = req.query.status as string | undefined;

  console.log(`[GET /invites] userId=${userId} status=${statusFilter ?? 'all'}`);

  try {
    let query: string;
    let params: unknown[];

    if (statusFilter) {
      query = `SELECT * FROM invites WHERE owner_user_id = $1 AND status = $2 ORDER BY created_at DESC`;
      params = [userId, statusFilter];
    } else {
      query = `SELECT * FROM invites WHERE owner_user_id = $1 ORDER BY created_at DESC`;
      params = [userId];
    }

    const result = await pool.query<InviteRow>(query, params);
    console.log(`[GET /invites] Returning ${result.rows.length} invite(s) for userId=${userId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /invites] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /invites/accept  — 招待を受け入れる（招待された側）
// ──────────────────────────────────────────────
router.post('/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId, email } = req.user!;
  const { token } = req.body as { token?: string };

  console.log(`[POST /invites/accept] userId=${userId} email=${email}`);

  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // トークン検索
    const inviteResult = await client.query<InviteRow>(
      `SELECT * FROM invites WHERE token = $1`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[POST /invites/accept] Invite not found for token`);
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    const invite = inviteResult.rows[0];
    console.log(`[POST /invites/accept] Found invite id=${invite.id} status=${invite.status} owner=${invite.owner_user_id}`);

    // pending確認
    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      console.warn(`[POST /invites/accept] Invite not pending: id=${invite.id} status=${invite.status}`);
      res.status(400).json({ error: `Invite is ${invite.status}` });
      return;
    }

    // 期限確認
    if (new Date() > new Date(invite.expires_at)) {
      await client.query('ROLLBACK');
      console.warn(`[POST /invites/accept] Invite expired: id=${invite.id}`);
      res.status(400).json({ error: 'Invite has expired' });
      return;
    }

    // すでにアクティブなリレーションシップがあれば作成しない
    const existingRel = await client.query<{ id: string }>(
      `SELECT id FROM relationships WHERE owner_user_id = $1 AND controller_user_id = $2`,
      [invite.owner_user_id, userId]
    );
    if (existingRel.rows.length > 0) {
      await client.query('ROLLBACK');
      console.warn(`[POST /invites/accept] Relationship already exists: owner=${invite.owner_user_id} controller=${userId}`);
      res.status(409).json({ error: 'すでにつながっています。' });
      return;
    }

    // relationships作成
    const relResult = await client.query<RelationshipRow>(
      `INSERT INTO relationships (id, owner_user_id, controller_user_id, status, created_at)
       VALUES (uuid_generate_v4(), $1, $2, 'active', NOW())
       RETURNING *`,
      [invite.owner_user_id, userId]
    );

    // invite更新
    await client.query(
      `UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [invite.id]
    );

    await client.query('COMMIT');
    console.log(`[POST /invites/accept] Relationship created id=${relResult.rows[0].id} owner=${invite.owner_user_id} controller=${userId}`);

    res.json({ relationship: relResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /invites/accept] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
