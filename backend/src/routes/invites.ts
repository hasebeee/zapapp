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

  if (!inviteeEmail) {
    res.status(400).json({ error: 'invitee_email is required' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7日

  try {
    const result = await pool.query<InviteRow>(
      `INSERT INTO invites (id, owner_user_id, invitee_email, token, status, expires_at, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'pending', $4, NOW())
       RETURNING *`,
      [userId, inviteeEmail, token, expiresAt]
    );

    res.status(201).json({ invite: result.rows[0] });
  } catch (err) {
    console.error('POST /invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// GET /invites?status=pending  — 自分のinvites一覧
// ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const statusFilter = req.query.status as string | undefined;

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
    res.json(result.rows);
  } catch (err) {
    console.error('GET /invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// POST /invites/accept  — 招待を受け入れる（招待された側）
// ──────────────────────────────────────────────
router.post('/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId, email } = req.user!;
  const { token } = req.body as { token?: string };

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
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    const invite = inviteResult.rows[0];

    // pending確認
    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `Invite is ${invite.status}` });
      return;
    }

    // 期限確認
    if (new Date() > new Date(invite.expires_at)) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Invite has expired' });
      return;
    }

    // inviteeEmailとログインユーザーのemailが一致するか確認
    if (invite.invitee_email.toLowerCase() !== email.toLowerCase()) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'This invite was not sent to your email address' });
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

    res.json({ relationship: relResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /invites/accept error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
