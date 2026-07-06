const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { parsePagination, paginateResponse } = require('../utils/pagination');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const pager = parsePagination(req.query, { defaultPageSize: 50 });

    const [countRows] = await pool.query(
      'SELECT COUNT(*) as total FROM notifications WHERE target_user = ?',
      [req.user.id]
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE target_user = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.id, pager.pageSize, pager.offset]
    );

    // 未读数（不受分页影响）
    const [unreadRows] = await pool.query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE target_user = ? AND is_read = FALSE',
      [req.user.id]
    );
    const unreadCount = unreadRows[0].cnt;

    res.json({ notifications: rows, unreadCount, ...paginateResponse(rows, total, pager) });
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
