/**
 * OCR 进程管理器
 * - 可选自动启动 OCR 服务（AUTO_START_OCR=true）
 * - 定期健康检查，挂了自动重启
 * - 提供状态查询接口
 *
 * OCR 服务是 Python 进程（RapidOCR），默认不自动启动，
 * 用户可通过 start-ocr.bat 手动启动。设置 AUTO_START_OCR=true 后由 Node 管理。
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const config = require("../config");
const logger = require("../core/logger");
const ocr = require("../modules/chatrecord/ocr");

const OCR_SCRIPT = config.chatrecord.ocrScript;
const OCR_PORT = config.chatrecord.ocrPort;
const HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 秒检查一次
const MAX_RESTART_ATTEMPTS = 3; // 最大重启次数
const RESTART_COOLDOWN_MS = 60 * 1000; // 重启计数冷却时间：1 分钟

let ocrProcess = null;
let restartCount = 0;
let lastRestartTime = 0;
let healthCheckTimer = null;
let isStopping = false;

// 检查 OCR 脚本是否存在
function isScriptAvailable() {
  return fs.existsSync(OCR_SCRIPT);
}

// 检查 Python 是否可用
function isPythonAvailable() {
  return new Promise((resolve) => {
    const check = spawn("python", ["--version"], { stdio: "ignore" });
    check.on("error", () => resolve(false));
    check.on("close", (code) => resolve(code === 0));
  });
}

// 启动 OCR 进程
function startOcrProcess() {
  if (ocrProcess) {
    logger.info("ocr-manager", "OCR 进程已在运行");
    return { started: false, reason: "already_running" };
  }

  if (!isScriptAvailable()) {
    logger.warn("ocr-manager", `OCR 脚本不存在: ${OCR_SCRIPT}`);
    return { started: false, reason: "script_not_found" };
  }

  try {
    logger.info("ocr-manager", `启动 OCR 服务: python ${OCR_SCRIPT}`);
    ocrProcess = spawn("python", [OCR_SCRIPT], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(OCR_PORT) }
    });

    ocrProcess.stdout.on("data", (data) => {
      const lines = data.toString().trim().split("\n").filter(l => l.trim());
      lines.forEach(line => logger.debug("ocr-stdout", line));
    });

    ocrProcess.stderr.on("data", (data) => {
      const lines = data.toString().trim().split("\n").filter(l => l.trim());
      lines.forEach(line => logger.warn("ocr-stderr", line));
    });

    ocrProcess.on("close", (code) => {
      logger.warn("ocr-manager", `OCR 进程退出，code=${code}`);
      ocrProcess = null;
      if (!isStopping) {
        handleOcrCrash();
      }
    });

    ocrProcess.on("error", (err) => {
      logger.error("ocr-manager", "OCR 进程启动失败", err.message);
      ocrProcess = null;
    });

    return { started: true, pid: ocrProcess.pid };
  } catch (e) {
    logger.error("ocr-manager", "启动 OCR 进程异常", e);
    ocrProcess = null;
    return { started: false, reason: "exception", error: e.message };
  }
}

// 处理 OCR 崩溃，自动重启
async function handleOcrCrash() {
  const now = Date.now();
  // 冷却时间后重置计数
  if (now - lastRestartTime > RESTART_COOLDOWN_MS) {
    restartCount = 0;
  }

  if (restartCount >= MAX_RESTART_ATTEMPTS) {
    logger.error("ocr-manager", `OCR 重启次数已达上限（${MAX_RESTART_ATTEMPTS}次），停止自动重启`);
    return;
  }

  restartCount++;
  lastRestartTime = now;
  logger.info("ocr-manager", `OCR 自动重启（第 ${restartCount}/${MAX_RESTART_ATTEMPTS} 次）`);

  // 等 2 秒再重启，避免频繁启动
  setTimeout(() => {
    if (!isStopping && !ocrProcess) {
      startOcrProcess();
    }
  }, 2000);
}

// 停止 OCR 进程
function stopOcrProcess() {
  isStopping = true;
  if (ocrProcess) {
    logger.info("ocr-manager", "停止 OCR 进程");
    try {
      ocrProcess.kill("SIGTERM");
      // 5 秒后强制杀死
      setTimeout(() => {
        if (ocrProcess) {
          ocrProcess.kill("SIGKILL");
          ocrProcess = null;
        }
      }, 5000);
    } catch (e) {
      logger.error("ocr-manager", "停止 OCR 进程失败", e);
    }
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// 定期健康检查
function startHealthCheck() {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(async () => {
    if (isStopping || ocrProcess) return; // 进程在运行就不用管
    // 进程不在运行，检查是否应该启动
    const autoStart = process.env.AUTO_START_OCR === "true";
    if (autoStart) {
      const health = await ocr.checkHealth();
      if (!health.available) {
        logger.info("ocr-manager", "健康检查发现 OCR 不可用，尝试启动");
        startOcrProcess();
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

// 初始化（根据配置决定是否自动启动）
async function init() {
  const autoStart = process.env.AUTO_START_OCR === "true";
  if (!autoStart) {
    logger.info("ocr-manager", "AUTO_START_OCR=false，不自动启动 OCR 服务（可通过 start-ocr.bat 手动启动）");
    return { autoStart: false };
  }

  const pythonOk = await isPythonAvailable();
  if (!pythonOk) {
    logger.warn("ocr-manager", "Python 不可用，无法自动启动 OCR 服务");
    return { autoStart: true, pythonAvailable: false };
  }

  if (!isScriptAvailable()) {
    logger.warn("ocr-manager", `OCR 脚本不存在: ${OCR_SCRIPT}`);
    return { autoStart: true, scriptAvailable: false };
  }

  // 先检查是否已经在运行
  const health = await ocr.checkHealth();
  if (health.available) {
    logger.info("ocr-manager", "OCR 服务已在运行，无需启动");
    startHealthCheck();
    return { autoStart: true, alreadyRunning: true };
  }

  const result = startOcrProcess();
  startHealthCheck();
  return { autoStart: true, ...result };
}

// 获取状态
function getStatus() {
  return {
    running: !!ocrProcess,
    pid: ocrProcess?.pid || null,
    port: OCR_PORT,
    script: OCR_SCRIPT,
    autoStart: process.env.AUTO_START_OCR === "true",
    restartCount,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    scriptAvailable: isScriptAvailable()
  };
}

module.exports = {
  init,
  startOcrProcess,
  stopOcrProcess,
  getStatus,
  startHealthCheck
};
