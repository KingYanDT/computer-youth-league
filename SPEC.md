# 计算机学院团委办公系统 - 规格说明书

> 版本：v2.3.0 ｜ 最后更新：2026-07-04
> 本文档与 `package.json`、`backend/`、`frontend/index.html`、`database/init.js` 当前实现保持一致。

## 1. 项目概述

**项目名称**：计算机学院团委办公系统（youth-league-office-system）

**项目类型**：B/S 架构全栈 Web 应用（Node.js + Express + MySQL + 原生前端单页）

**部署形态**：
- 服务端部署：PM2 + Nginx 反向代理（见 `deploy/`）
- 便携版部署：C# 启动器（`YouthLeagueLauncher.exe`）+ 内嵌 MySQL，开箱即用（见 `tools/launcher/`）

**目标用户**：计算机学院团委内部人员（内网环境使用）

**核心功能**：
- 任务派发与完成情况跟踪
- 团支书文件提交、部门负责人汇总
- 多级审核（团委书记/副书记、部长/副部长）
- 部门与人员管理、基于角色的权限控制
- 通知中心、操作审计日志

## 2. 系统架构

### 2.1 目录结构

```
计算机学院团委办公系统/
├── backend/                # Express 后端
│   ├── config/db.js        # MySQL 连接池
│   ├── middleware/auth.js  # JWT 鉴权 + 角色控制
│   ├── routes/             # auth/users/departments/tasks/files/summary/notifications
│   ├── utils/              # assignment/auditLog/fileName/upload/db/pagination
│   └── server.js           # 入口
├── database/
│   ├── init.js             # 建库建表 + 默认数据 + 索引补全
│   └── clearRuntimeData.js # 运行时数据清理
├── frontend/
│   ├── index.html          # HTML 结构（a11y 增强）
│   ├── styles.css          # CSS 样式
│   └── app.js              # JavaScript 应用逻辑
├── deploy/                 # deploy.sh + nginx.conf
├── tools/
│   ├── launcher/           # C# 便携版启动器 + 构建脚本
│   └── report/             # 汇报演示数据生成 + 截图脚本
├── uploads/                # 上传文件落盘目录
├── logs/                   # PM2 日志目录
├── ecosystem.config.js     # PM2 配置
└── package.json
```

### 2.2 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 HTML5 + CSS3 + JavaScript (ES6+)，Fetch API，单文件 |
| 后端 | Node.js 18+，Express 4.18 |
| 数据库 | MySQL 8（utf8mb4_unicode_ci） |
| 鉴权 | JWT（HS256）+ bcryptjs 密码哈希 + Cookie 传输 |
| 文件上传 | multer（落盘 uploads/，UUID 重命名） |
| 安全 | helmet、cors、express-rate-limit（登录限流） |
| 进程管理 | PM2 |
| 反向代理 | Nginx（HTTPS、gzip、uploads 防直链） |

### 2.3 角色与权限模型

| 角色 | 标识 | 主要权限 |
|---|---|---|
| 团委书记 | `secretary` | 全局任务/用户/部门管理、文件审核、汇总下载 |
| 副书记 | `viceSecretary` | 同上（除删除任务外） |
| 部长 | `minister` | 本部门任务创建、本部门文件审核、汇总上传 |
| 副部长 | `viceMinister` | 本部门文件审核、汇总上传 |
| 团支书 | `branchSecretary` | 接收任务、提交文件、重新提交被打回文件 |
| 委员 | `member` | 查看本部门文件 |

默认账号由 `database/init.js` 预置（secretary / vice / minister1 / minister2 / bgs / branch1 / branch2 等），默认口令 `123456`，**首次部署后必须修改**。

## 3. 数据模型

所有表使用 `utf8mb4 / utf8mb4_unicode_ci`，主键为 UUID `VARCHAR(36)`。

### 3.1 departments
| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 部门 ID（默认 dept1~dept4） |
| name | VARCHAR(100) | 部门名称 |
| color | VARCHAR(20) | 前端展示颜色 |
| minister_id | VARCHAR(36) | 部长 user ID |

### 3.2 users
| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 用户 ID |
| username | VARCHAR(50) UNIQUE | 登录名 |
| password | VARCHAR(255) | bcrypt 哈希 |
| name | VARCHAR(50) | 显示名 |
| role | ENUM | 见 2.3 角色列表 |
| department_id | VARCHAR(36) FK | 所属部门 |
| token_version | INT DEFAULT 0 | JWT 失效控制（递增即令旧 token 失效） |
| created_at | DATETIME | 创建时间 |

### 3.3 tasks
| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 任务 ID |
| title | VARCHAR(255) | 标题 |
| description | TEXT | 描述 |
| category | ENUM | 日常工作/组织生活/学习教育/主题活动/其他 |
| year | INT | 年份 |
| month | INT | 月份（可空） |
| day | INT | 日期（可空） |
| frequency | ENUM | 每年/不定期 |
| time_slot | VARCHAR(100) | 时间段说明 |
| department_id | VARCHAR(36) FK | 归属部门 |
| assigned_to | TEXT | 指派 JSON（见 3.3.1），用于前端回显 |
| created_by | VARCHAR(36) FK | 创建人 |
| is_regular | BOOLEAN | 是否常态化任务 |
| status | ENUM | active/completed |
| created_at | DATETIME | 创建时间 |

