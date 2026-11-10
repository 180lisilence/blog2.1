/**
 * 扫码登录票据（qrTicket）
 * ============================================================================
 * 解决 F-01：qid 无归属校验，任何人拿到 qid 就能匿名轮询并取走 webToken。
 *
 * 设计要点
 * ----------
 * 1. qid 生成时，向发起者（PC 浏览器）下发一枚 qrt Cookie：`<qid>.<HMAC>`
 *    - HMAC 密钥与 CSRF 签章同源（CSRF_SECRET / SESSION_SECRET），
 *      因此伪造 qid 归属必须知道服务端密钥，不再是"知道 qid 就能冒充"。
 *    - Cookie 设为 httpOnly，前端 JS 读不到（前端也不需要读）。
 * 2. check 接口必须同时满足：
 *    - 请求携带的 qrt Cookie 签名有效；
 *    - qrt 里的 qid 与 query 里的 qid 完全一致。
 *    缺任一条件一律按"会话无效"处理，不泄露该 qid 是否存在。
 * 3. webToken 绝不出现在轮询响应体里。确认登录后 check 只返回
 *    一次性 ticket（单次消费、30 秒有效），PC 端拿 ticket 调
 *    POST /api/qrcode/redeem 换会话。攻击者即便窃听到 check 的响应，
 *    也因为没有 qrt Cookie 而根本走不到这一步；即便 ticket 泄漏，
 *    也已被 PC 端先消费掉，且 30 秒即失效。
 *
 * 兼容性
 * ----------
 * 旧链路（check 直接下发 webToken）已彻底关闭，不做灰度兼容 ——
 * 保留兼容等于保留漏洞。代价只是用户需要刷新一次登录页拿到新的二维码。
 */
const crypto = require("crypto");
const config = require("../../config");
const logger = require("../../core/logger");

const QR_COOKIE_NAME = "qrt";
const TICKET_TTL_MS = 30 * 1000;

// ========== 签章密钥 ==========
// 与 csrf.js 共用同一套密钥来源，避免再多一个必须单独配置的环境变量。
let cachedKey = null;
function getSigningKey() {
  if (cachedKey) return cachedKey;
  const explicit = process.env.CSRF_SECRET || process.env.SESSION_SECRET || process.env.COOKIE_SECRET;
  if (explicit && explicit.length >= 16) {
    cachedKey = Buffer.from(String(explicit), "utf8");
    return cachedKey;
  }
  cachedKey = crypto.randomBytes(32);
  logger.warn(
    "qr-ticket",
    "未配置 CSRF_SECRET/SESSION_SECRET，扫码票据使用进程随机密钥。"
    + "重启后已发出的二维码会失效，用户刷新页面即可。"
  );
  return cachedKey;
}

function hmac(data) {
  return crypto.createHmac("sha256", getSigningKey()).update(String(data)).digest("hex");
}

// 常量时间字符串比较
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ========== qrt Cookie ==========

/**
 * 为指定 qid 签发票据值
 * @param {string} qid
 * @returns {string} `<qid>.<hmac>`
 */
function issueTicket(qid) {
  return `${qid}.${hmac(`qrt:${qid}`)}`;
}

/**
 * 校验票据值是否是合法的 `qid.*` 结构且签名正确
 * @param {string} value
 * @returns {{ valid: boolean, qid: string }}
 */
function parseTicket(value) {
  if (typeof value !== "string" || !value) return { valid: false, qid: "" };
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { valid: false, qid: "" };
  const qid = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!qid || !/^[0-9a-f]{64}$/i.test(sig)) return { valid: false, qid: "" };
  const expect = hmac(`qrt:${qid}`);
  if (!timingSafeEqualStr(sig, expect)) return { valid: false, qid: "" };
  return { valid: true, qid };
}

/**
 * 校验「本次请求是否为该 qid 的发起者」
 * @param {object} req
 * @param {string} qid
 * @returns {boolean}
 */
function isOwner(req, qid) {
  if (!qid) return false;
  const raw = req?.cookies?.[QR_COOKIE_NAME];
  const parsed = parseTicket(raw);
  if (!parsed.valid) return false;
  return timingSafeEqualStr(parsed.qid, qid);
}

