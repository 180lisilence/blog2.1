# 📝 更新日志

## 🔖 2.3 版本说明

博客公开化 + 根目录大整理：

- 🌐 博客全站公开访问，不需要登录就能看文章
- 🔒 工作台和后台保留登录门禁，私密内容不受影响
- 📊 新增 SEO 基础件：robots.txt / sitemap.xml / RSS Feed
- 🗂️ 新增文章归档页 / 标签聚合页
- 💬 文章底部新增反馈组件（有帮助/没帮助）
- 🧹 根目录从 40+ 文件精简到 16 个核心文件
- 📁 临时脚本移到 scripts/，文档移到 docs/
- 🐛 修复工作台误公开的安全漏洞
- 🐳 Docker 配置优化：HEALTHCHECK 改 /health，MySQL 端口不对外暴露

## 🔖 2.2 版本说明

在 2.0 基础上新增 **woldvein 游戏 AI 项目**：

- 📝 新增文章《woldvein 项目全景复盘：从启动器到游戏 AI》（blog/posts/woldvein-project.html）
- 🎮 新增项目页 blog/projects/woldvein/（含 project.json、入口页 index.html、全景复盘 review.html）
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
| 2.2.0+ | 2026-11-10 | - | 生产部署、全站 HTTPS、评论系统、CSRF 修复 |
| **2.2.x 安全加固线** | 2026-11-10~11 | - | 四轮渗透测试共修复 40+ 项漏洞：身份认证、注入防护、XSS/CSRF、Cookie 安全、限速防爆破 |
| **2.2.4** | 2026-11-11 | - | AI 模型扫描功能，支持 22+ 模型供应商 |
| **2.2.5~2.2.8** | 2026-11-11 | - | 多端在线状态联动、评论系统优化、多窗口登录同步 |
| **云客 1.0** | 2026-11-12 | - | 移动端适配 + SEO 基础件 + Docker 安全加固 |
| **云客 1.1** | 2026-11-13 | - | 博客全面公开，根路径跳转博客首页 |

### 运维记录

- 独立部署访问审计后台 `blog-sentinel`
- 四轮渗透测试后清理测试账号，数据库瘦身
- 双平台同步：GitHub + Gitee
- nginx 安全头加固、HSTS 配置、隐藏源站 IP
