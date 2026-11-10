/**
 * 博客评论路由
 *
 * 全部接口都要求登录（与 projects / links 模块保持一致）——
 * 本站是私人作品库，评论不对外开放。
 *
 * GET    /api/comments/:slug        文章评论列表（分页）
 * POST   /api/comments/:slug        发表评论或回复
 * DELETE /api/comments/:id          删除自己的评论
 * GET    /api/comments/stats/all    全站评论统计
 */
const express = require("express");
const logger = require("../../core/logger");
const { asyncHandler, ok, fail } = require("../../core/errors");
const { getTokenFromReq } = require("../../middleware/auth");
const sessionMgr = require("../auth/session");
const model = require("./model");
const service = require("./service");

const router = express.Router();

// 本模块所有接口都需要登录
router.use((req, res, next) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  req.username = ws.username;
  next();
});

// ========== 全站统计 ==========
// 必须放在 /:slug 之前，否则 stats/all 会被 /:slug 抢先匹配（slug="stats"）
router.get("/stats/all", asyncHandler(async (req, res) => {
  const result = await model.stats();
  ok(res, result);
}));

// ========== 评论列表 ==========
router.get("/:slug", asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!service.isValidPost(slug)) {
    return fail(res, 404, "文章不存在");
  }

  let page = parseInt(req.query.page, 10);
  let size = parseInt(req.query.size, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(size) || size < 1) size = service.DEFAULT_PAGE_SIZE;
  if (size > service.MAX_PAGE_SIZE) size = service.MAX_PAGE_SIZE;

  const { rows, total, totalPages } = await model.listByPost(slug, page, size);
  const tree = service.buildTree(rows, req.username);

  // 当前登录用户的展示名（前端发表框用）
  ok(res, {
    slug,
    comments: tree,
    total,
    page,
    size,
    totalPages
  });
}));

// ========== 发表评论 / 回复 ==========
router.post("/:slug", asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!service.isValidPost(slug)) {
    return fail(res, 404, "文章不存在");
  }

  const body = req.body || {};
  const check = service.validateContent(body.content);
  if (!check.ok) return fail(res, 400, check.msg);

  // 频率限制：同一用户两次评论至少间隔 RATE_LIMIT_MS
  const last = await model.lastCommentAt(req.username);
  if (last && Date.now() - last < service.RATE_LIMIT_MS) {
    const wait = Math.ceil((service.RATE_LIMIT_MS - (Date.now() - last)) / 1000);
    return fail(res, 429, `发言太快了，请 ${wait} 秒后再试`);
  }

  // 解析父评论：只支持一级回复
  let parentId = null;
  if (body.parentId !== undefined && body.parentId !== null && body.parentId !== "") {
    const pid = Number(body.parentId);
    if (!Number.isInteger(pid) || pid <= 0) {
      return fail(res, 400, "回复目标不合法");
    }
    const parent = await model.getById(pid);
    if (!parent || parent.status === 0) {
      return fail(res, 404, "要回复的评论不存在或已删除");
    }
    if (parent.post_slug !== slug) {
      return fail(res, 400, "回复目标不属于当前文章");
    }
    // 二级及以下的回复统一挂到顶层评论上，保持两级结构
    parentId = parent.parent_id === null ? Number(parent.id) : Number(parent.parent_id);
  }

  const id = await model.create({
    postSlug: slug,
    parentId,
    username: req.username,
    content: check.content,
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });

  const row = await model.getById(id);
  logger.info("comments-route", `${req.username} 评论 ${slug}#${id}${parentId ? ` 回复@${parentId}` : ""}`);

  ok(res, { comment: service.toDTO(row, req.username) }, "评论已发布");
}));

// ========== 删除自己的评论 ==========
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return fail(res, 400, "评论 ID 不合法");
  }

  const row = await model.getById(id);
  if (!row || row.status === 0) {
    return fail(res, 404, "评论不存在或已删除");
  }
  if (row.username !== req.username) {
    return fail(res, 403, "只能删除自己的评论");
  }

  const replyCount = await model.countReplies(id);
  if (replyCount > 0) {
    // 有回复：软删除，保留占位，回复链不断
    await model.softDelete(id);
    logger.info("comments-route", `${req.username} 软删除评论 #${id}（有 ${replyCount} 条回复）`);
    return ok(res, { soft: true }, "评论已删除（该评论下的回复会保留）");
  }

  // 无回复：直接删行
  await model.hardDelete(id);
  logger.info("comments-route", `${req.username} 删除评论 #${id}`);
  ok(res, { soft: false }, "评论已删除");
}));

module.exports = router;
