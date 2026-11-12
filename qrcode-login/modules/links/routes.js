/**
 * 友链路由
 * - GET /api/links  外链作品列表（公开，博客访客可见）
 */
const express = require("express");
const logger = require("../../core/logger");
const { fail, ok } = require("../../core/errors");
const linksService = require("./service");

const router = express.Router();

// 友链列表（公开访问）
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