#### 3.3.1 assigned_to 指派格式
- 全员：`'all'`
- 部分指派：JSON 字符串
```json
{ "mode": "partial", "tags": ["branch:all", "branch:dept1", "role:minister"], "users": ["uuid1", "uuid2"] }
```

#### 3.3.2 task_assignees 中间表
为加速查询"任务被指派给谁"，引入中间表（带联合主键与外键）：

| 字段 | 类型 | 说明 |
|---|---|---|
| task_id | VARCHAR(36) PK, FK CASCADE | 任务 ID |
| user_id | VARCHAR(36) PK, FK CASCADE | 用户 ID |

- 创建/更新任务时，`syncTaskAssignees` 把解析后的具体 user_id 列表同步到此表
- 查询被指派人时优先走中间表（带索引），无记录则回退到解析 `assigned_to TEXT`（兼容老数据）

### 3.4 file_submissions
团支书提交的文件，支持审核流程。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 提交 ID |
| task_id | VARCHAR(36) FK CASCADE | 关联任务 |
| file_name | VARCHAR(255) | 原始文件名（已规范化） |
| file_path | VARCHAR(500) | 服务器落盘路径 |
| file_size | BIGINT | 字节数 |
| submitted_by | VARCHAR(36) | 提交人 ID |
| submitted_by_name | VARCHAR(50) | 提交人姓名冗余 |
| department_id | VARCHAR(36) | 提交时所属部门 |
| status | ENUM | pending/approved/returned |
| returned_by | VARCHAR(36) | 打回人 ID |
| returned_at | DATETIME | 打回时间 |
| return_reason | TEXT | 打回原因 |
| submitted_at | DATETIME | 提交时间 |

### 3.5 summary_files
部门负责人上传的汇总材料。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 汇总 ID |
| task_id | VARCHAR(36) FK CASCADE | 关联任务 |
| file_name / file_path / file_size | - | 同上 |
| uploaded_by | VARCHAR(36) | 上传人 ID |
| department_id | VARCHAR(36) | 部门 |
| uploaded_at | DATETIME | 上传时间 |

### 3.6 notifications
| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 通知 ID |
| type | VARCHAR(50) | task/file/system |
| title | VARCHAR(100) | 标题 |
| message | TEXT | 内容 |
| target_user | VARCHAR(36) FK CASCADE | 接收人 |
| is_read | BOOLEAN | 已读标记 |
| created_at | DATETIME | 创建时间 |

### 3.7 audit_logs
| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(36) PK | 日志 ID |
| user_id | VARCHAR(36) | 操作人 |
| action | VARCHAR(50) | 动作（create_task/submit_file/approve_file/...） |
| target_type | VARCHAR(50) | task/file/user/department |
| target_id | VARCHAR(36) | 目标对象 ID |
| details | TEXT | JSON 详情 |
| ip_address | VARCHAR(45) | IPv4/IPv6 |
| created_at | DATETIME | 时间 |

## 4. API 规格

所有接口前缀 `/api`，除 `/api/auth/login` 外均需携带 JWT Cookie。

### 4.1 认证 `/api/auth`
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | /login | 公开 | 登录，设置 httpOnly Cookie（24h） |
| POST | /logout | 已登录 | 清除 Cookie + 递增 token_version 使该用户所有旧 token 立即失效 |
| GET | /me | 已登录 | 获取当前用户信息 |
| PUT | /change-password | 已登录 | 修改密码（校验旧密码） |

### 4.2 用户 `/api/users`
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | / | secretary/viceSecretary | 用户列表 |
| GET | /assignees | 已登录 | 可指派人员列表 |
| POST | / | secretary/viceSecretary | 创建用户 |
| PUT | /:id | secretary/viceSecretary | 编辑用户（递增 token_version） |
| PUT | /:id/role | secretary/viceSecretary | 改角色（递增 token_version） |
| PUT | /:id/department | secretary/viceSecretary | 改部门（递增 token_version） |
| DELETE | /:id | secretary | 删除用户 |

### 4.3 部门 `/api/departments`
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | / | 已登录 | 部门列表（含人员聚合） |
| POST | / | secretary/viceSecretary | 创建部门 |
| PUT | /:id | secretary/viceSecretary | 编辑部门 |
| DELETE | /:id | secretary/viceSecretary | 删除部门 |

### 4.4 任务 `/api/tasks`
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | / | 已登录 | 任务列表（支持 ?is_regular=&year=&page=&pageSize=） |
| POST | / | secretary/viceSecretary/minister | 创建任务（自动通知被指派人） |
| PUT | /:id | secretary/viceSecretary/minister | 编辑任务（未传 assigned_to 保留原值） |
| PUT | /:id (仅 status) | secretary/viceSecretary/minister | 切换 active/completed |
| DELETE | /:id | secretary/viceSecretary | 删除任务 |

