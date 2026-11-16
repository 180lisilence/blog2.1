/**
 * 文章路由（3.1）
 *
 * 挂载位置：/api/posts（loginFirstGuard + verifyCsrfToken 之后，与 /api/ai 同级）
 * - 公开 GET：已发布文章列表 / 详情（博客访客可读）
 * - 登录 POST：发表文章（写操作由 loginFirstGuard 保证登录，内部再兜一层）
 * - 管理员：待审队列、通过 / 驳回、删除任意文章
 *
 * GET  /api/posts                 已发布文章分页
 * GET  /api/posts/mine            我的文章（含待审/拦截）
 * GET  /api/posts/pending         待审队列（管理员）
 * GET  /api/posts/stats           状态统计（管理员）
 * GET  /api/posts/:slug           已发布文章详情
 * POST /api/posts                 发表文章
 * POST /api/posts/:id/review      快速审核（approve / reject）
 * DELETE /api/posts/:id           删除自己的文章（管理员可删任意）
 */
const express = require("express");
const logger = require("../../core/logger");
const { asyncHandler, ok, fail } = require("../../core/errors");
const { getTokenFromReq } = require("../../middleware/auth");
const sessionMgr = require("../auth/session");
const authModel = require("../auth/model");
const sensitive = require("./sensitive");
const model = require("./model");
const service = require("./service");

const router = express.Router();

/**
 * 从请求解析当前用户；未登录返回 null
 */
function getViewer(req) {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return null;
  const u = authModel.users.get(ws.username);
  return { name: ws.username, isAdmin: Boolean(u && u.builtin) };
}

function requireLogin(req, res) {
  const viewer = getViewer(req);
  if (!viewer) {
    fail(res, 401, "请先登录");
    return null;
  }
  return viewer;
}

function requireAdmin(req, res) {
  const viewer = requireLogin(req, res);
  if (!viewer) return null;
  if (!viewer.isAdmin) {
    fail(res, 403, "仅管理员可执行审核操作");
    return null;
  }
  return viewer;
}

// ========== 公开：已发布文章列表 ==========
router.get("/", asyncHandler(async (req, res) => {
  const { rows, total, page, size, totalPages } = await model.listPublished(req.query.page, req.query.size);
  ok(res, {
    posts: rows.map(service.toListDTO),
    total,
    page,
    size,
    totalPages
  });
}));

// ========== 我的文章（登录） ==========
// 必须放在 /:slug 之前，否则 "mine" 会被当成 slug
router.get("/mine", asyncHandler(async (req, res) => {
  const viewer = requireLogin(req, res);
  if (!viewer) return;
  const rows = await model.listByAuthor(viewer.name);
  ok(res, {
    posts: rows.map(service.toMineDTO),
    isAdmin: viewer.isAdmin,
    username: viewer.name
  });
}));

// ========== 待审队列（管理员） ==========
router.get("/pending", asyncHandler(async (req, res) => {
  const viewer = requireAdmin(req, res);
  if (!viewer) return;
  const rows = await model.listPending();
  const stats = await model.stats();
  ok(res, {
    posts: rows.map(service.toPendingDTO),
    stats
  });
}));

// ========== 状态统计（管理员） ==========
router.get("/stats", asyncHandler(async (req, res) => {
  const viewer = requireAdmin(req, res);
  if (!viewer) return;
  ok(res, { stats: await model.stats() });
}));

