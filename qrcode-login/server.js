/**
 * 项目中心服务入口
 * 模块化架构：config / core / db / middleware / modules
 */
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

const config = require("./config");
const logger = require("./core/logger");
const { errorHandler } = require("./core/errors");
const health = require("./core/health");
const ocrManager = require("./core/ocrManager");
const pool = require("./db/pool");
const { initDatabase } = require("./db/init");
const { createAuthGate, getTokenFromReq } = require("./middleware/auth");
const { forceHttps, securityHeaders, createRateLimiter, createCorsPolicy } = require("./middleware/security");
const { ensureCsrfCookie, verifyCsrfToken, getCsrfToken } = require("./middleware/csrf");
const captcha = require("./middleware/captcha");
const { startCleanup: startLoginLockCleanup } = require("./middleware/loginLock");
const { createBlogStatic } = require("./middleware/blogStatic");

const authRoutes = require("./modules/auth/routes");
const authModel = require("./modules/auth/model");
const authSession = require("./modules/auth/session");
const qrTicket = require("./modules/auth/qrTicket");
const aiRoutes = require("./modules/ai/routes");
const chatrecordRoutes = require("./modules/chatrecord/routes");
const projectsRoutes = require("./modules/projects/routes");
const linksRoutes = require("./modules/links/routes");
const commentsRoutes = require("./modules/comments/routes");

const app = express();

// ========== 反向代理信任配置 ==========
// 部署在 Nginx 之后时必须开启，否则 req.ip 永远是 127.0.0.1，
// 会导致 IP 白名单与频率限制全部失效。
// TRUST_PROXY 可选值：false / 数字(代理层数) / true / 具体网段
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv === "true") {
  app.set("trust proxy", true);
} else if (trustProxyEnv === "false") {
  // 显式关闭。旧版会把字符串 "false" 落到下面的「具体网段」分支，
  // Express 的 proxy-addr 会抛 TypeError: invalid IP address: false，
  // 服务直接起不来。配置文件里写 false 是很常见的写法，必须正确识别。
  app.set("trust proxy", false);
} else if (trustProxyEnv && !isNaN(Number(trustProxyEnv))) {
  app.set("trust proxy", Number(trustProxyEnv));
} else if (trustProxyEnv) {
  app.set("trust proxy", trustProxyEnv);
} else if (process.env.NODE_ENV === "production") {
  // 生产环境默认信任一层代理（本机 Nginx）
  app.set("trust proxy", 1);
}
// 关闭 X-Powered-By，避免暴露技术栈
app.disable("x-powered-by");

// ========== 全局中间件 ==========
app.use(forceHttps);           // 生产环境强制 HTTPS
app.use(securityHeaders);      // 安全响应头
app.use(createRateLimiter(300, 60000)); // 频率限制：每分钟 300 次

// CORS（F-11）
//
// 旧写法 app.use(cors()) 会输出 `Access-Control-Allow-Origin: *`。
// 虽然带 `*` 时浏览器不会附带 Cookie（凭据模式被禁），危害有限，
// 但配合 F-02 那类"CSRF 可构造"的缺陷就是放大器。
// 现在改为：默认**不下发任何 CORS 头**（同源部署根本不需要），
// 只有当请求 Origin 命中 CORS_ORIGINS 白名单时才回显该 Origin。
app.use(createCorsPolicy());

app.use(cookieParser());
// 单请求体上限：原来 10mb，配合 N-03 的"无配额"等于允许单次塞 10MB。
// 现在收到 1MB，配合 /api/data/all 的 2MB 总配额足够用。
app.use(express.json({ limit: "1mb" }));

