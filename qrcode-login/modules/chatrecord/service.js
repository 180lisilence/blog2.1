/**
 * ChatRecord 业务逻辑
 * 文件存储：data/chatrecord/{username}/
 *  - index.json: 会话索引
 *  - {id}.json: 会话详情
 */
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const config = require("../../config");
const logger = require("../../core/logger");
const { errors } = require("../../core/errors");

const DATA_DIR = config.chatrecord.dataDir;

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 用户数据目录
function userDir(username) {
  const dir = path.join(DATA_DIR, username);
  ensureDir(dir);
  return dir;
}

// 读取 JSON（带默认值）
function readJSON(fp, def) {
  try {
    if (!fs.existsSync(fp)) return def;
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch (e) {
    logger.warn("chatrecord-service", `读取 JSON 失败: ${fp}`, e.message);
    return def;
  }
}

// 写入 JSON
function writeJSON(fp, data) {
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8");
}

// 加载会话索引
function loadIndex(username) {
  return readJSON(path.join(userDir(username), "index.json"), []);
}

// 保存会话索引
function saveIndex(username, list) {
  writeJSON(path.join(userDir(username), "index.json"), list);
}

// 加载会话详情
function loadSession(username, id) {
  return readJSON(path.join(userDir(username), `${id}.json`), null);
}

// 保存会话详情
function saveSession(username, sess) {
  writeJSON(path.join(userDir(username), `${sess.id}.json`), sess);
}

// 删除会话
function deleteSession(username, id) {
  const fp = path.join(userDir(username), `${id}.json`);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  const idx = loadIndex(username);
  const newIdx = idx.filter(s => s.id !== id);
  saveIndex(username, newIdx);
}

// 更新索引元数据
function updateIndexMeta(username, sess) {
  const idx = loadIndex(username);
  const existing = idx.find(s => s.id === sess.id);
  const meta = {
    id: sess.id,
    title: sess.title || "未命名会话",
    messageCount: sess.messages?.length || 0,
    createdAt: sess.createdAt,
    updatedAt: Date.now()
  };
  if (existing) {
    Object.assign(existing, meta);
  } else {
    idx.unshift(meta);
  }
  saveIndex(username, idx);
}

// 列出会话
function listSessions(username) {
  return loadIndex(username);
}

// 创建会话
function createSession(username, data) {
  const now = Date.now();
  const sess = {
    id: uuidv4(),
    title: data.title || "未命名会话",
    messages: data.messages || [],
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now
  };
  saveSession(username, sess);
  updateIndexMeta(username, sess);
  logger.info("chatrecord-service", `创建会话: ${username}/${sess.id}`);
  return sess;
}

// 获取会话
function getSession(username, id) {
  const sess = loadSession(username, id);
  if (!sess) throw errors.notFound("会话不存在");
  return sess;
}

// 更新会话
function updateSession(username, id, data) {
  const sess = loadSession(username, id);
  if (!sess) throw errors.notFound("会话不存在");
  if (data.title !== undefined) sess.title = data.title;
  if (data.messages !== undefined) sess.messages = data.messages;
  if (data.metadata !== undefined) sess.metadata = data.metadata;
  sess.updatedAt = Date.now();
  saveSession(username, sess);
  updateIndexMeta(username, sess);
  return sess;
}

// 导入会话（从文本/JSON）
function importSession(username, id, importData) {
  const sess = loadSession(username, id);
  if (!sess) throw errors.notFound("会话不存在");
  if (importData.messages) {
    sess.messages = importData.messages;
  }
  if (importData.title) {
    sess.title = importData.title;
  }
  sess.updatedAt = Date.now();
  saveSession(username, sess);
  updateIndexMeta(username, sess);
  logger.info("chatrecord-service", `导入会话数据: ${username}/${id}, ${sess.messages.length} 条`);
  return sess;
}

module.exports = {
  listSessions,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  importSession,
  ensureDir,
  userDir
};
