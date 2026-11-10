/**
 * CSRF 防护中间件
 * 采用 double-submit cookie 模式：
 * 1. 首次访问时生成 CSRF token 存入 cookie
 * 2. 前端从 cookie 读取 token，放入请求头 X-CSRF-Token
 * 3. 服务端比对 cookie 中的 token 和请求头中的 token
 *
 * 适用场景：SameSite Cookie 已提供基础防护，CSRF token 作为纵深防御
 */
const crypto = require("crypto");
const logger = require("../core/logger");

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_BYTES = 32;

// 生成安全随机 token
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

// 判断是否应给 Cookie 加 Secure 标记
//
// 注意：这里必须独立判断，不能复用 FORCE_HTTPS。
// 两者语义完全不同：
//   FORCE_HTTPS  = 应用层是否主动把 http 跳转到 https
//   Secure Cookie = 浏览器是否只在 https 下发送该 Cookie
//
// 典型场景：Nginx 已经负责跳转（应用层 FORCE_HTTPS=false），
// 但站点实际跑在 HTTPS 上，此时 Cookie 仍然必须带 Secure，否则
// Cookie 会以明文在 http 请求中传输，失去保护意义。
//
// 判断顺序：
//   1. 显式 COOKIE_SECURE=true/false 优先
//   2. 有 PUBLIC_BASE_URL 且以 https:// 开头 → 开启
//   3. 生产环境默认开启
//
// 但有一个必须踩住的坑：带 Secure 的 Cookie 在 http 连接上会被浏览器直接丢弃，
// 不写入 document.cookie。此时前端读不到 csrf_token，POST 一律 403。
// 备用地址 http://<ip>/ 、反代漏传 X-Forwarded-Proto 的内网直连都属于这种情况。
// 所以这里再看一眼实际请求协议：确认是 http 且没走 TLS，就不要加 Secure ——
// 加了等于让 Cookie 彻底失效，反而不如不加。
function isSecureRequest(req) {
  const explicit = String(process.env.COOKIE_SECURE || "").toLowerCase();
  const decided = (() => {
    if (explicit === "true") return true;
    if (explicit === "false") return false;
    const base = String(process.env.PUBLIC_BASE_URL || "");
    if (base.startsWith("https://")) return true;
    if (base.startsWith("http://")) return false;
    return process.env.NODE_ENV === "production";
  })();

  if (!decided) return false;
  if (!req) return decided;

  // 已经明确是 https 请求 → 保持 Secure
  if (req.secure) return true;
  // 反代场景下看 X-Forwarded-Proto（受 TRUST_PROXY 控制，Nginx 会覆盖伪造值）
  const proto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  // 确认走的是明文 http：加了 Secure 也存不下来，索性不加，保证功能可用
  if (req.protocol === "http") return false;

  return decided;
}

// 确保请求有 CSRF token cookie（没有则生成）
function ensureCsrfCookie(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // 前端需要读取
      secure: isSecureRequest(req),
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000 // 24 小时
    });
  }
  req.csrfToken = token;
  next();
}

// 验证 CSRF token（对状态变更请求）
function verifyCsrfToken(req, res, next) {
  // 安全方法（GET/HEAD/OPTIONS）不需要验证
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken) {
    logger.warn("csrf", `CSRF token 缺失: ${req.method} ${req.url}`);
    return res.status(403).json({ ok: false, msg: "CSRF 验证失败，请刷新页面重试" });
  }

  // 常量时间比较，防止时序攻击
  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);
  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    logger.warn("csrf", `CSRF token 不匹配: ${req.method} ${req.url}`);
    return res.status(403).json({ ok: false, msg: "CSRF 验证失败，请刷新页面重试" });
  }

  next();
}

// 提供给前端获取 token 的接口（可选，前端也可以直接读 cookie）
//
// 这是前端拿不到 cookie 时的兜底通道，所以必须禁缓存：
// 一旦被浏览器/CDN 缓存住，前端反复拿到的是过期 token，
// 补 token 重试的逻辑就永远修不好问题。
//
// ?fresh=1 时强制重新生成一枚 token 并覆盖 cookie。
// 场景：前端内存里的 token 与 cookie 不同步，导致 403 后重试仍失败。
// 强制换发新 token 能让两端重新对齐。
function getCsrfToken(req, res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0"
  });

  const wantFresh = String(req.query?.fresh || "") === "1";
  if (wantFresh) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isSecureRequest(req),
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000
    });
    req.csrfToken = token;
  }

  res.json({ ok: true, csrfToken: req.csrfToken });
}

module.exports = {
  ensureCsrfCookie,
  verifyCsrfToken,
  getCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
