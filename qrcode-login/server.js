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
app.use(ensureCsrfCookie);     // 确保 CSRF token cookie

// 请求日志
app.use((req, res, next) => {
  logger.debug("http", `${req.method} ${req.url}`);
  next();
});

// ========== 健康检查（无需登录，无需 CSRF） ==========
app.get("/health", async (req, res) => {
  const result = await health.fullHealthCheck();
  const statusCode = result.status === "ok" ? 200 : 503;
  res.status(statusCode).json(result);
});
app.get("/health/live", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// CSRF token 获取接口
app.get("/api/csrf-token", getCsrfToken);

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
  if (!ws) return res.status(401).json({ ok: false, msg: "请先登录" });
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
app.get(["/", "/index.html", "/login", "/login.html"], (req, res) => {
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

  // 4.1 启动扫码一次性票据清理
  qrTicket.startCleanup();

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
  ocrManager.stopOcrProcess();
  await pool.end().catch(() => {});
  process.exit(0);
});
process.on("SIGINT", async () => {
  logger.info("startup", "收到 SIGINT，正在关闭...");
  ocrManager.stopOcrProcess();
  await pool.end().catch(() => {});
  process.exit(0);
});