// ========== 缓存语义默认值（RISK-07） ==========
// 旧实现：首页 / 返回 public,max-age=0；多数 /api/* 无 Cache-Control、无 Vary:Cookie。
// 带登录态的响应一旦被浏览器 / 共享代理缓存，可能串味给下一个访客。
// 这里给「所有 API + 页面」统一打 private,no-store + Vary:Cookie 作为安全默认；
// 路由若显式设置（如 /api/public/preview 的 public,max-age=300、/api/data/all 的
// no-store）会覆盖这里的默认值 —— 因为 Express 的 res.set 后写覆盖先写。
app.use((req, res, next) => {
  const p = req.path || "";
  // 明确列举「公开静态资源」扩展名，这些走各路由自带的 public + ?v= 版本控制
  // （session-kicked.js / presence-client.js 等各自显式设 public,max-age=300）。
  // 其余一律按私密内容处理：
  //   - 所有 /api/*
  //   - 所有 HTML 页面：包括 /projects.html、/settings.html 这类带 .html 后缀的
  //     受保护页面，也包括 "/" "/login" 等无后缀路由页
  // RISK-07 复核发现：旧判断 !/\.[A-Za-z0-9]+$/.test(p) 会把 /projects.html
  // 当成静态资源排除，导致登录后页面 Cache-Control 为空、无 Vary:Cookie，
  // 可能被浏览器 / 共享代理缓存串味给下一个访客。改为按「是否公开静态扩展名」
  // 白名单判断，HTML 页面不再漏网。
  const isPublicStaticAsset = /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot|map|txt)$/i.test(p);
  if (!isPublicStaticAsset) {
    if (!res.getHeader("Cache-Control")) {
      res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    }
    if (!res.getHeader("Vary")) {
      res.set("Vary", "Cookie");
    }
  }
  next();
});

// ========== blog-sentinel 访问审计适配器（可选，零侵入） ==========
// 仅在 qrcode-login/.env 配置了 INGEST_KEY 时启用；
// 未配置或加载失败都不会影响博客原有功能。
let sentinelAdapter = null;
try {
  const sentinel = require("./sentinel-adapter");
  sentinelAdapter = sentinel.install(app, authSession, {
    key: process.env.INGEST_KEY,
    // 生产 Nginx :3100 做 TLS 终止后反代到 Node :3101，同机直连必须写 3101。
    // 写 3100 会打到 HTTPS 端口导致适配器上报失败。
    baseUrl: process.env.SENTINEL_BASE_URL || "http://127.0.0.1:3101",
    logAccess: process.env.SENTINEL_LOG_ACCESS !== "false",
    excludeStatic: process.env.SENTINEL_EXCLUDE_STATIC === "true",
    trustProxy: app.get("trust proxy")
  });
  if (sentinelAdapter?.enabled) logger.info("sentinel", "访问审计适配器已启用");
} catch (e) {
  logger.warn("sentinel", "访问审计适配器加载失败（不影响博客）", e.message);
}

// ========== 成员快照接口（供 blog-sentinel 审计后台拉取，机器对机器） ==========
// 必须挂在 /api 通用守卫之前：它用 x-sentinel-key 鉴权，不走用户登录 / CSRF。
// 只输出脱敏字段（账号/注册时间/是否内置/在线会话），绝不含 salt/hash/webToken。
// 未配置 INGEST_KEY 时端点直接关闭，对博客零影响。
const sentinelMembers = require("./modules/audit/members");
function requireSentinelKey(req, res, next) {
  const expected = process.env.INGEST_KEY;
  if (!expected) return res.status(404).json({ ok: false, msg: "接口不存在" });
  const got = String(req.get("x-sentinel-key") || "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !require("crypto").timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, msg: "unauthorized" });
  }
  next();
}
app.get("/api/members", requireSentinelKey, (req, res) => {
  try {
    res.json(sentinelMembers.snapshot());
  } catch (e) {
    logger.error("sentinel-members", "成员快照生成失败", e.message);
    res.status(500).json({ ok: false, msg: "快照生成失败" });
  }
});

// ========== 账号管理端点（供 blog-sentinel 审计后台代管，机器对机器） ==========
// 同样用 x-sentinel-key 鉴权，挂在 /api 通用登录/CSRF 守卫之前。
// 支持 create / rename / reset-password / kick / delete；内置账号禁止改名与删除。
// 写操作会同步 MySQL + 内存 + 会话，并让目标账号全部会话立即失效。
const sentinelMembersAdmin = require("./modules/audit/members-admin").createMembersAdmin({ logger });
app.post("/api/members/admin", requireSentinelKey, async (req, res) => {
  try {
    const out = await sentinelMembersAdmin.apply(req.body || {});
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e && e.isOperational) {
      return res.status(e.statusCode).json({ ok: false, msg: e.message });
    }
    logger.error("sentinel-members-admin", "账号管理操作失败", e.message);
    res.status(500).json({ ok: false, msg: "账号管理操作失败" });
  }
});

