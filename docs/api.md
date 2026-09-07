# API 文档

基础路径：`http://127.0.0.1:3000`

所有响应统一格式：
- 成功：`{ "ok": true, ...数据 }`
- 失败：`{ "ok": false, "msg": "错误信息", "details"?：[...] }`

认证方式：请求头 `Cookie: web_token={token}` 或 `Authorization: Bearer {token}` 或 `?token={token}`

---

## 1. 认证模块 `/api`

### 1.1 生成二维码
- **GET** `/api/qrcode/generate`
- **无需登录**
- **响应**：
```json
{
  "ok": true,
  "qid": "QR-xxxx-xxxx",
  "qrBase64": "data:image/png;base64,...",
  "expireSeconds": 120
}
```

### 1.2 检查二维码状态（PC 轮询）
- **GET** `/api/qrcode/check?qid={qid}`
- **无需登录**
- **响应**：
```json
{ "status": "pending" }          // 等待扫码
{ "status": "scanned" }          // 已扫码，等待确认
{ "status": "confirmed", "webToken": "SELF-LOGIN-xxx", "username": "admin" }  // 确认成功
{ "status": "expired" }          // 已过期
```

### 1.3 标记已扫码（手机端）
- **GET** `/api/qrcode/scanned?qid={qid}`
- **无需登录**
- **响应**：`{ "ok": true, "status": "scanned" }`

### 1.4 手机端确认登录
- **POST** `/api/qrcode/confirm`
- **无需登录**
- **请求体**：
```json
{ "qid": "QR-xxxx", "username": "admin", "password": "123456" }
```
- **响应**：`{ "ok": true, "webToken": "SELF-LOGIN-xxx", "username": "admin" }`
- **错误**：400 会话失效 / 账号或密码错误

### 1.5 账号密码登录
- **POST** `/api/login`
- **无需登录**
- **请求体**：`{ "username": "admin", "password": "123456" }`
- **响应**：`{ "ok": true, "webToken": "SELF-LOGIN-xxx", "username": "admin" }`
- **错误**：400 账号或密码错误

### 1.6 注册
- **POST** `/api/register`
- **无需登录**
- **请求体**：`{ "username": "newuser", "password": "password123" }`
- **用户名规则**：2-20 位字母、数字、中文或 `@._-`
- **密码规则**：6-32 位
- **响应**：`{ "ok": true, "msg": "注册成功，请返回使用该账号登录" }`
- **错误**：400 参数不合法 / 409 账号已存在

### 1.7 登出
- **POST** `/api/logout`
- **需登录**
- **响应**：`{ "ok": true, "msg": "已退出登录" }`

### 1.8 查询当前登录态
- **GET** `/api/me`
- **需登录**
- **响应**：`{ "ok": true, "username": "admin" }`
- **错误**：401 未登录

### 1.8.1 修改密码
- **POST** `/api/change-password`
- **需登录**
- **请求体**：`{ "oldPassword": "旧密码", "newPassword": "新密码（6-32位）" }`
- **响应**：`{ "ok": true, "msg": "密码修改成功，请重新登录" }`
- **说明**：密码修改后当前 token 失效，需重新登录
- **错误**：400 旧密码错误 / 新密码不合法；401 未登录

### 1.9 获取用户全部业务数据
- **GET** `/api/data/all`
- **需登录**
- **响应**：`{ "ok": true, "data": { "key1": "value1", ... } }`

### 1.10 保存用户全部业务数据
- **PUT** `/api/data/all`
- **需登录**
- **请求体**：`{ "data": { "key1": "value1" } }`
- **响应**：`{ "ok": true, "msg": "保存成功" }`

---

## 2. 项目中心模块 `/api/projects`

所有接口需登录。

### 2.1 项目列表
- **GET** `/api/projects`
- **响应**：
```json
{
  "ok": true,
  "projects": [
    {
      "id": "builtin-workbench",
      "name": "个人工作台",
      "desc": "...",
      "url": "/blog/workbench/index.html",
      "icon": "🛠️",
      "color": "c1",
      "builtin": true
    },
    {
      "id": "imported-1234567890",
      "folder": "my-project",
      "name": "我的项目",
      "url": "/blog/projects/my-project/index.html",
      "icon": "📁",
      "color": "c1",
      "builtin": false,
      "importedAt": 1234567890000
    }
  ]
}
```

