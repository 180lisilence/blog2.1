# 架构说明

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                   浏览器端                        │
│  index.html(登录) / projects.html(项目中心)       │
│  mobile-confirm.html(手机确认) / chatrecord-*    │
└────────────────────┬────────────────────────────┘
                     │ HTTP / WebSocket(轮询)
┌────────────────────▼────────────────────────────┐
│              Express 服务 (server.js)             │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  auth    │  │ projects │  │  chatrecord   │  │
│  │  模块    │  │  模块    │  │    模块       │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       │             │               │           │
│  ┌────▼─────────────▼───────────────▼────────┐  │
│  │              core 核心层                    │  │
│  │  logger / errors / security                │  │
│  └────┬───────────────────────────────────────┘  │
│       │                                          │
│  ┌────▼─────────┐  ┌─────────────────────────┐  │
│  │  db 数据层   │  │  middleware 中间件层      │  │
│  │  pool/init   │  │  auth (Cookie/守卫)      │  │
│  └────┬─────────┘  └─────────────────────────┘  │
└───────┼──────────────────────────────────────────┘
        │
┌───────▼─────────┐     ┌──────────────────┐
│   MySQL 8.0     │     │  RapidOCR (Python)│
│  users/user_data│     │  127.0.0.1:8765   │
└─────────────────┘     └──────────────────┘
```

## 分层设计

### 1. config 层（配置）
- `config/index.js`：集中管理所有配置，从环境变量读取，带默认值
- 所有模块通过 `require("../config")` 获取配置，不直接读 `process.env`

### 2. core 层（核心工具）
- `logger.js`：分级日志，格式 `[时间] [级别] [模块] 消息`
- `errors.js`：`AppError` 业务错误类 + `asyncHandler` 自动捕获 + 全局错误中间件 + `ok/fail` 统一响应
- `security.js`：输入验证、路径穿越防护、XSS 转义、`safeGet` 空指针安全访问

### 3. db 层（数据访问）
- `pool.js`：MySQL 连接池
- `init.js`：启动时自动建库建表、从旧 `users.json` 迁移数据、创建内置管理员

### 4. middleware 层（中间件）
- `auth.js`：Cookie 解析、Token 提取、`createAuthGate` 认证守卫、`createAuthParser` 轻量解析

### 5. modules 层（业务模块）
每个业务模块包含三个文件：
- `model.js` / `service.js`：业务逻辑（不依赖 req/res）
- `session.js` / `ocr.js` / `validator.js`：模块内专用工具
- `routes.js`：路由定义（薄，只做参数提取和响应，业务逻辑调用 service）

## 模块职责

### auth 模块
- **用户管理**：MySQL 持久化 + 内存缓存双写，密码 scrypt 加盐
- **会话管理**：二维码登录会话（pending → scanned → confirmed）+ Web 登录态（7天）
- **路由**：`/api/qrcode/*`（生成/检查/扫码/确认）、`/api/login`、`/api/register`、`/api/logout`、`/api/me`、`/api/data/*`

### projects 模块
- **内置项目**：8 个硬编码项目（不可删除）
- **导入项目**：`projects.json` 持久化，支持扫描/导入/删除
- **规范验证**：`project.json` 必须包含 `name` 和 `entry`，入口文件必须存在
- **路由**：`/api/projects`（列表/扫描/导入/删除）

### chatrecord 模块
- **会话存储**：文件系统 `data/chatrecord/{username}/`，index.json 索引 + {id}.json 详情
- **分享**：内存 Map 存储 shareId → {username, sessionId}，公开访问无需登录
- **OCR**：代理到本地 RapidOCR（127.0.0.1:8765），不可用时返回 503 提示前端回退 Tesseract.js
- **路由**：`/api/chatrecord/sessions/*`、`/api/chatrecord/share/*`、`/api/chatrecord/ocr/*`

## 认证流程

### 账号密码登录
```
客户端 POST /api/login {username, password}
  → auth/routes.js 验证参数
  → auth/model.js verifyPassword (scrypt 比对)
  → auth/session.js createWebSession (生成 token, 存入 Map)
  → 返回 {webToken, username}
客户端存储 Cookie: web_token={token}
后续请求 → middleware/auth.js 解析 Cookie → 校验 token 有效性 → req.username
```

### 二维码登录
```
PC端 GET /api/qrcode/generate
  → 创建 loginSession (status=pending, qid=QR-xxx)
  → 生成二维码内容: {baseURL}/mobile-confirm.html?qid={qid}
  → 返回 qrBase64

PC端轮询 GET /api/qrcode/check?qid={qid}
  → 返回 status (pending/scanned/confirmed)

手机端扫码 → mobile-confirm.html?qid={qid}
  → GET /api/qrcode/scanned?qid={qid} (标记已扫码)
  → 用户输入账号密码 → POST /api/qrcode/confirm {qid, username, password}
  → 验证密码 → 创建 webSession → status=confirmed

PC端轮询发现 confirmed → 拿到 webToken → 写入 Cookie → 自动进入
```

## 错误处理规范

1. **业务错误**：抛出 `AppError(statusCode, message, details)`，全局中间件统一捕获
2. **异步路由**：用 `asyncHandler(fn)` 包装，自动 catch 并 next(err)
3. **同步路由**：try/catch 或直接 throw AppError
4. **未知错误**：全局 `errorHandler` 记录 ERROR 日志，返回 500，不泄露堆栈
5. **统一响应**：成功 `{ok:true, ...data}`，失败 `{ok:false, msg, details?}`

## 日志规范

- 格式：`[YYYY-MM-DD HH:mm:ss] [LEVEL] [module] message`
- 级别：DEBUG（开发调试）< INFO（正常流程）< WARN（可恢复异常）< ERROR（未捕获错误）
- 通过 `LOG_LEVEL` 环境变量控制输出级别
- 所有模块通过 `logger.info("模块名", "消息")` 输出，不直接用 console.log

## 启动流程

```
server.js start()
  1. initDatabase(pool)
     - ensureDatabase (CREATE DATABASE IF NOT EXISTS)
     - ensureTables (CREATE TABLE IF NOT EXISTS)
     - migrateFromJson (从旧 users.json 迁移)
     - ensureBuiltinAdmin (创建内置管理员)
  2. authModel.loadAll() (加载用户到内存)
  3. authSession.startCleanup() (每5分钟清理过期会话)
  4. app.listen(PORT)
```
