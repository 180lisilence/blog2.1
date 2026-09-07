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

// 确保请求有 CSRF token cookie（没有则生成）
function ensureCsrfCookie(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // 前端需要读取
      secure: process.env.NODE_ENV === "production",
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
function getCsrfToken(req, res) {
  res.json({ ok: true, csrfToken: req.csrfToken });
}

module.exports = {
  ensureCsrfCookie,
  verifyCsrfToken,
  getCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
