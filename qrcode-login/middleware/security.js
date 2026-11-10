/**
 * 安全中间件
 * - HTTPS 强制重定向（生产环境）
 * - 安全响应头（CSP / X-Frame-Options / 权限策略 / 跨源隔离）
 * - 请求频率限制
 * - CORS 白名单（F-11）
 */
const logger = require("../core/logger");

// 生产环境强制 HTTPS
// 仅在同时满足以下条件时启用：
//   1. NODE_ENV=production
//   2. 未显式设置 FORCE_HTTPS=false
// 说明：只有公网 IP、无证书的部署必须设置 FORCE_HTTPS=false，
// 否则所有请求会被 301 到 https://，而该地址无服务，形成死循环。
function forceHttps(req, res, next) {
  const disabled = String(process.env.FORCE_HTTPS || "").toLowerCase() === "false";
  if (process.env.NODE_ENV === "production" && !disabled) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    if (proto === "http") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
  }
  next();
}

// ========== CSP 构建 ==========
//
// F-11 的问题：
//   default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:
//   - 'unsafe-eval'：允许 eval / new Function，任何字符串拼进 eval 就是 RCE 级 XSS
//   - https: http:：任意域名的脚本都能加载，CSP 等于没写
//
// 现实约束：本站前端大量使用内联 <script> 和内联 style，全量拆出去成本极高
// 且容易回归。所以采取"分阶段收紧"策略：
//
//   CSP_MODE=strict（默认）
//     - 保留 'unsafe-inline'（内联脚本/样式必须，短期无法消除）
//     - 移除 'unsafe-eval'（全站已确认无 eval / new Function 依赖）
//     - script-src 不再放开 https: / http: 通配，改由 CSP_SCRIPT_HOSTS 显式列白名单
//     - img-src / media-src / font-src 仍可放开 https: data:（只影响资源加载，不执行代码）
//
//   CSP_MODE=report
//     与 strict 相同，但额外输出 Report-Only 头，便于灰度观察是否误杀
//
//   CSP_MODE=legacy
//     回退到旧的宽松策略（仅在紧急排障时使用）
// N-05 / W1-04：1.0 复测指出「页面已不用外部脚本，却仍放行 5 个 CDN 域」。
// 本轮把最后一个真实外链也消掉了：
//   - restaurant 的 tailwind / font-awesome 上一轮已本地化
//   - zonglan/stats.html 的 echarts 已下载到 assets/lib/ 并加 SRI
// 因此默认 script-src 不再放行**任何**外部域。
// 若将来临时需要外部脚本，用 CSP_SCRIPT_HOSTS 显式列出（应急，不默认开）。
const CDN_HOSTS_DEFAULT = [];

// zonglan 的字体 CSS 来自 miaoda.feishu.cn（加载的是 CSS，不是脚本）。
// 旧 CSP 把它错放在 script-src 里，而 style-src 只有 'self' —— 字体其实
// 一直被拦着没生效。这里放到 style-src 精确白名单，功能恢复且不放宽脚本。
const STYLE_HOSTS_DEFAULT = ["https://miaoda.feishu.cn"];

