"use strict";
/**
 * 成员快照纯逻辑测试（不连 MySQL，直接注入内存数据）
 * 验证：字段脱敏、在线按账号去重、有效会话过滤、计数正确、排序正确。
 * 用法：node tests/test-members.js
 */
const path = require("path");
const authModel = require("../modules/auth/model");
const authSession = require("../modules/auth/session");
const members = require("../modules/audit/members");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("PASS ", name); }
  else { fail++; console.log("FAIL ", name); }
}

(async () => {
  // 注入测试数据（模拟 MySQL 已加载的用户）
  authModel.users.clear();
  authModel.users.set("admin", { salt: "SALTY", hash: "HASHY", createdAt: 1000, builtin: true });
  authModel.users.set("alice", { salt: "S2", hash: "H2", createdAt: 2000, builtin: false });
  authModel.users.set("bob", { salt: "S3", hash: "H3", createdAt: 3000, builtin: false });

  // 注入在线会话：alice 两台设备，bob 一台，含一个过期会话
  authSession.webSessions.clear();
  const now = Date.now();
  authSession.webSessions.set("t1", { username: "alice", createAt: now - 5000, expireAt: now + 60000 });
  authSession.webSessions.set("t2", { username: "alice", createAt: now - 9000, expireAt: now + 60000 });
  authSession.webSessions.set("t3", { username: "bob", createAt: now - 1000, expireAt: now + 60000 });
  authSession.webSessions.set("t4", { username: "ghost", createAt: now - 99999, expireAt: now - 1 }); // 过期

  const snap = members.snapshot();
  const dump = JSON.stringify(snap);

  ok(snap.ok === true, "快照 ok=true");
  ok(snap.counts.total === 3, "总账号数 = 3");
  ok(snap.counts.builtin === 1, "内置账号数 = 1");
  ok(snap.counts.registered === 2, "普通注册数 = 2");
  ok(snap.counts.online === 2, "在线人数按账号去重 = 2（alice/bob）");
  ok(snap.counts.onlineSessions === 3, "有效会话数 = 3（排除过期 ghost）");
  ok(snap.users.length === 3, "用户列表 3 条");
  ok(snap.users[0].username === "admin" && snap.users[2].username === "bob", "用户按注册时间升序");
  ok(!/SALTY|HASHY|"salt"|"hash"/.test(dump), "输出不含 salt/hash（脱敏）");
  ok(!/SELF-LOGIN|webToken|"t1"/.test(dump), "输出不含 webToken");
  ok(snap.online.find(u => u.username === "alice")?.sessions === 2, "alice 在线会话聚合为 2 台设备");
  ok(!snap.online.some(u => u.username === "ghost"), "过期会话不计入在线");

  console.log(`\n===== 成员快照逻辑测试：通过 ${pass} / ${pass + fail} =====`);
  if (dump.length > 2000) console.log("快照大小:", dump.length, "bytes");
  // authModel 引入的 MySQL 连接池会挂住进程，逻辑测完即显式退出
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
