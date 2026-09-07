/**
 * 数据库初始化
 * 自动创建数据库、表结构、内置管理员
 */
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const fs = require("fs");
const config = require("../config");
const logger = require("../core/logger");

// 建库 SQL（不指定 database 连接）
const CREATE_DATABASE_SQL = `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

// 建表 SQL
const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    username VARCHAR(255) NOT NULL PRIMARY KEY,
    salt VARCHAR(64) NOT NULL,
    hash VARCHAR(128) NOT NULL,
    created_at BIGINT NOT NULL,
    is_builtin TINYINT DEFAULT 0,
    INDEX idx_builtin (is_builtin)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS user_data (
    username VARCHAR(255) NOT NULL,
    data_key VARCHAR(100) NOT NULL,
    data_value JSON,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (username, data_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

// 确保数据库存在
async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true
  });
  try {
    await conn.query(CREATE_DATABASE_SQL);
    logger.info("db-init", `数据库已确保存在: ${config.db.database}`);
  } finally {
    await conn.end();
  }
}

// 确保表结构存在
async function ensureTables(pool) {
  for (const sql of CREATE_TABLES_SQL) {
    await pool.query(sql);
  }
  logger.info("db-init", "表结构已确保存在");
}

// 确保内置管理员存在
async function ensureBuiltinAdmin(pool) {
  const [rows] = await pool.query("SELECT username FROM users WHERE username = ?", [config.defaultAdmin.username]);
  if (rows.length > 0) {
    logger.info("db-init", `内置管理员已存在: ${config.defaultAdmin.username}`);
    return;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(config.defaultAdmin.password, salt);
  await pool.execute(
    "INSERT INTO users (username, salt, hash, created_at, is_builtin) VALUES (?,?,?,?,1)",
    [config.defaultAdmin.username, salt, hash, Date.now()]
  );
  logger.info("db-init", `已创建内置管理员: ${config.defaultAdmin.username} / ${config.defaultAdmin.password}`);
}

// 从旧 users.json 迁移数据
async function migrateFromJson(pool) {
  if (!fs.existsSync(config.usersFile)) return;
  try {
    const old = JSON.parse(fs.readFileSync(config.usersFile, "utf-8"));
    const names = Object.keys(old);
    if (names.length === 0) return;
    let migrated = 0;
    for (const name of names) {
      const [exists] = await pool.query("SELECT username FROM users WHERE username = ?", [name]);
      if (exists.length > 0) continue;
      const u = old[name];
      await pool.execute(
        "INSERT INTO users (username, salt, hash, created_at, is_builtin) VALUES (?,?,?,?,?)",
        [name, u.salt, u.hash, u.createdAt || Date.now(), u.builtin ? 1 : 0]
      );
      migrated++;
    }
    if (migrated > 0) {
      logger.info("db-init", `已从 users.json 迁移 ${migrated} 个账号到 MySQL`);
    }
  } catch (e) {
    logger.error("db-init", "迁移 users.json 失败", e);
  }
}

// 完整初始化流程
async function initDatabase(pool) {
  try {
    await ensureDatabase();
    await ensureTables(pool);
    await migrateFromJson(pool);
    await ensureBuiltinAdmin(pool);
    logger.info("db-init", "数据库初始化完成");
    return true;
  } catch (e) {
    logger.error("db-init", "数据库初始化失败", e);
    return false;
  }
}

module.exports = { initDatabase, hashPassword };