// ========== 在线状态提示（presence） ==========
// 三端联动的用户端一侧：用户端轮询 /api/presence/state 感知「被管理员下线」；
// 提示开关由主站持有，审计后台经带密钥接口读写，两端读同一份状态，天然同步。
// 必须挂在 /api 通用登录 / CSRF 守卫之前：被踢后 token 已从 webSessions 删除，
// 走通用守卫会 401，反而无法把「你已下线」的提示送达用户端。
const presence = require("./modules/presence").getPresence();
app.get("/api/presence/state", (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const loginCookies = require("./modules/auth/loginCookies");
    // 2.2.8：把「本设备被顶号」的事实也带进判定。
    // 旧实现只看 token —— 而 sendKicked 在返回 401 KICKED 时已经把 web_token
    // 清掉了（HttpOnly，前端清不掉），于是后续 presence 轮询拿到空 token，
    // kicked Map（以 token 为 key）查不到 → 降级 anonymous → 下线提示永久丢失。
    // 实测对照：先 /api/me 后 presence = anonymous；只走 presence = kicked。
    // 现在用服务端自读的 blog_kick 标记补判，提示不再依赖凭据是否还在。
    const kickHint = loginCookies.readKickedCookie(req);
    const state = presence.state(getTokenFromReq(req), kickHint);
    // R4-03：web_token 已 HttpOnly，用户端 JS 清不掉。会话已真实失效
    // （被顶号 kicked / 过期 expired）时，服务端主动清全套登录 Cookie，
    // 避免浏览器继续携带失效 token 反复轮询。前端收到 kicked 即弹窗跳登录页。
    if (state.status === "kicked" || state.status === "expired") {
      try { loginCookies.clearLoginCookies(res); }
      catch (e) { /* 不影响状态响应本身 */ }
    }
    // 2.2.8：提示已送达（本次响应即携带 kicked），清掉顶号标记。
    // 否则用户回到登录页后 presence 仍会一直判定 kicked → 反复弹窗，
    // 而登录成功后 finalizeLogin 又会清它，两处都会清，幂等无副作用。
    if (state.status === "kicked") {
      try { res.clearCookie(loginCookies.BLOG_KICK_COOKIE, { path: "/" }); }
      catch (e) { /* 不影响状态响应本身 */ }
    }
    res.json({ ok: true, ...state });
  } catch (e) {
    logger.error("presence", "状态查询失败", e.message);
    res.json({ ok: true, status: "off", pollMs: 0, serverTs: Date.now() });
  }
});
app.get("/api/presence/settings", requireSentinelKey, (req, res) => {
  res.json({ ok: true, settings: presence.getSettings() });
});
app.post("/api/presence/settings", requireSentinelKey, (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
    if (typeof b.onlineNotice === "boolean") patch.onlineNotice = b.onlineNotice;
    if (typeof b.offlineNotice === "boolean") patch.offlineNotice = b.offlineNotice;
    if (typeof b.offlineMessage === "string") patch.offlineMessage = b.offlineMessage;
    if (b.pollMs !== undefined) patch.pollMs = b.pollMs;
    res.json({ ok: true, settings: presence.updateSettings(patch) });
  } catch (e) {
    logger.error("presence", "提示开关更新失败", e.message);
    res.status(500).json({ ok: false, msg: "提示开关更新失败" });
  }
});

// ========== 公开内容预览（登录页展示博客文章 / 项目，激发登录欲望） ==========
// 只读 blog/index.html 中已有的人工维护卡片：脱敏 + 限长 + 站内链接白名单。
// 不查库、不碰用户数据、不读私有项目；未登录也能取，但只有宣传性字段。
const publicPreview = require("./modules/public/preview").getPreview();
app.get("/api/public/preview", (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=300");
    res.json(publicPreview.get());
  } catch (e) {
    logger.error("preview", "内容预览生成失败", e.message);
    res.json({ ok: true, generatedAt: Date.now(), tagline: "", posts: [], projects: [] });
  }
});

// 用户端 presence 轮询脚本：由 blogStatic 自动注入所有 /blog HTML 文档。
// 放在公开路由（无需登录），严格 CSP 下同源自建脚本可正常加载。
app.get("/presence-client.js", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(config.blogRoot, "presence-client.js"));
});

// 会话被顶号提示脚本：顶层页面（index / projects / settings）在 apiFetch 里调用
// window.__handleKicked 处理 401 KICKED。公开只读、同源，严格 CSP 可加载。
app.get("/session-kicked.js", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(config.blogRoot, "session-kicked.js"));
});

app.use(ensureCsrfCookie);     // 确保 CSRF token cookie

// 请求日志
app.use((req, res, next) => {
  logger.debug("http", `${req.method} ${req.url}`);
  next();
});

