/**
 * 成员快照（供 blog-sentinel 审计后台拉取）
 *
 * 数据源全部来自内存（启动时已从 MySQL 加载），不额外查库、不加依赖：
 *   - authModel.users     : { username -> { salt, hash, createdAt, builtin } }
 *   - authSession.webSessions : { webToken -> { username, createAt, expireAt } }
 *
 * 安全：只输出脱敏字段（username / createdAt / isBuiltin / 在线会话），
 *       绝不外泄 salt / hash / webToken。
 */
const authModel = require("../auth/model");
const authSession = require("../auth/session");

/** 内存用户表 -> 脱敏列表（无 salt/hash） */
function listUsers() {
  const out = [];
  for (const [username, u] of authModel.users) {
    out.push({
      username: String(username),
      createdAt: Number(u.createdAt) || 0,
      isBuiltin: Boolean(u.builtin)
    });
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

/** 真实在线会话：未过期的 webSessions，按用户去重并聚合最近登录时间 */
function onlineSessions() {
  const now = Date.now();
  const byUser = new Map();
  let validSessions = 0;
  for (const [token, s] of authSession.webSessions) {
    if (!s || Number(s.expireAt) <= now) continue; // 过期会话未清理前也不计入在线
    validSessions++;
    const name = String(s.username || "-");
    const cur = byUser.get(name);
    const loginAt = Number(s.createAt) || 0;
    if (!cur || loginAt > cur.lastLoginAt) {
      byUser.set(name, {
        username: name,
        sessions: (cur?.sessions || 0) + 1,
        lastLoginAt: loginAt,
        expireAt: Number(s.expireAt) || 0
      });
    } else {
      cur.sessions += 1;
    }
  }
  const list = Array.from(byUser.values()).sort((a, b) => b.lastLoginAt - a.lastLoginAt);
  return {
    count: list.length,     // 在线人数（按用户去重）
    sessions: validSessions, // 有效会话数（含同账号多设备，已排除过期）
    users: list
  };
}

/** 完整快照 */
function snapshot() {
  const users = listUsers();
  const online = onlineSessions();
  const builtin = users.filter(u => u.isBuiltin).length;
  return {
    ok: true,
    generatedAt: Date.now(),
    counts: {
      total: users.length,
      builtin,
      registered: users.length - builtin,
      online: online.count,
      onlineSessions: online.sessions
    },
    users,
    online: online.users,
    note: "在线 = 未过期的 Web 登录会话，按账号去重；注册人数含内置管理员，普通注册数 = total - builtin。"
  };
}

module.exports = { snapshot, listUsers, onlineSessions };
