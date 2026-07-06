const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_EXTENSIONS = /\.(doc|docx|pdf|xls|xlsx|ppt|pptx|txt|csv|jpg|jpeg|png|gif|zip|rar)$/i;

const DEFAULT_MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760;

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
  limits: { fileSize: DEFAULT_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXTENSIONS.test(path.extname(file.originalname))) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  }
});

module.exports = upload;
