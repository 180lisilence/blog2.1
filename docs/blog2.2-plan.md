# blog2.2 规划：外链作品墙（友链形态）

> 目标：把 10 个外部 GitHub 作品以「友链」形态挂进博客，不动现有的 10 个内置项目。
> 本文只做方案，不含已实施的代码改动。验收通过后再进 blog2.3（本地镜像）。

---

## 一、先定位接口（现状实测）

| 层 | 位置 | 关键事实 |
|---|---|---|
| 前端渲染 | `projects.html:290-313` `renderGrid()` | 卡片统一模板 `<a class="card" href="${p.url}" target="_blank">`，无「外链 / 内置」区分 |
| 前端导航 | `projects.html:315-340` `renderNav()` | 只分「内置项目 / 导入项目」两段 |
| 前端计数 | `projects.html:292` | `共 ${allProjects.length} 个项目`，混入外链会一起 +10 |
| 数据接口 | `GET /api/projects` | 返回 `{ ok:true, projects:[...] }`，**需登录** |
| 扫描接口 | `GET /api/projects/scan` | 扫 `blog/projects/` 下未导入且有 `project.json` 的目录 |
| 导入接口 | `POST /api/projects/import` | body `{folder}`，写 `qrcode-login/projects.json` |
| 删除接口 | `DELETE /api/projects/:id` | `builtin-` 前缀拒删 |
| 内置清单 | `modules/projects/service.js:16-27` | `BUILTIN_PROJECTS` 硬编码 10 条（workbench / steel / jizhiyun / shantou / restaurant / earth / chatrecord / woldvein / zonglan / blog） |
| 导入清单 | `qrcode-login/projects.json` | 当前内容 `[]` |
| 鉴权 | `modules/projects/routes.js:18-24` | 模块级 `router.use`，全部接口要有效 web session |
| CSRF | `server.js:59-61` | `/api/projects` 挂 `verifyCsrfToken`（GET 放行，写操作必须带 `X-CSRF-Token`） |
| 挂载点 | `server.js:61` | `app.use("/api/projects", ...)`，新增模块照此追加 |

**项目对象现有字段**：`id / name / desc / url / icon / color / builtin`，导入项目额外有 `folder / version / author / tags / importedAt`。
**卡片可用字段**：`icon`（单个 emoji）、`color`（`c1`~`c6`）、`desc`、`tags`（前端只取前 3 个）。

---

## 二、10 个作品的实测元数据（2026-11-09 抓取）

| # | 仓库 | 作品名称 | 形态 / 技术栈 | 体积 | Pages | 建议 icon |
|---|---|---|---|---|---|---|
| 1 | skilll-collection | 本地技能工具箱 | 400 条技能主清单 · 12 大类 40 子类 · Python | 34 MB | ✅ /skilll-collection/ | 🧰 |
| 2 | critical-game | 重生之满级暴击 | LibGDX 1.12.1 · Java · Android + Windows 同 core | 1.9 GB | ✅ /critical-game/ | ⚔️ |
| 3 | my-world-monitor-tool | MC 服务器监控面板 | Python 采集 + 同页双端（浏览器 / WebView） | 8.4 MB | ✅ | 📡 |
| 4 | 3D-model-construction | 3D 线框渲染器 | 纯 CPU 软件光栅 · C++ · 启动动画 + 透明叠层双 exe | 9.8 MB | ✅ | 🧊 |
| 5 | rea-tool-myself | REA 双端逆向控制台 | REA CLI 6.5.0（155 命令）图形化 · HTML | 39 MB | ✅ | 🧭 |
| 6 | personal-information-anliaysis | 个人信息聚合工具集 | 爬虫 + 33KB APK + Electron 客户端 | 5.9 MB | ❌ 404 | 🔎 |
| 7 | qi-mao-book-export-verison | 七猫小说导出插件 | 静态注入插件 · 借 App 自身解密器 · Java/Smali | 35 MB | ✅ | 📚 |
| 8 | card-unlock-master | 卡密工具箱 / 解卡大师 | APK 工程 · Smali（README 为空，需自拟描述） | 8.7 MB | ✅ | 🔓 |
| 9 | gamehub | TERMINAL ARCADE 终端街机 | FastAPI · CRT 终端风网页游戏平台 | 2.7 MB | ✅ | 🕹️ |
| 10 | yunlu-room | 云麓空间 | 双端本机应用管理器 · PC Python/Tkinter + Android Kotlin | 19 MB | ✅ | 🗂️ |

> 8 / 10 有 GitHub Pages 可直接在线玩，2 条只能跳仓库（#6、#8）。
> #2 单仓 1.9 GB，是后续镜像阶段的硬约束（见第六节）。

