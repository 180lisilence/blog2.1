# 🌍 个人博客 & 作品集（登录门禁版）

> **项目状态**：🚧 开发中 / 个人使用（已部署 https://lizyi.asia）
> **当前版本**：2.2.6（2026-11-11，第四次测试缺陷修复与会话治理）｜完整版本历史见文末
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

### 内置管理员

- 账号：`admin`
- 密码：`123456`

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


## 🔖 2.1 版本说明

在 2.0 基础上新增 **woldvein 游戏 AI 项目**：

- 📝 新增文章《woldvein 项目全景复盘：从启动器到游戏 AI》（blog/posts/woldvein-project.html）
- 🎮 新增项目页 log/projects/woldvein/（含 project.json、入口页 index.html、全景复盘 review.html）
- 🏠 博客首页文章区与项目区同步更新
- 📊 复盘内容覆盖 v2.0 启动器 / v3.0 产品家族 / 崩溃危机 / v3.5·v3.6 修复 / v4.0 AI Agent / 第七项目存档修复

## 🔖 2.2 版本说明

新增 **外链作品墙（友链）**：10 个独立仓库托管的作品以卡片形式挂进项目中心与博客首页，不增加仓库体积，也不改动原有 10 个内置项目。

- 🔗 新增数据源 `qrcode-login/links.json`（10 条：skilll-collection / critical-game / my-world-monitor-tool / 3D-model-construction / rea-tool-myself / personal-information-anliaysis / qi-mao-book-export-verison / card-unlock-master / gamehub / yunlu-room）
- 🌐 新增接口 `GET /api/links`（需登录），域名白名单只认 `github.com/180lisilence/*` 与 `*.github.io`，防止 `javascript:` 注入
- 🗂️ 项目中心新增「外部作品 · 友链」分区，卡片带 ↗ 角标：8 个有 Pages 的走「在线体验」，2 个无 Pages 的只走「前往 GitHub」
- 🏠 博客首页新增同源区块（`/api/links` 驱动），接口异常时整块隐藏，不影响主页面
- 📦 版本号 2.0.0 → 2.2.0；`/api/projects` 与 `BUILTIN_PROJECTS` 零改动
- 🧩 `mirror` 字段预留：blog2.3 填入本地镜像路径后前端自动优先本地，渲染代码无需改动

## 🔖 版本历史

> 2.2 之后走 **2.2.x 补丁线**：安全加固不占用 2.3 功能版本（2.3 计划整搬 gamehub、3D-model-construction 进 `blog/projects/`）。

| 版本 | 日期 | 提交 | 摘要 |
| --- | --- | --- | --- |
| 2.1.0 | 2026-09-08 | `cbff3b6` | 免密一键直登、浏览器内 PPT 播放器、woldvein 项目页 |
| 2.1.1 | 2026-09-08 | `788d182` | zonglan 项目总览 |
| 2.2.0 | 2026-11-10 | `bc97300` | 外链作品墙：10 条友链 + `GET /api/links`，版本号 2.0.0 → 2.2.0 |
| 2.2.0+ | 2026-11-10 | `6cce922` `2339a76` `c6884fe` `a46768f` `f3554ab` `16a1d2a` | 生产部署、全站 HTTPS、免密入口 IP 白名单、注册移除 IP 限制、每篇文章评论、CSRF 双修复 |
| **2.2.1** | 2026-11-10 | `7e5e3e3` | 第一次三轮渗透修复：F-01~F-11 / N-01~N-14 共 24 项 |
| **2.2.2** | 2026-11-10 | `bd87837` | 第二次修复：W2/W3 系列残留、服务端 AI 代理、数据接口与缓存/CSP 收紧 |
| **2.2.3** | 2026-11-11 | `e12c693` | 第三次修复：注册验证码与限速、移除 `?token=` 通道、登录喷洒防护、scrypt 异步化、前端全量转义 |
| **2.2.4** | 2026-11-11 | `ffdad35` | 工作台 AI 设置新增「模型扫描」：接口地址/密钥 + 扫描按钮、去重合并模型列表、五类失败提示；模型供应商由 6 家扩充到 22 家 |
| **2.2.5** | 2026-11-11 | `f6bc4f6` | presence 三端联动：后台下线弹窗、用户上线提示、提示开关与用户端同步；登录页新增文章 / 项目预览，删除失效的 guest 入口 |
| **2.2.6** | 2026-11-11 | `151a582` | 第四次测试修复：扫码 confirm 身份伪造、畸形输入 500、同账号并发互踢、会话 Cookie HttpOnly/Secure 与 CSRF 轮换、direct-login fail-closed、/health 最小化、缓存语义 |

