/**
 * ChatRecord 路由
 * - 会话 CRUD
 * - 分享（创建/取消/访问）
 * - OCR（健康检查/识别）
 */
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../core/logger");
const { asyncHandler, ok, fail } = require("../../core/errors");
const { getTokenFromReq } = require("../../middleware/auth");
const sessionMgr = require("../auth/session");
const crService = require("./service");
const crOcr = require("./ocr");

const router = express.Router();

// 分享存储：shareId -> { username, sessionId, createdAt }
const shares = new Map();

// 认证检查
function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  req.username = ws.username;
  next();
}

// ========== 会话 CRUD ==========

// 会话列表
router.get("/sessions", requireAuth, (req, res) => {
  const list = crService.listSessions(req.username);
  ok(res, { sessions: list });
});

// 创建会话
router.post("/sessions", requireAuth, (req, res) => {
  const sess = crService.createSession(req.username, req.body || {});
  ok(res, { session: sess });
});

// 获取会话
router.get("/sessions/:id", requireAuth, (req, res) => {
  try {
    const sess = crService.getSession(req.username, req.params.id);
    ok(res, { session: sess });
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    fail(res, 500, "获取会话失败");
  }
});

// 更新会话
router.put("/sessions/:id", requireAuth, (req, res) => {
  try {
    const sess = crService.updateSession(req.username, req.params.id, req.body || {});
    ok(res, { session: sess });
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    fail(res, 500, "更新会话失败");
  }
});

// 删除会话
router.delete("/sessions/:id", requireAuth, (req, res) => {
  crService.deleteSession(req.username, req.params.id);
  // 同时清理相关分享
  for (const [shareId, info] of shares) {
    if (info.username === req.username && info.sessionId === req.params.id) {
      shares.delete(shareId);
    }
  }
  ok(res, null, "已删除");
});

// 导入会话数据
router.post("/sessions/:id/import", requireAuth, (req, res) => {
  try {
    const sess = crService.importSession(req.username, req.params.id, req.body || {});
    ok(res, { session: sess }, `导入成功，共 ${sess.messages.length} 条消息`);
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    logger.error("chatrecord-route", "导入会话失败", e);
    fail(res, 500, "导入失败");
  }
});

// ========== 分享 ==========

// 创建分享
router.post("/sessions/:id/share", requireAuth, (req, res) => {
  try {
    const sess = crService.getSession(req.username, req.params.id);
    const shareId = uuidv4().replace(/-/g, "").substring(0, 16);
    shares.set(shareId, {
      username: req.username,
      sessionId: sess.id,
      createdAt: Date.now()
    });
    logger.info("chatrecord-route", `创建分享: ${req.username}/${sess.id} -> ${shareId}`);
    ok(res, { shareId, url: `/chatrecord-share.html?id=${shareId}` });
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    fail(res, 500, "创建分享失败");
  }
});

// 取消分享
router.delete("/sessions/:id/share", requireAuth, (req, res) => {
  let removed = 0;
  for (const [shareId, info] of shares) {
    if (info.username === req.username && info.sessionId === req.params.id) {
      shares.delete(shareId);
      removed++;
    }
  }
  ok(res, null, removed > 0 ? "已取消分享" : "没有找到分享");
});

// 访问分享（公开，无需登录）
router.get("/share/:shareId", (req, res) => {
  const info = shares.get(req.params.shareId);
  if (!info) return fail(res, 404, "分享不存在或已过期");
  try {
    const sess = crService.getSession(info.username, info.sessionId);
    ok(res, { session: sess, sharedBy: info.username });
  } catch (e) {
    fail(res, 404, "分享内容不存在");
  }
});

// ========== OCR ==========

// OCR 健康检查
router.get("/ocr/health", asyncHandler(async (req, res) => {
  const health = await crOcr.checkHealth();
  ok(res, { ocr: health });
}));

// OCR 识别
router.post("/ocr", requireAuth, asyncHandler(async (req, res) => {
  const { image } = req.body || {};
  if (!image || typeof image !== "string") {
    return fail(res, 400, "缺少图片数据");
  }
  try {
    const result = await crOcr.recognize(image);
    ok(res, result);
  } catch (e) {
    logger.warn("chatrecord-route", "OCR 识别失败，前端将回退 Tesseract.js", e.message);
    fail(res, 503, "OCR 服务不可用，请使用浏览器端识别", { fallback: true });
  }
}));

module.exports = router;
