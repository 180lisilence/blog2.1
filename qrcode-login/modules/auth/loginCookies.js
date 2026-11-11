/**
 * 登录态 Cookie 统一签发 / 清理（R4-02 + R4-03）
 * ================================================================
 * R4-03：web_token 由服务端 Set-Cookie 下发并标记 HttpOnly，前端 JS 不再
 *        自行写 document.cookie。这样任何页面内 XSS 都读不到长期凭据，
 *        斩断「XSS -> 窃取 web_token -> 账号接管」这条链。
 *
 * R4-02：登录成功后轮换 CSRF token（双提交 token 在认证态切换前后不同），
 *        消除会话固定面（session fixation）。
 *
 * 配套设计（HttpOnly 的必然要求）：
 *   1. HttpOnly Cookie 前端 JS 清不掉，所以被顶号 / 撤销 / 登出时，必须由
 *      服务端在响应里主动 res.clearCookie —— 见 clearLoginCookies 调用点
 *      （routes.js logout、middleware/auth.js sendKicked、server.js presence）。
 *   2. previewGate 等「是否已登录」的体验判断不能再读 web_token（HttpOnly），
 *      改用一个不含任何凭据的非 HttpOnly 标记 web_auth=1。伪造它最多让预览
 *      卡片点击放行，后端鉴权仍会兜底，不构成越权。
 *   3. 登录响应体仍返回 webToken —— 探针 / Bearer 客户端 / 子项目靠它取凭据；
 *      HttpOnly 只影响浏览器 JS 读 document.cookie，不影响响应 JSON，也不
 *      影响 HTTP 客户端手动拼 Cookie 头。
 */
const csrf = require("../../middleware/csrf");

const WEB_TOKEN_COOKIE = "web_token";
const WEB_AUTH_COOKIE = "web_auth"; // 非 HttpOnly，仅体验判断，不含凭据
// 顶号标记 Cookie（2.2.8 新增）
//
// 为什么需要它：sendKicked() 在返回 401 KICKED 的同时必须清掉 web_token
// （HttpOnly，前端清不掉；不清会陷入「401 KICKED → 弹窗 → 再 401」死循环）。
// 但 web_token 一旦被清，presence 端点就再也拿不到 token，
// 而 presence 的「被顶号」记录正是以 token 为 key 的 —— 查不到就降级成
// anonymous，下线提示永久丢失（实测 X1：先 /api/me 后 presence → anonymous）。
//
// 于是把「本设备已被顶号」这一事实单独落到一个短时效 Cookie 上：
//   - 不含任何凭据（只有 reason 字符串），HttpOnly 也不影响（服务端自读）
//   - 由 sendKicked 在清 Cookie 之后补写，presence 端点据此仍能判定 kicked
//   - 登录成功 / presence 送达提示 / 登出时清除，不会误报
const BLOG_KICK_COOKIE = "blog_kick";
const BLOG_KICK_MAX_AGE = 10 * 60 * 1000; // 与 presence 的 KICK_TTL_MS 对齐
const WEB_TOKEN_MAX_AGE = 7 * 24 * 3600 * 1000; // 与 config.webTokenExpireMs 对齐

/**
 * 登录成功后签发全套 Cookie：
 *   - web_token：HttpOnly + Secure(视请求) + SameSite=Lax
 *   - web_auth ：非 HttpOnly 体验标记（仅表示"登录过"，不含 token）
 *   - csrf_token：轮换后的新 token（R4-02）
 * @returns {string} 新的 csrf token（便于调用方同步前端缓存，可选）
 */
function finalizeLogin(req, res, webToken) {
  const base = {
    secure: csrf.isSecureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: WEB_TOKEN_MAX_AGE
  };
  // 主凭据：HttpOnly，JS 不可读
  res.cookie(WEB_TOKEN_COOKIE, webToken, { ...base, httpOnly: true });
  // 体验标记：JS 可读，供 previewGate 判断；不含任何凭据
  res.cookie(WEB_AUTH_COOKIE, "1", { ...base, httpOnly: false });
  // R4-02：轮换 CSRF（写 Cookie，前端下次从 document.cookie 读到新值）
  const freshCsrf = csrf.issueToken();
  csrf.writeCsrfCookie(req, res, freshCsrf);
  // 2.2.8：登录成功即清掉顶号标记 —— 否则这台设备刚登进去就被 presence
  // 认成「刚被顶号」，会立刻弹一个下线提示把新会话也搅了。
  try { res.clearCookie(BLOG_KICK_COOKIE, { path: "/" }); } catch (e) { /* 忽略 */ }
  return freshCsrf;
}

/** 清理全套登录 Cookie。HttpOnly 下必须由服务端调用，前端 JS 清不掉 web_token。 */
function clearLoginCookies(res) {
  const opt = { path: "/" };
  res.clearCookie(WEB_TOKEN_COOKIE, opt);
  res.clearCookie(WEB_AUTH_COOKIE, opt);
}

/**
 * 标记「本设备刚刚被顶号」（2.2.8）
 *
 * 由 sendKicked 在 clearLoginCookies 之后调用：web_token 已被清掉，
 * presence 端点再也拿不到 token，无法查到自己被顶过号。这个 Cookie
 * 携带 reason，让 presence 端点仍能判定 kicked 并把提示送到用户端。
 *
 * 不含任何凭据（只有 reason 字符串），且是短时效的 —— 即使漏清，
 * 10 分钟后自动失效，不会造成长期误报。
 */
function markKickedCookie(req, res, reason) {
  const r = String(reason || "concurrent_login").slice(0, 32);
  res.cookie(BLOG_KICK_COOKIE, r, {
    httpOnly: true,
    secure: csrf.isSecureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: BLOG_KICK_MAX_AGE
  });
}

/**
 * 读取本设备的顶号标记（presence 端点用）
 * @returns {string} reason；没有标记返回空串
 */
function readKickedCookie(req) {
  try {
    const raw = req.headers?.cookie || "";
    for (const part of raw.split(";")) {
      const p = part.trim();
      const eq = p.indexOf("=");
      if (eq <= 0) continue;
      if (p.slice(0, eq) === BLOG_KICK_COOKIE) {
        return decodeURIComponent(p.slice(eq + 1)).slice(0, 32);
      }
    }
  } catch (e) { /* 畸形编码按无标记处理 */ }
  return "";
}

module.exports = {
  finalizeLogin,
  clearLoginCookies,
  markKickedCookie,
  readKickedCookie,
  WEB_TOKEN_COOKIE,
  WEB_AUTH_COOKIE,
  BLOG_KICK_COOKIE
};
