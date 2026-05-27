require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('./middleware/auth');
const { normalizeOriginalName } = require('./utils/fileName');
const pool = require('./config/db');

if (!process.env.JWT_SECRET) {
  console.error('错误：JWT_SECRET 环境变量未设置，服务器拒绝启动');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !process.env.DB_PASSWORD) {
  console.error('错误：生产环境必须设置 DB_PASSWORD');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
};
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());

const ALLOWED_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-zip-compressed'
];

const ALLOWED_EXTENSIONS = /\.(doc|docx|pdf|xls|xlsx|ppt|pptx|txt|csv|jpg|jpeg|png|gif|zip|rar)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
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
    const ext = path.extname(file.originalname);
    if (!ALLOWED_EXTENSIONS.test(ext)) {
      return cb(new Error('不支持的文件类型'));
    }
    cb(null, true);
  }
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/files', require('./routes/files'));
app.use('/api/summary', require('./routes/summary'));
app.use('/api/notifications', require('./routes/notifications'));

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }
  const originalName = normalizeOriginalName(req.file.originalname);
  res.json({
    file_name: originalName,
    file_path: req.file.path,
    file_size: req.file.size
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制' });
    }
    return res.status(400).json({ error: '文件上传错误' });
  }
  if (err.message === '不支持的文件类型' || err.message === 'Unsupported file type') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API不存在' });
  }
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

async function ensureSchema() {
  await pool.query("ALTER TABLE tasks MODIFY assigned_to TEXT");
}

ensureSchema().catch((err) => {
  console.warn('Schema check warning:', err.message);
}).finally(() => {
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
});
