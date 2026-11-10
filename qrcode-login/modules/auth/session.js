/**
 * 会话管理
 * - 二维码登录会话（loginSessions）
 * - Web 登录态会话（webSessions）
 * - 定时清理过期会话
 */
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const config = require("../../config");
const logger = require("../../core/logger");

// 二维码登录会话：qid -> { status, createAt, expireAt, webToken, username, redeemTicket }
const loginSessions = new Map();

// Web 登录态：webToken -> { username, createAt, expireAt }
const webSessions = new Map();

// 创建二维码会话
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

// 获取二维码会话
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

// 创建 Web 登录态
function createWebSession(username) {
  // 6-02：旧 token 带 `SELF-LOGIN-` 前缀，等于在 Cookie / 日志 / 分享出去的
  // 截图里免费标注「这是本站自助签发的长期会话」，还泄露了签发路径。
  // 换成 256 位纯随机不透明令牌，不带任何语义。
  // 同时日志不再打印 token 片段，避免凭据残留在 pm2 logs / 日志采集里。
  const webToken = crypto.randomBytes(32).toString("base64url");
  const session = {
    username,
    createAt: Date.now(),
    expireAt: Date.now() + config.webTokenExpireMs
  };
  webSessions.set(webToken, session);
  logger.info("auth-session", `用户登录: ${username}`);
  return webToken;
}

// 获取 Web 会话
function getWebSession(token) {
  const s = webSessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expireAt) {
    webSessions.delete(token);
    return null;
  }
  return s;
}

// 销毁 Web 会话
function destroyWebSession(token) {
  const s = webSessions.get(token);
  if (s) {
    logger.info("auth-session", `用户登出: ${s.username}`);
  }
  return webSessions.delete(token);
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
    if (now > s.expireAt) {
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
  destroyWebSession,
  cleanupExpired,
  startCleanup
};
