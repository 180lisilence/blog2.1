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

// ========== token 签章 ==========
//
// 单纯 randomBytes 出来的 token 有一个弱点：服务端没记住它，就无法分辨
// "这串字符是我发的"还是"攻击者自己编的"。所以加一道 HMAC 签章。
//
// 签名密钥来源（按优先级）：
//   1. CSRF_SECRET 环境变量（推荐，多实例部署必须显式设置且保持一致）
//   2. 从 SESSION_SECRET / COOKIE_SECRET 派生
//   3. 兜底：进程启动时随机生成（注意：多进程/重启后旧 token 会失效，
//      单进程部署没问题，多实例部署必须配 CSRF_SECRET）
const SIG_LEN = 16; // 签章截断到 16 字节（32 hex），够用且不撑大 cookie

let cachedSecret = null;
function getSigningKey() {
  if (cachedSecret) return cachedSecret;

  const explicit = process.env.CSRF_SECRET || process.env.SESSION_SECRET || process.env.COOKIE_SECRET;
  if (explicit && explicit.length >= 16) {
    cachedSecret = Buffer.from(String(explicit), "utf8");
    return cachedSecret;
  }

  // 兜底：进程级随机密钥
  cachedSecret = crypto.randomBytes(32);
  logger.warn(
    "csrf",
    "未配置 CSRF_SECRET/SESSION_SECRET，使用进程随机密钥。"
    + "多实例部署或重启后，已发出的 token 会全部失效（前端会自动补 token 重试）。"
  );
  return cachedSecret;
}

function signToken(body) {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(String(body))
    .digest("hex")
    .slice(0, SIG_LEN * 2);
}

// 签发一个带签名的 token：<32字节随机hex>.<32位签章hex>
function issueToken() {
  const body = generateToken();
  return body + "." + signToken(body);
}

// 校验签名是否有效
function isSignedToken(token) {
  if (typeof token !== "string") return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // 随机部分必须是 64 位 hex，签章必须是 32 位 hex，先做格式校验省一次 HMAC
  if (!/^[0-9a-f]{64}$/i.test(body)) return false;
  if (!new RegExp("^[0-9a-f]{" + SIG_LEN * 2 + "}$", "i").test(sig)) return false;
  if (sig.length === 0) return false;

  const expect = signToken(body);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expect, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 旧 token（无签名）不再兼容，见 verifyCsrfToken 的说明。


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

const CSRF_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 小时

// 写 csrf_token cookie 的统一出口，保证各处的属性一致
function writeCsrfCookie(req, res, token) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // 前端需要读取
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: CSRF_COOKIE_MAX_AGE
  });
}

// 确保请求有 CSRF token cookie（没有则签发一个带签名的）
function ensureCsrfCookie(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE_NAME];

  // 没有 token，或者是历史上遗留下来的旧格式 token（无签名）→ 立刻换成签名版。
  // 旧 token 在这里主动升级，用户下一次请求就已经是新 token 了，
  // 不用等前端走 403 → 补 token → 重试那一轮。
  if (!token || !isSignedToken(token)) {
    token = issueToken();
    writeCsrfCookie(req, res, token);
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

  // 1) 双向一致性（double-submit 的基础）
  // 常量时间比较，防止时序攻击
  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);
  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    logger.warn("csrf", `CSRF token 不匹配: ${req.method} ${req.url}`);
    return res.status(403).json({ ok: false, msg: "CSRF 验证失败，请刷新页面重试" });
  }

  // 2) 签发有效性（加固）
  //
  // 只比 cookie 与 header 是否相同是不够的：攻击者只要能往受害者浏览器里
  // 写入一个自己知道的 csrf_token（子域 cookie 注入、同站 XSS 前置等），
  // 就能构造"两边都是同一个任意字符串"的请求，一致性校验照样通过。
  // 所以 token 必须能证明是服务端签发的 —— 这里用 HMAC 签章校验。
  //
  // 不设宽限期：旧格式 token 一律拒绝。
  // 代价只是第一次写请求多一次往返（前端收到 403 会自动 ?fresh=1 换 token 重试），
  // 用户无感。设宽限期反而会让"任意伪造 token 在过渡期内可通行"，
  // 等于加固在过渡期完全失效 —— 不值得。
  if (!isSignedToken(cookieToken)) {
    logger.warn("csrf", `CSRF token 未签名/签名无效: ${req.method} ${req.url}`);
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

  // 存量旧格式 token（无签名）也在这里静默升级成签名版：
  // 前端每次补 token 都是一次换发机会，不必等 cookie 自然过期。
  const current = req.csrfToken;
  const needUpgrade = current && !isSignedToken(current);

  if (wantFresh || needUpgrade) {
    const token = issueToken();
    writeCsrfCookie(req, res, token);
    req.csrfToken = token;
  }

  res.json({ ok: true, csrfToken: req.csrfToken });
}

module.exports = {
  ensureCsrfCookie,
  verifyCsrfToken,
  getCsrfToken,
  isSignedToken,
  issueToken,
  writeCsrfCookie,
  isSecureRequest,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
