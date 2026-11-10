# blog2.1 → blog2.2 版本差异对比

> 生成时间：2026-11-10 08:08（GMT+8）
> 对比基线：`788d182` → `bc97300`（main 分支，已同步 GitHub 与 Gitee）
> 本次发布物：`blog2.1-v2.1.0` / `blog2.1-v2.2.0` 双包 + 一份可 `git apply` 的补丁

---

## 一、一句话结论

**2.2 只新增了一条平行数据链路，没有改动任何既有功能。**

- 体积：**+31,415 字节**（148.7 MB → 148.7 MB，几乎零增长）
- 文件：242 → 246（净增 4 个文件）
- 代码：**+698 / −16 行**，其中 203 行是规划文档、152 行是数据文件，真正逻辑代码仅 **222 行**
- 既有 10 个内置项目、`/api/projects`、登录门禁、ChatRecord 全部未动

---

## 二、版本基本信息

| 项目 | blog2.1 | blog2.2 |
|---|---|---|
| 提交 | `788d182` | `bc97300` |
| 提交时间 | 2026-09-08 15:42 | 2026-11-10 00:22 |
| 提交说明 | `feat: add zonglan project overview blog2.1.1` | `feat(blog2.2): 新增外链作品墙，10 个独立仓库作品以友链卡挂入` |
| `package.json` version | `2.0.0` | `2.2.0` |
| 文件数 | 242 | 246 |
| 仓库体积 | 148.7 MB | 148.7 MB |
| 内置项目数 | 10 | 10（不变） |
| 外部作品（友链） | 0 | **10** |
| 单元测试 | 56 通过 | 56 通过（未新增、未失败） |

> 注：`package.json` 里的版本号在 2.1 阶段仍是 `2.0.0`（当时未随手更新），2.2 一次性补到 `2.2.0`。

---

## 三、功能差异总览

| 功能 | blog2.1 | blog2.2 | 变化 |
|---|---|---|---|
| 扫码登录 / 账号密码登录 / 免密直登 | ✅ | ✅ | 无变化 |
| 注册、改密、登出 | ✅ | ✅ | 无变化 |
| 项目中心（10 个内置项目卡片） | ✅ | ✅ | 无变化 |
| 导入自定义项目（`project.json`） | ✅ | ✅ | 无变化 |
| 项目扫描 / 删除 | ✅ | ✅ | 无变化 |
| 快速导航下拉（内置 / 导入 两段） | ✅ | ✅ | **变为三段**，新增「外部作品」 |
| 页头计数 | `共 10 个项目` | `共 10 个站内项目 · 10 个外部作品` | 语义拆开 |
| **外部作品墙（友链）** | ❌ | ✅ | **新增** |
| **`GET /api/links`** | ❌ | ✅ | **新增** |
| 博客首页外部作品区 | ❌ | ✅ | **新增** |
| ChatRecord 会话时序实验室 | ✅ | ✅ | 无变化 |
| OCR（RapidOCR / Tesseract 回退） | ✅ | ✅ | 无变化 |
| MySQL 自动建库建表 | ✅ | ✅ | 无变化 |

---

## 四、文件级差异（12 个文件）

| 文件 | 状态 | 增 | 删 | 说明 |
|---|---|---|---|---|
| `qrcode-login/links.json` | **新增** | 152 | 0 | 10 条友链数据 |
| `qrcode-login/modules/links/service.js` | **新增** | 100 | 0 | 读取 + 校验 + 排序 |
| `qrcode-login/modules/links/routes.js` | **新增** | 34 | 0 | `GET /api/links` |
| `docs/blog2.2-plan.md` | **新增** | 203 | 0 | 规划 + 实施记录 |
| `projects.html` | 改 | 86 | 10 | 分区渲染、外链卡、导航第三段、并行加载 |
| `blog/index.html` | 改 | 50 | 0 | 同源友链区块 |
| `docs/api.md` | 改 | 46 | 0 | 新增第 4 章 `/api/links` |
| `README.md` | 改 | 19 | 4 | 2.2 说明 + 目录树 |
| `.gitignore` | 改 | 3 | 0 | 忽略 `.workbuddy/` |
| `qrcode-login/server.js` | 改 | 2 | 0 | require + 挂载 |
| `qrcode-login/config/index.js` | 改 | 1 | 0 | `linksFile` 路径 |
| `qrcode-login/package.json` | 改 | 2 | 2 | 版本号 + 描述 |
| **合计** | | **698** | **16** | |

---

## 五、代码级差异要点

### 5.1 后端接入（3 行）

```js
// config/index.js — 新增
linksFile: path.join(ROOT_DIR, "links.json"),

// server.js — 新增
const linksRoutes = require("./modules/links/routes");
app.use("/api/links", verifyCsrfToken, linksRoutes);
```

挂在 `app.use("/api/projects", ...)` 之后，复用同一套 `verifyCsrfToken`。

### 5.2 新增接口

| 接口 | 方法 | 鉴权 | 返回 |
|---|---|---|---|
| `/api/links` | GET | 需登录（未登录 401） | `{ ok, count, links: [...] }` |

**安全措施（2.1 没有的部分）：**

```js
const REPO_RE = /^https:\/\/github\.com\/180lisilence\/[A-Za-z0-9._-]+\/?$/;
const DEMO_RE = /^https:\/\/([A-Za-z0-9-]+\.)?github\.io\/[A-Za-z0-9._~%\-/]*$/;
const MIRROR_RE = /^\/blog\/projects\/[A-Za-z0-9_-]+\/[A-Za-z0-9._~%\-/]+$/;
```

