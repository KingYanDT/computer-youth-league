const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

async function auditLog({ user_id, action, target_type, target_id, details, ip_address }) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), user_id, action, target_type, target_id, details ? JSON.stringify(details) : null, ip_address]
    );
  } catch (err) {
    console.error('审计日志写入失败：', err.message);
  }
}

module.exports = auditLog;