// ========== 健康检查 ==========
// RISK-09：匿名 /health 旧实现泄露 database(host/port/库名)、OCR 端口、
// 系统平台 / Node 版本 / CPU / 内存等内网拓扑，为后续攻击提供情报。
// 现在对外只回最小存活信号；详细检查移到带 x-sentinel-key 的 /health/detail，
// 供本机 / 内网监控系统（已握有 INGEST_KEY）调用。
app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/health/live", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/health/detail", requireSentinelKey, async (req, res) => {
  try {
    const result = await health.fullHealthCheck();
    res.status(result.status === "ok" ? 200 : 503).json(result);
  } catch (e) {
    logger.error("health", "详细健康检查失败", e.message);
    res.status(503).json({ status: "degraded", timestamp: new Date().toISOString() });
  }
});

// CSRF token 获取接口
app.get("/api/csrf-token", getCsrfToken);

// 8-01：注册验证码下发接口（公开只读，答案不下发）
app.get("/api/captcha", captcha.captchaRoute);

// 8-01：注册接口独立按 IP 限速。全局 300 次/分钟对"批量灌账号"太宽，
// 这里收紧到 10 分钟 5 次；与服务端验证码形成两层，脚本无法无成本重试。
const registerLimiter = createRateLimiter(5, 10 * 60 * 1000);
app.use("/api/register", registerLimiter);

// W2-07：鉴权顺序修正。
// 旧版 CSRF 校验挂在身份校验之前，匿名写操作统一返回 403「CSRF 验证失败」，
// 而不是 401「请先登录」。这既泄露了状态码差异，也让「拿到有效 CSRF token
// 的匿名请求」能推进到下一层。现在对非公开的写操作，先确认登录态再谈 CSRF。
const PUBLIC_WRITE_PATHS = new Set([
  "/register", "/login", "/direct-login", "/logout",
  "/qrcode/generate", "/qrcode/check", "/qrcode/confirm",
  "/qrcode/redeem", "/qrcode/scanned"
]);
function loginFirstGuard(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (PUBLIC_WRITE_PATHS.has(req.path)) return next();
  const token = getTokenFromReq(req);
  const ws = token ? authSession.getWebSession(token) : null;
  if (!ws) {
    // VULN-CONCURRENT-01：被顶号 / 被撤销的会话在所有写接口统一返回 KICKED，
    // 前端 apiFetch 捕获后弹「账号已在其他设备登录」，而不是静默 401。
    // 注意：PUBLIC_WRITE_PATHS（登录/注册/扫码等）已在上面放行，不会被误伤。
    const st = token ? authSession.getSessionStatus(token) : null;
    if (st && st.status === "kicked") return require("./middleware/auth").sendKicked(req, res, st);
    return res.status(401).json({ ok: false, msg: "请先登录" });
  }
  next();
}

// ========== API 路由（鉴权前置 + CSRF 验证） ==========
// AI 代理单独挂在 /api 之前，避免被 authRoutes 的通配挂载吞掉。
app.use("/api/ai", loginFirstGuard, verifyCsrfToken, aiRoutes);
app.use("/api", loginFirstGuard, verifyCsrfToken, authRoutes);
app.use("/api/chatrecord", verifyCsrfToken, chatrecordRoutes);
app.use("/api/projects", verifyCsrfToken, projectsRoutes);
app.use("/api/links", verifyCsrfToken, linksRoutes);
app.use("/api/comments", verifyCsrfToken, commentsRoutes);

// ========== 认证守卫 ==========
const authGate = createAuthGate(authSession.webSessions);

// ========== 公开页面（无需登录） ==========
// 根路径直接跳转到博客首页
app.get(["/", "/index.html"], (req, res) => {
  res.redirect(301, "/blog/");
});
// 登录页单独放在 /login
app.get(["/login", "/login.html"], (req, res) => {
  res.sendFile(path.join(config.blogRoot, "index.html"));
});
app.get("/mobile-confirm.html", (req, res) => {
  res.sendFile(path.join(config.blogRoot, "mobile-confirm.html"));
});
app.get("/chatrecord-share.html", (req, res) => {
  res.sendFile(path.join(config.blogRoot, "chatrecord-share.html"));
});
app.get("/architecture.html", (req, res) => {
  res.sendFile(path.join(config.blogRoot, "architecture.html"));
});

// ========== 需登录页面 ==========
app.get("/projects.html", authGate, (req, res) => {
  res.sendFile(path.join(config.blogRoot, "projects.html"));
});
app.get("/settings.html", authGate, (req, res) => {
  res.sendFile(path.join(config.blogRoot, "settings.html"));
});

