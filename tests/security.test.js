/**
 * 安全模块单元测试
 * 测试 core/security.js 的所有函数
 */
const assert = require("assert");
const path = require("path");
const security = require("../qrcode-login/core/security");

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

console.log("\n=== security.js 测试 ===");

// validateUsername
test("validateUsername: 合法用户名通过", () => {
  assert.strictEqual(security.validateUsername("admin"), null);
  assert.strictEqual(security.validateUsername("用户123"), null);
  assert.strictEqual(security.validateUsername("a@b.c-d_e"), null);
});

test("validateUsername: 空用户名被拒绝", () => {
  assert.ok(security.validateUsername(""));
  assert.ok(security.validateUsername(null));
  assert.ok(security.validateUsername(undefined));
});

test("validateUsername: 过短用户名被拒绝", () => {
  assert.ok(security.validateUsername("a"));
});

test("validateUsername: 过长用户名被拒绝", () => {
  assert.ok(security.validateUsername("a".repeat(21)));
});

test("validateUsername: 非法字符被拒绝", () => {
  assert.ok(security.validateUsername("user name"));
  assert.ok(security.validateUsername("user<name>"));
  assert.ok(security.validateUsername("user;name"));
});

// validatePassword
test("validatePassword: 合法密码通过", () => {
  assert.strictEqual(security.validatePassword("123456"), null);
  assert.strictEqual(security.validatePassword("abcdefghijklmnopqrstuvwxyz123456"), null);
});

test("validatePassword: 空密码被拒绝", () => {
  assert.ok(security.validatePassword(""));
  assert.ok(security.validatePassword(null));
});

test("validatePassword: 过短密码被拒绝", () => {
  assert.ok(security.validatePassword("12345"));
});

test("validatePassword: 过长密码被拒绝", () => {
  assert.ok(security.validatePassword("a".repeat(33)));
});

// safePath
test("safePath: 正常路径通过", () => {
  const base = path.join(__dirname, "..", "qrcode-login");
  const result = security.safePath(base, "data", "test.json");
  assert.ok(result.includes("data"));
});

test("safePath: 路径穿越被拒绝", () => {
  const base = path.join(__dirname, "..", "qrcode-login");
  assert.throws(() => {
    security.safePath(base, "..", "..", "etc", "passwd");
  });
});

// validateFolderName
test("validateFolderName: 合法文件夹名通过", () => {
  assert.strictEqual(security.validateFolderName("my-project"), null);
  assert.strictEqual(security.validateFolderName("chatrecord"), null);
});

test("validateFolderName: 空名称被拒绝", () => {
  assert.ok(security.validateFolderName(""));
  assert.ok(security.validateFolderName(null));
});

test("validateFolderName: .. 被拒绝", () => {
  assert.ok(security.validateFolderName(".."));
  assert.ok(security.validateFolderName("../evil"));
});

test("validateFolderName: 路径分隔符被拒绝", () => {
  assert.ok(security.validateFolderName("a/b"));
  assert.ok(security.validateFolderName("a\\b"));
});

// safeGet
test("safeGet: 正常获取嵌套属性", () => {
  const obj = { a: { b: { c: 42 } } };
  assert.strictEqual(security.safeGet(obj, "a.b.c"), 42);
});

test("safeGet: 不存在的属性返回默认值", () => {
  const obj = { a: { b: 1 } };
  assert.strictEqual(security.safeGet(obj, "a.x.y", "default"), "default");
});

test("safeGet: null 对象返回默认值", () => {
  assert.strictEqual(security.safeGet(null, "a.b", "default"), "default");
  assert.strictEqual(security.safeGet(undefined, "a.b", "default"), "default");
});

test("safeGet: 无默认值时返回 undefined", () => {
  assert.strictEqual(security.safeGet({ a: 1 }, "b"), undefined);
});

// escapeHtml
test("escapeHtml: 转义特殊字符", () => {
  assert.strictEqual(security.escapeHtml("<script>"), "&lt;script&gt;");
  assert.strictEqual(security.escapeHtml('a"b'), "a&quot;b");
  assert.strictEqual(security.escapeHtml("a&b"), "a&amp;b");
});

test("escapeHtml: 非字符串原样返回", () => {
  assert.strictEqual(security.escapeHtml(123), 123);
  assert.strictEqual(security.escapeHtml(null), null);
});

// truncate
test("truncate: 正常长度不截断", () => {
  assert.strictEqual(security.truncate("hello", 10), "hello");
});

test("truncate: 超长字符串截断", () => {
  assert.strictEqual(security.truncate("hello world", 5), "hello");
});

test("truncate: 非字符串原样返回", () => {
  assert.strictEqual(security.truncate(123, 10), 123);
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
module.exports = { passed, failed };
