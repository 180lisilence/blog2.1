/**
 * presence 单元测试（2.2.8 顶号提示送达链路）
 *
 * 背景：sendKicked 在返回 401 KICKED 的同时必须清掉 HttpOnly 的 web_token
 * （否则被顶设备会陷入「401 -> 弹窗 -> 再 401」死循环）。
 * 但 web_token 一旦被清，presence 就拿不到 token，
 * 而「被顶号」记录正是以 token 为 key 的 —— 查不到就降级 anonymous，
 * 下线提示永久丢失（实测：先 /api/me 后 presence 返回 anonymous）。
 *
 * 2.2.8 的解法：服务端自读一个短时效的 blog_kick 标记（只含 reason 字符串），
 * presence 拿不到 token 时据此仍判定 kicked。
 *
 * 用注入依赖的方式跑，不碰 MySQL / fs / 网络。
 */
const assert = require("assert");
const path = require("path");
const os = require("os");
const fs = require("fs");

const { createPresence } = require("../qrcode-login/modules/presence");

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

// 造一个临时的 presence 实例：settings 走内存，session 用假实现
function makePresence(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "presence-test-"));
  const now = opts.clock || (() => Date.now());
  // 有效会话：expireAt 必须大于当前时间，否则 presence 判定 expired
  const sessions = new Map(
    Object.entries(opts.sessions || { TOKEN_OK: { username: "carol", expireAt: now() + 3600_000 } })
  );
  const p = createPresence({
    logger: { info() {}, warn() {}, debug() {}, error() {} },
    settingsFile: path.join(tmpDir, "presence-settings.json"),
    session: {
      getWebSession: (t) => sessions.get(t) || null
    },
    clock: now
  });
  return { p, sessions, cleanup: () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} } };
}

console.log("\n=== modules/presence 顶号提示链路测试 (2.2.8) ===");

test("state: 无 token 且无标记 → anonymous", () => {
  const { p, cleanup } = makePresence();
  try {
    assert.strictEqual(p.state("", "").status, "anonymous");
    assert.strictEqual(p.state(null, null).status, "anonymous");
  } finally { cleanup(); }
});

test("state: 无 token 但有 blog_kick 标记 → kicked（提示不丢）", () => {
  const { p, cleanup } = makePresence();
  try {
    const st = p.state("", "concurrent_login");
    assert.strictEqual(st.status, "kicked", "凭据被清后仍必须判定为 kicked");
    assert.strictEqual(st.reason, "concurrent_login");
    assert.strictEqual(st.showDialog, true, "账号安全事件必须强制弹窗");
    assert.ok(st.message && st.message.length > 0, "必须带提示文案");
  } finally { cleanup(); }
});

test("state: 无 token 但有 session_revoked 标记 → kicked + 强制弹窗", () => {
  const { p, cleanup } = makePresence();
  try {
    const st = p.state("", "session_revoked");
    assert.strictEqual(st.status, "kicked");
    assert.strictEqual(st.reason, "session_revoked");
    assert.strictEqual(st.showDialog, true);
  } finally { cleanup(); }
});

test("state: 有效 token → online（正常刷新不被误判登出）", () => {
  const { p, cleanup } = makePresence();
  try {
    const st = p.state("TOKEN_OK", "");
    assert.strictEqual(st.status, "online");
  } finally { cleanup(); }
});

test("state: 有效 token + 残留标记 → 仍 online（标记不能压过有效会话）", () => {
  // 登录成功后 finalizeLogin 会清标记，但这里再兜一层：
  // 万一标记残留（浏览器没清掉），有效会话也不能被误判成被顶号。
  const { p, cleanup } = makePresence();
  try {
    const st = p.state("TOKEN_OK", "concurrent_login");
    assert.strictEqual(st.status, "online", "有效会话优先，不能被残留标记误伤");
  } finally { cleanup(); }
});

test("markKicked + state: 命中 kicked Map → kicked", () => {
  const { p, cleanup } = makePresence();
  try {
    p.markKicked("TOKEN_A", "alice", "concurrent_login");
    const st = p.state("TOKEN_A", "");
    assert.strictEqual(st.status, "kicked");
    assert.strictEqual(st.reason, "concurrent_login");
  } finally { cleanup(); }
});

test("state: token 存在但会话已失效（无踢标记）→ expired", () => {
  const { p, cleanup } = makePresence();
  try {
    const st = p.state("TOKEN_GONE", "");
    assert.strictEqual(st.status, "expired");
  } finally { cleanup(); }
});

test("state: 过期踢记录会被回收，不会永久命中", () => {
  let now = 1000000;
  const { p, cleanup } = makePresence({ clock: () => now });
  try {
    p.markKicked("TOKEN_T", "bob", "concurrent_login");
    assert.strictEqual(p.state("TOKEN_T", "").status, "kicked");
    now += 11 * 60 * 1000; // 超过 10 分钟 TTL
    assert.strictEqual(p.state("TOKEN_T", "").status, "expired");
  } finally { cleanup(); }
});

test("updateSettings: 关闭总开关后不再返回任何状态提示", () => {
  const { p, cleanup } = makePresence();
  try {
    p.updateSettings({ enabled: false });
    assert.strictEqual(p.state("", "concurrent_login").status, "off");
  } finally { cleanup(); }
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
module.exports = { passed, failed };
