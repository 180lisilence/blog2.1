/**
 * 成员账号管理（供 blog-sentinel 审计后台代管，机器对机器）
 *
 * 设计要点：
 *  1. 所有写操作同步三处：MySQL(users / user_data) + 内存 authModel.users + Web 会话。
 *  2. 内置账号（含默认管理员）受保护：禁止改名 / 删除，只允许重置密码与踢下线。
 *  3. 任何写操作都让受影响账号的 Web 会话立即失效，
 *     避免出现「改了密码还能用旧 token」或「删了账号会话还在」的窗口。
 *  4. 本模块只接受受 x-sentinel-key 保护的调用，输出绝不含 salt / hash / webToken。
 *
 * 依赖注入：测试时传入 mock 的 pool / model / session / users / logger，
 * 生产不传参则使用真实模块。这样本地无 MySQL 也能完整验证逻辑。
 */
const crypto = require("crypto");
const { errors } = require("../../core/errors");
const { validateUsername, validatePassword } = require("../../core/security");

function createMembersAdmin(deps = {}) {
  const pool = deps.pool || require("../../db/pool");
  const logger = deps.logger || require("../../core/logger");
  const model = deps.model || require("../auth/model");
  const session = deps.session || require("../auth/session");
  const users = deps.users || model.users; // Map: username -> { salt, hash, createdAt, builtin }
  // presence：记录「被管理员强制下线」的 token 凭据，供用户端轮询弹窗。
  // 测试可注入 mock；生产复用单例，与 server.js 的提示开关同源。
  const presence = deps.presence || require("../presence").getPresence();

  function hashPassword(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.scrypt(String(password), salt, 64, (err, derived) => {
        if (err) reject(err);
        else resolve(derived.toString("hex"));
      });
    });
  }

  function requireUser(raw) {
    const username = String(raw || "").trim();
    if (!username) throw errors.badRequest("账号不能为空");
    const user = users.get(username);
    if (!user) throw errors.notFound("账号不存在");
    return { username, user };
  }

  function assertNotBuiltin(user, action) {
    if (user.builtin) throw errors.forbidden(`内置账号禁止${action}`);
  }

  /**
   * 销毁目标账号的全部 Web 会话。
   * 删除前先把 token 记入 presence 的「被强制下线」表 —— 用户端下次轮询
   * /api/presence/state 时凭这个标记区分「管理员下线」与「主动登出 / 过期」。
   * reason 只在管理员写操作里传；主动登出路径不经过这里，不会被误标。
   */
  function destroySessionsOf(username, reason) {
    let n = 0;
    for (const [token, s] of session.webSessions) {
      if (s && s.username === username) {
        if (reason) {
          try { presence.markKicked(token, username, reason); }
          catch (e) { logger.warn("members-admin", "下线标记写入失败（不影响会话失效）", e.message); }
        }
        session.webSessions.delete(token);
        n++;
      }
    }
    return n;
  }

  async function withTx(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(conn);
      await conn.commit();
      return out;
    } catch (e) {
      try { await conn.rollback(); } catch (_) { /* 回滚失败不掩盖原错误 */ }
      throw e;
    } finally {
      conn.release();
    }
  }

  /** 新增普通账号（内置账号只在初始化时产生，这里不接受 builtin 参数） */
  async function create(rawName, password) {
    const username = String(rawName || "").trim();
    const uErr = validateUsername(username);
    if (uErr) throw errors.badRequest(uErr);
    const pErr = validatePassword(password);
    if (pErr) throw errors.badRequest(pErr);
    if (users.has(username)) throw errors.conflict("该账号已存在");
    const user = await model.create(username, password, false);
    logger.info("members-admin", `新增账号: ${username}`);
    return { action: "create", username, createdAt: user.createdAt };
  }

  /** 重命名账号：users 与 user_data 同事务更新，内存 key 同步迁移 */
  async function rename(username, rawNew) {
    const { user } = requireUser(username);
    assertNotBuiltin(user, "重命名");
    const newUsername = String(rawNew || "").trim();
    const uErr = validateUsername(newUsername);
    if (uErr) throw errors.badRequest(uErr);
    if (newUsername === username) throw errors.badRequest("新账号名与原账号名相同");
    if (users.has(newUsername)) throw errors.conflict("目标账号名已存在");

    await withTx(async conn => {
      await conn.execute("UPDATE users SET username=? WHERE username=?", [newUsername, username]);
      await conn.execute("UPDATE user_data SET username=? WHERE username=?", [newUsername, username]);
    });

    users.delete(username);
    users.set(newUsername, user); // 同一对象引用，createdAt / builtin / hash 保持不变
    const sessions = destroySessionsOf(username, "rename");
    logger.info("members-admin", `账号重命名: ${username} -> ${newUsername}（会话失效 ${sessions}）`);
    return { action: "rename", from: username, to: newUsername, sessionsDestroyed: sessions };
  }

  /** 重置密码：新盐值 + 新哈希，写库并同步内存，随后踢掉全部会话 */
  async function resetPassword(username, password) {
    const { user } = requireUser(username);
    const pErr = validatePassword(password);
    if (pErr) throw errors.badRequest(pErr);
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await hashPassword(password, salt);

    await withTx(async conn => {
      await conn.execute("UPDATE users SET salt=?, hash=? WHERE username=?", [salt, hash, username]);
    });

    user.salt = salt;
    user.hash = hash;
    const sessions = destroySessionsOf(username, "reset-password");
    logger.info("members-admin", `重置密码: ${username}（会话失效 ${sessions}）`);
    return { action: "reset-password", username, sessionsDestroyed: sessions };
  }

  /** 强制下线：销毁该账号所有 Web 会话（不动密码），并留下用户端可识别的下线标记 */
  async function kick(rawName) {
    const { username } = requireUser(rawName);
    const sessions = destroySessionsOf(username, "kick");
    logger.info("members-admin", `强制下线: ${username}（会话失效 ${sessions}）`);
    return { action: "kick", username, sessionsDestroyed: sessions };
  }

  /** 删除账号：同事务删除 user_data 与 users，内存与会话同步清理 */
  async function remove(rawName) {
    const { username, user } = requireUser(rawName);
    assertNotBuiltin(user, "删除");

    await withTx(async conn => {
      await conn.execute("DELETE FROM user_data WHERE username=?", [username]);
      await conn.execute("DELETE FROM users WHERE username=?", [username]);
    });

    users.delete(username);
    const sessions = destroySessionsOf(username, "delete");
    logger.warn("members-admin", `删除账号: ${username}（会话失效 ${sessions}）`);
    return { action: "delete", username, sessionsDestroyed: sessions };
  }

  async function apply(body = {}) {
    const action = String(body.action || "").trim();
    switch (action) {
      case "create": return create(body.username, body.password);
      case "rename": return rename(body.username, body.newUsername);
      case "reset-password": return resetPassword(body.username, body.password);
      case "kick": return kick(body.username);
      case "delete": return remove(body.username);
      default: throw errors.badRequest("不支持的账号操作");
    }
  }

  return { apply, create, rename, resetPassword, kick, delete: remove };
}

module.exports = { createMembersAdmin };
