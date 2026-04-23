import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';

import { authMiddleware } from './middleware/auth';
import invitesRouter from './routes/invites';
import tasksRouter from './routes/tasks';
import zapRequestsRouter from './routes/zapRequests';
import relationshipsRouter from './routes/relationships';
import ownersRouter from './routes/owners';
import meRouter from './routes/me';
import devicesRouter from './routes/devices';
import giftsRouter from './routes/gifts';

dotenv.config();

// ──────────────────────────────────────────────
// Firebase Admin SDK 初期化
// ──────────────────────────────────────────────
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// ──────────────────────────────────────────────
// Express アプリ
// ──────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

// ヘルスチェック（認証不要）
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 全APIに認証ミドルウェアを適用
app.use(authMiddleware);

// ルーティング
app.use('/invites', invitesRouter);
app.use('/tasks', tasksRouter);
app.use('/zap_requests', zapRequestsRouter);
app.use('/relationships', relationshipsRouter);
app.use('/owners', ownersRouter);
app.use('/me', meRouter);
app.use('/devices', devicesRouter);
app.use('/gifts', giftsRouter);

// 404ハンドラ
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// グローバルエラーハンドラ
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
