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

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
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

// 验证密码
function verifyPassword(username, password) {
  const user = users.get(username);
  if (!user) return null;
  if (hashPassword(password, user.salt) !== user.hash) return null;
  return user;
}

// 创建用户
async function create(username, password, builtin = false) {
  if (users.has(username)) {
    throw errors.conflict("该账号已被注册，请直接登录");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
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
  if (hashPassword(oldPassword, user.salt) !== user.hash) {
    throw errors.badRequest("旧密码错误");
  }
  // 生成新盐值和哈希
  const newSalt = crypto.randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, newSalt);
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
