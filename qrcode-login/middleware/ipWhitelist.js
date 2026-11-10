/**
 * IP 白名单中间件
 * 用于限制敏感接口（如免密直登）只能被指定来源调用
 *
 * 配置方式（.env）：
 *   TRUSTED_IPS=127.0.0.1,::1,192.168.1.0/24,206.187.214.190
 *   支持单个 IP 与 CIDR 网段，逗号分隔
 *   留空 = 不限制（仅建议本机开发环境）
 *
 * 注意：经反向代理后需正确解析真实 IP，
 * 由 app.set("trust proxy") 与 X-Forwarded-For 共同决定。
 */
const logger = require("../core/logger");

// 规范化 IPv6 映射的 IPv4 地址（::ffff:1.2.3.4 -> 1.2.3.4）
function normalizeIp(ip) {
  if (!ip) return "";
  let s = String(ip).trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  // 去掉 IPv6 zone id，如 fe80::1%eth0
  const pct = s.indexOf("%");
  if (pct !== -1) s = s.slice(0, pct);
  return s;
}

// IPv4 转整数
function ipv4ToLong(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// 判断单个 IP 是否命中单条规则（支持精确匹配与 CIDR）
function matchRule(ip, rule) {
  const r = normalizeIp(rule);
  if (!r) return false;
  if (r === ip) return true;

  // 通配符 *
  if (r === "*") return true;

  // CIDR 匹配（仅 IPv4）
  if (r.includes("/")) {
    const [base, bitsRaw] = r.split("/");
    const bits = Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const baseLong = ipv4ToLong(base);
    const ipLong = ipv4ToLong(ip);
    if (baseLong === null || ipLong === null) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (baseLong & mask) === (ipLong & mask);
  }

  return false;
}

// 解析环境变量为规则数组
function parseTrustedList(raw) {
  return String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 创建 IP 白名单中间件
 * @param {Object} options
 * @param {string} options.envKey  环境变量名，默认 TRUSTED_IPS
 * @param {boolean} options.allowAllWhenEmpty  列表为空时是否放行（默认 true，便于本地开发）
 * @param {string} options.label  日志标识
 */
function createIpWhitelist(options = {}) {
  const envKey = options.envKey || "TRUSTED_IPS";
  const allowAllWhenEmpty = options.allowAllWhenEmpty !== false;
  const label = options.label || "ip-whitelist";

  return function ipWhitelist(req, res, next) {
    const rules = parseTrustedList(process.env[envKey]);

    // 列表为空：按配置决定放行或拒绝
    if (rules.length === 0) {
      if (allowAllWhenEmpty) {
        req.ipTrusted = false;
        return next();
      }
      logger.warn(label, `白名单为空且策略为拒绝，拦截 ${req.ip}`);
      return res.status(403).json({ ok: false, msg: "该接口未开放" });
    }

    // req.ip 受 trust proxy 影响，取 Express 解析后的结果
    const clientIp = normalizeIp(req.ip || req.socket?.remoteAddress || "");
    const hit = rules.some(rule => matchRule(clientIp, rule));

    if (hit) {
      req.ipTrusted = true;
      return next();
    }

    logger.warn(label, `来源 IP 不在白名单: ${clientIp} -> ${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      ok: false,
      msg: "该入口仅限受信任网络访问"
    });
  };
}

/**
 * 判断某 IP 是否在白名单内（不拦截，仅判断）
 * 用于业务层做分支处理
 */
function isTrustedIp(ip, rules) {
  const clientIp = normalizeIp(ip);
  const list = Array.isArray(rules) ? rules : parseTrustedList(rules);
  if (list.length === 0) return false;
  return list.some(rule => matchRule(clientIp, rule));
}

module.exports = {
  createIpWhitelist,
  isTrustedIp,
  normalizeIp,
  matchRule,
  parseTrustedList
};
