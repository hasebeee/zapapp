import pool from './db';

/**
 * 監視者として合否判定待ち（readyToZap / readyToReZap）のタスク数。
 * プッシュ通知のバッジ数（アプリアイコンの通知数）として使う。
 */
export async function getPendingJudgmentCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM tasks
     JOIN relationships
       ON relationships.owner_user_id = tasks.owner_user_id
      AND relationships.controller_user_id = tasks.controller_user_id
      AND relationships.status = 'active'
     WHERE tasks.controller_user_id = $1
       AND tasks.status IN ('readyToZap', 'readyToReZap')`,
    [userId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}
