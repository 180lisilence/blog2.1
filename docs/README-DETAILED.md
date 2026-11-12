# 🌍 个人博客 & 作品集（登录门禁版）

> **项目状态**：🚧 开发中 / 个人使用（已部署 https://lizyi.asia   ）
> **当前版本**：2.2.8（2026-11-11，评论口径统一 / 删除权限收紧 / 顶号提示修复）｜完整版本历史见文末
> 本项目为个人博客与作品集系统，功能持续迭代中。已完成四轮渗透测试加固并持续在生产环境运行。

一个集成了多个网页项目和游戏的个人博客系统，前面加了**登录门禁**：支持扫码登录和账号密码登录双模式，登录后才能进入博客和使用全部项目。

## ✨ 特性

- 🔐 **双模式登录**：手机扫码登录 + 电脑端账号密码登录，无需手机也能登录
- 📝 **账号注册**：手机端可注册新账号，密码 scrypt 加盐存储
- 📂 **项目中心**：登录后统一入口，卡片式展示所有项目，支持导入自定义项目
- ➕ **项目导入**：符合 `project.json` 规范的项目文件夹可一键导入，像应用图标一样展示
- 📝 **博客首页**：文章列表 + 项目展示
- 💬 **ChatRecord 会话时序实验室**：聊天记录可视化分析，支持多会话管理、自动保存、分享链接、OCR 截图识别
- 🎮 **多个内置项目**：个人工作台、钢铁前线 FPS、极智云企业门户、我的世界服务器、餐厅管理系统、Earth Online
- 📱 **移动端适配**：手机浏览器可直接访问（同一局域网下）
- 🗄️ **MySQL 持久化**：用户数据、业务数据自动建库建表，支持从旧 users.json 迁移

## 🚀 快速开始

### 环境要求

- Node.js 16+
- MySQL 5.7+ / 8.0+（推荐，未配置时用户数据走内存缓存，重启后丢失）
- Python 3.8+（可选，用于 ChatRecord OCR 增强识别，未安装时自动回退浏览器端 Tesseract.js）

### 安装与启动

```bash
# 1. 进入后端目录
cd qrcode-login

# 2. 安装依赖
npm install

# 3. 配置环境变量（可选，有默认值）
cp .env.example .env
# 编辑 .env 修改 MySQL 密码、端口等

# 4. 启动服务
npm start
```

或直接双击根目录的 `打开博客.bat`（会自动启动服务并打开登录页）。

启动后访问：
- 登录页：http://127.0.0.1:3000/
- 局域网访问：http://<你的局域网IP>:3000/



首次启动时自动创建（可在 `.env` 中修改 `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`）。新用户可通过手机扫码页注册。

### 代码检查与格式化

```bash
# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix

# Prettier 格式化
npm run format
```

### 运行单元测试

```bash
# 运行全部测试（56个用例，不依赖外部框架）
npm test
```

测试覆盖：安全模块（24）、错误处理（13）、会话管理（10）、项目验证器（9）。

## 📖 开发者文档

- [架构说明](./docs/architecture.md) - 分层设计、模块职责、认证流程、错误处理规范
- [API 文档](./docs/api.md) - 全部接口说明、请求/响应格式、错误码汇总
- [数据库设计](./docs/database.md) - 表结构、初始化流程、数据迁移、备份建议

## ⚙️ 配置说明

所有配置通过环境变量管理，复制 `.env.example` 为 `.env` 即可修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `LOG_LEVEL` | `INFO` | 日志级别：DEBUG / INFO / WARN / ERROR |
| `MYSQL_HOST` | `127.0.0.1` | MySQL 主机 |
| `MYSQL_PORT` | `3306` | MySQL 端口 |
| `MYSQL_USER` | `root` | MySQL 用户 |
| `MYSQL_PASSWORD` | `123456` | MySQL 密码 |
| `MYSQL_DATABASE` | `myself_blog2` | 数据库名（自动创建） |
| `DEFAULT_ADMIN_USERNAME` | `admin` | 内置管理员账号 |
| `DEFAULT_ADMIN_PASSWORD` | `123456` | 内置管理员密码 |
| `QR_EXPIRE_MS` | `120000` | 二维码有效期（毫秒） |
| `WEB_TOKEN_EXPIRE_MS` | `604800000` | 登录态有效期（毫秒，默认7天） |
| `OCR_PORT` | `8765` | ChatRecord OCR 服务端口 |

## 📁 项目结构

