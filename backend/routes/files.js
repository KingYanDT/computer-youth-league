const express = require('express');
const router = express.Router();
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');
const { normalizeOriginalName } = require('../utils/fileName');
const { getAssignedUsers } = require('../utils/assignment');
const { withTransaction } = require('../utils/db');
const { parsePagination, paginateResponse } = require('../utils/pagination');
const upload = require('../utils/upload');

const COMMITTEE_ROLES = ['secretary', 'viceSecretary'];
const DEPARTMENT_REVIEW_ROLES = ['minister', 'viceMinister'];
const DEPARTMENT_VIEW_ROLES = ['minister', 'viceMinister', 'member'];

function isCommittee(user) {
  return COMMITTEE_ROLES.includes(user.role);
}

function canViewSubmission(user, file) {
  if (isCommittee(user)) return true;
  if (file.submitted_by === user.id) return true;
  return DEPARTMENT_VIEW_ROLES.includes(user.role) && user.department_id && user.department_id === file.department_id;
}

function canReviewSubmission(user, file) {
  if (isCommittee(user)) return true;
  return DEPARTMENT_REVIEW_ROLES.includes(user.role) && user.department_id && user.department_id === file.department_id;
}

function applyVisibilityFilter(query, params, user) {
  if (isCommittee(user)) return query;
  if (user.role === 'branchSecretary') {
    params.push(user.id);
    return `${query} AND fs.submitted_by = ?`;
  }
  if (DEPARTMENT_VIEW_ROLES.includes(user.role) && user.department_id) {
    params.push(user.department_id);
    return `${query} AND fs.department_id = ?`;
  }
  params.push('__no_access__');
  return `${query} AND fs.id = ?`;
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { task_id, taskId, status } = req.query;
    const pager = parsePagination(req.query, { defaultPageSize: 50 });
    let query = `
      SELECT fs.*, t.title as task_title, d.name as department_name
      FROM file_submissions fs
      LEFT JOIN tasks t ON fs.task_id = t.id
      LEFT JOIN departments d ON fs.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    const requestedTaskId = task_id || taskId;

    if (requestedTaskId) {
      query += ' AND fs.task_id = ?';
      params.push(requestedTaskId);
    }

    if (status) {
      query += ' AND fs.status = ?';
      params.push(status);
    }

    query = applyVisibilityFilter(query, params, req.user);

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) c`;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;

    query += ' ORDER BY fs.submitted_at DESC LIMIT ? OFFSET ?';
    params.push(pager.pageSize, pager.offset);

    const [rows] = await pool.query(query, params);
    res.json({ files: rows, ...paginateResponse(rows, total, pager) });
  } catch (err) {
    console.error('Get files error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireRole('branchSecretary'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a file' });
    }

    const taskId = req.body.task_id || req.body.taskId;
    if (!taskId) {
      return res.status(400).json({ error: 'Please choose a task' });
    }

    const [taskRows] = await pool.query('SELECT id, department_id, assigned_to FROM tasks WHERE id = ?', [taskId]);
    if (taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const assignedUsers = await getAssignedUsers(pool, taskRows[0].assigned_to, taskId);
    if (!assignedUsers.some(user => user.id === req.user.id)) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    const id = uuidv4();
    const departmentId = taskRows[0].department_id || req.user.department_id;
    const originalName = normalizeOriginalName(req.file.originalname);

    // 事务：插入文件 + 通知部门负责人 + 通知书记
    await withTransaction(async (conn) => {
      await conn.query(
        'INSERT INTO file_submissions (id, task_id, file_name, file_path, file_size, submitted_by, submitted_by_name, department_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id, taskId, originalName, req.file.path, req.file.size,
          req.user.id, req.user.name, departmentId, 'pending'
        ]
      );

      if (taskRows[0].department_id) {
        const [leaders] = await conn.query(
          'SELECT id FROM users WHERE department_id = ? AND role IN (?, ?)',
          [taskRows[0].department_id, 'minister', 'viceMinister']
        );
        for (const leader of leaders) {
          await conn.query(
            'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), 'file', 'New file submitted', `${req.user.name} submitted ${originalName}`, leader.id]
          );
        }
      }

      const [secretaries] = await conn.query("SELECT id FROM users WHERE role IN ('secretary', 'viceSecretary')");
      for (const sec of secretaries) {
        await conn.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'file', 'New file submitted', `${req.user.name} submitted ${originalName}`, sec.id]
        );
      }
    });

    await auditLog({
      user_id: req.user.id,
      action: 'submit_file',
      target_type: 'file',
      target_id: id,
      details: { file_name: originalName, task_id: taskId },
      ip_address: req.ip
    });

    res.status(201).json({ message: 'File submitted successfully', file: { id, file_name: originalName } });
  } catch (err) {
    console.error('Submit file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (!canViewSubmission(req.user, file)) {
      return res.status(403).json({ error: 'No permission to access this file' });
    }

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File is missing' });
    }

    await auditLog({
      user_id: req.user.id,
      action: 'download_file',
      target_type: 'file',
      target_id: req.params.id,
      ip_address: req.ip
    });

    res.download(file.file_path, file.file_name);
  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/approve', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister', 'viceMinister'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (!canReviewSubmission(req.user, file)) {
      return res.status(403).json({ error: 'No permission to approve this file' });
    }

    await withTransaction(async (conn) => {
      await conn.query('UPDATE file_submissions SET status = ? WHERE id = ?', ['approved', fileId]);

      if (file.submitted_by) {
        await conn.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'file', 'File approved', `Your file "${file.file_name}" was approved`, file.submitted_by]
        );
      }
    });

    await auditLog({
      user_id: req.user.id,
      action: 'approve_file',
      target_type: 'file',
      target_id: fileId,
      ip_address: req.ip
    });

    res.json({ message: 'File approved' });
  } catch (err) {
    console.error('Approve file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/return', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister', 'viceMinister'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const returnReason = req.body.return_reason || req.body.reason;
    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (!canReviewSubmission(req.user, file)) {
      return res.status(403).json({ error: 'No permission to return this file' });
    }

    await withTransaction(async (conn) => {
      await conn.query(
        'UPDATE file_submissions SET status = ?, returned_by = ?, returned_at = NOW(), return_reason = ? WHERE id = ?',
        ['returned', req.user.id, returnReason || null, fileId]
      );

      if (file.submitted_by) {
        await conn.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'file', 'File returned', `Your file "${file.file_name}" was returned. Reason: ${returnReason || 'None'}`, file.submitted_by]
        );
      }
    });

    await auditLog({
      user_id: req.user.id,
      action: 'return_file',
      target_type: 'file',
      target_id: fileId,
      details: { return_reason: returnReason },
      ip_address: req.ip
    });

    res.json({ message: 'File returned' });
  } catch (err) {
    console.error('Return file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/resubmit', authenticateToken, requireRole('branchSecretary'), upload.single('file'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (file.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only resubmit your own file' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a replacement file' });
    }

    const originalName = normalizeOriginalName(req.file.originalname);
    const oldFilePath = file.file_path;

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE file_submissions
         SET file_name = ?, file_path = ?, file_size = ?, status = ?, returned_by = NULL,
             returned_at = NULL, return_reason = NULL, submitted_at = NOW()
         WHERE id = ?`,
        [originalName, req.file.path, req.file.size, 'pending', fileId]
      );

      const [taskRows] = await conn.query('SELECT title, department_id FROM tasks WHERE id = ?', [file.task_id]);
      if (taskRows.length > 0 && taskRows[0].department_id) {
        const [leaders] = await conn.query(
          'SELECT id FROM users WHERE department_id = ? AND role IN (?, ?)',
          [taskRows[0].department_id, 'minister', 'viceMinister']
        );
        for (const leader of leaders) {
          await conn.query(
            'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), 'file', 'File resubmitted', `${req.user.name} resubmitted a file for "${taskRows[0].title}"`, leader.id]
          );
        }
      }
    });

    // 事务提交成功后删除旧文件，避免磁盘文件堆积
    if (oldFilePath && oldFilePath !== req.file.path && fs.existsSync(oldFilePath)) {
      fs.unlink(oldFilePath, (err) => {
        if (err) console.error('Failed to delete old file:', oldFilePath, err);
      });
    }

    await auditLog({
      user_id: req.user.id,
      action: 'resubmit_file',
      target_type: 'file',
      target_id: fileId,
      details: { file_name: originalName },
      ip_address: req.ip
    });

    res.json({ message: 'File resubmitted' });
  } catch (err) {
    console.error('Resubmit file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, requireRole('secretary', 'viceSecretary'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (file.status !== 'returned') {
      return res.status(400).json({ error: 'Only returned submissions can be deleted' });
    }

    await pool.query('DELETE FROM file_submissions WHERE id = ?', [fileId]);
    if (file.file_path && fs.existsSync(file.file_path)) {
      fs.unlink(file.file_path, () => {});
    }

    await auditLog({
      user_id: req.user.id,
      action: 'delete_returned_file',
      target_type: 'file',
      target_id: fileId,
      details: { file_name: file.file_name },
      ip_address: req.ip
    });

    res.json({ message: 'Returned submission deleted' });
  } catch (err) {
    console.error('Delete returned file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