/**
 * 把 qrt Cookie 写入响应
 *
 * 生命周期与二维码一致：二维码过期就没有校验归属的意义了。
 */
function writeTicketCookie(req, res, qid) {
  res.cookie(QR_COOKIE_NAME, issueTicket(qid), {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: "lax",
    path: "/",
    maxAge: config.qrExpireMs
  });
}

/**
 * 清除 qrt Cookie（换取会话成功后立刻删掉，减少暴露面）
 */
function clearTicketCookie(req, res) {
  res.clearCookie(QR_COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "lax", secure: isSecure(req) });
}

// 与 csrf.js 的 isSecureRequest 保持同一判定口径
function isSecure(req) {
  const explicit = String(process.env.COOKIE_SECURE || "").toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  const base = String(process.env.PUBLIC_BASE_URL || "");
  if (base.startsWith("https://")) return true;
  if (base.startsWith("http://")) return false;
  if (!req) return process.env.NODE_ENV === "production";
  if (req.secure) return true;
  const proto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  if (req.protocol === "http") return false;
  return process.env.NODE_ENV === "production";
}

// ========== 一次性换码 ticket ==========

// ticket -> { qid, username, webToken, expireAt, used }
const redeemTickets = new Map();

/**
 * 确认登录成功后，为「已通过归属校验的发起者」生成一次性换码票据。
 * 注意：这里不直接把 webToken 交给轮询响应，webToken 只存在服务端这张表里。
 */
function createRedeemTicket(qid, username) {
  const ticket = crypto.randomBytes(32).toString("hex");
  redeemTickets.set(ticket, {
    qid,
    username,
    webToken: null,
    expireAt: Date.now() + TICKET_TTL_MS,
    used: false
  });
  return ticket;
}

/**
 * 二维码被手机端确认后，把服务端生成的 webToken 关联到票据上
 */
function bindWebToken(ticket, webToken) {
  const t = redeemTickets.get(ticket);
  if (!t) return false;
  t.webToken = webToken;
  return true;
}

/**
 * 消费一次性票据（原子：校验 + 标记已用 + 返回）
 * @returns {{ ok: boolean, reason: string, webToken?: string, username?: string }}
 */
function consumeRedeemTicket(ticket, qid) {
  const t = redeemTickets.get(ticket);
  if (!t) return { ok: false, reason: "invalid" };
  if (t.used) {
    // 已被消费：可能是重放，也可能是 PC 端重复请求。直接销毁。
    redeemTickets.delete(ticket);
    logger.warn("qr-ticket", `换码票据重复使用: qid=${t.qid}`);
    return { ok: false, reason: "used" };
  }
  if (Date.now() > t.expireAt) {
    redeemTickets.delete(ticket);
    return { ok: false, reason: "expired" };
  }
  if (!t.webToken) return { ok: false, reason: "notready" };
  // qid 必须一致：票据是从某个 qid 的会话里长出来的，不能被挪用
  if (qid && !timingSafeEqualStr(t.qid, qid)) {
    logger.warn("qr-ticket", `换码票据 qid 不匹配: expect=${t.qid}, got=${qid}`);
    return { ok: false, reason: "invalid" };
  }
  t.used = true;
  redeemTickets.delete(ticket);
  return { ok: true, webToken: t.webToken, username: t.username };
}

// 定时清理过期票据
function startCleanup() {
  setInterval(() => {
    const now = Date.now();
    let n = 0;
    for (const [k, v] of redeemTickets) {
      if (now > v.expireAt) {
        redeemTickets.delete(k);
        n++;
      }
    }
    if (n > 0) logger.debug("qr-ticket", `清理过期换码票据: ${n} 条`);
  }, 60 * 1000);
}

module.exports = {
  QR_COOKIE_NAME,
  issueTicket,
  parseTicket,
  isOwner,
  writeTicketCookie,
  clearTicketCookie,
  createRedeemTicket,
  bindWebToken,
  consumeRedeemTicket,
  startCleanup,
  TICKET_TTL_MS
};
