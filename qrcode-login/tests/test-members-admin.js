"use strict";
/**
 * 账号管理纯逻辑测试（不连 MySQL）
 * 依赖注入 mock pool / users / session，覆盖：
 *  - 五类操作（create / rename / reset-password / kick / delete）
 *  - 事务 SQL 与回滚、内存 Map 同步、会话失效
 *  - 内置账号保护、参数校验、目标不存在
 *  - 输出不含 salt / hash / webToken
 */
const assert = require("assert");
const { createMembersAdmin } = require("../modules/audit/members-admin");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log("PASS  " + name); })
    .catch(e => { fail++; console.log("FAIL  " + name + " :: " + (e && e.message)); });
}

function mkDeps() {
  const users = new Map();
  const calls = [];
  const session = { webSessions: new Map() };
  const model = {
    users,
    async create(username, password, builtin) {
      const u = { salt: "s-" + username, hash: "h-" + username, createdAt: 1000, builtin: !!builtin };
      users.set(username, u);
      calls.push(["model.create", username, builtin]);
      return u;
    }
  };
  const pool = {
    async getConnection() {
      return {
        async beginTransaction() { calls.push(["tx.begin"]); },
        async execute(sql, params) { calls.push(["tx.execute", sql, params]); },
        async commit() { calls.push(["tx.commit"]); },
        async rollback() { calls.push(["tx.rollback"]); },
        release() { calls.push(["tx.release"]); }
      };
    }
  };
  const logger = { info() {}, warn() {}, error() {} };
  const admin = createMembersAdmin({ pool, model, session, users, logger });
  return { admin, users, session, calls, pool };
}

