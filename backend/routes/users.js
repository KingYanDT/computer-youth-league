const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');
const { parsePagination, paginateResponse } = require('../utils/pagination');
const VALID_ROLES = ['secretary', 'viceSecretary', 'minister', 'viceMinister', 'member', 'branchSecretary'];

// 密码强度校验：至少 6 位，必须同时包含字母和数字
function validatePassword(pwd) {
  if (!pwd || typeof pwd !== 'string' || pwd.length < 6) {
    return '密码至少 6 个字符';
  }
  if (!/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) {
    return '密码必须同时包含字母和数字';
  }
  return null;
}

router.get('/assignees', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, role, department_id, created_at FROM users ORDER BY role, name');
    res.json({ users: rows });
  } catch (err) {
    console.error('Get assignees error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const pager = parsePagination(req.query, { defaultPageSize: 50 });
    const [countRows] = await pool.query('SELECT COUNT(*) as total FROM users');
    const total = countRows[0].total;
    const [rows] = await pool.query(
      'SELECT id, name, username, role, department_id, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pager.pageSize, pager.offset]
    );
    res.json({ users: rows, ...paginateResponse(rows, total, pager) });
  } catch (err) {
    console.error('获取用户列表错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const { name, username, password, role, department_id } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: '请填写必要字段' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const pwdErr = validatePassword(password);
    if (pwdErr) {
      return res.status(400).json({ error: pwdErr });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (id, name, username, password, role, department_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, username, hashedPassword, role, department_id || null]
    );

    await auditLog({
      user_id: req.user.id,
      action: 'create_user',
      target_type: 'user',
      target_id: id,
      details: { name, username, role },
      ip_address: req.ip
    });

    res.status(201).json({ message: '用户创建成功', user: { id, name, username, role, department_id } });
  } catch (err) {
    console.error('创建用户错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const { name, role, department_id } = req.body;
    const userId = req.params.id;

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    await pool.query(
      'UPDATE users SET name = ?, role = ?, department_id = ?, token_version = token_version + 1 WHERE id = ?',
      [name, role, department_id || null, userId]
    );

    await auditLog({
      user_id: req.user.id,
      action: 'update_user',
      target_type: 'user',
      target_id: userId,
      details: { name, role, department_id },
      ip_address: req.ip
    });

    res.json({ message: '用户更新成功' });
  } catch (err) {
    console.error('更新用户错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/role', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!role) {
      return res.status(400).json({ error: '请指定角色' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [result] = await pool.query('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?', [role, userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await auditLog({
      user_id: req.user.id,
      action: 'change_role',
      target_type: 'user',
      target_id: userId,
      details: { role },
      ip_address: req.ip
    });

    res.json({ message: '角色修改成功' });
  } catch (err) {
    console.error('修改角色错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/department', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const { department_id } = req.body;
    const userId = req.params.id;

    // 递增 token_version 使旧 token 失效，避免改部门后仍带旧部门权限
    const [result] = await pool.query(
      'UPDATE users SET department_id = ?, token_version = token_version + 1 WHERE id = ?',
      [department_id || null, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    await auditLog({
      user_id: req.user.id,
      action: 'change_department',
      target_type: 'user',
      target_id: userId,
      details: { department_id },
      ip_address: req.ip
    });

    res.json({ message: '部门修改成功' });
  } catch (err) {
    console.error('修改部门错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({ error: '不能删除自己' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [userId]);

    await auditLog({
      user_id: req.user.id,
      action: 'delete_user',
      target_type: 'user',
      target_id: userId,
      ip_address: req.ip
    });

    res.json({ message: '用户删除成功' });
  } catch (err) {
    console.error('删除用户错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
