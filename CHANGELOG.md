# 📝 更新日志

## 🔖 2.1 版本说明

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
| 2.2.0+ | 2026-11-10 | `6cce922` `2339a76` `c6884fe` `a46768f` `f3554ab` `16a1d2a` | 生产部署、全站 HTTPS、免密入口 IP 白名单、注册移除 IP 限制、每篇文章评论、CSRF 双修复 |
| **2.2.1** | 2026-11-10 | `7e5e3e3` | 第一次三轮渗透修复：F-01~F-11 / N-01~N-14 共 24 项 |
| **2.2.2** | 2026-11-10 | `bd87837` | 第二次修复：W2/W3 系列残留、服务端 AI 代理、数据接口与缓存/CSP 收紧 |
| **2.2.3** | 2026-11-11 | `e12c693` | 第三次修复：注册验证码与限速、移除 `?token=` 通道、登录喷洒防护、scrypt 异步化、前端全量转义 |
| **2.2.4** | 2026-11-11 | `ffdad35` | 工作台 AI 设置新增「模型扫描」：接口地址/密钥 + 扫描按钮、去重合并模型列表、五类失败提示；模型供应商由 6 家扩充到 22 家 |
| **2.2.5** | 2026-11-11 | `f6bc4f6` | presence 三端联动：后台下线弹窗、用户上线提示、提示开关与用户端同步；登录页新增文章 / 项目预览，删除失效的 guest 入口 |
| **2.2.6** | 2026-11-11 | `151a582` | 第四次测试修复：扫码 confirm 身份伪造、畸形输入 500、同账号并发互踢、会话 Cookie HttpOnly/Secure 与 CSRF 轮换、direct-login fail-closed、/health 最小化、缓存语义 |
| **2.2.7** | 2026-11-11 | `b41b03a` | 同浏览器多窗口下线感知：顶层页接入 presence 轮询、`localStorage` 登录纪元互斥解决共享 Cookie 导致的「两窗口同显已登录/后台只 1 设备」、被顶窗口弹窗且不误踢新窗口 |
| **2.2.8** | 2026-11-11 | `303ab50` | 评论计数与列表口径统一（删除后计数立即同步、回复不再随父评论消失）、评论删除权限收紧为仅内置管理员、多端登录顶号提示断链修复（被顶设备必弹下线提示，正常刷新不误判登出） |
| **云客 1.0** | 2026-11-12 | - | 移动端适配 + SEO + 安全修复：AI 对话页手机端单栏切换、Notification WebView 兼容、设置页布局优化、登录页移动端适配、robots.txt + sitemap.xml、博客文章公开访问、favicon、Docker 安全加固、nginx 隐藏源站 IP |
| **云客 1.1** | 2026-11-13 | - | 博客全面公开：根路径直接跳转博客首页、去掉登录门禁、加登录入口和返回链接、SEO 友好、公开缓存 |

### 运维记录（不计入版本号）

- 2026-11-10/11：独立部署 `blog-sentinel` 访问审计后台（未纳入本仓库），含态势地图与「注册 / 在线」视图。
- 2026-11-11：清理线上 85 个渗透测试账号，仅保留 7 个；`user_data` 由 19.95MB 降至 29,759 字节，删除前全量备份留在服务器 `/root/`。
- 2026-11-11：`main` 同步推送至 GitHub 与 Gitee 双平台。
- 2026-11-11（运维侧安全整改，未纳入代码仓库）：nginx 两个 vhost 的 HSTS 补全为 `max-age=31536000; includeSubDomains; preload`；修复 `blog-sentinel` vhost 因 `location /` 内 `add_header` 屏蔽继承导致 3100 端口实际缺失 HSTS 的问题（在该 location 内重新声明）。明文 HTTP 80 跳转块仍不下发 HSTS。
- 2026-11-11（运维侧安全整改）：`blog-sentinel` 公开 `/health` 移除 `counts`（访问/登录/事件数不再匿名可读），只保留 `ok/status/ts`；详细计数移到需后台登录的 `GET /api/audit/health`，看板「系统·接入」三项数值不退化；静态资源版本升 `?v=5`。主站 `/health` 未改动。
- 2026-11-11：presence 三端联动生产逐文件部署，备份 `/root/blog2.1-presence-deploy-backup-20261110T194649`（11 文件 244K）；生产 `server.js` 以生产版本为基底精确插块（md5 `8dcf8dd3b3ac5fb739db74c2a24f4c2f`），从未用本地版本整体覆盖。收尾核对发现看板 CSS 漏升版本号，补升 `?v=7` 并单独部署 3 个文件（备份同目录 `static-v7/`）。
- 2026-11-11：第四次测试修复生产部署，备份 `/root/blog2.1-r4fix-backup-20261111T124721`；15 个文件逐文件 md5 一致，`server.js` 仅精确插 5 个修复块（保留 `SENTINEL_BASE_URL=3101` 等生产差异），公网黑盒 43/43、生产用户数回到 8。修复报告见 `E:/workaddress/cs/fourth/第四次测试修复报告_lizyi.asia_博客.md`。
