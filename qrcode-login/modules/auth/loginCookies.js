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
  return freshCsrf;
}

/** 清理全套登录 Cookie。HttpOnly 下必须由服务端调用，前端 JS 清不掉 web_token。 */
function clearLoginCookies(res) {
  const opt = { path: "/" };
  res.clearCookie(WEB_TOKEN_COOKIE, opt);
  res.clearCookie(WEB_AUTH_COOKIE, opt);
}

module.exports = { finalizeLogin, clearLoginCookies, WEB_TOKEN_COOKIE, WEB_AUTH_COOKIE };