// ========== 发表文章（登录） ==========
router.post("/", asyncHandler(async (req, res) => {
  const viewer = requireLogin(req, res);
  if (!viewer) return;

  const check = service.validateInput(req.body || {});
  if (!check.ok) return fail(res, 400, check.msg);

  // 频率限制：60 秒一篇；24 小时内最多 10 篇
  const last = await model.lastPostAt(viewer.name);
  if (last && Date.now() - last < service.RATE_LIMIT_MS) {
    const wait = Math.ceil((service.RATE_LIMIT_MS - (Date.now() - last)) / 1000);
    return fail(res, 429, `发得太快了，请 ${wait} 秒后再试`);
  }
  const since = Date.now() - 24 * 3600 * 1000;
  const today = await model.countSince(viewer.name, since);
  if (today >= service.DAILY_MAX) {
    return fail(res, 429, `24 小时内最多发布 ${service.DAILY_MAX} 篇文章，请稍后再试`);
  }

  const input = check.input;
  // 敏感词分级：publish 即时发布 / review 转人工 / reject 直接拦截
  const verdict = sensitive.evaluate(input);
  let action = verdict.action;
  // 管理员本人发帖跳过人工复核环节（高危词仍然拦截）
  if (viewer.isAdmin && action === "review") action = "publish";

  const status = action === "publish" ? "published" : action === "review" ? "pending" : "rejected";
  const slug = service.generateSlug();

  const id = await model.create({
    slug,
    author: viewer.name,
    title: input.title,
    summary: input.summary,
    content: input.content,
    tag: input.tag,
    status,
    riskLevel: verdict.level,
    autoPassed: action === "publish",
    hits: verdict.hits,
    reviewNote: action === "reject"
      ? `命中高危违禁词：${verdict.hits.map(h => h.word).join("、")}`
      : "",
    reviewedBy: action === "publish" ? (verdict.action === "review" ? viewer.name : "system") : "",
    reviewedAt: action === "publish" ? Date.now() : 0
  });

  const row = await model.getById(id);
  logger.info(
    "posts-route",
    `${viewer.name} 发表文章 #${id} status=${status} level=${verdict.level} hits=${verdict.hits.length}`
  );

  const msg = action === "publish"
    ? "已通过快速审核，文章已发布"
    : action === "review"
      ? `检测到 ${verdict.hits.length + verdict.reasons.length} 处风险内容，已进入快速审核队列`
      : "内容命中高危违禁词，已被拦截";

  ok(res, {
    post: service.toMineDTO(row),
    action,
    hits: verdict.hits,
    reasons: verdict.reasons,
    msg
  }, msg);
}));

// ========== 快速审核（管理员） ==========
router.post("/:id/review", asyncHandler(async (req, res) => {
  const viewer = requireAdmin(req, res);
  if (!viewer) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "文章 ID 不合法");

  const body = req.body || {};
  const action = String(body.action || "");
  if (action !== "approve" && action !== "reject") {
    return fail(res, 400, "审核动作必须是 approve 或 reject");
  }

  const row = await model.getById(id);
  if (!row) return fail(res, 404, "文章不存在");
  if (row.status !== "pending") {
    return fail(res, 409, "这篇文章不在待审队列中");
  }

  const note = typeof body.note === "string" ? body.note : "";
  const status = action === "approve" ? "published" : "rejected";
  await model.review(id, { status, note, reviewedBy: viewer.name });

  logger.info(
    "posts-route",
    `${viewer.name} 审核文章 #${id} action=${action} status=${status}`
  );

  ok(res, {
    id,
    status,
    msg: action === "approve" ? "已通过审核并发布" : "已驳回"
  }, action === "approve" ? "已通过审核并发布" : "已驳回");
}));

// ========== 删除（本人或管理员） ==========
router.delete("/:id", asyncHandler(async (req, res) => {
  const viewer = requireLogin(req, res);
  if (!viewer) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "文章 ID 不合法");

  const row = await model.getById(id);
  if (!row) return fail(res, 404, "文章不存在");
  if (row.author !== viewer.name && !viewer.isAdmin) {
    return fail(res, 403, "无权删除他人的文章");
  }

  await model.remove(id);
  logger.info("posts-route", `${viewer.name} 删除文章 #${id}`);
  ok(res, { id }, "文章已删除");
}));

// ========== 已发布文章详情（公开） ==========
// 必须放在所有具体 GET 路由之后
router.get("/:slug", asyncHandler(async (req, res) => {
  const { slug } = req.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(slug)) {
    return fail(res, 404, "文章不存在");
  }
  const row = await model.getPublishedBySlug(slug);
  if (!row) return fail(res, 404, "文章不存在或尚未通过审核");
  ok(res, { post: service.toDetailDTO(row) });
}));

module.exports = router;
