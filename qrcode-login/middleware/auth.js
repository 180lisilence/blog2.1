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
function getTokenFromReq(req) {
  const cookies = parseCookies(req);
  if (cookies.web_token) return cookies.web_token;
  if (req.query?.token) return String(req.query.token);
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
    // 未登录：API 返回 401，页面跳转登录页
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ ok: false, msg: "请先登录" });
    }
    return res.redirect("/login.html");
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
