/**
 * 统一分级日志
 * 级别：DEBUG < INFO < WARN < ERROR
 * 格式：[时间] [级别] [模块] 消息
 */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function timestamp() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function format(level, module, msg, extra) {
  const base = `[${timestamp()}] [${level}] [${module}] ${msg}`;
  if (extra !== undefined) {
    if (extra instanceof Error) return `${base}\n${extra.stack || extra.message}`;
    if (typeof extra === "object") return `${base} ${JSON.stringify(extra)}`;
    return `${base} ${extra}`;
  }
  return base;
}

const logger = {
  debug(module, msg, extra) {
    if (currentLevel <= LOG_LEVELS.DEBUG) console.log(format("DEBUG", module, msg, extra));
  },
  info(module, msg, extra) {
    if (currentLevel <= LOG_LEVELS.INFO) console.log(format("INFO", module, msg, extra));
  },
  warn(module, msg, extra) {
    if (currentLevel <= LOG_LEVELS.WARN) console.warn(format("WARN", module, msg, extra));
  },
  error(module, msg, extra) {
    if (currentLevel <= LOG_LEVELS.ERROR) console.error(format("ERROR", module, msg, extra));
  }
};

module.exports = logger;
