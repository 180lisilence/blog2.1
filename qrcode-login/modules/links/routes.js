/**
 * 友链路由
 * - GET /api/links  外链作品列表（需登录）
 */
const express = require("express");
const logger = require("../../core/logger");
const { fail, ok } = require("../../core/errors");
const { getTokenFromReq } = require("../../middleware/auth");
const sessionMgr = require("../auth/session");
const linksService = require("./service");

const router = express.Router();

// 本模块所有接口都需要登录（与 projects 模块保持一致）
router.use((req, res, next) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  req.username = ws.username;
  next();
});

// 友链列表
router.get("/", (req, res) => {
  try {
    const links = linksService.getLinks();
    ok(res, { links, count: links.length });
  } catch (e) {
    logger.error("links-route", "获取友链失败", e);
    fail(res, 500, "获取友链失败");
  }
});

module.exports = router;
