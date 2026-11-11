/**
 * 会话管理
 * - 二维码登录会话（loginSessions）
 * - Web 登录态注册表（webSessions）：设备 / IP / UA / 状态，支撑同账号并发登录治理
 * - 登录 / 顶号 / 撤销审计环形缓冲（完整历史由 blog-sentinel 审计后台持久化）
 * - 定时清理过期会话
 *
 * 之所以从「无状态 token + Map」升级为带状态的注册表：
 * VULN-CONCURRENT-01 实测同一账号可 8 台设备无限并存、无互踢、无审计、
 * 无设备列表、无强制下线。修复需要服务端真正认识「这个 token 属于哪台设备、
 * 同账号还有哪些活跃会话」，这些都必须落在服务端注册表里。
 *
 * 兼容约束：sentinel-adapter 包装了 createWebSession / destroyWebSession，
 * 前者必须继续返回 token 字符串、后者继续接受 token，故两者签名保持不变，
 * 仅新增可选参数（meta / reason）。
 */
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const config = require("../../config");
const logger = require("../../core/logger");

// 二维码登录会话：qid -> { status, createAt, expireAt, webToken, username, redeemTicket }
const loginSessions = new Map();

// Web 登录态注册表：webToken -> {
//   username, createAt, issuedAt, expireAt, lastSeen,
//   ip, ua, device, id(短ID，对外脱敏),
//   status: "active" | "revoked", revokeReason, revokedAt
// }
const webSessions = new Map();

// 会话审计环形缓冲：只留内存最近 200 条，供 /api/sessions/audit 查询。
// 完整、持久的登录审计由 blog-sentinel 的 logins / events store 承担。
const AUDIT_MAX = 200;
const sessionAudit = [];

// 被撤销的会话记录保留时长：需覆盖 presence 的 10 分钟 kicked TTL，
// 期间用 getSessionStatus() 把「被顶号」和「从未登录」区分开，返回 401 KICKED。
const REVOKED_KEEP_MS = 10 * 60 * 1000;

function pushAudit(kind, session, extra = {}) {
  sessionAudit.push({
    kind,
    username: String(session?.username || ""),
    sessionId: String(session?.id || ""),
    ip: String(session?.ip || extra.ip || ""),
    device: String(session?.device || ""),
    ua: String(session?.ua || "").slice(0, 200),
    reason: String(extra.reason || session?.revokeReason || ""),
    result: String(extra.result || "ok"),
    at: Date.now()
  });
  if (sessionAudit.length > AUDIT_MAX) {
    sessionAudit.splice(0, sessionAudit.length - AUDIT_MAX);
  }
}

function makeShortId() {
  return crypto.randomBytes(6).toString("hex"); // 12 hex，对外暴露用，不含完整 token
}

// IP 脱敏：IPv4 只留前两段，IPv6 只留前两段，避免设备列表变成内网拓扑图
function maskIp(ip) {
  const s = String(ip || "").trim();
  if (!s) return "";
  if (s.includes(".")) {
    const p = s.split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : s;
  }
  if (s.includes(":")) return s.split(":").slice(0, 2).join(":") + "::";
  return s;
}

// ========== 二维码会话 ==========

function createQrSession() {
  const qid = `QR-${uuidv4()}`;
  const session = {
    qid,
    status: "pending",
    createAt: Date.now(),
    expireAt: Date.now() + config.qrExpireMs,
    webToken: null,
    username: null,
    redeemTicket: null
  };
  loginSessions.set(qid, session);
  return session;
}

function getQrSession(qid) {
  const s = loginSessions.get(qid);
  if (!s) return null;
  if (Date.now() > s.expireAt && s.status !== "confirmed") {
    s.status = "expired";
  }
  return s;
}

// 销毁二维码会话（换取完登录态后立即调用，让 qid 彻底不可用）
function destroyQrSession(qid) {
  return loginSessions.delete(qid);
}

// ========== Web 会话 ==========