---

## 三、方案选型

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 直接塞进 `BUILTIN_PROJECTS` | 在 service.js 加 10 条 | 改动最小，但污染「内置项目」语义、计数与导航全乱、2.3 迁移时要再拆 |
| B. 生成 10 个 `blog/projects/xxx/project.json` 走导入流程 | 复用现有导入 | 会要求目录里有真实 `entry` 文件，纯外链做不到 |
| **C. 独立 `links.json` + 独立 `/api/links` + 前端分区渲染** | 新增轻量模块 | **推荐**：零回归、数据可增删、2.3 只需给每条填 `mirror` 字段 |

**选 C。** 核心理由：`/api/projects` 是现有 10 张卡的数据源，任何字段/条数变化都会连带影响计数、导航、导入弹窗的「已导入」判断。外链作品在 2.2 阶段本质是「内容」而不是「可导入项目」，用独立数据源隔离，2.3 转正时再合并。

---

## 四、blog2.2 改动清单（按文件）

### 4.1 新增数据文件 `qrcode-login/links.json`

```json
[
  {
    "id": "link-skilll-collection",
    "name": "本地技能工具箱",
    "desc": "400 条技能主清单、12 大类 40 子类物理归位，整包离线自足，附可搜索索引页。",
    "repo": "https://github.com/180lisilence/skilll-collection",
    "demo": "https://180lisilence.github.io/skilll-collection/",
    "mirror": null,
    "icon": "🧰",
    "color": "c1",
    "tags": ["技能库", "Python", "离线工具"],
    "stack": "Python",
    "size": "34 MB",
    "updated": "2026-11-07",
    "order": 1
  }
]
```

字段约定：
- `repo` 必填，必须匹配 `^https://github\.com/180lisilence/`
- `demo` 可为 `null`（无 Pages 时前端隐藏「在线演示」按钮）
- `mirror` 在 2.2 恒为 `null`；2.3 填 `/blog/projects/<folder>/index.html` 后前端自动优先本地
- `color` 只能用 `c1`~`c6`，`tags` 最多 3 个（前端 `slice(0,3)`）

### 4.2 新增后端模块 `qrcode-login/modules/links/`

- `service.js`：读 `links.json` → 校验（URL 域名白名单、`demo` 可空、`color` 枚举）→ 按 `order` 排序；坏条目跳过并 `logger.warn`，不抛 500。
- `routes.js`：`GET /api/links`，沿用 `projects/routes.js` 同款登录中间件 `router.use`。
- `server.js` 追加两行：`const linksRoutes = require("./modules/links/routes")` + `app.use("/api/links", verifyCsrfToken, linksRoutes);`（放在 projects 那行之后，保持风格一致）。

**为什么做域名白名单**：`renderGrid` 是模板字符串直插 `href`，`links.json` 一旦被改写就能注入 `javascript:`。项目里已有 `core/security.js` 承担同类职责，模块内做一次前缀校验即可，成本 6 行。

### 4.3 `projects.html`

1. `renderGrid()` 拆成两段：原有 10 张内置卡 → 新增 `<div class="section-label">外部作品 · 友链</div>` + 外链卡。
2. 外链卡模板（复用 `.card` 样式，增加 `↗` 角标与双按钮）：

```html
<a class="card ext-card" href="${p.demo || p.repo}" target="_blank" rel="noopener noreferrer">
  <span class="ext-badge">↗</span>
  <div class="c-icon ${p.color}">${p.icon}</div>
  <h3>${p.name}</h3>
  <p>${p.desc}</p>
  <div class="tags">…</div>
  <div class="go">${p.demo ? "在线体验 →" : "前往 GitHub →"}</div>
</a>
```

3. 计数改成两段：`共 10 个内置项目 · 10 个外部作品`（避免 `allProjects.length` 语义混淆）。
4. `renderNav()` 追加第三段「外部作品」，同样带 `↗`。
5. 数据加载改为 `Promise.all([apiFetch("/api/projects"), apiFetch("/api/links")])`，任一失败降级为空数组，不阻塞主网格。

### 4.4 `blog/index.html`

在「我的项目」区块之后加一个「外部作品」小节：3 列卡片、只显示 icon + 名称 + 一行描述，点击外跳。博客首页是登录门禁内页面，可直接用同一接口。

### 4.5 版本与文档

- `qrcode-login/package.json` → `"version": "2.2.0"`
- `README.md` 增补「🔖 2.2 版本说明：外链作品墙（10 个作品）」，并补上现状已存在但文档缺失的 zonglan
- 新增本文件 `docs/blog2.2-plan.md`，`docs/api.md` 增补 `/api/links` 一节

---

## 五、验收标准（可执行）

