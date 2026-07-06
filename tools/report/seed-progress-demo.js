require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// 环境守卫：禁止在生产环境运行此演示数据脚本
if (process.env.NODE_ENV === 'production') {
  console.error('⚠️  检测到 NODE_ENV=production，禁止运行 seed-progress-demo.js 演示数据脚本。');
  console.error('    此脚本会 DELETE + INSERT 真实业务数据，仅适用于开发/演示环境。');
  process.exit(1);
}

// 数据库主机白名单：仅允许连接本机
const dbHost = process.env.DB_HOST || 'localhost';
const allowedHosts = ['localhost', '127.0.0.1', '::1'];
if (!allowedHosts.includes(dbHost)) {
  console.error(`⚠️  DB_HOST=${dbHost} 不是本机地址，拒绝执行（防止误连远程/生产库）。`);
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection({
    host: dbHost,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'youth_league'
  });

  const title = '2026年6月团支部工作材料提交（汇报演示）';
  const [oldTasks] = await conn.query('SELECT id FROM tasks WHERE title = ?', [title]);
  if (oldTasks.length) {
    await conn.query('DELETE FROM tasks WHERE title = ?', [title]);
  }

  const [[secretary]] = await conn.query("SELECT id FROM users WHERE username='secretary' LIMIT 1");
  const [[branch]] = await conn.query("SELECT id, name FROM users WHERE username='branch' LIMIT 1");
  const [[minister]] = await conn.query("SELECT id FROM users WHERE username='bgs' LIMIT 1");
  if (!secretary || !branch || !minister) {
    throw new Error('缺少默认账号，无法生成汇报演示数据');
  }

  const uploadDir = path.join(process.cwd(), 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const submissionPath = path.join(uploadDir, 'progress-demo-branch-submission.txt');
  const summaryPath = path.join(uploadDir, 'progress-demo-summary.txt');
  fs.writeFileSync(submissionPath, '团支部工作材料提交演示文件。\n', 'utf8');
  fs.writeFileSync(summaryPath, '部门汇总材料演示文件。\n', 'utf8');

  const taskId = crypto.randomUUID();
  const subId = crypto.randomUUID();
  const sumId = crypto.randomUUID();
  const assignment = JSON.stringify({ mode: 'partial', tags: ['branch:all'], users: [] });

  await conn.query(
    `INSERT INTO tasks
      (id,title,description,category,year,month,day,frequency,time_slot,department_id,assigned_to,created_by,is_regular,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [
      taskId,
      title,
      '用于阶段性汇报截图，展示任务派发、团支书提交、完成情况统计与文件审核流程。',
      '日常工作',
      2026,
      6,
      15,
      '不定期',
      '全天',
      'dept1',
      assignment,
      secretary.id,
      0,
      'active'
    ]
  );

  await conn.query(
    `INSERT INTO file_submissions
      (id,task_id,file_name,file_path,file_size,submitted_by,submitted_by_name,department_id,submitted_at,status)
     VALUES (?,?,?,?,?,?,?,?,NOW(),?)`,
    [
      subId,
      taskId,
      '团支部工作材料-陈团支书.txt',
      submissionPath,
      fs.statSync(submissionPath).size,
      branch.id,
      branch.name,
      'dept1',
      'pending'
    ]
  );

  await conn.query(
    `INSERT INTO summary_files
      (id,task_id,file_name,file_path,file_size,uploaded_by,department_id,uploaded_at)
     VALUES (?,?,?,?,?,?,?,NOW())`,
    [
      sumId,
      taskId,
      '办公室汇总材料（汇报演示）.txt',
      summaryPath,
      fs.statSync(summaryPath).size,
      minister.id,
      'dept1'
    ]
  );

  await conn.end();
  console.log(JSON.stringify({ taskId, subId, sumId }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
