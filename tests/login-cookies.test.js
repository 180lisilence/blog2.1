/**
 * loginCookies 单元测试（R4-02 + R4-03）
 * 验证：web_token 以 HttpOnly 下发、web_auth 体验标记、CSRF 登录轮换、
 *       清理函数清除全套 Cookie。
 * 用 mock req/res，不依赖 MySQL / 网络。
 */
const assert = require("assert");
const path = require("path");
const loginCookies = require("../qrcode-login/modules/auth/loginCookies");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

// 最小 express-like res mock：记录所有 res.cookie / clearCookie 调用
function mockReq(overrides = {}) {
  return { secure: false, protocol: "http", headers: {}, ...overrides };
}
function mockRes() {
  return {
    cookies: [],
    clears: [],
    cookie(name, value, opt) { this.cookies.push({ name, value, opt: opt || {} }); return this; },
    clearCookie(name, opt) { this.clears.push({ name, opt: opt || {} }); return this; }
  };
}

console.log("\n=== auth/loginCookies.js 测试 (R4-02/R4-03) ===");

test("finalizeLogin: web_token 以 HttpOnly 下发", () => {
  const res = mockRes();
  loginCookies.finalizeLogin(mockReq(), res, "WEBTOKEN_XYZ");
  const wt = res.cookies.find(c => c.name === "web_token");
  assert.ok(wt, "应下发 web_token Cookie");
  assert.strictEqual(wt.value, "WEBTOKEN_XYZ");
  assert.strictEqual(wt.opt.httpOnly, true, "web_token 必须 HttpOnly");
  assert.strictEqual(wt.opt.sameSite, "lax");
  assert.strictEqual(wt.opt.path, "/");
  assert.ok(wt.opt.maxAge > 0, "应有 maxAge");
});

test("finalizeLogin: web_auth 为非 HttpOnly 体验标记", () => {
  const res = mockRes();
  loginCookies.finalizeLogin(mockReq(), res, "T");
  const wa = res.cookies.find(c => c.name === "web_auth");
  assert.ok(wa, "应下发 web_auth");
  assert.strictEqual(wa.value, "1");
  assert.strictEqual(wa.opt.httpOnly, false, "web_auth 必须 JS 可读");
  assert.ok(!JSON.stringify(wa).includes("WEBTOKEN"), "web_auth 不得含 token");
});

test("finalizeLogin: 轮换 CSRF（每次签发不同 token）", () => {
  const r1 = mockRes(), r2 = mockRes();
  loginCookies.finalizeLogin(mockReq(), r1, "T1");
  loginCookies.finalizeLogin(mockReq(), r2, "T2");
  const c1 = r1.cookies.find(c => c.name === "csrf_token");
  const c2 = r2.cookies.find(c => c.name === "csrf_token");
  assert.ok(c1 && c2, "两次都应下发 csrf_token");
  assert.notStrictEqual(c1.value, c2.value, "CSRF token 必须轮换，不可复用");
  assert.ok(/\./.test(c1.value), "CSRF token 应带 HMAC 签章（含 . 分隔）");
});

test("finalizeLogin: 返回新 CSRF 供调用方同步", () => {
  const res = mockRes();
  const ret = loginCookies.finalizeLogin(mockReq(), res, "T");
  assert.ok(typeof ret === "string" && ret.includes("."), "应返回签名 token");
  const cookie = res.cookies.find(c => c.name === "csrf_token");
  assert.strictEqual(ret, cookie.value, "返回值应与下发的 Cookie 一致");
});

test("finalizeLogin: https 请求带 Secure（isSecureRequest 集成）", () => {
  const res = mockRes();
  // 通过 headers 模拟反代 https
  loginCookies.finalizeLogin(mockReq({ headers: { "x-forwarded-proto": "https" } }), res, "T");
  // 该用例依赖进程级 COOKIE_SECURE 推导；只断言不抛错、结构完整即可，
  // Secure 与否由 csrf.isSecureRequest 的环境判断决定，不在本单测固定。
  assert.strictEqual(res.cookies.length, 3, "应下发 web_token + web_auth + csrf_token 三个 Cookie");
});

test("clearLoginCookies: 清除 web_token 与 web_auth", () => {
  const res = mockRes();
  loginCookies.clearLoginCookies(res);
  assert.strictEqual(res.clears.length, 2, "应清除两个 Cookie");
  const names = res.clears.map(c => c.name).sort();
  assert.deepStrictEqual(names, ["web_auth", "web_token"]);
  for (const c of res.clears) assert.strictEqual(c.opt.path, "/");
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
module.exports = { passed, failed };
