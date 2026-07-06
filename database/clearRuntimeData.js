require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

const uploadDir = path.join(__dirname, '..', 'uploads');

// 生产环境守卫：禁止在 production 直接运行，必须显式传 --force
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('⚠️  检测到 NODE_ENV=production，禁止运行清理脚本。');
  console.error('    如确需在生产环境执行，请加 --force 参数并已做好数据备份。');
  process.exit(1);
}

// 删除目标前校验真实路径必须位于 uploadDir 内部，防止软链接穿越误删外部文件
async function safeRemove(target) {
  const uploadDirReal = await fs.realpath(uploadDir);
  let targetReal;
  try {
    targetReal = await fs.realpath(target);
  } catch (err) {
    if (err.code === 'ENOENT') return; // 目标不存在，跳过
    throw err;
  }
  const rel = path.relative(uploadDirReal, targetReal);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`拒绝删除 uploadDir 之外的路径: ${target} -> ${targetReal}`);
  }
  await fs.rm(targetReal, { recursive: true, force: true });
}

async function clearUploads() {
  try {
    const entries = await fs.readdir(uploadDir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (entry.name === '.gitkeep') return;
      const target = path.join(uploadDir, entry.name);
      await safeRemove(target);
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
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('DELETE FROM summary_files');
    await connection.query('DELETE FROM file_submissions');
    await connection.query('DELETE FROM notifications');
    await connection.query('DELETE FROM audit_logs');
    await connection.query('DELETE FROM tasks');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    throw err;
  } finally {
    await connection.end();
  }
}

function confirm() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('⚠️  即将清空 tasks / file_submissions / summary_files / notifications / audit_logs 及 uploads/ 全部内容。\n    输入 yes 确认继续，其他任意输入取消: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const ok = await confirm();
  if (!ok) {
    console.log('已取消，未做任何改动。');
    return;
  }

  // 先清 DB（事务包裹），再清磁盘文件
  // DB 失败时磁盘文件保留以便排查；DB 成功后磁盘清理失败仅警告（不影响业务一致性）
  await clearDatabase();
  console.log('数据库运行时数据已清空。');

  try {
    await clearUploads();
    console.log('uploads/ 目录已清空。');
  } catch (err) {
    console.warn('⚠️  清理 uploads/ 时出错（数据库已清空，不影响业务）:', err.message);
  }

  console.log('运行时数据清理完成。');
}

main().catch((err) => {
  console.error('清理运行时数据失败:', err);
  process.exit(1);
});
