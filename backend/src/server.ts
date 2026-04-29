import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import pool from './db';
import { applySchema } from './db/applySchema';
import { startCronJobs } from './jobs/cronJobs';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const APP_ENV = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';

async function main(): Promise<void> {
  // DB接続確認。production では起動時にスキーマ変更しない。
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    if (APP_ENV !== 'production') {
      await applySchema();
      console.log('Database connected and schema applied successfully');
    } else {
      console.log('Database connected successfully; schema auto-apply skipped in production');
    }
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }

  // cronジョブ起動
  startCronJobs();

  // サーバー起動
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('Shutting down server...');
    server.close(async () => {
      await pool.end();
      console.log('Database pool closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
