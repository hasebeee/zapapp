import { Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import pool from '../db';
import { AuthRequest } from '../types';

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    const email = decoded.email ?? '';
    const displayName = decoded.name ?? decoded.email ?? '';

    // Upsert user into DB
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, display_name, created_at, last_login_at)
       VALUES (uuid_generate_v4(), $1, $2, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
         SET display_name   = EXCLUDED.display_name,
             last_login_at  = NOW()
       RETURNING id`,
      [email, displayName]
    );

    const userId = result.rows[0].id;

    req.user = { userId, email };
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
