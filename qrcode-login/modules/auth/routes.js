/**
 * 认证路由
 * - 二维码登录（生成/检查/扫码/确认）
 * - 账号注册/登录/登出
 * - 登录态查询
 * - 用户业务数据
 */
const express = require("express");
const qrcode = require("qrcode");
const pool = require("../../db/pool");
const config = require("../../config");
const logger = require("../../core/logger");
const { errors, asyncHandler, ok, fail } = require("../../core/errors");
const { validateUsername, validatePassword, safeGet } = require("../../core/security");
const userModel = require("./model");
const sessionMgr = require("./session");
const { getTokenFromReq } = require("../../middleware/auth");
const { loginLockCheck, recordFailure, clearFailure } = require("../../middleware/loginLock");

const router = express.Router();

// ========== 二维码登录 ==========

// 生成二维码
router.get("/qrcode/generate", asyncHandler(async (req, res) => {
  const session = sessionMgr.createQrSession();
  const confirmUrl = `${config.baseURL}/mobile-confirm.html?qid=${session.qid}`;
  const qrBase64 = await qrcode.toDataURL(confirmUrl, { width: 300, margin: 2 });
  logger.info("auth-route", `二维码已生成: ${session.qid}`);
  ok(res, { qid: session.qid, qrBase64, expireSeconds: Math.floor(config.qrExpireMs / 1000) });
}));

// 检查二维码状态（PC 端轮询）
router.get("/qrcode/check", (req, res) => {
  const qid = req.query.qid;
  const session = sessionMgr.getQrSession(qid);
  if (!session) return fail(res, 400, "会话无效");
  const result = { status: session.status };
  if (session.status === "confirmed") {
    result.webToken = session.webToken;
    result.username = session.username;
  }
  res.json(result);
});

// 标记已扫码（手机端调用）
router.get("/qrcode/scanned", (req, res) => {
  const qid = req.query.qid;
  const session = sessionMgr.getQrSession(qid);
  if (!session) return fail(res, 400, "会话无效");
  if (session.status === "pending") {
    session.status = "scanned";
    logger.info("auth-route", `二维码已扫码: ${qid}`);
  }
  ok(res, { status: session.status });
});

// 手机端确认登录
router.post("/qrcode/confirm", (req, res) => {
  const { qid, username, password } = req.body || {};
  const session = sessionMgr.getQrSession(qid);
  if (!session) return fail(res, 400, "会话失效，请刷新二维码后重试");
  if (session.status === "confirmed") return fail(res, 400, "二维码已经使用过");

  const user = userModel.verifyPassword(username, password);
  if (!user) return fail(res, 400, "账号或密码错误");

  session.status = "confirmed";
  session.username = username;
  session.webToken = sessionMgr.createWebSession(username);
  logger.info("auth-route", `二维码确认登录: ${username}`);
  ok(res, { webToken: session.webToken, username });
});

// ========== 账号注册/登录 ==========

// 注册
router.post("/register", asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || "").trim();

  const userErr = validateUsername(u);
  if (userErr) return fail(res, 400, userErr);
  const passErr = validatePassword(password);
  if (passErr) return fail(res, 400, passErr);

  await userModel.create(u, password, false);
  logger.info("auth-route", `用户注册: ${u}`);
  ok(res, null, "注册成功，请返回使用该账号登录");
}));

// 账号密码登录
router.post("/login", loginLockCheck, (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || "").trim();
  const p = String(password || "");
  const ip = req.loginIp || req.ip;
  if (!u || !p) return fail(res, 400, "请输入账号和密码");

  const user = userModel.verifyPassword(u, p);
  if (!user) {
    const result = recordFailure(ip, u);
    const msg = result.locked
      ? `尝试次数过多，请 ${Math.round(result.remainSec)} 秒后再试`
      : `账号或密码错误（还可尝试 ${result.remaining} 次）`;
    return fail(res, result.locked ? 429 : 400, msg);
  }

  // 登录成功，清除失败记录
  clearFailure(ip, u);
  const webToken = sessionMgr.createWebSession(u);
  logger.info("auth-route", `账号密码登录: ${u}`);
  ok(res, { webToken, username: u });
});

// 登出
router.post("/logout", (req, res) => {
  const token = getTokenFromReq(req);
  if (token) sessionMgr.destroyWebSession(token);
  ok(res, null, "已退出登录");
});

// 查询当前登录态
router.get("/me", (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "未登录");
  ok(res, { username: ws.username });
});

// 修改密码
router.post("/change-password", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return fail(res, 400, "请输入旧密码和新密码");
  const passErr = validatePassword(newPassword);
  if (passErr) return fail(res, 400, passErr);
  try {
    await userModel.changePassword(ws.username, oldPassword, newPassword);
    // 密码修改后，使当前 token 失效，要求重新登录
    sessionMgr.destroyWebSession(token);
    ok(res, null, "密码修改成功，请重新登录");
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    logger.error("auth-route", "修改密码失败", e);
    fail(res, 500, "修改密码失败");
  }
}));

// ========== 用户业务数据（MySQL，按用户隔离） ==========

// 获取用户全部数据
router.get("/data/all", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  const [rows] = await pool.query("SELECT data_key, data_value FROM user_data WHERE username = ?", [ws.username]);
  const data = {};
  for (const r of rows) {
    data[r.data_key] = r.data_value;
  }
  ok(res, { data });
}));

// 保存用户全部数据
router.put("/data/all", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  const data = safeGet(req, "body.data", {});
  if (typeof data !== "object" || data === null) return fail(res, 400, "数据格式错误");
  const now = Date.now();
  for (const [key, value] of Object.entries(data)) {
    await pool.execute(
      "INSERT INTO user_data (username, data_key, data_value, updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE data_value=VALUES(data_value), updated_at=VALUES(updated_at)",
      [ws.username, key, JSON.stringify(value), now]
    );
  }
  logger.info("auth-route", `用户数据已保存: ${ws.username}, keys=${Object.keys(data).length}`);
  ok(res, null, "保存成功");
}));

module.exports = router;
