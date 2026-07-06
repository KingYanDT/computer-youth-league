const express = require('express');
const router = express.Router();
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');
const { normalizeOriginalName } = require('../utils/fileName');
const { parsePagination, paginateResponse } = require('../utils/pagination');
const upload = require('../utils/upload');

const COMMITTEE_ROLES = ['secretary', 'viceSecretary'];
const DEPARTMENT_VIEW_ROLES = ['minister', 'viceMinister', 'member'];

function isCommittee(user) {
  return COMMITTEE_ROLES.includes(user.role);
}

function canViewSummary(user, file) {
  if (isCommittee(user)) return true;
  if (file.uploaded_by === user.id) return true;
  return DEPARTMENT_VIEW_ROLES.includes(user.role) && user.department_id && user.department_id === file.department_id;
}

function applyVisibilityFilter(query, params, user) {
  if (isCommittee(user)) return query;
  if (DEPARTMENT_VIEW_ROLES.includes(user.role) && user.department_id) {
    params.push(user.department_id);
    return `${query} AND sf.department_id = ?`;
  }
  params.push(user.id);
  return `${query} AND sf.uploaded_by = ?`;
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const requestedTaskId = req.query.task_id || req.query.taskId;
    const pager = parsePagination(req.query, { defaultPageSize: 50 });
    let query = `
      SELECT sf.*, t.title as task_title, d.name as department_name
      FROM summary_files sf
      LEFT JOIN tasks t ON sf.task_id = t.id
      LEFT JOIN departments d ON sf.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (requestedTaskId) {
      query += ' AND sf.task_id = ?';
      params.push(requestedTaskId);
    }

    query = applyVisibilityFilter(query, params, req.user);

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) c`;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;

    query += ' ORDER BY sf.uploaded_at DESC LIMIT ? OFFSET ?';
    params.push(pager.pageSize, pager.offset);

    const [rows] = await pool.query(query, params);
    res.json({ summaries: rows, ...paginateResponse(rows, total, pager) });
  } catch (err) {
    console.error('Get summaries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a file' });
    }

    const taskId = req.body.task_id || req.body.taskId;
    if (!taskId) {
      return res.status(400).json({ error: 'Please choose a task' });
    }

    const [taskRows] = await pool.query('SELECT id, department_id FROM tasks WHERE id = ?', [taskId]);
    if (taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isCommittee(req.user) && req.user.department_id !== taskRows[0].department_id) {
      return res.status(403).json({ error: 'No permission to upload summary for this task' });
    }

    const id = uuidv4();
    const departmentId = isCommittee(req.user) ? taskRows[0].department_id : req.user.department_id;
    const originalName = normalizeOriginalName(req.file.originalname);
    await pool.query(
      'INSERT INTO summary_files (id, task_id, file_name, file_path, file_size, uploaded_by, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, taskId, originalName, req.file.path, req.file.size, req.user.id, departmentId]
    );

    await auditLog({
      user_id: req.user.id,
      action: 'upload_summary',
      target_type: 'summary',
      target_id: id,
      details: { file_name: originalName, task_id: taskId },
      ip_address: req.ip
    });

    res.status(201).json({ message: 'Summary uploaded successfully', summary: { id, file_name: originalName } });
  } catch (err) {
    console.error('Upload summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM summary_files WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (!canViewSummary(req.user, file)) {
      return res.status(403).json({ error: 'No permission to access this file' });
    }

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File is missing' });
    }

    await auditLog({
      user_id: req.user.id,
      action: 'download_summary',
      target_type: 'summary',
      target_id: req.params.id,
      ip_address: req.ip
    });

    res.download(file.file_path, file.file_name);
  } catch (err) {
    console.error('Download summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
