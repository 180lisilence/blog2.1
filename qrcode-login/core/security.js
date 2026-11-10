/**
 * 安全检查模块
 * - 输入验证
 * - 路径穿越防护
 * - XSS 基础防护
 * - 空指针安全访问
 */
const path = require("path");
const { errors } = require("./errors");

// 用户名正则：2-20位字母、数字、中文或 @._-
const USERNAME_REGEX = /^[\w\u4e00-\u9fa5@.\-]{2,20}$/;

// 验证用户名
function validateUsername(username) {
  if (!username || typeof username !== "string") return "账号不能为空";
  const u = username.trim();
  if (!USERNAME_REGEX.test(u)) return "账号需为 2-20 位字母、数字、中文或 @._- 组合";
  return null;
}

// 验证密码
//
// 3-01 / 8-02：旧策略只要求 6-32 位，`123456` 这类口令可直接注册。
// 现在要求 8-64 位且同时包含字母与数字，前端注册/改密提示已同步。
// 该校验只作用于「新设置的密码」，不影响已有账号登录。
function validatePassword(password) {
  if (!password || typeof password !== "string") return "密码不能为空";
  if (password.length < 8 || password.length > 64) return "密码长度需为 8-64 位";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "密码需同时包含字母和数字";
  }
  return null;
}

// 防止路径穿越：确保目标路径在 baseDir 内
function safePath(baseDir, ...segments) {
  const target = path.join(baseDir, ...segments);
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw errors.badRequest("非法路径访问");
  }
  return resolvedTarget;
}

// 验证文件夹名（不含路径分隔符和 ..）
function validateFolderName(name) {
  if (!name || typeof name !== "string") return "文件夹名不能为空";
  const n = name.trim();
  if (!n || n.includes("..") || n.includes("/") || n.includes("\\") || n.includes("\0")) {
    return "文件夹名不合法";
  }
  return null;
}

// 安全获取对象属性（空指针检查）
function safeGet(obj, path, defaultValue) {
  if (obj == null) return defaultValue;
  const keys = path.split(".");
  let cur = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== "object") return defaultValue;
    cur = cur[key];
  }
  return cur === undefined ? defaultValue : cur;
}

// 基础 XSS 转义
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 限制字符串长度
function truncate(str, maxLen) {
  if (typeof str !== "string") return str;
  return str.length > maxLen ? str.substring(0, maxLen) : str;
}

module.exports = {
  validateUsername,
  validatePassword,
  safePath,
  validateFolderName,
  safeGet,
  escapeHtml,
  truncate,
  USERNAME_REGEX
};