// meta: { ip, ua, device } —— 由 sessionPolicy 从请求中提取，设备指纹不信任客户端自报 ID
function createWebSession(username, meta = {}) {
  // 6-02：256 位纯随机不透明令牌，不带任何语义；日志不打印 token
  const webToken = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const session = {
    id: makeShortId(),
    username,
    createAt: now,
    issuedAt: now,
    expireAt: now + config.webTokenExpireMs,
    lastSeen: now,
    ip: String(meta.ip || "").slice(0, 64),
    ua: String(meta.ua || "").slice(0, 300),
    device: String(meta.device || "未知设备").slice(0, 60),
    status: "active"
  };
  webSessions.set(webToken, session);
  pushAudit("login", session);
  logger.info("auth-session", `用户登录: ${username}, device=${session.device}, ip=${session.ip}`);
  return webToken;
}

function getWebSession(token) {
  const s = webSessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expireAt) {
    webSessions.delete(token);
    return null;
  }
  // 被顶号 / 手动撤销的会话不再具备登录态。保留记录是为了
  // getSessionStatus() 能返回 401 KICKED 专用码，而不是笼统的「请先登录」。
  if (s.status !== "active") return null;
  s.lastSeen = Date.now();
  return s;
}

/**
 * 判断 token 的会话状态，用于区分三种失效原因：
 *   active —— 有效会话
 *   kicked —— 因并发登录 / 手动撤销而失效（带 reason）
 *   none   —— 从未存在 / 已过期 / 已清理
 * 这是 401 KICKED 专用码与 presence 顶号提示的数据源。
 */
function getSessionStatus(token) {
  if (!token) return { status: "none" };
  const s = webSessions.get(token);
  if (!s) return { status: "none" };
  const now = Date.now();
  if (s.status === "revoked") {
    if (now - s.revokedAt <= REVOKED_KEEP_MS) {
      return { status: "kicked", reason: s.revokeReason, username: s.username };
    }
    webSessions.delete(token);
    return { status: "none" };
  }
  if (now > s.expireAt) {
    webSessions.delete(token);
    return { status: "none", expired: true };
  }
  return { status: "active", username: s.username };
}

// 扫码 redeem 时用 PC 端真实请求信息刷新会话画像（confirm 阶段只有手机信息）
function touchSession(token, meta = {}) {
  const s = webSessions.get(token);
  if (!s || s.status !== "active") return false;
  if (meta.ip) s.ip = String(meta.ip).slice(0, 64);
  if (meta.ua) s.ua = String(meta.ua).slice(0, 300);
  if (meta.device) s.device = String(meta.device).slice(0, 60);
  s.lastSeen = Date.now();
  return true;
}

function destroyWebSession(token, reason = "") {
  const s = webSessions.get(token);
  if (s) {
    logger.info("auth-session", `会话结束: ${s.username}${reason ? ` (${reason})` : ""}`);
    if (reason) pushAudit("revoke", s, { reason, result: "ok" });
  }
  return webSessions.delete(token);
}

/**
 * 同账号并发登录策略（服务端强制，不依赖客户端存储）：
 *   SESSION_POLICY=single（默认）—— 新登录顶掉该账号全部旧会话
 *   SESSION_POLICY=limit          —— 最多 MAX_ACTIVE_SESSIONS 个活跃会话，超出踢最早登录者
 *   SESSION_POLICY=off            —— 关闭治理（保留并存，仅用于排障）
 * 返回被撤销的 token 数组，由 sessionPolicy 负责写 presence 顶号标记。
 */
