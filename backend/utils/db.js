const pool = require('../config/db');

/**
 * 在事务中执行 fn。fn 接收一个独立连接 conn，应使用 conn.query 而非 pool.query。
 * 自动 commit / rollback，并在 finally 释放连接。
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('回滚事务失败:', rollbackErr);
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { withTransaction, pool };