```bash
cd qrcode-login && npm start
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/links        # 期望 401（未登录）
curl -s -b "web_token=<有效token>" http://127.0.0.1:3000/api/links | head -20   # 期望 10 条，ok:true
curl -s -b "web_token=<有效token>" http://127.0.0.1:3000/api/projects | head -5 # 期望仍是 10 条（零回归）
```

浏览器侧：
1. `/projects.html` 页首显示 `共 10 个内置项目 · 10 个外部作品`
2. 外链卡右上角有 `↗`，新标签打开，不覆盖本站
3. #6、#8 两张卡只出现「前往 GitHub →」，不出现「在线体验」
4. 「快速导航」出现第三段「外部作品」，搜索框能过滤
5. 断网状态下页面不白屏，内置项目区正常

---

## 六、blog2.3 预埋（验收后才做）

1. **只镜像可静态托管的 7 个**（#1 #3 #4 #5 #7 #9 #10），`git clone --depth 1` 取 `main` 分支 Pages 产物，落到 `blog/projects/<folder>/`，各写一份 `project.json` 走现有导入流程。
2. **#2 critical-game 不镜像**：单仓 1.9 GB，进 git 会让克隆与镜像构建不可接受（当前仓库已 149 MB）。保持外链，或改为 Releases 附件。
3. **#6 #8 无 Pages**：2.3 阶段考虑自建构建产物（#8 只有 APK，`.apk` 应进 `.gitignore` 走 Releases）。
4. 前端只需把 `links.json` 里对应条目的 `mirror` 填上即可，**不改一行渲染代码** —— 这是选方案 C 的兑现点。

---

## 七、假设与待确认

1. 假定「友链」= 卡片外跳，不做 iframe 内嵌（内嵌受 `X-Frame-Options` 限制，且 Pages 站点会串样式）。
2. 假定外链作品与内置项目一样需要登录才能看到（沿用现有门禁，不做公开友链页）。
3. 假定 #8 card-unlock-master 的描述由我按目录内容自拟（README 只有标题一行）。
4. 假定 `docs/api.md` 需要同步，而不是只在 README 提一句。
5. 若你希望公开可见（不登录也能看友链墙），需单独放行 `GET /api/links` 与对应页面，这会削弱门禁完整性——建议 2.3 再评估。

---

## 八、实施记录（2026-11-09 已落地）

### 8.1 备份

- 位置：`E:/workaddress/.blog2.1-backup/blog2.2-20261109-234156/`（仓库外部，不污染 Git）
- 内容：`server.js`、`config/index.js`、`package.json`、`projects.json`、`projects.html`、`blog/index.html`、`README.md`、`docs/api.md`、`.gitignore`
- 附 `SHA256SUMS.txt` 与 `GIT_HEAD.txt`（基线 `788d182`）
- 回滚：把备份目录里的同名文件覆盖回对应路径即可

### 8.2 实际改动

| 文件 | 性质 | 内容 |
|---|---|---|
| `qrcode-login/links.json` | 新增 | 10 条友链数据 |
| `qrcode-login/modules/links/service.js` | 新增 | 读取 + 校验 + 排序（86 行） |
| `qrcode-login/modules/links/routes.js` | 新增 | `GET /api/links` + 登录拦截（34 行） |
| `qrcode-login/config/index.js` | 改 1 行 | 增加 `linksFile` |
| `qrcode-login/server.js` | 改 2 行 | require + 挂载 `/api/links` |
| `projects.html` | 改 | 分区渲染、↗ 角标、导航第三段、并行加载降级 |
| `blog/index.html` | 改 | 同源友链区块 + 接口失败整块隐藏 |
| `package.json` | 改 | 2.0.0 → 2.2.0 |
| `README.md` / `docs/api.md` | 改 | 2.2 说明、目录树、`/api/links` 文档 |

### 8.3 实测结果

- `GET /api/links` 未登录 → **401**；登录后 → `ok:true, count:10`
- `GET /api/projects` → 仍为 **10 条**（零回归）
- `node tests/run.js` → **56 通过 / 0 失败**
- 项目中心页头显示 `共 10 个站内项目 · 10 个外部作品`，外链卡 10 张，其中「个人信息聚合工具集」只显示「前往 GitHub」
- 博客首页友链区块 10 张卡、3 列网格正常，深色主题下可读
- 渲染后 DOM 统计：`ext-card` 10 个、`在线体验` 9 处、`前往 GitHub` 1 处、导航含「外部作品」段

### 8.4 已知差异

- 初版规划里写「8 个有 Pages」，实测 `card-unlock-master` 的 Pages 返回 200，实际是 **9 个有演示页、1 个无**，`links.json` 按实测填写
