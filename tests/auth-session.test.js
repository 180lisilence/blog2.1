/**
 * 会话管理单元测试
 * 测试 modules/auth/session.js
 */
const assert = require("assert");
const sessionMgr = require("../qrcode-login/modules/auth/session");

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

console.log("\n=== auth/session.js 测试 ===");

// 二维码会话
test("createQrSession: 创建二维码会话", () => {
  const s = sessionMgr.createQrSession();
  assert.ok(s.qid.startsWith("QR-"));
  assert.strictEqual(s.status, "pending");
  assert.ok(s.expireAt > Date.now());
});

test("getQrSession: 获取已创建的会话", () => {
  const s = sessionMgr.createQrSession();
  const found = sessionMgr.getQrSession(s.qid);
  assert.strictEqual(found.qid, s.qid);
  assert.strictEqual(found.status, "pending");
});

test("getQrSession: 不存在的会话返回 null", () => {
  assert.strictEqual(sessionMgr.getQrSession("QR-not-exist"), null);
});

test("二维码会话状态流转: pending -> scanned -> confirmed", () => {
  const s = sessionMgr.createQrSession();
  // pending
  assert.strictEqual(s.status, "pending");
  // scanned
  s.status = "scanned";
  assert.strictEqual(sessionMgr.getQrSession(s.qid).status, "scanned");
  // confirmed
  s.status = "confirmed";
  s.webToken = "test-token";
  s.username = "testuser";
  const found = sessionMgr.getQrSession(s.qid);
  assert.strictEqual(found.status, "confirmed");
  assert.strictEqual(found.webToken, "test-token");
  assert.strictEqual(found.username, "testuser");
});

// Web 会话
test("createWebSession: 创建 Web 登录态", () => {
  const token = sessionMgr.createWebSession("testuser");
  assert.ok(token.startsWith("SELF-LOGIN-"));
});

test("getWebSession: 获取有效会话", () => {
  const token = sessionMgr.createWebSession("testuser2");
  const ws = sessionMgr.getWebSession(token);
  assert.ok(ws);
  assert.strictEqual(ws.username, "testuser2");
  assert.ok(ws.expireAt > Date.now());
});

test("getWebSession: 不存在的 token 返回 null", () => {
  assert.strictEqual(sessionMgr.getWebSession("invalid-token"), null);
});

test("destroyWebSession: 销毁会话", () => {
  const token = sessionMgr.createWebSession("testuser3");
  assert.ok(sessionMgr.getWebSession(token));
  sessionMgr.destroyWebSession(token);
  assert.strictEqual(sessionMgr.getWebSession(token), null);
});

test("destroyWebSession: 销毁不存在的会话返回 false", () => {
  assert.strictEqual(sessionMgr.destroyWebSession("not-exist"), false);
});

// 清理
test("cleanupExpired: 清理过期会话不报错", () => {
  // 创建一些会话
  sessionMgr.createQrSession();
  sessionMgr.createWebSession("cleanup-test");
  // 清理不应抛出异常
  assert.doesNotThrow(() => sessionMgr.cleanupExpired());
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
module.exports = { passed, failed };
