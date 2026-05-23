const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const auditLog = require('../utils/auditLog');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '登录尝试过多，请15分钟后再试' }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        department_id: user.department_id,
        token_version: user.token_version
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    await auditLog({
      user_id: user.id,
      action: 'login',
      target_type: 'user',
      target_id: user.id,
      ip_address: req.ip
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        department_id: user.department_id
      }
    });
  } catch (err) {
    console.error('登录错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await auditLog({
          user_id: decoded.id,
          action: 'logout',
          target_type: 'user',
          target_id: decoded.id,
          ip_address: req.ip
        });
      } catch (e) {}
    }
    res.clearCookie('token');
    res.json({ message: '已退出登录' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.query('SELECT id, name, username, role, department_id, token_version FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      res.clearCookie('token');
      return res.status(401).json({ error: '用户不存在' });
    }

    const user = rows[0];
    if (user.token_version !== decoded.token_version) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Token已失效，请重新登录' });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        department_id: user.department_id
      }
    });
  } catch (err) {
    res.clearCookie('token');
    res.status(401).json({ error: 'Token无效或已过期' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hashedPassword, decoded.id]);

    await auditLog({
      user_id: decoded.id,
      action: 'change_password',
      target_type: 'user',
      target_id: decoded.id,
      ip_address: req.ip
    });

    res.json({ message: '密码修改成功，请重新登录' });
  } catch (err) {
    console.error('修改密码错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