```
myself-blog-beta/
├── index.html                  # 登录页（扫码 + 账号密码双模式）
├── mobile-confirm.html         # 手机扫码确认/注册页
├── projects.html               # 登录后的项目中心
├── chatrecord-share.html       # ChatRecord 公开分享页（无需登录）
├── architecture.html           # 架构说明页
├── settings.html               # ⚙️ 用户设置页（改密码）
├── 打开博客.bat                 # 一键启动脚本
├── Dockerfile                  # Docker 镜像构建
├── docker-compose.yml          # Docker Compose 编排（含 MySQL）
├── .dockerignore               # Docker 构建忽略
├── CONTRIBUTING.md             # 贡献指南
├── LICENSE                     # MIT 许可证
├── README.md
├── docs/                       # 📖 开发者文档
│   ├── architecture.md         # 架构说明（分层设计/模块职责/认证流程）
│   ├── api.md                  # API 文档（全部接口说明）
│   └── database.md             # 数据库设计（表结构/初始化/迁移）
├── tests/                      # 🧪 单元测试
│   ├── run.js                  # 测试运行器
│   ├── security.test.js        # 安全模块测试（24个用例）
│   ├── errors.test.js          # 错误处理测试（13个用例）
│   ├── auth-session.test.js    # 会话管理测试（10个用例）
│   └── validator.test.js       # 项目验证器测试（9个用例）
├── blog/                       # 博客内容（登录后才能访问）
│   ├── index.html              # 博客首页
│   ├── assets/                 # 博客静态资源
│   ├── posts/                  # 博客文章
│   ├── workbench/              # 个人工作台
│   └── projects/               # 作品集项目
│       ├── chatrecord/         # 💬 ChatRecord 会话时序实验室
│       ├── steel-frontline/    # 🎯 钢铁前线 · 狙击（FPS 游戏）
│       ├── jizhiyun-pro/       # ☁️ 极智云 · 企业门户
│       ├── shantou/            # ⛏️ 我们的山头（Minecraft 服务器）
│       ├── restaurant/          # 🍽️ 餐厅学生管理系统
│       └── earth-online/        # 🌍 Earth Online
└── qrcode-login/               # 登录门禁后端（模块化架构）
    ├── server.js               # 入口（150行，纯组装逻辑）
    ├── package.json
    ├── links.json              # 外链作品数据（2.2 新增）
    ├── .env.example            # 环境变量模板
    ├── .eslintrc.json          # ESLint 配置
    ├── .prettierrc             # Prettier 配置
    ├── config/
    │   └── index.js            # 集中配置管理
    ├── core/
    │   ├── logger.js           # 分级日志（DEBUG/INFO/WARN/ERROR）
    │   ├── errors.js           # AppError + asyncHandler + 全局错误中间件
    │   └── security.js         # 输入验证/路径穿越防护/XSS转义/空指针检查
    ├── db/
    │   ├── pool.js             # MySQL 连接池
    │   └── init.js             # 自动建库建表 + 数据迁移 + 内置管理员
    ├── middleware/
    │   └── auth.js             # Cookie 解析 + 认证守卫
    └── modules/
        ├── auth/               # 认证模块
        │   ├── model.js        # 用户模型（CRUD + 密码验证）
        │   ├── session.js      # 会话管理（二维码 + Web 登录态）
        │   └── routes.js       # 路由（登录/注册/二维码/登出/用户数据）
        ├── chatrecord/         # ChatRecord 模块
        │   ├── service.js      # 会话 CRUD 业务逻辑
        │   ├── ocr.js          # OCR 服务代理（RapidOCR + 回退）
        │   └── routes.js       # 路由（会话/分享/OCR）
        ├── projects/           # 项目中心模块
        │   ├── validator.js    # project.json 规范验证
        │   ├── service.js      # 项目列表/扫描/导入/删除
        │   └── routes.js       # 路由
        └── links/              # 友链模块（2.2 新增）
            ├── service.js      # links.json 读取 + URL 白名单校验
            └── routes.js       # GET /api/links
```

## 📦 项目导入规范

在项目中心点击「+」可导入自定义项目。被导入的项目文件夹需放在 `blog/projects/` 下，并包含 `project.json`：

```json
{
  "name": "项目名称（必填）",
  "entry": "index.html（必填，入口文件）",
  "version": "1.0.0",
  "description": "项目描述",
  "icon": "🎮",
  "color": "c1",
  "author": "作者",
  "tags": ["标签1", "标签2"]
}
```

- `color` 可选值：`c1` ~ `c6`
- `icon` 为单个 emoji 或字符
- 导入前会自动验证规范，不符合则拒绝导入并提示原因

## 💬 ChatRecord 会话时序实验室

把聊天记录变成可计算的数字表征。

### 功能

- 📥 **多种导入方式**：文本粘贴、JSON 数组、微信/QQ 截图 OCR 识别
- 📊 **8 种可视化图表**：时序波形、消息量分布、平均长度、日历热力图、发送者统计、复读指数、周×小时活跃度
- 💾 **多会话管理**：保存多个聊天记录会话，随时切换，自动保存（debounce 1.5s）
- 🔗 **分享链接**：生成只读分享链接，对方无需登录即可查看图表
- 🔍 **OCR 双引擎**：优先本地 RapidOCR（服务端自动拉起），未安装时回退浏览器端 Tesseract.js

### API