只放行本人的 GitHub 仓库与 Pages，杜绝 `javascript:` / `data:` 协议注入。坏条目**跳过并记 WARN 日志**，不让一条脏数据打挂整个接口。

### 5.3 前端渲染（`projects.html`）

```js
// 2.1
document.getElementById("projectCount").textContent = `共 ${allProjects.length} 个项目`;

// 2.2
document.getElementById("projectCount").textContent =
  `共 ${allProjects.length} 个站内项目${extCount ? ` · ${extCount} 个外部作品` : ""}`;
```

外链卡模板新增 `escapeHtml()` 转义（2.1 的卡片是内联 `innerHTML`，没有转义），并加 `rel="noopener noreferrer"`。

### 5.4 加载降级（2.1 没有的机制）

```js
// 2.1：单接口，失败即整页报错
async function loadProjects() {
  const r = await apiFetch("/api/projects");
  if (d.ok) { ... } else { grid.innerHTML = '<div class="error">加载项目列表失败</div>'; }
}

// 2.2：双接口并行，单侧失败只降级该区块
async function loadData() {
  let projectsOk = false;
  try { /* /api/projects */ } catch (e) { console.warn(...) }
  try { /* /api/links   */ } catch (e) { console.warn(...) }
  if (!projectsOk && !allLinks.length) { /* 才报错 */ }
  renderGrid(); renderNav();
}
```

---

## 六、数据差异：10 个外部作品

| # | 作品 | 仓库 | 体积 | 在线演示 | 技术栈 |
|---|---|---|---|---|---|
| 1 | 本地技能工具箱 | skilll-collection | 68.3 MB | ✅ | Python |
| 2 | 重生之满级暴击 | critical-game | 1.9 GB | ✅ | Java（LibGDX） |
| 3 | MC 服务器监控面板 | my-world-monitor-tool | 8.4 MB | ✅ | Python + HTML |
| 4 | 3D 线框渲染器 | 3D-model-construction | 19.8 MB | ✅ | C++ |
| 5 | REA 双端逆向控制台 | rea-tool-myself | 39 MB | ✅ | HTML / JS |
| 6 | 个人信息聚合工具集 | personal-information-anliaysis | 5.9 MB | ❌ 仅仓库 | JavaScript + Python |
| 7 | 七猫小说导出插件 | qi-mao-book-export-verison | 35 MB | ✅ | Java / Smali |
| 8 | 卡密工具箱 / 解卡大师 | card-unlock-master | 8.7 MB | ✅ | Smali |
| 9 | TERMINAL ARCADE 终端街机 | gamehub | 2.7 MB | ✅ | Python + HTML |
| 10 | 云麓空间 | yunlu-room | 19 MB | ✅ | Kotlin + Python |

**9 个有在线演示，1 个（#6）只能跳仓库**。这 10 条只存在于 `links.json`，**没有下载任何代码进仓库** —— 所以体积只涨了 31 KB。

---

## 七、未改变的部分（回归验证）

| 检查项 | 2.1 结果 | 2.2 结果 |
|---|---|---|
| `GET /api/projects` 条数 | 10 | **10** |
| `BUILTIN_PROJECTS` 内容 | 10 条 | 10 条（未改一行） |
| `node tests/run.js` | 56 通过 | **56 通过** |
| 登录 / 注册 / 改密 | 正常 | 正常 |
| ChatRecord 会话与 OCR | 正常 | 正常 |
| `projects.json`（导入项目存储） | `[]` | `[]` |

---

## 八、发布物清单

| 文件 | 大小 | 说明 |
|---|---|---|
| `blog2.1-v2.1.0_20261110-080831.zip` | 133 MB | 2.1 完整快照，311 个条目 |
| `blog2.1-v2.2.0_20261110-080831.zip` | 133 MB | 2.2 完整快照，316 个条目 || `blog2.1-diff-2.1-to-2.2_20261110-080831.patch` | 40 KB | 12 文件补丁，可 `git apply` |

**校验和：**
```
338f75d7d97f12030c6ddccf6765e02b43145adc1c0126510b72aaa32c408af9  blog2.1-v2.1.0_20261110-080831.zip
ed0970f15dea3ae4a05af89c4ab2878f3dd1d78478d1c5d4ccab581d6b18ea05  blog2.1-v2.2.0_20261110-080831.zip
5b529f212857300a5a303b598f9fdbb3afb819ca96a6625deefc5b81e25e9860  blog2.1-diff-2.1-to-2.2_20261110-080831.patch
```

> 两个包的体积几乎一样，因为 2.2 只多 31 KB —— 这本身就是「友链方案没有把仓库撑大」的直接证据。

**zip 内容不含 `node_modules`、`users.json`、`server.log`、`data/`**（均被 `.gitignore` 排除，`git archive` 只导出被跟踪文件）。

---

## 九、升级与回滚

**从 2.1 升到 2.2（补丁方式）：**
```bash
git checkout 788d182
git apply blog2.1-diff-2.1-to-2.2_20261110-080831.patch
cd qrcode-login && npm start
```

**直接使用 2.2 包：**
```bash
unzip blog2.1-v2.2.0_20261110-080831.zip
cd blog2.1-v2.2.0/qrcode-login && npm install && npm start
```

**回滚到 2.1：**
```bash
git checkout 788d182   # 或 unzip blog2.1-v2.1.0_*.zip
```

**升级后必须做的验证：**
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/links   # 未登录 → 401
# 登录后
curl -s -b "web_token=<token>" http://127.0.0.1:3000/api/links | head -5   # count:10
curl -s -b "web_token=<token>" http://127.0.0.1:3000/api/projects | head -5 # 仍是 10 条
```
