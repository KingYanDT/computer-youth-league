const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'name', u.name, 'role', u.role))
         FROM users u WHERE u.department_id = d.id AND u.role IN ('minister', 'viceMinister')) as leaders
      FROM departments d ORDER BY d.created_at
    `);
    res.json({ departments: rows });
  } catch (err) {
    console.error('获取部门列表错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const { name, color, minister_id, member_id } = req.body;

    const id = uuidv4();
    await pool.query('INSERT INTO departments (id, name, color, minister_id, member_id) VALUES (?, ?, ?, ?, ?)', [id, name, color || '#1890ff', minister_id || null, member_id || null]);

    await auditLog({
      user_id: req.user.id,
      action: 'create_department',
      target_type: 'department',
      target_id: id,
      details: { name, color },
      ip_address: req.ip
    });

    res.status(201).json({ message: '部门创建成功', department: { id, name, color } });
  } catch (err) {
    console.error('创建部门错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    const { name, color, minister_id, member_id } = req.body;
    const deptId = req.params.id;

    await pool.query(
      'UPDATE departments SET name = ?, color = ?, minister_id = ?, member_id = ? WHERE id = ?',
      [name, color, minister_id || null, member_id || null, deptId]
    );

    await auditLog({
      user_id: req.user.id,
      action: 'update_department',
      target_type: 'department',
      target_id: deptId,
      details: { name, color, minister_id, member_id },
      ip_address: req.ip
    });

    res.json({ message: '部门更新成功' });
  } catch (err) {
    console.error('更新部门错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', authenticateToken, requireRole('secretary'), async (req, res) => {
  try {
    await pool.query('DELETE FROM departments WHERE id = ?', [req.params.id]);

    await auditLog({
      user_id: req.user.id,
      action: 'delete_department',
      target_type: 'department',
      target_id: req.params.id,
      ip_address: req.ip
    });

    res.json({ message: '部门删除成功' });
  } catch (err) {
    console.error('删除部门错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
