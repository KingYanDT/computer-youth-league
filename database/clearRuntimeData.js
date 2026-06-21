require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');

const uploadDir = path.join(__dirname, '..', 'uploads');

async function clearUploads() {
  try {
    const entries = await fs.readdir(uploadDir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const target = path.join(uploadDir, entry.name);
      if (entry.name === '.gitkeep') return;
      await fs.rm(target, { recursive: true, force: true });
    }));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

async function clearDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'youth_league'
  });

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('DELETE FROM summary_files');
    await connection.query('DELETE FROM file_submissions');
    await connection.query('DELETE FROM notifications');
    await connection.query('DELETE FROM audit_logs');
    await connection.query('DELETE FROM tasks');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } catch (err) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    throw err;
  } finally {
    await connection.end();
  }
}

async function main() {
  await clearDatabase();
  await clearUploads();
  console.log('Runtime data cleared: tasks, submissions, summaries, notifications, audit logs, uploads.');
}

main().catch((err) => {
  console.error('Failed to clear runtime data:', err);
  process.exit(1);
});
