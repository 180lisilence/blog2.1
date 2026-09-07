/**
 * 项目中心业务逻辑
 * - 内置项目列表
 * - 导入项目持久化（projects.json）
 * - 扫描、导入、删除
 */
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const logger = require("../../core/logger");
const { errors } = require("../../core/errors");
const { validateFolderName } = require("../../core/security");
const { readAndValidate } = require("./validator");

// 内置项目（不可删除）
const BUILTIN_PROJECTS = [
  { id: "builtin-workbench", name: "个人工作台", desc: "工作生活一体化本地管理应用", url: "/blog/workbench/index.html", icon: "🛠️", color: "c1", builtin: true },
  { id: "builtin-steel", name: "钢铁前线 · 狙击", desc: "二战写实 FPS 游戏", url: "/blog/projects/steel-frontline/index.html", icon: "🎯", color: "c2", builtin: true },
  { id: "builtin-jizhiyun", name: "极智云 · 企业门户", desc: "企业级大型综合门户", url: "/blog/projects/jizhiyun-pro/index.html", icon: "☁️", color: "c3", builtin: true },
  { id: "builtin-shantou", name: "我们的山头", desc: "我的世界服务器官网", url: "/blog/projects/shantou/index.html", icon: "⛏️", color: "c4", builtin: true },
  { id: "builtin-restaurant", name: "餐厅学生管理系统", desc: "面向餐厅场景的学生管理系统", url: "/blog/projects/restaurant/index.html", icon: "🍽️", color: "c5", builtin: true },
  { id: "builtin-earth", name: "Earth Online", desc: "交互式地球轨道设计器", url: "/blog/projects/earth-online/index.html", icon: "🌍", color: "c6", builtin: true },
  { id: "builtin-chatrecord", name: "ChatRecord 会话时序实验室", desc: "导入聊天记录生成时序分析图表", url: "/blog/projects/chatrecord/index.html", icon: "🌸", color: "c2", builtin: true },
  { id: "builtin-blog", name: "博客首页", desc: "回到博客首页", url: "/blog/", icon: "📖", color: "c1", builtin: true }
];

// 读取导入的项目
function readImported() {
  try {
    if (!fs.existsSync(config.projectsFile)) return [];
    return JSON.parse(fs.readFileSync(config.projectsFile, "utf-8"));
  } catch (e) {
    logger.error("projects-service", "读取 projects.json 失败", e);
    return [];
  }
}

// 保存导入的项目
function writeImported(list) {
  try {
    fs.writeFileSync(config.projectsFile, JSON.stringify(list, null, 2), "utf-8");
  } catch (e) {
    logger.error("projects-service", "写入 projects.json 失败", e);
    throw errors.internal("保存项目失败");
  }
}

// 获取全部项目（内置 + 导入）
function getAll() {
  return [...BUILTIN_PROJECTS, ...readImported()];
}

// 扫描白名单：已存在的项目文件夹，扫描时排除
// 1. 从内置项目 URL 自动提取
// 2. 手动补充已存在但未内置的旧项目
const BUILTIN_FOLDERS = new Set([
  // 从内置项目 URL 提取
  ...BUILTIN_PROJECTS
    .map(p => {
      const m = p.url.match(/\/blog\/projects\/([^/]+)\//);
      return m ? m[1] : null;
    })
    .filter(Boolean),
  // 手动补充：已存在的旧项目文件夹（无 project.json，不应出现在可导入列表）
  "jizhiyun-demo",
  "shantou2"
]);

function scanAvailable() {
  const imported = readImported();
  const importedFolders = new Set(imported.map(p => p.folder));
  const available = [];
  try {
    const folders = fs.readdirSync(config.projects.dir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    for (const f of folders) {
      if (importedFolders.has(f.name)) continue;
      if (BUILTIN_FOLDERS.has(f.name)) continue;
      const result = readAndValidate(f.name);
      const name = result.manifest?.name || f.name;
      const icon = result.manifest?.icon || "📁";
      available.push({
        folder: f.name,
        name,
        icon,
        valid: result.valid,
        errors: result.valid ? undefined : result.errors
      });
    }
  } catch (e) {
    logger.error("projects-service", "扫描项目文件夹失败", e);
  }
  return available;
}

// 导入项目
function importProject(folderName) {
  // 验证文件夹名
  const folderErr = validateFolderName(folderName);
  if (folderErr) throw errors.badRequest(folderErr);

  const folderPath = path.join(config.projects.dir, folderName);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw errors.badRequest(`文件夹不存在: blog/projects/${folderName}`);
  }

  // 读取并验证 project.json
  const result = readAndValidate(folderName);
  if (!result.valid) {
    throw errors.badRequest("规范验证失败", result.errors);
  }

  // 检查是否已导入
  const imported = readImported();
  if (imported.find(p => p.folder === folderName)) {
    throw errors.conflict("该项目已导入");
  }

  const manifest = result.manifest;
  const project = {
    id: "imported-" + Date.now(),
    folder: folderName,
    name: manifest.name.trim(),
    desc: manifest.description || "",
    url: `/blog/projects/${folderName}/${manifest.entry}`,
    icon: manifest.icon || "📁",
    color: manifest.color || "c1",
    version: manifest.version || "1.0.0",
    author: manifest.author || "",
    tags: manifest.tags || [],
    importedAt: Date.now(),
    builtin: false
  };
  imported.push(project);
  writeImported(imported);
  logger.info("projects-service", `项目导入成功: ${project.name} (${folderName})`);
  return project;
}

// 删除导入的项目
function deleteProject(id) {
  if (id.startsWith("builtin-")) {
    throw errors.badRequest("内置项目不可删除");
  }
  const imported = readImported();
  const idx = imported.findIndex(p => p.id === id);
  if (idx < 0) throw errors.notFound("项目不存在");
  const removed = imported.splice(idx, 1)[0];
  writeImported(imported);
  logger.info("projects-service", `项目已删除: ${removed.name}`);
  return removed;
}

module.exports = {
  BUILTIN_PROJECTS,
  getAll,
  scanAvailable,
  importProject,
  deleteProject
};
