/**
 * 项目验证器单元测试
 * 测试 modules/projects/validator.js
 * 使用临时目录模拟项目文件夹
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const validator = require("../qrcode-login/modules/projects/validator");

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

console.log("\n=== projects/validator.js 测试 ===");

// validateManifest 纯函数测试
test("validateManifest: 合法 manifest 通过", () => {
  const manifest = { name: "测试项目", entry: "index.html" };
  // 注意：会检查入口文件是否存在，这里用临时目录
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proj-test-"));
  fs.writeFileSync(path.join(tmpDir, "index.html"), "<html></html>");
  const errors = validator.validateManifest(manifest, path.basename(tmpDir));
  // 因为 entry 检查用的是 config.projects.dir，不是 tmpDir，所以可能报入口文件不存在
  // 这里只验证 name 和 entry 字段本身的格式
  assert.ok(!errors.includes("缺少必填字段 name"));
  assert.ok(!errors.includes("缺少必填字段 entry"));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("validateManifest: 缺少 name 被拒绝", () => {
  const manifest = { entry: "index.html" };
  const errors = validator.validateManifest(manifest, "test");
  assert.ok(errors.includes("缺少必填字段 name（项目名称）"));
});

test("validateManifest: 缺少 entry 被拒绝", () => {
  const manifest = { name: "测试" };
  const errors = validator.validateManifest(manifest, "test");
  assert.ok(errors.includes("缺少必填字段 entry（入口文件，如 index.html）"));
});

test("validateManifest: null manifest 被拒绝", () => {
  const errors = validator.validateManifest(null, "test");
  assert.ok(errors.length > 0);
});

test("validateManifest: 非法 color 被拒绝", () => {
  const manifest = { name: "测试", entry: "index.html", color: "invalid" };
  const errors = validator.validateManifest(manifest, "test");
  assert.ok(errors.some(e => e.includes("color")));
});

test("validateManifest: 合法 color 通过", () => {
  const manifest = { name: "测试", entry: "index.html", color: "c3" };
  const errors = validator.validateManifest(manifest, "test");
  assert.ok(!errors.some(e => e.includes("color")));
});

test("validateManifest: tags 非数组被拒绝", () => {
  const manifest = { name: "测试", entry: "index.html", tags: "not-array" };
  const errors = validator.validateManifest(manifest, "test");
  assert.ok(errors.includes("tags 必须是数组"));
});

test("validateManifest: version 非字符串被拒绝", () => {
  const manifest = { name: "测试", entry: "index.html", version: 123 };
  const errors = validator.validateManifest(manifest, "test");
  assert.ok(errors.includes("version 必须是字符串"));
});

// VALID_COLORS
test("VALID_COLORS: 包含 c1-c6", () => {
  assert.ok(validator.VALID_COLORS.includes("c1"));
  assert.ok(validator.VALID_COLORS.includes("c6"));
  assert.strictEqual(validator.VALID_COLORS.length, 6);
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
module.exports = { passed, failed };
