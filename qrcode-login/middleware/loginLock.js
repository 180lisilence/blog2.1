/**
 * 登录失败锁定中间件
 * - 按 IP + 用户名记录失败次数
 * - 连续失败 MAX_ATTEMPTS 次后锁定 LOCK_DURATION_MS
 * - 登录成功后清除该 IP+用户名的失败记录
 * - 定期清理过期记录
 */
const logger = require("../core/logger");

const MAX_ATTEMPTS = 5; // 最大失败次数
const LOCK_DURATION_MS = 5 * 60 * 1000; // 锁定时长：5 分钟
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 清理间隔：10 分钟

// key: `${ip}:${username}` -> { count, lockUntil }
const failRecords = new Map();

// 获取客户端 IP
function getClientIp(req) {
  return req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.connection?.remoteAddress || "unknown";
}

// 检查是否被锁定
function isLocked(ip, username) {
  const key = `${ip}:${username}`;
  const record = failRecords.get(key);
  if (!record) return { locked: false, remaining: MAX_ATTEMPTS };
  if (record.lockUntil && Date.now() < record.lockUntil) {
    const remainSec = Math.ceil((record.lockUntil - Date.now()) / 1000);
    return { locked: true, remainSec };
  }
  return { locked: false, remaining: Math.max(0, MAX_ATTEMPTS - record.count) };
}

// 记录一次失败
function recordFailure(ip, username) {
  const key = `${ip}:${username}`;
  const record = failRecords.get(key) || { count: 0, lockUntil: 0 };
  record.count++;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockUntil = Date.now() + LOCK_DURATION_MS;
    logger.warn("login-lock", `账号锁定: ip=${ip}, username=${username}, 失败${record.count}次, 锁定5分钟`);
  }
  failRecords.set(key, record);
  return {
    locked: record.count >= MAX_ATTEMPTS,
    remaining: Math.max(0, MAX_ATTEMPTS - record.count),
    remainSec: record.count >= MAX_ATTEMPTS ? LOCK_DURATION_MS / 1000 : 0
  };
}

// 登录成功后清除记录
function clearFailure(ip, username) {
  const key = `${ip}:${username}`;
  failRecords.delete(key);
}

// 登录前置检查中间件（用于 /api/login 路由）
function loginLockCheck(req, res, next) {
  const ip = getClientIp(req);
  const username = String(req.body?.username || "").trim();
  if (!username) return next(); // 没有用户名，后续逻辑会处理

  const status = isLocked(ip, username);
  if (status.locked) {
    logger.warn("login-lock", `拒绝登录（锁定中）: ip=${ip}, username=${username}, 剩余${status.remainSec}秒`);
    return res.status(429).json({
      ok: false,
      msg: `尝试次数过多，请 ${status.remainSec} 秒后再试`,
      remainSec: status.remainSec
    });
  }
  req.loginIp = ip;
  req.loginUsername = username;
  next();
}

// 定期清理过期记录
function startCleanup() {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, record] of failRecords) {
      if (record.lockUntil && now > record.lockUntil && record.count >= MAX_ATTEMPTS) {
        // 锁定已过期，重置计数
        failRecords.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug("login-lock", `清理过期锁定记录: ${cleaned} 条`);
    }
  }, CLEANUP_INTERVAL);
}

// 获取锁定状态（用于管理接口）
function getLockStatus(ip, username) {
  return isLocked(ip, username);
}

module.exports = {
  loginLockCheck,
  recordFailure,
  clearFailure,
  startCleanup,
  getLockStatus,
  MAX_ATTEMPTS,
  LOCK_DURATION_MS
};
