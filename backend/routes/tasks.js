const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');
const { serializeAssignment, syncTaskAssignees, getAssignedUsers } = require('../utils/assignment');
const { withTransaction } = require('../utils/db');
const { parsePagination, paginateResponse } = require('../utils/pagination');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { is_regular, year } = req.query;
    const pager = parsePagination(req.query, { defaultPageSize: 50 });
    let query = 'SELECT t.*, d.name as department_name FROM tasks t LEFT JOIN departments d ON t.department_id = d.id WHERE 1=1';
    const params = [];

    if (is_regular !== undefined) {
      query += ' AND t.is_regular = ?';
      params.push(is_regular === 'true' || is_regular === '1' ? 1 : 0);
    }

    if (year) {
      query += ' AND t.year = ?';
      params.push(parseInt(year, 10));
    }

    // 总条数
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) c`;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;

    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(pager.pageSize, pager.offset);

    const [rows] = await pool.query(query, params);
    // 保持向后兼容：tasks 字段保留 + 新增分页字段
    res.json({ tasks: rows, ...paginateResponse(rows, total, pager) });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), async (req, res) => {
  try {
    const {
      title, description, category, year, month, day,
      frequency, time_slot, department_id, assigned_to, is_regular
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const taskFrequency = is_regular ? '每年' : '不定期';
    const id = uuidv4();
    const assignment = serializeAssignment(assigned_to || 'all');

    // 事务：插入任务 + 同步指派人中间表 + 通知
    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO tasks (id, title, description, category, year, month, day, frequency, time_slot, department_id, assigned_to, created_by, is_regular, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, title, description || null, category || '日常工作',
          year || new Date().getFullYear(), month || null, day || null,
          taskFrequency, time_slot || null,
          department_id || null, assignment,
          req.user.id, is_regular ? 1 : 0, 'active'
        ]
      );

      await syncTaskAssignees(conn, id, assignment);

      const assignedUsers = await getAssignedUsers(conn, assignment, id);
      for (const user of assignedUsers) {
        await conn.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'task', '新任务', `您有新任务：${title}`, user.id]
        );
      }
    });

    await auditLog({
      user_id: req.user.id,
      action: 'create_task',
      target_type: 'task',
      target_id: id,
      details: { title, category, frequency: taskFrequency, assigned_to: assignment },
      ip_address: req.ip
    });

    res.status(201).json({ message: 'Task created', task: { id, title } });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), async (req, res) => {
  try {
    if (Object.keys(req.body).length === 1 && req.body.status) {
      if (!['active', 'completed'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Invalid task status' });
      }

      const [result] = await pool.query(
        'UPDATE tasks SET status = ? WHERE id = ?',
        [req.body.status, req.params.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      await auditLog({
        user_id: req.user.id,
        action: 'update_task_status',
        target_type: 'task',
        target_id: req.params.id,
        details: { status: req.body.status },
        ip_address: req.ip
      });

      return res.json({ message: 'Task status updated' });
    }

    const {
      title, description, category, year, month, day,
      frequency, time_slot, department_id, assigned_to, is_regular, status
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const taskFrequency = is_regular ? '每年' : '不定期';
    const taskId = req.params.id;
    let assignment;
    let assignmentChanged = false;

    if (assigned_to === undefined) {
      const [origRows] = await pool.query('SELECT assigned_to FROM tasks WHERE id = ?', [taskId]);
      if (origRows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      assignment = origRows[0].assigned_to;
    } else {
      assignment = serializeAssignment(assigned_to);
      assignmentChanged = true;
    }

    await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `UPDATE tasks SET title = ?, description = ?, category = ?, year = ?, month = ?, day = ?,
         frequency = ?, time_slot = ?, department_id = ?, assigned_to = ?, is_regular = ?, status = ? WHERE id = ?`,
        [
          title, description || null, category || '日常工作',
          year, month || null, day || null,
          taskFrequency, time_slot || null,
          department_id || null, assignment,
          is_regular ? 1 : 0, status || 'active', taskId
        ]
      );
      if (result.affectedRows === 0) {
        const err = new Error('Task not found');
        err.statusCode = 404;
        throw err;
      }

      // 只有显式传入 assigned_to 时才重建中间表，避免无谓 DELETE+INSERT
      if (assignmentChanged) {
        await syncTaskAssignees(conn, taskId, assignment);
      }
    });

    await auditLog({
      user_id: req.user.id,
      action: 'update_task',
      target_type: 'task',
      target_id: taskId,
      details: { title, assigned_to: assignment },
      ip_address: req.ip
    });

    res.json({ message: 'Task updated' });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Task not found' });
    }
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Server error' });
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

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
