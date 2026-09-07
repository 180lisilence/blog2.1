/**
 * 错误处理模块单元测试
 * 测试 core/errors.js
 */
const assert = require("assert");
const { AppError, errors, asyncHandler, ok, fail } = require("../qrcode-login/core/errors");

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

console.log("\n=== core/errors.js 测试 ===");

// AppError
test("AppError: 创建业务错误", () => {
  const err = new AppError(400, "参数错误", { field: "name" });
  assert.strictEqual(err.statusCode, 400);
  assert.strictEqual(err.message, "参数错误");
  assert.deepStrictEqual(err.details, { field: "name" });
  assert.strictEqual(err.isOperational, true);
  assert.ok(err instanceof Error);
});

// errors 工厂
test("errors.badRequest: 返回 400 错误", () => {
  const err = errors.badRequest("无效参数");
  assert.strictEqual(err.statusCode, 400);
  assert.strictEqual(err.message, "无效参数");
});

test("errors.unauthorized: 返回 401 错误", () => {
  const err = errors.unauthorized();
  assert.strictEqual(err.statusCode, 401);
  assert.strictEqual(err.message, "请先登录");
});

test("errors.forbidden: 返回 403 错误", () => {
  const err = errors.forbidden();
  assert.strictEqual(err.statusCode, 403);
});

test("errors.notFound: 返回 404 错误", () => {
  const err = errors.notFound("资源不存在");
  assert.strictEqual(err.statusCode, 404);
  assert.strictEqual(err.message, "资源不存在");
});

test("errors.conflict: 返回 409 错误", () => {
  const err = errors.conflict("已存在");
  assert.strictEqual(err.statusCode, 409);
});

test("errors.internal: 返回 500 错误", () => {
  const err = errors.internal();
  assert.strictEqual(err.statusCode, 500);
});

// asyncHandler
test("asyncHandler: 正常执行不报错", async () => {
  const handler = asyncHandler(async (req, res) => {
    res.statusCode = 200;
  });
  const req = {};
  const res = { statusCode: 0 };
  let nextCalled = false;
  await handler(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(nextCalled, false);
});

test("asyncHandler: 捕获异常并调用 next", async () => {
  const testErr = new Error("测试错误");
  const handler = asyncHandler(async () => {
    throw testErr;
  });
  let caughtErr = null;
  await handler({}, {}, (err) => { caughtErr = err; });
  assert.strictEqual(caughtErr, testErr);
});

// ok / fail 响应（模拟 res）
function mockRes() {
  return {
    statusCode: 200,
    body: null,
    json(data) { this.body = data; },
    status(code) { this.statusCode = code; return this; }
  };
}

test("ok: 返回成功响应", () => {
  const res = mockRes();
  ok(res, { data: 123 }, "操作成功");
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.data, 123);
  assert.strictEqual(res.body.msg, "操作成功");
});

test("ok: 无数据时只返回 ok", () => {
  const res = mockRes();
  ok(res);
  assert.deepStrictEqual(res.body, { ok: true });
});

test("fail: 返回失败响应", () => {
  const res = mockRes();
  fail(res, 400, "参数错误", { field: "name" });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.ok, false);
  assert.strictEqual(res.body.msg, "参数错误");
  assert.deepStrictEqual(res.body.details, { field: "name" });
});

test("fail: 无 details 时不包含 details 字段", () => {
  const res = mockRes();
  fail(res, 500, "服务器错误");
  assert.strictEqual(res.body.ok, false);
  assert.strictEqual(res.body.details, undefined);
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
module.exports = { passed, failed };