### 2.2.6 — 第四次测试缺陷修复与会话治理（2026-11-11）

- **P0 扫码身份伪造（BUG-02 / 4-5-01）**：`/api/qrcode/confirm` 的 `verifyPassword` 漏 `await`，Promise 恒真导致任意密码可确认任意账号；补齐 `await`、严格字符串断言，subject 只取库中校验通过的规范用户名，改走 `sessionPolicy.issue()`；redeem 阶段同步下发 PC 端登录 Cookie。
- **P0 畸形输入 500（BUG-01）**：`parseCookies()` 的 `decodeURIComponent` 增加 `safeDecode` 兜底；全局错误处理器把 `entity.parse.failed` / `URIError` / 4xx 正确映射为 4xx，畸形 JSON 返回 400。
- **P0 同账号并发登录（VULN-CONCURRENT-01）**：`webSessions` 升级为带 `id/ip/ua/device/status/revokeReason` 的注册表；新增 `SESSION_POLICY=single|limit|off`（默认 `single`）、`401 KICKED`、顶层 `session-kicked.js` 自动跳转、presence 顶号强制弹窗；新增 `/api/sessions`、`/api/sessions/revoke`、`/api/sessions/revoke-others`、`/api/sessions/audit`；修复页面守卫与在线人数误计 `revoked` 会话。
- **P1/P2 会话 Cookie 与 CSRF（R4-02 / R4-03）**：`web_token` 改由服务端 `Set-Cookie` 下发 `HttpOnly; Secure; SameSite=Lax`，前端不再用 JS 写；登录成功轮换 `csrf_token`；新增非敏感体验标记 `web_auth`；logout / KICKED / presence 过期均主动清 HttpOnly Cookie；响应体保留 `webToken` 兼容 Bearer 与探针。
- **P1 其它**：`/api/direct-login` 默认 fail-closed（空白名单拒绝，仅显式 `DIRECT_LOGIN_IPS_ALLOW_EMPTY=true` 放行）；匿名 `/health` 只回 `status/timestamp`，详细检查移到 `x-sentinel-key` 保护的 `/health/detail`；全局 API / 页面默认 `private, no-store` + `Vary: Cookie`；登录 / 注册 / 改密补齐严格类型断言。
- **报告误判核实**：RISK-01/04 AI 同源代理已在位、`ALLOWED_HOSTS` 可变引用与 `__aiKeyMem` 已移除；RISK-05 总配额 2MB / 500 键已实现；RISK-06 `boot.js showFatalError` 已改 `textContent`；`validateApiKey` 已收紧。
- **验证**：本地语法全通过、单测 63/63、本地黑盒 37/37；生产 15 文件 md5 一致、Node 18 语法 12/12、`server.js` 以生产版本精确插 5 块；公网黑盒 43/43、服务器内直连 `direct-login` 非白名单 IP 403/403 且 loopback 200；`:3100` 审计后台在线。
- **清理**：生产 2 个 `r4pub_*`、本地 4 个 `r4fix_*` 临时账号已删除，生产用户数回到 8。

### 2.2.1 — 三轮渗透报告全量修复（2026-11-10）

- 认证与会话：CSRF HMAC 签章、扫码归属绑定 Cookie `qrt`、一次性 `ticket` 换取登录态、`logout` 只认当前请求凭据、登录限速改为「正确密码优先放行」。
- 接口与数据：`/api/data/all` 全量替换语义 + 2MB / 500 键 / 256KB 配额、键名白名单、按需读取 `?key=` / `?keys=`。
- 边界与响应头：路径遍历拦截、匿名 `/blog/*` 页面 302、私有静态资源 `private, no-store` + `Vary: Cookie`、CORS 默认不下发任何跨源头。
- 线上实测 69/69 通过。

### 2.2.2 — 残留项与 AI 链路修复（2026-11-10）

