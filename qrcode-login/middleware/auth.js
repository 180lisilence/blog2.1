/**
 * 认证中间件
 * - Cookie 解析
 * - 登录态判断
 * - 认证守卫
 */
const { errors } = require("../core/errors");

// 解析 Cookie
function parseCookies(req) {
  const list = {};
  const rc = req.headers?.cookie;
  if (!rc) return list;
  rc.split(";").forEach(cookie => {
    const parts = cookie.split("=");
    if (parts.length >= 2) {
      const key = decodeURIComponent(parts.shift().trim());
      const val = decodeURIComponent(parts.join("=").trim());
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

// 认证守卫中间件
function createAuthGate(webSessions) {
  return function authGate(req, res, next) {
    const token = getTokenFromReq(req);
    const ws = webSessions.get(token);
    if (ws && Date.now() <= ws.expireAt) {
      req.username = ws.username;
      return next();
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
    if (ws && Date.now() <= ws.expireAt) {
      req.username = ws.username;
    }
    next();
  };
}

module.exports = { parseCookies, getTokenFromReq, createAuthGate, createAuthParser };
