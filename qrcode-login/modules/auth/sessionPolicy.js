/**
 * 会话策略（VULN-CONCURRENT-01 修复核心）
 * ---------------------------------------------------------------
 * 把所有「签发 Web 会话」的入口收敛到一处，统一做三件事：
 *   1. 提取服务端可信的请求画像（IP / UA / 派生的设备标签，不信任客户端自报 ID）；
 *   2. 调用 sessionMgr.createWebSession 签发会话 —— 保持 sentinel-adapter
 *      对 createWebSession 的零改包装，登录审计与「某某已上线」事件照常上报；
 *   3. 执行同账号并发策略，把被顶掉的旧 token 交给 presence 打上
 *      concurrent_login 标记，让旧设备的 presence-client 弹出「已在其他设备登录」。
 *
 * 任何新增登录路径（密码 / 扫码 / 免密）都必须走 issue()，否则并发治理会被绕过。
 */
const crypto = require("crypto");
const sessionMgr = require("./session");
const presence = require("../presence").getPresence();
const logger = require("../../core/logger");

// 从请求提取服务端可信画像。deviceId 不用客户端自报值——报告 B3-04 / VULN-CONCURRENT-01
// 明确指出前端 localStorage/sessionStorage 可被篡改，设备身份必须由服务端从请求派生。
function requestProfile(req) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  const ua = String(req?.headers?.["user-agent"] || "").slice(0, 300);
  const platform = String(req?.headers?.["sec-ch-ua-platform"] || "").replace(/["']/g, "");
  const mobile = /mobile|android|iphone|ipad/i.test(ua);
  const osName = platform
    || (/windows/i.test(ua) ? "Windows"
      : /macintosh|mac os/i.test(ua) ? "macOS"
        : /android/i.test(ua) ? "Android"
          : /iphone|ipad|ipod/i.test(ua) ? "iOS"
            : /linux/i.test(ua) ? "Linux" : "其他系统");
  const browser = /edg\//i.test(ua) ? "Edge"
    : /opr\//i.test(ua) || /opera/i.test(ua) ? "Opera"
      : /firefox\//i.test(ua) ? "Firefox"
        : /chrome\//i.test(ua) ? "Chrome"
          : /safari\//i.test(ua) ? "Safari" : "浏览器";
  // 稳定设备标签：同一 UA+平台的重复登录归为同类设备，不含随机值，便于用户辨认
  const device = `${osName} · ${browser}${mobile ? " · 移动" : ""}`.slice(0, 60);
  return { ip, ua, device };
}

/**
 * 签发会话并执行并发策略。
 * @returns {{ webToken: string, evicted: string[], profile: object }}
 */
function issue(req, username) {
  const profile = requestProfile(req);
  // 顺序很关键：先用新会话占位，再执行策略撤销「除 keepToken 外」的旧会话，
  // 避免并发窗口里新 token 被当成旧会话一起踢掉。
  const webToken = sessionMgr.createWebSession(username, profile);
  let evicted = [];
  try {
    evicted = sessionMgr.applyConcurrentPolicy(username, webToken);
  } catch (e) {
    logger.error("session-policy", "并发策略执行失败（会话已签发，旧会话保留）", e);
  }
  for (const oldToken of evicted) {
    try { presence.markKicked(oldToken, username, "concurrent_login"); }
    catch (e) { logger.warn("session-policy", "顶号标记写入失败", e.message); }
  }
  return { webToken, evicted, profile };
}

/** 扫码 redeem 阶段用 PC 端真实请求刷新会话画像 */
function adopt(req, webToken) {
  try { sessionMgr.touchSession(webToken, requestProfile(req)); }
  catch (e) { logger.warn("session-policy", "会话画像刷新失败", e.message); }
}

/**
 * 用户主动撤销某台设备。被撤销 token 同样打 session_revoked 标记，
 * 让那台设备立刻收到「会话已在别处被撤销」提示，而不是静默失效。
 */
function revoke(username, sessionId, currentToken) {
  // keepToken 直接排除当前会话：要退出应走 /api/logout，
  // 否则用户会把自己踢下线并收到一条莫名其妙的「被撤销」提示。
  const out = sessionMgr.revokeSessionById(username, sessionId, "user_revoke", currentToken);
  if (!out) return null;
  try { presence.markKicked(out.token, username, "session_revoked"); }
  catch (e) { logger.warn("session-policy", "撤销标记写入失败", e.message); }
  return { self: false, sessionId: out.session.id };
}

module.exports = { requestProfile, issue, adopt, revoke };
