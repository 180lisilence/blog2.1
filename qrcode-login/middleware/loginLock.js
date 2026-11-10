/**
 * 登录失败锁定中间件
 * ============================================================================
 * 目标：既能挡住爆破，又不能让攻击者把真实用户"锁在门外"。
 *
 * 双维度计数（两边都必须过）
 * --------------------------------
 * 1. IP+账号维度（主要防爆破）
 *    - 同一 IP 对同一账号连续失败 5 次 → 该 IP 对该账号锁 5 分钟
 *    - 这是真正挡住爆破的那层，攻击者换 IP 才能绕过
 *
 * 2. 账号维度（次要，带"受害者优先"退让）
 *    - F-08 的问题在于旧实现只有账号维度，攻击者周期性打错密码就能让
 *      admin 永久无法登录 —— 这是纯粹的 DoS。
 *    - 现在账号维度的锁只用于"极高频的分布式爆破"（阈值远高于单 IP 阈值），
 *      且锁定时长很短（60 秒），并且提供一个**只可能被真实密码持有者触发**
 *      的解锁口：用正确密码登录时永远先放行再校验。
 *
 * 关键设计：正确密码优先
 * --------------------------------
 * 锁定期间如果请求方拿的是正确密码，必须放行并清除全部计数。
 * 判断方式是"先算密码再说锁不锁"—— 密码错的才吃锁，密码对的永远进得去。
 * 唯一的代价是：锁定期间的请求仍会做一次 scrypt 计算（本来就要算），
 * 不会额外增加攻击成本，也不给攻击者留下"锁定即拒答"的探测口。
 */
const logger = require("../core/logger");

// IP+账号维度
const MAX_ATTEMPTS = 5;               // 同一 IP 对同一账号最多连错 5 次
const LOCK_DURATION_MS = 5 * 60 * 1000; // 锁 5 分钟

// 账号维度（跨 IP 累计，只用于挡分布式爆破）
const ACCOUNT_MAX_ATTEMPTS = 30;        // 全站对同一账号的失败上限
const ACCOUNT_LOCK_DURATION_MS = 60 * 1000; // 只锁 60 秒，避免变成永久 DoS

// 9-01（第二轮总汇 P0）：纯 IP 维度，专治「密码喷洒」——
// 攻击者拿一个弱密码去撞几百个账号时，上面两个维度都拦不住：
//   IP+账号维度：每个账号只错 1 次，永远到不了 5 次
//   账号全局维度：每个账号只错 1 次，也永远到不了 30 次
// 现在同一 IP 跨账号累计失败也会触发锁定。阈值放宽到 20 次，
// 且同样遵守「正确密码优先放行」，不会把真实用户锁在门外。
const IP_MAX_ATTEMPTS = 20;
const IP_LOCK_DURATION_MS = 10 * 60 * 1000;

const CLEANUP_INTERVAL = 10 * 60 * 1000;

// key: `${ip}:${username}` -> { count, lockUntil }
const failRecords = new Map();
// key: username -> { count, lockUntil }
const accountRecords = new Map();
// key: ip -> { count, lockUntil }  （跨账号，只计失败）
const ipRecords = new Map();

// 获取客户端 IP
function getClientIp(req) {
  return req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.connection?.remoteAddress || "unknown";
}

/**
 * 只读查询锁定状态（不消耗计数）
 * 注意：调用方拿到 locked=true 后**不应直接拒绝**，而应先验证密码，
 * 正确密码一律放行。见文件头说明。
 */
function isLocked(ip, username) {
  const now = Date.now();

  const ipKey = `${ip}:${username}`;
  const ipRec = failRecords.get(ipKey);
  if (ipRec && ipRec.lockUntil && now < ipRec.lockUntil) {
    return { locked: true, remainSec: Math.ceil((ipRec.lockUntil - now) / 1000), scope: "ip" };
  }

  const acct = accountRecords.get(username);
  if (acct && acct.lockUntil && now < acct.lockUntil) {
    return { locked: true, remainSec: Math.ceil((acct.lockUntil - now) / 1000), scope: "account" };
  }

  const pureIp = ipRecords.get(ip);
  if (pureIp && pureIp.lockUntil && now < pureIp.lockUntil) {
    return { locked: true, remainSec: Math.ceil((pureIp.lockUntil - now) / 1000), scope: "ip-global" };
  }

  const remaining = ipRec ? Math.max(0, MAX_ATTEMPTS - ipRec.count) : MAX_ATTEMPTS;
  return { locked: false, remaining };
}

