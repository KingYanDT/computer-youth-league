const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const auditLog = require('../utils/auditLog');

const ALLOWED_EXTENSIONS = /\.(doc|docx|pdf|xls|xlsx|ppt|pptx|txt|csv|jpg|jpeg|png|gif|zip|rar)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXTENSIONS.test(path.extname(file.originalname))) {
      return cb(new Error('不支持的文件类型'));
    }
    cb(null, true);
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { task_id, status } = req.query;
    let query = `
      SELECT fs.*, t.title as task_title, d.name as department_name
      FROM file_submissions fs
      LEFT JOIN tasks t ON fs.task_id = t.id
      LEFT JOIN departments d ON fs.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (task_id) {
      query += ' AND fs.task_id = ?';
      params.push(task_id);
    }

    if (status) {
      query += ' AND fs.status = ?';
      params.push(status);
    }

    if (req.user.role === 'branchSecretary') {
      query += ' AND fs.submitted_by = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY fs.submitted_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ files: rows });
  } catch (err) {
    console.error('获取文件列表错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authenticateToken, requireRole('branchSecretary'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }

    const { task_id } = req.body;
    if (!task_id) {
      return res.status(400).json({ error: '请选择关联任务' });
    }

    const id = uuidv4();
    await pool.query(
      'INSERT INTO file_submissions (id, task_id, file_name, file_path, file_size, submitted_by, submitted_by_name, department_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, task_id, req.file.originalname, req.file.path, req.file.size,
        req.user.id, req.user.name, req.user.department_id, 'pending'
      ]
    );

    const [taskRows] = await pool.query('SELECT department_id FROM tasks WHERE id = ?', [task_id]);
    if (taskRows.length > 0 && taskRows[0].department_id) {
      const [leaders] = await pool.query(
        'SELECT id FROM users WHERE department_id = ? AND role IN (?, ?)',
        [taskRows[0].department_id, 'minister', 'viceMinister']
      );
      for (const leader of leaders) {
        await pool.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'file', '新文件提交', `${req.user.name} 提交了文件：${req.file.originalname}`, leader.id]
        );
      }
    }

    const [secretaries] = await pool.query("SELECT id FROM users WHERE role IN ('secretary', 'viceSecretary')");
    for (const sec of secretaries) {
      await pool.query(
        'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'file', '新文件提交', `${req.user.name} 提交了文件：${req.file.originalname}`, sec.id]
      );
    }

    await auditLog({
      user_id: req.user.id,
      action: 'submit_file',
      target_type: 'file',
      target_id: id,
      details: { file_name: req.file.originalname, task_id },
      ip_address: req.ip
    });

    res.status(201).json({ message: '文件提交成功', file: { id, file_name: req.file.originalname } });
  } catch (err) {
    console.error('文件提交错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const file = rows[0];
    const filePath = file.file_path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件已丢失' });
    }

    await auditLog({
      user_id: req.user.id,
      action: 'download_file',
      target_type: 'file',
      target_id: req.params.id,
      ip_address: req.ip
    });

    res.download(filePath, file.file_name);
  } catch (err) {
    console.error('文件下载错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/approve', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), async (req, res) => {
  try {
    const fileId = req.params.id;

    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }

    await pool.query('UPDATE file_submissions SET status = ? WHERE id = ?', ['approved', fileId]);

    const file = rows[0];
    if (file.submitted_by) {
      await pool.query(
        'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'file', '文件审核通过', `您提交的文件"${file.file_name}"已审核通过`, file.submitted_by]
      );
    }

    await auditLog({
      user_id: req.user.id,
      action: 'approve_file',
      target_type: 'file',
      target_id: fileId,
      ip_address: req.ip
    });

    res.json({ message: '文件审核通过' });
  } catch (err) {
    console.error('审核文件错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/return', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister', 'viceMinister'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const { return_reason } = req.body;

    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }

    await pool.query(
      'UPDATE file_submissions SET status = ?, returned_by = ?, returned_at = NOW(), return_reason = ? WHERE id = ?',
      ['returned', req.user.id, return_reason || null, fileId]
    );

    const file = rows[0];
    if (file.submitted_by) {
      await pool.query(
        'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'file', '文件被退回', `您提交的文件"${file.file_name}"被退回，原因：${return_reason || '无'}`, file.submitted_by]
      );
    }

    await auditLog({
      user_id: req.user.id,
      action: 'return_file',
      target_type: 'file',
      target_id: fileId,
      details: { return_reason },
      ip_address: req.ip
    });

    res.json({ message: '文件已退回' });
  } catch (err) {
    console.error('退回文件错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/resubmit', authenticateToken, requireRole('branchSecretary'), async (req, res) => {
  try {
    const fileId = req.params.id;

    const [rows] = await pool.query('SELECT * FROM file_submissions WHERE id = ?', [fileId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const file = rows[0];
    if (file.submitted_by !== req.user.id) {
      return res.status(403).json({ error: '只能重新提交自己的文件' });
    }

    await pool.query(
      'UPDATE file_submissions SET status = ?, returned_by = NULL, returned_at = NULL, return_reason = NULL, submitted_at = NOW() WHERE id = ?',
      ['pending', fileId]
    );

    const [taskRows] = await pool.query('SELECT title, department_id FROM tasks WHERE id = ?', [file.task_id]);
    if (taskRows.length > 0 && taskRows[0].department_id) {
      const [leaders] = await pool.query(
        'SELECT id FROM users WHERE department_id = ? AND role IN (?, ?)',
        [taskRows[0].department_id, 'minister', 'viceMinister']
      );
      for (const leader of leaders) {
        await pool.query(
          'INSERT INTO notifications (id, type, title, message, target_user) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'file', '文件重新提交', `${req.user.name} 重新提交了任务「${taskRows[0].title}」的文件`, leader.id]
        );
      }
    }

    await auditLog({
      user_id: req.user.id,
      action: 'resubmit_file',
      target_type: 'file',
      target_id: fileId,
      ip_address: req.ip
    });

    res.json({ message: '文件已重新提交' });
  } catch (err) {
    console.error('重新提交文件错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
