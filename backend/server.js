require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authenticateToken } = require('./middleware/auth');
const { normalizeOriginalName } = require('./utils/fileName');
const upload = require('./utils/upload');

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
    file_size: req.file.size
  });
});

// 404 兜底：API 返回 JSON，其余回退到 SPA index.html
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API不存在' });
  }
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// 错误处理中间件必须放在所有路由之后
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

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
