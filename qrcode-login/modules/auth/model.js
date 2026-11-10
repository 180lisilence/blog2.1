/**
 * 用户模型
 * MySQL 持久化 + 内存缓存
 */
const crypto = require("crypto");
const pool = require("../../db/pool");
const logger = require("../../core/logger");
const { errors } = require("../../core/errors");

// 内存缓存：{ username: { salt, hash, createdAt, builtin } }
const users = new Map();

// P-10（04-访客权限加固复测遗留）：scryptSync 是同步阻塞调用，默认
// N=16384 的单次计算会占满整个事件循环几十毫秒；登录/注册/改密并发时
// 全站请求（含静态资源、健康检查）都会被卡住，属于可被放大的 DoS 面。
// 改为 crypto.scrypt 的异步版本，计算落到 libuv 线程池，不阻塞主线程。
function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString("hex"));
    });
  });
}

// 从 MySQL 加载所有用户到内存
async function loadAll() {
  try {
    const [rows] = await pool.query("SELECT username, salt, hash, created_at, is_builtin FROM users");
    users.clear();
    for (const r of rows) {
      users.set(r.username, {
        salt: r.salt,
        hash: r.hash,
        createdAt: Number(r.created_at),
        builtin: !!r.is_builtin
      });
    }
    logger.info("auth-model", `已加载 ${users.size} 个用户`);
  } catch (e) {
    logger.error("auth-model", "加载用户失败", e);
    throw e;
  }
}

// 获取用户
function get(username) {
  return users.get(username) || null;
}

// 检查用户是否存在
function exists(username) {
  return users.has(username);
}

// 验证密码（异步，见 hashPassword 说明）
async function verifyPassword(username, password) {
  const user = users.get(username);
  if (!user) return null;
  const computed = Buffer.from(await hashPassword(password, user.salt), "hex");
  const stored = Buffer.from(String(user.hash || ""), "hex");
  // 定长比较，避免普通 !== 的逐字节早退形成时序侧信道
  if (computed.length !== stored.length || !crypto.timingSafeEqual(computed, stored)) return null;
  return user;
}

// 创建用户
async function create(username, password, builtin = false) {
  if (users.has(username)) {
    throw errors.conflict("该账号已被注册，请直接登录");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  const createdAt = Date.now();
  try {
    await pool.execute(
      "INSERT INTO users (username, salt, hash, created_at, is_builtin) VALUES (?,?,?,?,?)",
      [username, salt, hash, createdAt, builtin ? 1 : 0]
    );
  } catch (e) {
    logger.error("auth-model", "写入用户到 MySQL 失败", e);
    throw errors.internal("注册失败，请稍后重试");
  }
  const user = { salt, hash, createdAt, builtin };
  users.set(username, user);
  logger.info("auth-model", `已创建用户: ${username}${builtin ? " (内置)" : ""}`);
  return user;
}

// 修改密码
async function changePassword(username, oldPassword, newPassword) {
  const user = users.get(username);
  if (!user) throw errors.notFound("用户不存在");
  // 验证旧密码
  const oldHash = Buffer.from(await hashPassword(oldPassword, user.salt), "hex");
  const stored = Buffer.from(String(user.hash || ""), "hex");
  if (oldHash.length !== stored.length || !crypto.timingSafeEqual(oldHash, stored)) {
    throw errors.badRequest("旧密码错误");
  }
  // 生成新盐值和哈希
  const newSalt = crypto.randomBytes(16).toString("hex");
  const newHash = await hashPassword(newPassword, newSalt);
  try {
    await pool.execute(
      "UPDATE users SET salt = ?, hash = ? WHERE username = ?",
      [newSalt, newHash, username]
    );
  } catch (e) {
    logger.error("auth-model", "更新密码到 MySQL 失败", e);
    throw errors.internal("修改密码失败，请稍后重试");
  }
  user.salt = newSalt;
  user.hash = newHash;
  logger.info("auth-model", `用户修改密码: ${username}`);
  return true;
}

// 获取所有用户名
function listUsernames() {
  return Array.from(users.keys());
}

module.exports = { users, loadAll, get, exists, verifyPassword, create, changePassword, listUsernames, hashPassword };