function applyConcurrentPolicy(username, keepToken) {
  const policy = String(process.env.SESSION_POLICY || "single").toLowerCase();
  if (policy === "off") return [];
  const rawMax = Number(process.env.MAX_ACTIVE_SESSIONS);
  const max = policy === "limit"
    ? (Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 3)
    : 1;

  const now = Date.now();
  const active = [];
  for (const [token, s] of webSessions) {
    if (s.username !== username || s.status !== "active" || now > s.expireAt) continue;
    if (token === keepToken) continue;
    active.push({ token, s });
  }
  // 最早登录的优先被踢
  active.sort((a, b) => a.s.createAt - b.s.createAt);

  const kickCount = policy === "single"
    ? active.length
    : Math.max(0, active.length - (max - 1));
  const evicted = [];
  for (let i = 0; i < kickCount; i++) {
    const { token, s } = active[i];
    s.status = "revoked";
    s.revokeReason = "concurrent_login";
    s.revokedAt = now;
    evicted.push(token);
    pushAudit("kick", s);
  }
  if (evicted.length) {
    logger.info("auth-session", `[并发治理] ${username} 新登录顶掉 ${evicted.length} 个旧会话 (policy=${policy})`);
  }
  return evicted;
}

// 列出账号的活跃会话（脱敏：短 ID + 掩码 IP，绝不含完整 token）
function listSessions(username, currentToken) {
  const now = Date.now();
  const out = [];
  for (const [token, s] of webSessions) {
    if (s.username !== username || s.status !== "active" || now > s.expireAt) continue;
    out.push({
      id: s.id,
      current: token === currentToken,
      createdAt: s.createAt,
      issuedAt: s.issuedAt,
      lastSeen: s.lastSeen,
      ip: maskIp(s.ip),
      device: s.device,
      ua: s.ua
    });
  }
  out.sort((a, b) => b.lastSeen - a.lastSeen);
  return out;
}

// 按短 ID 撤销指定会话；只能撤销 username 名下的，越权返回 null。
// keepToken 用于排除「当前正在使用的会话」——要退出应走 /api/logout，
// 不能让用户把自己踢下线后误判为被顶号。
function revokeSessionById(username, id, reason = "user_revoke", keepToken = "") {
  const wanted = String(id || "");
  if (!wanted) return null;
  const now = Date.now();
  for (const [token, s] of webSessions) {
    if (s.username !== username || s.status !== "active" || now > s.expireAt) continue;
    if (token === keepToken) continue;
    if (s.id !== wanted) continue;
    s.status = "revoked";
    s.revokeReason = reason;
    s.revokedAt = now;
    pushAudit("revoke", s);
    logger.info("auth-session", `[会话撤销] ${username} 撤销设备 ${s.device} (${reason})`);
    return { token, session: s };
  }
  return null;
}

// 审计查询：不传 username 返回全部（内部/管理员用），传则只看该账号
function getSessionAudit(username, limit = 50) {
  const n = Math.max(1, Math.min(AUDIT_MAX, Number(limit) || 50));
  const rows = username
    ? sessionAudit.filter(a => a.username === String(username))
    : sessionAudit.slice();
  return rows.slice(-n).reverse();
}

// 清理过期会话
function cleanupExpired() {
  const now = Date.now();
  let qrCleaned = 0;
  for (const [qid, s] of loginSessions) {
    if (now > s.expireAt && s.status !== "confirmed") {
      loginSessions.delete(qid);
      qrCleaned++;
    }
  }
  let webCleaned = 0;
  for (const [token, s] of webSessions) {
    if (now > s.expireAt || (s.status === "revoked" && now - s.revokedAt > REVOKED_KEEP_MS)) {
      webSessions.delete(token);
      webCleaned++;
    }
  }
  if (qrCleaned > 0 || webCleaned > 0) {
    logger.debug("auth-session", `清理过期会话: QR=${qrCleaned}, Web=${webCleaned}`);
  }
}

// 启动定时清理（每 5 分钟）
function startCleanup() {
  setInterval(cleanupExpired, 5 * 60 * 1000);
  logger.info("auth-session", "会话清理定时器已启动（每5分钟）");
}

module.exports = {
  loginSessions,
  webSessions,
  createQrSession,
  getQrSession,
  destroyQrSession,
  createWebSession,
  getWebSession,
  getSessionStatus,
  touchSession,
  destroyWebSession,
  applyConcurrentPolicy,
  listSessions,
  revokeSessionById,
  getSessionAudit,
  cleanupExpired,
  startCleanup
};