(async () => {
  // 1. create 正常
  await t("create 新增普通账号并写内存", async () => {
    const d = mkDeps();
    const out = await d.admin.apply({ action: "create", username: "tester", password: "Abcd1234" });
    assert.equal(out.ok, undefined); // 不返回 ok 字段，由路由统一包裹
    assert.equal(out.action, "create");
    assert.equal(out.username, "tester");
    assert.equal(d.users.get("tester").builtin, false);
  });

  // 2. create 重名 / 弱密码 / 非法账号
  await t("create 重名账号被拒绝", async () => {
    const d = mkDeps();
    await d.admin.apply({ action: "create", username: "tester", password: "Abcd1234" });
    await assert.rejects(() => d.admin.apply({ action: "create", username: "tester", password: "Abcd1234" }), /已存在/);
  });
  await t("create 纯数字密码被拒绝", async () => {
    const d = mkDeps();
    await assert.rejects(() => d.admin.apply({ action: "create", username: "tester", password: "12345678" }), /字母和数字/);
  });
  await t("create 过短密码被拒绝", async () => {
    const d = mkDeps();
    await assert.rejects(() => d.admin.apply({ action: "create", username: "tester", password: "Ab1" }), /8-64/);
  });
  await t("create 非法账号名被拒绝", async () => {
    const d = mkDeps();
    await assert.rejects(() => d.admin.apply({ action: "create", username: "a", password: "Abcd1234" }), /账号需为/);
  });

  // 3. rename
  await t("rename 同事务更新两表并迁移内存 key", async () => {
    const d = mkDeps();
    d.users.set("probe_01", { salt: "s", hash: "h", createdAt: 1000, builtin: false });
    const out = await d.admin.apply({ action: "rename", username: "probe_01", newUsername: "probe_02" });
    assert.equal(out.action, "rename");
    assert.equal(out.from, "probe_01");
    assert.equal(out.to, "probe_02");
    assert.equal(d.users.has("probe_01"), false);
    assert.equal(d.users.has("probe_02"), true);
    const execs = d.calls.filter(c => c[0] === "tx.execute");
    assert.equal(execs.length, 2);
    assert.ok(execs.some(c => /UPDATE users SET username/.test(c[1])));
    assert.ok(execs.some(c => /UPDATE user_data SET username/.test(c[1])));
    assert.ok(d.calls.some(c => c[0] === "tx.commit"));
  });
  await t("rename 目标已存在被拒绝（409）", async () => {
    const d = mkDeps();
    d.users.set("a1", { salt: "s", hash: "h", createdAt: 1, builtin: false });
    d.users.set("b2", { salt: "s", hash: "h", createdAt: 2, builtin: false });
    await assert.rejects(() => d.admin.apply({ action: "rename", username: "a1", newUsername: "b2" }), /已存在/);
  });
  await t("rename 同名被拒绝", async () => {
    const d = mkDeps();
    d.users.set("same1", { salt: "s", hash: "h", createdAt: 1, builtin: false });
    await assert.rejects(() => d.admin.apply({ action: "rename", username: "same1", newUsername: "same1" }), /相同/);
  });

  // 4. 内置账号保护
  await t("内置账号禁止重命名（403）", async () => {
    const d = mkDeps();
    d.users.set("admin", { salt: "s", hash: "h", createdAt: 1, builtin: true });
    await assert.rejects(() => d.admin.apply({ action: "rename", username: "admin", newUsername: "admin2" }), /内置账号/);
  });
  await t("内置账号禁止删除（403）", async () => {
    const d = mkDeps();
    d.users.set("admin", { salt: "s", hash: "h", createdAt: 1, builtin: true });
    await assert.rejects(() => d.admin.apply({ action: "delete", username: "admin" }), /内置账号/);
    assert.equal(d.users.has("admin"), true);
  });

  // 5. reset-password
  await t("reset-password 更新哈希并同步内存", async () => {
    const d = mkDeps();
    d.users.set("pwuser", { salt: "old", hash: "old", createdAt: 1, builtin: false });
    const out = await d.admin.apply({ action: "reset-password", username: "pwuser", password: "NewPass123" });
    const u = d.users.get("pwuser");
    assert.notEqual(u.salt, "old");
    assert.notEqual(u.hash, "old");
    assert.equal(u.hash.length, 128); // scrypt 64 字节 -> 128 hex
    assert.equal(out.action, "reset-password");
  });
  await t("reset-password 纯数字密码被拒绝", async () => {
    const d = mkDeps();
    d.users.set("pwuser", { salt: "s", hash: "h", createdAt: 1, builtin: false });
    await assert.rejects(() => d.admin.apply({ action: "reset-password", username: "pwuser", password: "12345678" }), /字母和数字/);
  });

  // 6. kick
  await t("kick 销毁目标账号全部 Web 会话且不动密码", async () => {
    const d = mkDeps();
    d.users.set("kickme", { salt: "s", hash: "h", createdAt: 1, builtin: false });
    d.session.webSessions.set("t1", { username: "kickme" });
    d.session.webSessions.set("t2", { username: "kickme" });
    d.session.webSessions.set("t3", { username: "other" });
    const out = await d.admin.apply({ action: "kick", username: "kickme" });
    assert.equal(out.sessionsDestroyed, 2);
    assert.equal(d.session.webSessions.has("t1"), false);
    assert.equal(d.session.webSessions.has("t2"), false);
    assert.equal(d.session.webSessions.has("t3"), true); // 不影响其他账号
    assert.equal(d.users.get("kickme").hash, "h");
  });

  // 7. delete
  await t("delete 同事务删除两表并清理内存与会话", async () => {
    const d = mkDeps();
    d.users.set("delme", { salt: "s", hash: "h", createdAt: 1, builtin: false });
    d.session.webSessions.set("t1", { username: "delme" });
    const out = await d.admin.apply({ action: "delete", username: "delme" });
    assert.equal(out.action, "delete");
    assert.equal(d.users.has("delme"), false);
    assert.equal(d.session.webSessions.has("t1"), false);
    const execs = d.calls.filter(c => c[0] === "tx.execute");
    assert.ok(execs.some(c => /DELETE FROM user_data/.test(c[1])));
    assert.ok(execs.some(c => /DELETE FROM users/.test(c[1])));
  });

  // 8. 事务失败回滚 + 内存不变
  await t("事务执行失败时回滚且内存不变", async () => {
    const d = mkDeps();
    d.users.set("failme", { salt: "s", hash: "h", createdAt: 1, builtin: false });
    d.pool.getConnection = async () => ({
      async beginTransaction() { d.calls.push(["tx.begin"]); },
      async execute() { throw new Error("DB down"); },
      async commit() { d.calls.push(["tx.commit"]); },
      async rollback() { d.calls.push(["tx.rollback"]); },
      release() { d.calls.push(["tx.release"]); }
    });
    await assert.rejects(() => d.admin.apply({ action: "delete", username: "failme" }), /DB down/);
    assert.equal(d.users.has("failme"), true, "内存账号不应被删除");
    assert.ok(d.calls.some(c => c[0] === "tx.rollback"));
    assert.ok(d.calls.some(c => c[0] === "tx.release"));
  });

  // 9. 目标不存在 / 未知操作 / 空用户名
  await t("不存在的账号返回 404", async () => {
    const d = mkDeps();
    await assert.rejects(() => d.admin.apply({ action: "kick", username: "nobody" }), /不存在/);
  });
  await t("未知操作返回 400", async () => {
    const d = mkDeps();
    await assert.rejects(() => d.admin.apply({ action: "drop_database" }), /不支持/);
  });
  await t("空账号名返回 400", async () => {
    const d = mkDeps();
    await assert.rejects(() => d.admin.apply({ action: "kick", username: "" }), /不能为空/);
  });

  // 10. 敏感字段保护
  await t("所有写操作结果都不含 salt / hash / webToken", async () => {
    const d = mkDeps();
    await d.admin.apply({ action: "create", username: "safeone", password: "Abcd1234" });
    d.users.set("safetwo", { salt: "SEC-S", hash: "SEC-H", createdAt: 1, builtin: false });
    d.session.webSessions.set("SEC-TOKEN", { username: "safetwo" });
    const results = await Promise.all([
      d.admin.apply({ action: "rename", username: "safeone", newUsername: "safeone2" }),
      d.admin.apply({ action: "reset-password", username: "safetwo", password: "NewPass123" }),
      d.admin.apply({ action: "kick", username: "safetwo" })
    ]);
    const text = JSON.stringify(results);
    for (const needle of ["SEC-S", "SEC-H", "SEC-TOKEN", '"salt"', '"hash"', '"webToken"']) {
      assert.equal(text.includes(needle), false, "不应出现 " + needle);
    }
  });

  console.log(`\n===== 账号管理逻辑测试 =====\n通过 ${pass} / ${pass + fail}\n${fail === 0 ? "全部通过。" : "存在失败。"}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
