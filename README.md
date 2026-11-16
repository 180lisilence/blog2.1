# 🌍 云客 · 个人博客 & 工作台

> 已部署：https://lizyi.asia
> 当前版本：**云客 1.0**（2026-11-12）

一个集成了个人博客、作品集、AI 对话工作台的全栈 Web 应用，支持扫码登录和账号密码双模式。

## ✨ 功能

- **个人博客**：文章发布、评论系统、公开访问
- **作品集**：10+ 内置项目 + 友链外链作品墙
- **云客工作台**：AI 对话（支持 22+ 模型供应商）、项目管理、设置中心
- **登录系统**：扫码登录 + 账号密码、会话管理、多端互踢
- **安全加固**：四轮渗透测试修复、CSP、CSRF、限速、HttpOnly Cookie

## 🛠️ 技术栈

- **后端**：Node.js + Express + MySQL
- **前端**：原生 HTML/CSS/JS，无框架
- **部署**：Docker + Nginx + PM2
- **桌面端**：Electron 打包 EXE
- **移动端**：Capacitor 打包 APK

## 🚀 快速开始

### 方式一：Docker 一键启动（推荐）

```bash
# Linux / macOS
chmod +x docker-start.sh
./docker-start.sh

# Windows
docker-start.bat
```

或者手动执行：

```bash
# 1. 复制环境变量模板
cp qrcode-login/.env.example qrcode-login/.env
# 编辑 .env，修改数据库密码和管理员密码

# 2. 启动
docker-compose up -d --build
```

访问 http://localhost:3000 即可。

### 方式二：本地开发

```bash
# 安装依赖
npm install

# 复制配置
cp qrcode-login/.env.example qrcode-login/.env

# 启动
node qrcode-login/server.js
```

## 📄 文档

- [详细使用说明](./docs/README-DETAILED.md)
- [更新日志](./CHANGELOG.md)
- [许可证](./LICENSE)

## 📝 License

[MIT](./LICENSE)