// 博客内容（需登录）
//
// 用自研中间件替代 express.static(config.blogContent)：
//   - F-06 / N-10：编码斜杠路径遍历 -> 归一化 + 前缀校验，越界 400
//   - N-08：未登录的静态资源返回 401 JSON，不再伪装成 200 text/html
//   - N-09：统一 private + no-store + Vary: Cookie，杜绝共享缓存串味
app.use("/blog", createBlogStatic({
  root: config.blogContent,
  getToken: getTokenFromReq,
  getSession: (t) => authSession.getWebSession(t)
}));

// 构建方法示例（需登录）
app.use("/build-methods", authGate, express.static(path.join(config.blogRoot, "build-methods")));

// ========== 全局错误处理 ==========
app.use(errorHandler);

// 404 处理
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, msg: "接口不存在" });
  }
  res.status(404).send("404 - 页面不存在");
});

// ========== 启动 ==========
async function start() {
  logger.info("startup", "========================================");
  logger.info("startup", "项目中心服务启动中...");

  // 1. 初始化数据库（建库建表、迁移、内置管理员）
  logger.info("startup", "初始化数据库...");
  const dbOk = await initDatabase(pool);
  if (!dbOk) {
    logger.warn("startup", "数据库初始化失败，将使用内存模式（用户数据可能丢失）");
  }

  // 2. 加载用户数据到内存
  try {
    await authModel.loadAll();
  } catch (e) {
    logger.error("startup", "加载用户数据失败", e);
  }

  // 3. 启动会话清理定时器
  authSession.startCleanup();

  // 4. 启动登录失败锁定清理
  startLoginLockCleanup();

  // 4.0 启动注册验证码过期清理
  captcha.startCleanup();

  // 4.1 启动扫码一次性票据清理
  qrTicket.startCleanup();

  // 4.2 启动在线状态提示的下线标记清理（10 分钟 TTL，定时回收）
  presence.startCleanup();

  // 4.3 修复存量孤儿回复（2.2.8）
  // 旧口径下「已软删但还有活回复」的父评论仍计入 total，页面显示「评论 1」
  // 而列表里那条却是已删除的占位。新口径不再计入软删父评论，
  // 它下面的回复必须提升为顶层，否则会一起从页面消失。
  try {
    const commentsModel = require("./modules/comments/model");
    const fixed = await commentsModel.repairOrphanReplies();
    if (fixed > 0) {
      logger.info("startup", `修复孤儿回复 ${fixed} 条（父评论已软删，提升为顶层）`);
    }
  } catch (e) {
    logger.warn("startup", `孤儿回复修复失败（不影响启动）: ${e.message}`);
  }

  // 5. 初始化 OCR 管理器（可选自动启动）
  try {
    await ocrManager.init();
  } catch (e) {
    logger.warn("startup", "OCR 管理器初始化失败（不影响主功能）", e.message);
  }

  // 6. 启动服务
  app.listen(config.port, config.host, () => {
    logger.info("startup", `服务启动: http://${config.host}:${config.port}`);
    logger.info("startup", `对外地址: ${config.baseURL}`);
    logger.info("startup", `登录页: ${config.baseURL}/`);
    logger.info("startup", `健康检查: ${config.baseURL}/health`);
    logger.info("startup", `数据库: MySQL ${config.db.host}:${config.db.port}/${config.db.database}`);
    logger.info("startup", `环境: ${process.env.NODE_ENV || "development"}`);
    logger.info("startup", `免密白名单: ${process.env.DIRECT_LOGIN_IPS || "(未配置)"}`);
    logger.info("startup", "========================================");
  });
}

start().catch(err => {
  logger.error("startup", "服务启动失败", err);
  process.exit(1);
});

// 优雅关闭
process.on("SIGTERM", async () => {
  logger.info("startup", "收到 SIGTERM，正在关闭...");
  if (sentinelAdapter?.stop) await sentinelAdapter.stop().catch(() => {});
  ocrManager.stopOcrProcess();
  await pool.end().catch(() => {});
  process.exit(0);
});
process.on("SIGINT", async () => {
  logger.info("startup", "收到 SIGINT，正在关闭...");
  if (sentinelAdapter?.stop) await sentinelAdapter.stop().catch(() => {});
  ocrManager.stopOcrProcess();
  await pool.end().catch(() => {});
  process.exit(0);
});