| 方法 | 路径 | 说明 | 登录 |
|---|---|---|---|
| GET | /api/chatrecord/sessions | 会话列表 | ✅ |
| POST | /api/chatrecord/sessions | 创建会话 | ✅ |
| GET | /api/chatrecord/sessions/:id | 获取会话 | ✅ |
| PUT | /api/chatrecord/sessions/:id | 更新会话（自动保存） | ✅ |
| DELETE | /api/chatrecord/sessions/:id | 删除会话 | ✅ |
| POST | /api/chatrecord/sessions/:id/import | 导入消息 | ✅ |
| POST | /api/chatrecord/sessions/:id/share | 生成分享链接 | ✅ |
| DELETE | /api/chatrecord/sessions/:id/share | 取消分享 | ✅ |
| GET | /api/chatrecord/share/:shareId | 公开分享数据 | ❌ |
| GET | /api/chatrecord/ocr/health | OCR 服务状态 | ✅ |
| POST | /api/chatrecord/ocr | OCR 识别（代理到 RapidOCR） | ✅ |

### OCR 增强识别

ChatRecord 的 OCR 截图识别优先使用本地 RapidOCR 服务（识别率远超 Tesseract.js）。blog 服务启动后会自动预启动 Python OCR 服务，无需手动运行。

如需手动安装 OCR 依赖：

```bash
pip install rapidocr_onnxruntime pillow numpy
```

## 🔐 登录门禁说明

- **双模式登录**：
  - 扫码登录：手机扫码 → 手机端注册/登录 → PC 端自动进入
  - 账号密码登录：在登录页二维码下方直接输入账号密码，无需手机
- 未登录访问任何受保护页面都会跳转到登录页
- 登录成功后写入登录 Cookie（7 天有效，可配置）
- 手机扫码 URL 自动使用局域网 IP（Wi-Fi 网卡优先），手机和电脑需在同一网络

## ⚙️ 用户设置

登录后在项目中心点击「⚙️ 设置」可进入设置页面：

- **修改密码**：输入旧密码和新密码（6-32位），修改后需重新登录
- **退出登录**：清除当前登录态

设置页路径：`/settings.html`（需登录）

## 🗄️ 数据库设计

服务启动时自动创建以下表（无需手动执行 SQL）：

### users 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| username | VARCHAR(255) PK | 用户名 |
| salt | VARCHAR(64) | 密码盐值 |
| hash | VARCHAR(128) | scrypt 密码哈希 |
| created_at | BIGINT | 创建时间戳 |
| is_builtin | TINYINT | 是否内置管理员 |

### user_data 用户业务数据表
| 字段 | 类型 | 说明 |
|------|------|------|
| username | VARCHAR(255) | 用户名（联合主键） |
| data_key | VARCHAR(100) | 数据键（联合主键） |
| data_value | JSON | 数据值 |
| updated_at | BIGINT | 更新时间戳 |

## 🛠️ 技术栈

- **前端**：纯 HTML / CSS / JavaScript，ECharts 图表，Tesseract.js 浏览器端 OCR
- **后端**：Node.js + Express（模块化架构，4 层 18 文件）
- **数据库**：MySQL 8.0（自动建库建表）+ 内存缓存
- **OCR**：RapidOCR（PaddleOCR ONNX 版，服务端） + Tesseract.js（浏览器端回退）
- **密码加密**：scrypt 加盐（Node.js 内置 crypto）
- **代码质量**：ESLint + Prettier
- **日志**：分级日志（DEBUG/INFO/WARN/ERROR），带时间戳和模块名
- **安全**：scrypt 密码加盐、HTTPS 强制（生产环境）、安全响应头（CSP/X-Frame-Options等）、请求频率限制、输入验证、路径穿越防护

## 📦 部署

### 传统部署

登录门禁依赖 Node 后端，需部署到可运行 Node 的平台（Render / Railway / 云服务器 / 宝塔 Node 项目），将整个项目上传即可。

- 纯静态托管（GitHub Pages 等）无法运行登录门禁
- MySQL 为推荐依赖，未配置时用户数据走内存缓存（重启后丢失），建议配置 MySQL 持久化
- 部署前复制 `.env.example` 为 `.env`，修改数据库密码和管理员账号

### Docker 部署（推荐）

```bash
# 1. 配置环境变量
cp qrcode-login/.env.example qrcode-login/.env
# 编辑 .env 修改密码等

# 2. 启动（自动构建镜像 + 启动 MySQL + 博客服务）
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止
docker-compose down
```

Docker Compose 会自动启动：
- **blog** 服务：Node.js + Express，端口 3000
- **mysql** 服务：MySQL 8.0，端口 3306，数据持久化到 Docker Volume
- **chatrecord-data** Volume：ChatRecord 会话数据持久化

## 🤝 贡献

本项目为个人项目，欢迎提交 Issue 和 PR。代码提交前请运行 `npm run lint` 确保通过检查。

## 📄 License

[MIT](./LICENSE)


## 📝 更新日志

完整版本历史详见 [CHANGELOG.md](./CHANGELOG.md)

当前最新版本：**云客 1.0**（2026-11-12）
