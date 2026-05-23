const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { is_regular, year } = req.query;
    let query = 'SELECT t.*, d.name as department_name FROM tasks t LEFT JOIN departments d ON t.department_id = d.id WHERE 1=1';
    const params = [];

    if (is_regular !== undefined) {
      query += ' AND t.is_regular = ?';
      params.push(is_regular === 'true' || is_regular === '1' ? 1 : 0);
    }

    if (year) {
      query += ' AND t.year = ?';
      params.push(parseInt(year));
    }

    query += ' ORDER BY t.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ tasks: rows });
  } catch (err) {
    console.error('获取任务列表错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), async (req, res) => {
  try {
    const {
      title, description, category, year, month, day,
      frequency, time_slot, department_id, assigned_to, is_regular
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: '请输入任务标题' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO tasks (id, title, description, category, year, month, day, frequency, time_slot, department_id, assigned_to, created_by, is_regular, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, title, description || null, category || '日常工作',
        year || new Date().getFullYear(), month || null, day || null,
        frequency || '不定期', time_slot || null,
        department_id || null, assigned_to || 'all',
        req.user.id, is_regular ? 1 : 0, 'active'
      ]
    );

    if (assigned_to === 'branchSecretaries') {
      const [branchUsers] = await pool.query("SELECT id FROM users WHERE role = 'branchSecretary'");
      for (const bu of branchUsers) {
        await pool.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'task', '新任务', `您有新任务：${title}`, bu.id]
        );
      }
    } else {
      if (department_id) {
        const [deptUsers] = await pool.query('SELECT id FROM users WHERE department_id = ?', [department_id]);
        for (const du of deptUsers) {
          await pool.query(
            'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), 'task', '新任务', `您有新任务：${title}`, du.id]
          );
        }
      }
    }

    await auditLog({
      user_id: req.user.id,
      action: 'create_task',
      target_type: 'task',
      target_id: id,
      details: { title, category, frequency },
      ip_address: req.ip
    });

    res.status(201).json({ message: '任务创建成功', task: { id, title } });
  } catch (err) {
    console.error('创建任务错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), async (req, res) => {
  try {
    const {
      title, description, category, year, month, day,
      frequency, time_slot, department_id, assigned_to, is_regular, status
    } = req.body;

    await pool.query(
      `UPDATE tasks SET title = ?, description = ?, category = ?, year = ?, month = ?, day = ?,
       frequency = ?, time_slot = ?, department_id = ?, assigned_to = ?, is_regular = ?, status = ? WHERE id = ?`,
      [
        title, description || null, category || '日常工作',
        year, month || null, day || null,
        frequency || '不定期', time_slot || null,
        department_id || null, assigned_to || 'all',
        is_regular ? 1 : 0, status || 'active', req.params.id
      ]
    );

    await auditLog({
      user_id: req.user.id,
      action: 'update_task',
      target_type: 'task',
      target_id: req.params.id,
      details: { title },
      ip_address: req.ip
    });

    res.json({ message: '任务更新成功' });
  } catch (err) {
    console.error('更新任务错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', authenticateToken, requireRole('secretary', 'viceSecretary'), async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);

    await auditLog({
      user_id: req.user.id,
      action: 'delete_task',
      target_type: 'task',
      target_id: req.params.id,
      ip_address: req.ip
    });

    res.json({ message: '任务删除成功' });
  } catch (err) {
    console.error('删除任务错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