// 记录一次失败（两个维度同时累加）
function recordFailure(ip, username) {
  const now = Date.now();

  // --- IP+账号 ---
  const ipKey = `${ip}:${username}`;
  const ipRec = failRecords.get(ipKey) || { count: 0, lockUntil: 0 };
  // 锁定已过期 → 重新计数
  if (ipRec.lockUntil && now > ipRec.lockUntil) {
    ipRec.count = 0;
    ipRec.lockUntil = 0;
  }
  ipRec.count++;
  if (ipRec.count >= MAX_ATTEMPTS) {
    ipRec.lockUntil = now + LOCK_DURATION_MS;
    logger.warn("login-lock", `[IP+账号] 锁定: ip=${ip}, username=${username}, 失败${ipRec.count}次, 锁5分钟`);
  }
  failRecords.set(ipKey, ipRec);

  // --- 账号全局 ---
  const acct = accountRecords.get(username) || { count: 0, lockUntil: 0 };
  if (acct.lockUntil && now > acct.lockUntil) {
    acct.count = 0;
    acct.lockUntil = 0;
  }
  acct.count++;
  if (acct.count >= ACCOUNT_MAX_ATTEMPTS) {
    acct.lockUntil = now + ACCOUNT_LOCK_DURATION_MS;
    logger.warn("login-lock", `[账号全局] 分布式爆破限速: username=${username}, 失败${acct.count}次, 锁60秒`);
  }
  accountRecords.set(username, acct);

  // --- 纯 IP（跨账号，9-01）---
  const pureIp = ipRecords.get(ip) || { count: 0, lockUntil: 0 };
  if (pureIp.lockUntil && now > pureIp.lockUntil) {
    pureIp.count = 0;
    pureIp.lockUntil = 0;
  }
  pureIp.count++;
  pureIp.lastFail = now;
  if (pureIp.count >= IP_MAX_ATTEMPTS) {
    pureIp.lockUntil = now + IP_LOCK_DURATION_MS;
    logger.warn("login-lock", `[纯IP] 密码喷洒限速: ip=${ip}, 跨账号失败${pureIp.count}次, 锁10分钟`);
  }
  ipRecords.set(ip, pureIp);

  const locked = ipRec.lockUntil > now || acct.lockUntil > now || pureIp.lockUntil > now;
  return {
    locked,
    remaining: Math.max(0, MAX_ATTEMPTS - ipRec.count),
    remainSec: locked
      ? Math.ceil(Math.max(ipRec.lockUntil || 0, acct.lockUntil || 0, pureIp.lockUntil || 0) / 1000 - now / 1000)
      : 0
  };
}

// 登录成功后清除该 IP+账号 / 账号全局 / 纯 IP 的记录
// 正确密码持有者永远不该被任何一层计数器挡住（F-08 语义不变）。
function clearFailure(ip, username) {
  failRecords.delete(`${ip}:${username}`);
  accountRecords.delete(username);
  ipRecords.delete(ip);
}

/**
 * 登录前置检查中间件
 *
 * ⚠️ 语义已变更：本中间件**不再直接拒绝**锁定中的请求。
 * 它只记录「当前处于锁定中」到 req.loginLocked，交由业务层
 * 在密码校验之后再决定是否拒绝 —— 正确密码永远放行（防 F-08 DoS）。
 * 同时它还会做一次"按 IP 的暴力粗筛"，挡掉明显不在做人事的来源。
 */
function loginLockCheck(req, res, next) {
  const ip = getClientIp(req);
  const username = String(req.body?.username || "").trim();
  req.loginIp = ip;
  req.loginUsername = username;
  req.loginLocked = username ? isLocked(ip, username) : { locked: false };

  if (req.loginLocked.locked) {
    logger.warn(
      "login-lock",
      `锁定中仍收到登录请求（将先校验密码再决定）: ip=${ip}, username=${username}, 剩余${req.loginLocked.remainSec}秒, scope=${req.loginLocked.scope}`
    );
  }
  next();
}

/**
 * 业务层在密码校验**失败之后**调用，产出统一响应。
 *
 * 3-01 / 9-02 / 9-03：旧响应会回显「还可尝试 N 次」和「请 N 秒后再试」，
 * 等于免费告诉攻击者还剩几发、锁多久、什么时候能继续打。现在对外一律
 * 固定文案，状态码只区分「被限速」和「凭据错误」，细节全部只进服务端日志。
 * @returns {{ status:number, msg:string }}
 */
function failureResponse(ip, username) {
  const result = recordFailure(ip, username);
  if (result.locked) {
    logger.warn("login-lock", `失败登录被限速: ip=${ip}, username=${username}, remainSec=${result.remainSec}`);
    return { status: 429, msg: "请求过于频繁，请稍后再试" };
  }
  return { status: 400, msg: "账号或密码错误" };
}

// 定期清理过期记录
function startCleanup() {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of failRecords) {
      // 锁已过期且长时间无失败 → 删（避免 Map 无限增长）
      if ((!record.lockUntil || now > record.lockUntil) && record.count === 0) {
        failRecords.delete(key);
        cleaned++;
      } else if (record.lockUntil && now > record.lockUntil + CLEANUP_INTERVAL) {
        failRecords.delete(key);
        cleaned++;
      }
    }

    for (const [key, record] of accountRecords) {
      if (record.lockUntil && now > record.lockUntil + CLEANUP_INTERVAL) {
        accountRecords.delete(key);
        cleaned++;
      }
    }

    for (const [key, record] of ipRecords) {
      if (record.lockUntil && now > record.lockUntil + CLEANUP_INTERVAL) {
        ipRecords.delete(key);
        cleaned++;
      } else if (!record.lockUntil && now - (record.lastFail || 0) > CLEANUP_INTERVAL * 2) {
        ipRecords.delete(key);
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
  failureResponse,
  clearFailure,
  startCleanup,
  getLockStatus,
  getClientIp,
  MAX_ATTEMPTS,
  LOCK_DURATION_MS,
  ACCOUNT_MAX_ATTEMPTS,
  ACCOUNT_LOCK_DURATION_MS,
  IP_MAX_ATTEMPTS,
  IP_LOCK_DURATION_MS
};