function buildCsp() {
  const mode = String(process.env.CSP_MODE || "strict").toLowerCase();

  if (mode === "legacy") {
    return "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:; "
      + "img-src 'self' data: blob: https: http:;";
  }

  const extraHosts = String(process.env.CSP_SCRIPT_HOSTS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const scriptHosts = Array.from(new Set([...CDN_HOSTS_DEFAULT, ...extraHosts])).join(" ");
  const styleHosts = Array.from(new Set(STYLE_HOSTS_DEFAULT)).join(" ");

  return [
    "default-src 'self'",
    // 脚本：同源 + 内联（暂留），默认零外部域
    `script-src 'self' 'unsafe-inline'${scriptHosts ? " " + scriptHosts : ""}`,
    // 样式：同源 + 内联 + 字体 CSS 精确域名
    `style-src 'self' 'unsafe-inline'${styleHosts ? " " + styleHosts : ""}`,
    // 图片/字体/媒体：允许 https 与 data:（这些不执行代码）
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "media-src 'self' data: blob: https:",
    // 连接：仅同源（前端不该直连第三方 —— 见 N-06）
    "connect-src 'self'",
    // 禁止被任何页面嵌套（配合 X-Frame-Options）
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:"
  ].join("; ");
}

const CSP_VALUE = buildCsp();

// 安全响应头
function securityHeaders(req, res, next) {
  // 防止点击劫持
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // 防止 MIME 类型嗅探
  res.setHeader("X-Content-Type-Options", "nosniff");
  // XSS 防护（旧浏览器）
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // 引用策略
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // 权限策略：本站不需要摄像头/麦克风/定位/支付等
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
    + "magnetometer=(), gyroscope=(), accelerometer=(), display-capture=()"
  );

  // 跨源隔离（F-11 提到缺失）
  // 注意：COOP 会切断 opener 关系，本站没有 window.opener 依赖，可以安全开启。
  // COEP 不开 —— require-corp 会让所有未带 CORP 头的外部资源（CDN 图片等）加载失败。
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // CSP：strict 模式直接下发强制策略
  const mode = String(process.env.CSP_MODE || "strict").toLowerCase();
  if (mode === "report") {
    res.setHeader("Content-Security-Policy-Report-Only", CSP_VALUE);
  }
  res.setHeader("Content-Security-Policy", CSP_VALUE);

  next();
}

// ========== CORS 白名单（F-11） ==========
//
// 默认不下发任何 CORS 头：同源部署（Nginx 反代 / 同域）压根不需要 CORS。
// 只有 Origin 命中 CORS_ORIGINS 白名单时才回显，且带 Vary: Origin 防缓存串味。
//
// 显式拒绝 `Access-Control-Allow-Origin: *`：
// 与 Cookie 鉴权共存时，通配让任何站点都能发起跨域请求，
// 一旦将来 F-02 类缺陷复现，就是放大器。
function createCorsPolicy() {
  return function corsPolicy(req, res, next) {
    const origin = req.headers.origin;
    if (!origin) return next();

    const allowList = String(process.env.CORS_ORIGINS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    // 同源请求本来不需要 CORS 头（Origin 存在但同源的情况浏览器也不会校验）
    if (allowList.length === 0) {
      // 不下发任何 Access-Control-* 头
      return next();
    }

    res.setHeader("Vary", "Origin, Accept-Encoding");

    if (allowList.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token,Authorization");
      res.setHeader("Access-Control-Max-Age", "600");
      if (req.method === "OPTIONS") return res.status(204).end();
    } else {
      // 不在白名单：预检直接拒，普通请求不带 CORS 头（浏览器自然拒绝读取响应）
      if (req.method === "OPTIONS") {
        logger.warn("security", `CORS 预检被拒: origin=${origin}, path=${req.originalUrl}`);
        return res.status(403).json({ ok: false, msg: "来源不在允许列表" });
      }
    }
    next();
  };
}

// 简单请求频率限制（按 IP）
function createRateLimiter(maxRequests = 100, windowMs = 60000) {
  const requests = new Map(); // ip -> { count, resetTime }

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now > record.resetTime) {
      requests.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      logger.warn("security", `请求频率超限: ${ip}, count=${record.count}`);
      return res.status(429).json({
        ok: false,
        msg: "请求过于频繁，请稍后再试"
      });
    }
    next();
  };
}

// 清理过期的频率限制记录（每 10 分钟）
function startRateLimitCleanup(rateLimiterMap) {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimiterMap) {
      if (now > record.resetTime) rateLimiterMap.delete(ip);
    }
  }, 10 * 60 * 1000);
}

module.exports = {
  forceHttps,
  securityHeaders,
  createCorsPolicy,
  createRateLimiter,
  startRateLimitCleanup,
  CSP_VALUE
};
