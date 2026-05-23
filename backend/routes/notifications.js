const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE target_user = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    const unreadCount = rows.filter(n => !n.is_read).length;
    res.json({ notifications: rows, unreadCount });
  } catch (err) {
    console.error('获取通知列表错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND target_user = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: '已标记为已读' });
  } catch (err) {
    console.error('标记通知已读错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
