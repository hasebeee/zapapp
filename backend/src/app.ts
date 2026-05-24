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
  let credential: admin.credential.Credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // base64エンコードされたサービスアカウントJSONを使用（改行問題を回避）
    try {
      const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(json);
      credential = admin.credential.cert(serviceAccount);
      console.log('[Firebase] Initialized with FIREBASE_SERVICE_ACCOUNT_BASE64');
    } catch (e) {
      console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:', e);
      process.exit(1);
    }
  } else {
    // 個別の環境変数を使用（フォールバック）
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;
    console.log('[Firebase] projectId:', process.env.FIREBASE_PROJECT_ID);
    console.log('[Firebase] clientEmail:', process.env.FIREBASE_CLIENT_EMAIL);
    console.log('[Firebase] privateKey length:', privateKey?.length ?? 0);
    credential = admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: privateKey,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    } as admin.ServiceAccount);
    console.log('[Firebase] Initialized with individual env vars');
  }

  admin.initializeApp({ credential });

  // 起動時にOAuthトークン取得テスト
  setTimeout(async () => {
    try {
      const token = await credential.getAccessToken();
      console.log('[Firebase] OAuth token OK, expires_in:', token.expires_in);
    } catch (err: any) {
      console.error('[Firebase] OAuth token FAILED:', err?.message ?? err);
    }
  }, 5000);
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
