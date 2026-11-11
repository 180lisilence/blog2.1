/**
 * 认证中间件
 * - Cookie 解析
 * - 登录态判断
 * - 认证守卫
 */
const { errors } = require("../core/errors");

// BUG-01：decodeURIComponent 遇到畸形百分号编码（如 "%", "%ZZ", 残缺 UTF-8）
// 会抛 URIError。旧实现没有 try/catch，一个畸形 Cookie 就能让任意请求 500，
// 构成低成本 DoS / 日志污染面。这里对键和值分别安全解码：解码失败时退回原文，
// 该 Cookie 自然无法匹配 web_token/qrt，按未登录处理，绝不向外抛异常。
function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

// 解析 Cookie
function parseCookies(req) {
  const list = {};
  const rc = req.headers?.cookie;
  if (!rc) return list;
  rc.split(";").forEach(cookie => {
    const parts = cookie.split("=");
    if (parts.length >= 2) {
      const key = safeDecode(parts.shift().trim());
      const val = safeDecode(parts.join("=").trim());
      list[key] = val;
    }
  });
  return list;
}

// 从请求中提取 token
//
// 6-01（第二轮总汇 P0）：移除 URL 查询参数认证通道。
// 旧实现接受 ?token=<webToken>，等于把长期凭据塞进 URL —— 会被浏览器历史、
// Referer、代理/Nginx access.log、分享出去的链接完整记录，且任何能拿到日志
// 的人都能直接接管会话。现在只认两种来源：
//   1. HttpOnly/非 JS 可读用途的 web_token Cookie（前端主通道）
//   2. Authorization: Bearer（机器对机器 / 本地调试通道）
// 全站前端已核实无任何 ?token= 依赖。
function getTokenFromReq(req) {
  const cookies = parseCookies(req);
  if (cookies.web_token) return cookies.web_token;
  const auth = req.headers?.authorization;
  if (auth?.startsWith("Bearer ")) return auth.substring(7);
  return "";
}

// VULN-CONCURRENT-01：会话可用性的唯一判据。
// 旧守卫只判断 Date.now() <= ws.expireAt，直接读裸 webSessions Map。
// 并发治理上线后，被顶号 / 手动撤销的会话会以 status="revoked" 在 Map 里
// 保留至多 10 分钟（供 getSessionStatus 返回 401 KICKED）。若这里不检查
// status，这些已失效会话仍能通过页面守卫访问 /projects.html 等受保护页面，
// 只是页面内的 API 调用才 401 —— 等于页面层可被绕过。统一在这里拦死。
function isUsableSession(ws) {
  return Boolean(ws) && ws.status === "active" && Date.now() <= ws.expireAt;
}

// 认证守卫中间件
function createAuthGate(webSessions) {
  return function authGate(req, res, next) {
    const token = getTokenFromReq(req);
    const ws = webSessions.get(token);
    if (isUsableSession(ws)) {
      req.username = ws.username;
      return next();
    }
    // 被顶号 / 撤销：API 统一返回 KICKED，让前端 apiFetch 弹「已在其他设备登录」。
    // 页面请求则重定向登录页（presence-client.js 负责在用户端弹出下线提示）。
    if (ws && ws.status === "revoked" && req.path.startsWith("/api/")) {
      return sendKicked(res, { reason: ws.revokeReason });
    }
    // 未登录：API 返回 401，页面跳转登录页（根目录登录页是 index.html）
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ ok: false, msg: "请先登录" });
    }
    return res.redirect("/");
  };
}

// 轻量认证：只解析用户，不拦截
function createAuthParser(webSessions) {
  return function authParser(req, res, next) {
    const token = getTokenFromReq(req);
    const ws = webSessions.get(token);
    if (isUsableSession(ws)) {
      req.username = ws.username;
    }
    next();
  };
}

/**
 * 被顶号 / 会话被撤销时的 401 专用响应（VULN-CONCURRENT-01）。
 * 普通「未登录」仍沿用统一的「请先登录」文案，不做接口地图差异；
 * 只有已认证会话被并发策略撤销时才带 code=KICKED，供前端立即弹窗引导重登。
 */
function sendKicked(res, status) {
  const reason = status?.reason || "concurrent_login";
  // R4-03：web_token 已是 HttpOnly，前端 JS 清不掉。服务端必须在此主动
  // 清理全套登录 Cookie，否则被顶号设备会一直带着失效 token 轮询 /api/me，
  // 陷入「401 KICKED -> 弹窗 -> 再 401」的死循环。
  try { require("../modules/auth/loginCookies").clearLoginCookies(res); }
  catch (e) { /* 兜底：模块加载失败也不能影响 KICKED 响应本身 */ }
  return res.status(401).json({
    ok: false,
    code: "KICKED",
    reason,
    msg: reason === "session_revoked"
      ? "当前会话已在另一台设备上被撤销，请重新登录"
      : "你的账号已在其他设备登录，当前会话已下线"
  });
}

module.exports = { parseCookies, getTokenFromReq, createAuthGate, createAuthParser, sendKicked };
