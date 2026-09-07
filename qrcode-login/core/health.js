/**
 * 健康检查模块
 * - 数据库连接状态
 * - OCR 服务状态
 * - 服务运行时间、内存使用
 * - 版本信息
 */
const os = require("os");
const pool = require("../db/pool");
const config = require("../config");
const ocr = require("../modules/chatrecord/ocr");
const logger = require("../core/logger");

const startTime = Date.now();

// 检查数据库连接
async function checkDatabase() {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    return {
      status: "up",
      connected: true,
      host: config.db.host,
      port: config.db.port,
      database: config.db.database
    };
  } catch (e) {
    logger.warn("health", "数据库连接检查失败", e.message);
    return {
      status: "down",
      connected: false,
      error: e.message,
      host: config.db.host,
      port: config.db.port
    };
  }
}

// 检查 OCR 服务
async function checkOcr() {
  try {
    const result = await ocr.checkHealth();
    return {
      status: result.available ? "up" : "down",
      available: result.available,
      engine: result.engine || null,
      version: result.version || null,
      port: config.chatrecord.ocrPort
    };
  } catch (e) {
    return {
      status: "down",
      available: false,
      error: e.message,
      port: config.chatrecord.ocrPort
    };
  }
}

// 收集系统信息
function getSystemInfo() {
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  return {
    uptime: uptimeSec,
    uptimeFormatted: formatUptime(uptimeSec),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + "MB",
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB"
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024) + "MB",
      freeMemory: Math.round(os.freemem() / 1024 / 1024) + "MB"
    },
    environment: process.env.NODE_ENV || "development"
  };
}

// 格式化运行时间
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}时`);
  if (mins > 0) parts.push(`${mins}分`);
  parts.push(`${secs}秒`);
  return parts.join("");
}

// 完整健康检查
async function fullHealthCheck() {
  const [db, ocrStatus] = await Promise.all([
    checkDatabase(),
    checkOcr()
  ]);

  const allUp = db.status === "up"; // OCR 是可选的，不影响整体状态
  return {
    status: allUp ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      database: db,
      ocr: ocrStatus
    },
    system: getSystemInfo()
  };
}

// 轻量健康检查（只检查数据库，用于负载均衡）
async function simpleHealthCheck() {
  const db = await checkDatabase();
  return {
    status: db.status === "up" ? "ok" : "down",
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  fullHealthCheck,
  simpleHealthCheck,
  checkDatabase,
  checkOcr,
  getSystemInfo
};
