require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456'
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'youth_league'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${process.env.DB_NAME || 'youth_league'}\``);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(20),
        minister_id VARCHAR(36),
        member_id VARCHAR(36),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('secretary','viceSecretary','minister','viceMinister','member','branchSecretary') NOT NULL DEFAULT 'member',
        department_id VARCHAR(36),
        token_version INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        category ENUM('组织生活','学习教育','主题活动','日常工作','其他') DEFAULT '日常工作',
        year INT,
        month INT,
        day INT,
        frequency ENUM('每周','每月','每季度','每学期','每年','不定期') DEFAULT '不定期',
        time_slot VARCHAR(100),
        department_id VARCHAR(36),
        assigned_to TEXT,
        created_by VARCHAR(36),
        is_regular BOOLEAN DEFAULT FALSE,
        status ENUM('active','completed') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS file_submissions (
        id VARCHAR(36) PRIMARY KEY,
        task_id VARCHAR(36) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT,
        submitted_by VARCHAR(36),
        submitted_by_name VARCHAR(50),
        department_id VARCHAR(36),
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending','approved','returned') DEFAULT 'pending',
        returned_by VARCHAR(36),
        returned_at DATETIME,
        return_reason TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS summary_files (
        id VARCHAR(36) PRIMARY KEY,
        task_id VARCHAR(36) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT,
        uploaded_by VARCHAR(36),
        department_id VARCHAR(36),
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        type ENUM('task','file','system') NOT NULL,
        title VARCHAR(100) NOT NULL,
        message TEXT,
        target_user VARCHAR(36),
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_user) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        action VARCHAR(50),
        target_type VARCHAR(50),
        target_id VARCHAR(36),
        details TEXT,
        ip_address VARCHAR(45),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at)
      )
    `);

    const [deptRows] = await connection.query('SELECT COUNT(*) as count FROM departments');
    if (deptRows[0].count === 0) {
      const departments = [
        { id: 'dept1', name: '办公室', color: '#722ed1' },
        { id: 'dept2', name: '组织部', color: '#13c2c2' },
        { id: 'dept3', name: '宣传部', color: '#fa8c16' },
        { id: 'dept4', name: '志愿实践部', color: '#eb2f96' }
      ];

      for (const dept of departments) {
        await connection.query(
          'INSERT INTO departments (id, name, color) VALUES (?, ?, ?)',
          [dept.id, dept.name, dept.color]
        );
      }

      const hashedPassword = await bcrypt.hash('123456', 10);

      const users = [
        { id: uuidv4(), name: '张书记', username: 'secretary', role: 'secretary', dept: null },
        { id: uuidv4(), name: '李副书记', username: 'vice', role: 'viceSecretary', dept: null },
        { id: uuidv4(), name: '办公室主任', username: 'bgs', role: 'minister', dept: 'dept1' },
        { id: uuidv4(), name: '组织部长', username: 'zzb', role: 'minister', dept: 'dept2' },
        { id: uuidv4(), name: '宣传部长', username: 'xcb', role: 'minister', dept: 'dept3' },
        { id: uuidv4(), name: '志愿实践部长', username: 'zysjb', role: 'minister', dept: 'dept4' },
        { id: uuidv4(), name: '陈团支书', username: 'branch', role: 'branchSecretary', dept: null }
      ];

      for (const user of users) {
        await connection.query(
          'INSERT INTO users (id, name, username, password, role, department_id) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, user.name, user.username, hashedPassword, user.role, user.dept]
        );
      }

      for (const dept of departments) {
        const minister = users.find(u => u.dept === dept.id);
        if (minister) {
          await connection.query(
            'UPDATE departments SET minister_id = ? WHERE id = ?',
            [minister.id, dept.id]
          );
        }
      }

      console.log('默认部门和用户已创建');
    }

    console.log('数据库初始化完成！');
  } catch (error) {
    console.error('数据库初始化失败：', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

initDatabase();