### 4.5 文件提交 `/api/files`
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | / | 已登录 | 文件列表（按角色/部门可见性过滤） |
| POST | / | branchSecretary | 上传提交（multipart） |
| GET | /:id/download | 已登录 | 下载（校验可见性 + 审计） |
| PUT | /:id/approve | secretary/vice/minister/viceMinister | 审核通过 |
| PUT | /:id/return | secretary/vice/minister/viceMinister | 打回（带原因） |
| PUT | /:id/resubmit | branchSecretary | 重新提交（删除旧文件） |
| DELETE | /:id | secretary/viceSecretary | 删除已打回记录 |

### 4.6 汇总文件 `/api/summary`
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | / | 已登录 | 汇总列表 |
| POST | / | minister/viceMinister | 上传汇总 |
| GET | /:id/download | 已登录 | 下载 |

### 4.7 通知 `/api/notifications`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 当前用户通知 + 未读数 |
| PUT | /:id/read | 标记已读 |

## 5. 前端模块

`frontend/index.html` 单文件应用，约 2700 行，包含：

- **登录页**：用户名/密码登录
- **任务管理**：卡片式任务列表、创建/编辑模态框、任务详情、完成度网格统计
- **文件提交与审核**：拖拽上传、待审列表、审核/打回/重新提交流程
- **部门管理**：部门 CRUD、颜色标识
- **用户与权限**：用户 CRUD、角色/部门调整
- **通知中心**：未读提醒、标记已读
- **年份切换**：跨年度任务查看
- **去年任务文件回看**

视觉设计：CSS 变量主题色、卡片阴影、模态框、Toast 提示。

## 6. 部署与运维

### 6.1 服务端部署（`deploy/deploy.sh`）
1. 检查 `.env`，不存在则从 `.env.example` 复制并退出提示修改
2. `npm install --omit=dev`
3. `npm run init-db` 初始化数据库
4. 创建 `uploads/` `logs/` 目录
5. `pm2 start ecosystem.config.js --env production`（必须带 `--env production`）
6. `pm2 save` 持久化进程列表

### 6.2 环境变量（`.env`）
| 变量 | 说明 |
|---|---|
| NODE_ENV | production 必须设为 production |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | 数据库连接 |
| PORT | 后端监听端口（默认 3000） |
| JWT_SECRET | JWT 签名密钥（生产必须修改，≥32 字节） |
| CORS_ORIGIN | 跨域来源 |
| MAX_FILE_SIZE | 上传大小上限（字节，默认 10MB） |

### 6.3 Nginx（`deploy/nginx.conf`）
- HTTPS（TLS 1.2/1.3）
- `/api/` 反代 `127.0.0.1:3000`
- `/uploads/` `deny all`（防直链，仅通过 API 下载）
- `client_max_body_size 10m`
- SPA 回退 `try_files $uri $uri/ /index.html`

### 6.4 便携版（`tools/launcher/`）
- C# 启动器自动启动内嵌 MySQL + Node 服务
- 默认数据目录 `C:\ProgramData\YouthLeagueOfficePortable\mysql-data`
- 一键打包脚本 `build-portable.ps1`

## 7. 安全与边界

- **密码**：bcrypt 哈希存储，默认口令 `123456` 仅用于首次部署，必须修改
- **JWT**：httpOnly + sameSite=lax Cookie，24h 过期；`token_version` 主动失效（登出、改密、改角色、改部门、编辑用户时递增）
- **密码强度**：修改密码与创建用户时校验，至少 6 位且同时包含字母和数字
- **文件上传**：扩展名白名单（doc/docx/pdf/xls/xlsx/ppt/pptx/txt/csv/jpg/png/gif/zip/rar），10MB 上限，UUID 重命名落盘
- **限流**：登录接口 `express-rate-limit`
- **审计**：关键操作写入 audit_logs（创建/删除/审核/下载等）
- **运行时数据清理**：`clearRuntimeData.js` 需输入 `yes` 二次确认，production 环境需 `--force`

## 8. 已知限制与后续改进方向

- 任务指派 `assigned_to TEXT` 字段保留用于前端回显，新增 `task_assignees` 中间表用于查询（已完成）
- 列表接口已支持分页（`?page=&pageSize=`），前端默认请求 `pageSize=200` 保持全量加载模式
- 关键多步操作已用 `withTransaction` 包裹（tasks 创建/更新、files 提交/审核/打回/重新提交）
- 前端已拆分为 `index.html` + `styles.css` + `app.js` 三文件，a11y 已增强（模态框 role/aria、label for、div→button 转换、Toast aria-live）
- Multer 上传配置已抽取为 `utils/upload.js` 公共模块
- `departments.member_id` 死字段已移除（老库 DROP COLUMN 兼容）
- 无 CSRF token 双提交（内网场景可接受）
- `SPEC.md` 此前版本描述的"党建/团建模块切换 + LocalStorage 单文件原型"已废弃，本文档为当前实现的真实规格