### 2.2 扫描可导入项目
- **GET** `/api/projects/scan`
- **响应**：
```json
{
  "ok": true,
  "available": [
    {
      "folder": "my-project",
      "name": "我的项目",
      "icon": "📁",
      "valid": true
    },
    {
      "folder": "bad-project",
      "name": "bad-project",
      "icon": "📁",
      "valid": false,
      "errors": ["缺少必填字段 name", "入口文件不存在: index.html"]
    }
  ]
}
```

### 2.3 导入项目
- **POST** `/api/projects/import`
- **请求体**：`{ "folder": "my-project" }`
- **响应**：`{ "ok": true, "project": {...}, "msg": "导入成功: 我的项目" }`
- **错误**：400 文件夹不存在 / 规范验证失败；409 已导入

### 2.4 删除导入项目
- **DELETE** `/api/projects/:id`
- **响应**：`{ "ok": true, "msg": "已删除: 我的项目" }`
- **错误**：400 内置项目不可删除；404 项目不存在

---

## 3. ChatRecord 模块 `/api/chatrecord`

### 3.1 会话列表
- **GET** `/api/chatrecord/sessions`
- **需登录**
- **响应**：
```json
{
  "ok": true,
  "sessions": [
    { "id": "uuid", "title": "会话标题", "messageCount": 100, "createdAt": 123, "updatedAt": 456 }
  ]
}
```

### 3.2 创建会话
- **POST** `/api/chatrecord/sessions`
- **需登录**
- **请求体**（可选）：`{ "title": "新会话", "messages": [], "metadata": {} }`
- **响应**：`{ "ok": true, "session": { "id": "uuid", ... } }`

### 3.3 获取会话
- **GET** `/api/chatrecord/sessions/:id`
- **需登录**
- **响应**：`{ "ok": true, "session": { "id": "uuid", "title": "...", "messages": [...], "metadata": {...} } }`
- **错误**：404 会话不存在

### 3.4 更新会话
- **PUT** `/api/chatrecord/sessions/:id`
- **需登录**
- **请求体**：`{ "title": "新标题", "messages": [...], "metadata": {...} }`（均可选）
- **响应**：`{ "ok": true, "session": {...} }`

### 3.5 删除会话
- **DELETE** `/api/chatrecord/sessions/:id`
- **需登录**
- **响应**：`{ "ok": true, "msg": "已删除" }`

### 3.6 导入消息
- **POST** `/api/chatrecord/sessions/:id/import`
- **需登录**
- **请求体**：`{ "messages": [...], "title": "可选新标题" }`
- **响应**：`{ "ok": true, "session": {...}, "msg": "导入成功，共 N 条消息" }`

### 3.7 创建分享
- **POST** `/api/chatrecord/sessions/:id/share`
- **需登录**
- **响应**：`{ "ok": true, "shareId": "abc123", "url": "/chatrecord-share.html?id=abc123" }`

### 3.8 取消分享
- **DELETE** `/api/chatrecord/sessions/:id/share`
- **需登录**
- **响应**：`{ "ok": true, "msg": "已取消分享" }`

### 3.9 公开分享数据
- **GET** `/api/chatrecord/share/:shareId`
- **无需登录**
- **响应**：`{ "ok": true, "session": {...}, "sharedBy": "username" }`
- **错误**：404 分享不存在或已过期

### 3.10 OCR 健康检查
- **GET** `/api/chatrecord/ocr/health`
- **无需登录**
- **响应**：
```json
{ "ok": true, "ocr": { "available": true, "engine": "RapidOCR", "version": "1.0" } }
{ "ok": true, "ocr": { "available": false } }
```

### 3.11 OCR 识别
- **POST** `/api/chatrecord/ocr`
- **需登录**
- **请求体**：`{ "image": "data:image/png;base64,..." }`
- **响应**（RapidOCR 格式，score 已转为 0-100）：
```json
{
  "ok": true,
  "width": 1920,
  "height": 1080,
  "items": [
    { "box": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], "text": "识别文字", "score": 95.5 }
  ]
}
```
- **错误**：503 OCR 服务不可用（前端应回退 Tesseract.js）

---

## 错误码汇总

| 状态码 | 含义 | 常见场景 |
|--------|------|---------|
| 400 | 请求参数错误 | 账号密码为空、文件夹不存在、规范验证失败 |
| 401 | 未登录 | 访问需登录的接口但无有效 token |
| 403 | 无权限 | （预留） |
| 404 | 资源不存在 | 会话不存在、项目不存在、分享不存在 |
| 409 | 冲突 | 账号已注册、项目已导入 |
| 500 | 服务器内部错误 | 未捕获异常、数据库写入失败 |
| 503 | 服务不可用 | OCR 服务未启动 |