- 新增服务端 AI 代理 `/api/ai/chat`：硬编码 6 个官方端点，前端不再决定目标域名，Key 不落库不写日志，CSP `connect-src 'self'` 保持不变。
- 前端 AI Key 收进 `Store.AIKey` 闭包，移除 `window.__aiKeyMem` 与可变 `ALLOWED_HOSTS`，统一 `Config.aiReady()` 判据。
- `PUT` 缺 `data` 显式 400（不再静默清空全库）、PATCH 存量值反序列化、`removed` 计数改用 `affectedRows`、匿名写请求先 401 再谈 CSRF。
- echarts 本地化 + SRI、CSP 外部脚本白名单收紧为空、nginx `gzip_vary off`。
- 线上专项 56/56 通过。

### 2.2.3 — 注册 / 登录面与前端加固（2026-11-11）

- 移除 `?token=` URL 查询参数认证通道，只认 Cookie `web_token` / `Authorization: Bearer`；webToken 改为 256 位不透明随机值，去掉 `SELF-LOGIN-` 前缀。
- 注册新增服务端 HMAC 算术验证码（SVG 下发、答案不下发、一次性）+ 按 IP 限速 5 次/10 分钟；密码策略升为 8-64 位且需含字母数字。
- 登录新增纯 IP 跨账号限速挡密码喷洒；失败与 429 统一固定文案，不再回显剩余次数 / 锁定秒数。
- `scryptSync` → 异步 `crypto.scrypt`（哈希完全兼容，老账号无需改密）、密码比较改 `timingSafeEqual`；`TRUST_PROXY=false` 不再导致启动崩溃。
- 原型污染黑名单 + 无原型对象、项目 `entry` 禁止 `..` 逃逸、导入错误不泄露目录、评论内容类型校验、OCR health 需登录。
- 评论 ID / 项目卡 / 扫描列表 / 外链全部转义，新增 `safeHref` 挡 `javascript:` 协议。
- 验证：本地端到端 29/29、既有测试 57/57、线上专项 27/27、公网 HTTPS 与审计后台复验通过。

### 2.2.4 — 工作台 AI 模型扫描与供应商扩充（2026-11-11）

- 设置页「🤖 AI 对话配置」保持原有布局与保存/测试流程不变，新增「模型服务接口地址」「接口密钥」输入项和「扫描模型」按钮。
- 扫描走同源服务端代理 `POST /api/ai/models`：地址必须 https、默认端口、非 IP/本地主机且命中官方域名白名单；密钥只进 header，不落日志、不落库；CSP 仍为 `connect-src 'self'`。
- 结果按模型 ID 去重后**追加**到现有 `datalist`，内置模型永远优先且不被覆盖或删除；同时渲染可点击的模型 chip，点一下即填入模型输入框。扫描结果随 `config.ai.scannedModels` 持久化，刷新页面仍在。
- 扫描期间按钮进入「⏳ 扫描中…」禁用态；输入为空 / 接口地址格式错误 / 密钥无效 / 接口请求失败 / 扫描结果为空各有独立图标、颜色与文案；任何失败都不重建模型列表、不清空输入、不改写已保存配置。
- 模型供应商从 6 家扩充到 22 家（保留原有全部选项，新增 Anthropic、Gemini、硅基流动、百度千帆、腾讯混元、讯飞星火、MiniMax、阶跃星辰、零一万物、百川、Mistral、Groq、xAI、Together AI、OpenRouter、Cohere）；服务端 chat 代理同步支持 OpenAI / Anthropic / Gemini 三种协议，新供应商选中即可对话。
- 验证：本地综合 94/94、既有测试 57/57、生产端到端 18/18。

### 2.2.5 — presence 三端联动与登录页内容预览（2026-11-11）

