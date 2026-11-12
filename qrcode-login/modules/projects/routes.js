/**
 * 项目中心路由
 * - 项目列表
 * - 扫描可导入项目
 * - 导入项目
 * - 删除导入项目
 */
const express = require("express");
const logger = require("../../core/logger");
const { asyncHandler, ok, fail } = require("../../core/errors");
const { getTokenFromReq } = require("../../middleware/auth");
const sessionMgr = require("../auth/session");
const projectService = require("./service");

const router = express.Router();

// 认证检查中间件（写操作和管理接口需要登录）
function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  req.username = ws.username;
  next();
}

// 项目列表（公开，博客首页用）
router.get("/", (req, res) => {
  const projects = projectService.getAll();
  ok(res, { projects });
});

// 扫描可导入的项目（需登录）
router.get("/scan", requireAuth, (req, res) => {
  const available = projectService.scanAvailable();
  ok(res, { available });
});

// 导入项目（需登录）
router.post("/import", requireAuth, (req, res) => {
  const { folder } = req.body || {};
  const folderName = String(folder || "").trim();
  if (!folderName) return fail(res, 400, "请输入项目文件夹名");
  try {
    const project = projectService.importProject(folderName);
    ok(res, { project }, `导入成功: ${project.name}`);
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message, e.details);
    logger.error("projects-route", "导入项目失败", e);
    fail(res, 500, "导入失败，请稍后重试");
  }
});

// 删除导入项目（需登录）
router.delete("/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  try {
    const removed = projectService.deleteProject(id);
    ok(res, null, `已删除: ${removed.name}`);
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    logger.error("projects-route", "删除项目失败", e);
    fail(res, 500, "删除失败，请稍后重试");
  }
});

module.exports = router;
