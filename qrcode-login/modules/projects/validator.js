/**
 * project.json 规范验证
 */
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const logger = require("../../core/logger");

const VALID_COLORS = config.projects.validColors;

// 验证 project.json 规范
function validateManifest(manifest, folderName) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    errors.push("project.json 不是有效的 JSON 对象");
    return errors;
  }
  // 必填：name
  if (!manifest.name || typeof manifest.name !== "string" || !manifest.name.trim()) {
    errors.push("缺少必填字段 name（项目名称）");
  }
  // 必填：entry
  if (!manifest.entry || typeof manifest.entry !== "string" || !manifest.entry.trim()) {
    errors.push("缺少必填字段 entry（入口文件，如 index.html）");
  } else if (!/^[A-Za-z0-9._/-]+$/.test(manifest.entry)
             || manifest.entry.startsWith("/")
             || manifest.entry.split("/").includes("..")) {
    // B2-05 / P-11：entry 会被拼进对外 URL 与磁盘路径，必须禁止
    // 绝对路径与 .. 逃逸，否则导入一个伪造 project.json 就能让
    // 静态托管读到 projects/ 目录之外的文件。
    errors.push("entry 只能是项目内的相对路径，且不能包含 .. 或绝对路径");
  }
  // 可选字段类型检查
  if (manifest.version && typeof manifest.version !== "string") {
    errors.push("version 必须是字符串");
  }
  if (manifest.description && typeof manifest.description !== "string") {
    errors.push("description 必须是字符串");
  }
  if (manifest.icon && typeof manifest.icon !== "string") {
    errors.push("icon 必须是字符串（单个 emoji 或字符）");
  }
  if (manifest.color && !VALID_COLORS.includes(manifest.color)) {
    errors.push(`color 必须是 ${VALID_COLORS.join("/")} 之一`);
  }
  if (manifest.tags && !Array.isArray(manifest.tags)) {
    errors.push("tags 必须是数组");
  }
  // 检查入口文件是否存在（仅当 entry 已通过上面的路径校验）
  if (manifest.entry && typeof manifest.entry === "string" && manifest.entry.trim()
      && /^[A-Za-z0-9._/-]+$/.test(manifest.entry)
      && !manifest.entry.startsWith("/")
      && !manifest.entry.split("/").includes("..")) {
    const entryPath = path.resolve(config.projects.dir, folderName, manifest.entry);
    const base = path.resolve(config.projects.dir, folderName) + path.sep;
    if (!entryPath.startsWith(base)) {
      errors.push("entry 路径越界");
    } else if (!fs.existsSync(entryPath)) {
      errors.push(`入口文件不存在: ${manifest.entry}`);
    }
  }
  return errors;
}

// 读取并验证项目文件夹的 project.json
function readAndValidate(folderName) {
  const manifestPath = path.join(config.projects.dir, folderName, "project.json");
  if (!fs.existsSync(manifestPath)) {
    return { valid: false, errors: ["未找到 project.json"] };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (e) {
    // B2-05：JSON.parse 的原始错误可能带服务器目录结构与堆栈片段，
    // 只进服务端日志，对外统一固定文案。
    logger.warn("projects-validator", `解析 project.json 失败: ${folderName}`, e.message);
    return { valid: false, errors: ["project.json 格式错误，无法解析"] };
  }
  const errors = validateManifest(manifest, folderName);
  return { valid: errors.length === 0, errors, manifest };
}

module.exports = { validateManifest, readAndValidate, VALID_COLORS };
