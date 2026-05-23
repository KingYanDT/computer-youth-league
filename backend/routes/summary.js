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
    const { task_id } = req.query;
    let query = `
      SELECT sf.*, t.title as task_title, d.name as department_name
      FROM summary_files sf
      LEFT JOIN tasks t ON sf.task_id = t.id
      LEFT JOIN departments d ON sf.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (task_id) {
      query += ' AND sf.task_id = ?';
      params.push(task_id);
    }

    query += ' ORDER BY sf.uploaded_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ summaries: rows });
  } catch (err) {
    console.error('获取汇总列表错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authenticateToken, requireRole('secretary', 'viceSecretary', 'minister'), upload.single('file'), async (req, res) => {
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
      'INSERT INTO summary_files (id, task_id, file_name, file_path, file_size, uploaded_by, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, task_id, req.file.originalname, req.file.path, req.file.size, req.user.id, req.user.department_id]
    );

    await auditLog({
      user_id: req.user.id,
      action: 'upload_summary',
      target_type: 'summary',
      target_id: id,
      details: { file_name: req.file.originalname, task_id },
      ip_address: req.ip
    });

    res.status(201).json({ message: '汇总文件上传成功', summary: { id, file_name: req.file.originalname } });
  } catch (err) {
    console.error('上传汇总文件错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM summary_files WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const file = rows[0];
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: '文件已丢失' });
    }

    res.download(file.file_path, file.file_name);
  } catch (err) {
    console.error('下载汇总文件错误：', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