- **主站 presence 权威服务**：新增 `qrcode-login/modules/presence/index.js`，统一保存提示开关（`data/presence-settings.json`）与被强制下线的 token 标记；`GET /api/presence/state` 公开返回 `off` / `anonymous` / `online` / `kicked` / `expired` 五态，`GET|POST /api/presence/settings` 由 `x-sentinel-key` 保护，供后台读写开关。
- **用户端下线弹窗**：`presence-client.js` 由 `blogStatic` 自动注入所有 `/blog/*` HTML（零依赖、严格 CSP、CSSOM 造样式、token 只走 Cookie）；`kicked` 时弹「你已被管理员强制下线，请重新登录」，后台关掉「下线弹窗」开关则静默清理 Cookie 回登录页。账号管理的 `rename` / `reset-password` / `kick` / `delete` 在销毁会话前调用 `presence.markKicked(token, username, reason)`，用户端下一轮询周期即感知。
- **后台上线 / 下线提示**：`sentinel-adapter.js` 在 `createWebSession()` 成功时写 `member_online` 事件（`/api/audit/live` 只读 `events`，原登录事件只进 `logins` 不会触发提示）；看板据此弹「用户 xxx 已上线」，`member_admin(kick)` 弹下线通知。新增「上线 / 下线提示」面板可配总开关、上线提示、下线提示、下线文案与轮询间隔，保存后同步推进 live 游标避免事件时序错位；登录表单成功也显式启动 presence 轮询。
- **登录页内容预览**：新增 `GET /api/public/preview`，解析 `blog/index.html` 的文章 / 项目卡片，脱敏 + 限长 + 站内链接白名单 + 5 分钟 mtime 缓存；登录页最多渲染 3 篇文章 + 3 个项目卡片与登录 CTA。同时删除失效的 `guestEnter()` / `web_guest` 入口（写 Cookie 但后端 token 通道不认，302 静默回环，用户感知「点击无响应」）。
- **缓存版本补修**：看板 `index.html` 四个静态引用统一升 `?v=7`（`style.css` 本轮新增 presence 样式但曾漏升版本），两个历史验证脚本的 `?v=4` 硬编码断言改为通用正则。
- **验证**：本地 sentinel 冒烟 75/75、主站 presence HTTP E2E 19/19、用户端弹窗浏览器 17/17、后台开关浏览器 19/19；生产逐文件 md5 一致、公网三端联动 13/13、后台上线 toast 5/5；补部署后公网 `?v=7` 四个资源均 200 且新 CSS / JS 内容命中，缓存头 `no-store`。

### 运维记录（不计入版本号）

- 2026-11-10/11：独立部署 `blog-sentinel` 访问审计后台（未纳入本仓库），含态势地图与「注册 / 在线」视图。
- 2026-11-11：清理线上 85 个渗透测试账号，仅保留 7 个；`user_data` 由 19.95MB 降至 29,759 字节，删除前全量备份留在服务器 `/root/`。
- 2026-11-11：`main` 同步推送至 GitHub 与 Gitee 双平台。
- 2026-11-11（运维侧安全整改，未纳入代码仓库）：nginx 两个 vhost 的 HSTS 补全为 `max-age=31536000; includeSubDomains; preload`；修复 `blog-sentinel` vhost 因 `location /` 内 `add_header` 屏蔽继承导致 3100 端口实际缺失 HSTS 的问题（在该 location 内重新声明）。明文 HTTP 80 跳转块仍不下发 HSTS。
- 2026-11-11（运维侧安全整改）：`blog-sentinel` 公开 `/health` 移除 `counts`（访问/登录/事件数不再匿名可读），只保留 `ok/status/ts`；详细计数移到需后台登录的 `GET /api/audit/health`，看板「系统·接入」三项数值不退化；静态资源版本升 `?v=5`。主站 `/health` 未改动。
- 2026-11-11：presence 三端联动生产逐文件部署，备份 `/root/blog2.1-presence-deploy-backup-20261110T194649`（11 文件 244K）；生产 `server.js` 以生产版本为基底精确插块（md5 `8dcf8dd3b3ac5fb739db74c2a24f4c2f`），从未用本地版本整体覆盖。收尾核对发现看板 CSS 漏升版本号，补升 `?v=7` 并单独部署 3 个文件（备份同目录 `static-v7/`）。
- 2026-11-11：第四次测试修复生产部署，备份 `/root/blog2.1-r4fix-backup-20261111T124721`；15 个文件逐文件 md5 一致，`server.js` 仅精确插 5 个修复块（保留 `SENTINEL_BASE_URL=3101` 等生产差异），公网黑盒 43/43、生产用户数回到 8。修复报告见 `E:/workaddress/cs/fourth/第四次测试修复报告_lizyi.asia_博客.md`。
