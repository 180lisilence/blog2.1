/**
 * 安全中间件
 * - HTTPS 强制重定向（生产环境）
 * - 安全响应头（X-Frame-Options, X-Content-Type-Options, CSP 等）
 * - 请求频率限制（简单版）
 */
const logger = require("../core/logger");

// 生产环境强制 HTTPS
function forceHttps(req, res, next) {
  // 只在生产环境启用，本地开发不强制
  if (process.env.NODE_ENV === "production") {
    // 检查 X-Forwarded-Proto（反向代理后）
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    if (proto === "http") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
  }
  next();
}

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
  // 内容安全策略（宽松模式，允许内联脚本和外部资源）
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:; img-src 'self' data: blob: https: http:;"
  );
  next();
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
  createRateLimiter,
  startRateLimitCleanup
};
