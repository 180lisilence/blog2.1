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
const authModel = require("../auth/model");
const model = require("./model");
const service = require("./service");

const router = express.Router();

/**
 * 删除权限判定：
 *   - 内置管理员（builtin）可删除任何人的评论
 *   - 普通用户可删除自己发表的评论
 */
function isAdminUser(username) {
  if (!username) return false;
  try {
    const u = authModel.users.get(username);
    return Boolean(u && u.builtin);
  } catch (e) {
    return false;
  }
}

function canDeleteComment(viewer, commentUsername) {
  // 管理员删任何人
  if (viewer.isAdmin) return true;
  // 作者删自己的
  return viewer.name === commentUsername;
}

// 本模块所有接口都需要登录
router.use((req, res, next) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  req.username = ws.username;
  // 查看者身份：名字用于展示，isAdmin 决定删除按钮显隐与删除接口放行
  req.viewer = { name: ws.username, isAdmin: isAdminUser(ws.username) };
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
  const tree = service.buildTree(rows, req.viewer);

  // 当前登录用户的展示名（前端发表框用）+ 是否管理员（前端删除入口显隐用）
  ok(res, {
    slug,
    comments: tree,
    total,
    page,
    size,
    totalPages,
    isAdmin: req.viewer.isAdmin
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

  ok(res, { comment: service.toDTO(row, req.viewer) }, "评论已发布");
}));

// ========== 删除评论 ==========
// 权限规则：
//   - 内置管理员可删除任何人的评论
//   - 普通用户可删除自己发表的评论
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return fail(res, 400, "评论 ID 不合法");
  }

  const row = await model.getById(id);
  if (!row || row.status === 0) {
    return fail(res, 404, "评论不存在或已删除");
  }

  if (!canDeleteComment(req.viewer, row.username)) {
    logger.warn(
      "comments-route",
      `拒绝删除评论: user=${req.username}, id=${id}, owner=${row.username}`
    );
    return fail(res, 403, "无权删除他人的评论");
  }

  const replyCount = await model.countReplies(id);
  // 2.2.8：删除后立刻返回最新计数，前端无需再发一次列表请求即可同步。
  // 计数口径与 listByPost 的 total 完全一致（见 model.js 的 VISIBLE_TOP）。
  const postSlug = row.post_slug;
  if (replyCount > 0) {
    // 有回复：软删除父评论并把子回复提升为顶层，回复不丢、也不会变孤儿
    await model.softDelete(id);
    const total = await model.countByPost(postSlug);
    logger.info(
      "comments-route",
      `${req.username} 软删除评论 #${id}（有 ${replyCount} 条回复，已提升为顶层），剩余计数=${total}`
    );
    return ok(res, { soft: true, total }, "评论已删除（该评论下的回复会保留）");
  }

  // 无回复：直接删行
  await model.hardDelete(id);
  const total = await model.countByPost(postSlug);
  logger.info("comments-route", `${req.username} 删除评论 #${id}，剩余计数=${total}`);
  ok(res, { soft: false, total }, "评论已删除");
}));

module.exports = router;
