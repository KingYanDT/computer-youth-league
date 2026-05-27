const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authenticateToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query(
      'SELECT id, name, username, role, department_id, token_version FROM users WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0 || rows[0].token_version !== decoded.token_version) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Token invalid or expired' });
    }

    req.user = {
      id: rows[0].id,
      username: rows[0].username,
      name: rows[0].name,
      role: rows[0].role,
      department_id: rows[0].department_id,
      token_version: rows[0].token_version
    };
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
