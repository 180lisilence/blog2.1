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
const { validateUsername, validatePassword } = require("../../core/security");
const userModel = require("./model");
const sessionMgr = require("./session");
const sessionPolicy = require("./sessionPolicy");
const qrTicket = require("./qrTicket");
const { finalizeLogin, clearLoginCookies } = require("./loginCookies");
const { getTokenFromReq, sendKicked } = require("../../middleware/auth");
const { loginLockCheck, recordFailure, failureResponse, clearFailure } = require("../../middleware/loginLock");
const { createIpWhitelist } = require("../../middleware/ipWhitelist");
const captcha = require("../../middleware/captcha");

const router = express.Router();

// ========== confirm 专用限速器（N-02 / N-11） ==========
//
// 1.0 复测残留项：旧版是「纯 IP」滑动窗口（10 次 / 10 分钟），
// 同一 NAT 出口下所有用户共享这 10 次额度 —— 学校/公司网络里一个人误触，
// 整段出口 10 分钟都扫不了码。现在改成双维度：
//   - 主维度 IP+账号：每对组合 10 次 / 10 分钟（同出口不同账号互不牵连）
//   - 兜底维度纯 IP：40 次 / 10 分钟（仍挡得住单 IP 换账号的分布式爆破）
// 正常用户扫码一次就过，两个天花板都碰不到。
const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const CONFIRM_MAX_PER_IP_ACCOUNT = 10;
const CONFIRM_MAX_PER_IP = 40;
const confirmAttempts = new Map();   // `${ip}:${username}` -> { count, resetAt }
const confirmIpAttempts = new Map(); // ip -> { count, resetAt }

function bumpLimit(map, key, max, ip, label) {
  const now = Date.now();
  let rec = map.get(key);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + CONFIRM_WINDOW_MS };
    map.set(key, rec);
  }
  rec.count++;
  if (rec.count > max) {
    const remainSec = Math.ceil((rec.resetAt - now) / 1000);
    logger.warn("auth-route", `[N-02] confirm 触发 ${label} 限速: ip=${ip}, key=${key}, count=${rec.count}`);
    return { blocked: true, remainSec };
  }
  return { blocked: false };
}

function confirmLimiter(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const username = String(req.body?.username || "").trim() || "-";

  const byPair = bumpLimit(confirmAttempts, `${ip}:${username}`, CONFIRM_MAX_PER_IP_ACCOUNT, ip, "IP+账号");
  const byIp = bumpLimit(confirmIpAttempts, ip, CONFIRM_MAX_PER_IP, ip, "纯IP兜底");
  const hit = byPair.blocked ? byPair : (byIp.blocked ? byIp : null);
  if (hit) {
    // 9-02：不再回显剩余秒数，避免给攻击者提供限速窗口计时器
    logger.warn("auth-route", `confirm 限速触发: ip=${ip}, remainSec=${hit.remainSec}`);
    return res.status(429).json({ ok: false, msg: "请求过于频繁，请稍后再试" });
  }
  next();
}

// 定期清理限速窗口记录（避免 Map 无限增长）
setInterval(() => {
  const now = Date.now();
  for (const [k, rec] of confirmAttempts) {
    if (now > rec.resetAt) confirmAttempts.delete(k);
  }
  for (const [ip, rec] of confirmIpAttempts) {
    if (now > rec.resetAt) confirmIpAttempts.delete(ip);
  }
}, 10 * 60 * 1000).unref?.();

// 免密直登的 IP 白名单：仅受信任网络可调用
//
// 这是全站唯一需要 IP 限制的入口。原因：该接口不需要任何凭据即可签发
// 会话，一旦公网可达，等于任何人点一下就能进站。所以必须锁死。
//
// 环境变量 DIRECT_LOGIN_IPS，留空时按 DIRECT_LOGIN_IPS_ALLOW_EMPTY 决定放行/拒绝。
//
// 4-5-02 / F-05（P1）：旧实现 allowAllWhenEmpty 默认 true，生产未显式写
// DIRECT_LOGIN_IPS_ALLOW_EMPTY=false 时，白名单为空 = 公网任何人都能无凭据
// 签发 local 会话。这里把默认值整体翻转为 fail-closed：默认拒绝，只有显式
// 设 DIRECT_LOGIN_IPS_ALLOW_EMPTY=true 才恢复"空白名单放行"（仅供本机开发）。
const directLoginGuard = createIpWhitelist({
  envKey: "DIRECT_LOGIN_IPS",
  allowAllWhenEmpty: process.env.DIRECT_LOGIN_IPS_ALLOW_EMPTY === "true",
  label: "direct-login"
});

// 注册：对外开放，不做 IP 限制
//
// 曾经用 REGISTER_IPS 白名单把注册锁成"仅管理员可调用"，但那会让所有
// 正常访客都无法自助注册，等于把注册功能废掉。当前改为：
//   - 不做 IP 限制，任何来源都能注册
//   - 防滥用交给已有的 输入校验 + CSRF + 全局限流 三层
// 如需临时关闭注册，把 ALLOW_REGISTER 设为 false 即可（返回 403）

// ========== 二维码登录 ==========
//
// 安全模型（针对 F-01 会话劫持链）
// ---------------------------------------------------------------
// 旧实现：generate 只返回 qid，check 只校验 qid 存在性，确认后把
//         webToken 直接塞进 check 响应体 —— 拿到 qid 的人匿名轮询即可
//         取走受害者的完整登录令牌，构成完整劫持链。
//
// 新实现三道闸：
//   1. generate 向发起者下发 httpOnly 的 qrt Cookie（`<qid>.<HMAC>`）。
//   2. check 必须持有与该 qid 匹配的 qrt Cookie，否则一律"会话无效"，
//      且不区分"qid 不存在"与"不是你发起的"（避免变成 qid 存在性 oracle）。
//   3. webToken 绝不进响应体。确认后 check 只给一次性 ticket（30s、单次
//      消费），PC 端凭 ticket 调 /qrcode/redeem 换会话。

// 生成二维码
router.get("/qrcode/generate", asyncHandler(async (req, res) => {
  const session = sessionMgr.createQrSession();
  // 把 qid 绑定到当前浏览器（httpOnly Cookie，前端读不到也改不了）
  qrTicket.writeTicketCookie(req, res, session.qid);

  const confirmUrl = `${config.baseURL}/mobile-confirm.html?qid=${session.qid}`;
  const qrBase64 = await qrcode.toDataURL(confirmUrl, { width: 300, margin: 2 });
  logger.info("auth-route", `二维码已生成: ${session.qid}, ip=${req.ip}`);
  ok(res, { qid: session.qid, qrBase64, expireSeconds: Math.floor(config.qrExpireMs / 1000) });
}));

// 检查二维码状态（PC 端轮询）
// 必须持有 qrt Cookie 且归属匹配，否则视为会话无效
router.get("/qrcode/check", (req, res) => {
  const qid = String(req.query.qid || "");
  if (!qid) return fail(res, 400, "会话无效");

  // 归属校验：不是发起者，直接拒。不区分"不存在"与"不属于你"，
  // 避免把 check 变成 qid 存在性探测接口。
  if (!qrTicket.isOwner(req, qid)) {
    logger.warn("auth-route", `[F-01] 拒绝非发起者轮询: qid=${qid}, ip=${req.ip}`);
    return fail(res, 400, "会话无效");
  }

  const session = sessionMgr.getQrSession(qid);
  if (!session) return fail(res, 400, "会话无效");

  // 归属校验通过后才允许推进"会话不存在"与过期判断
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  const result = { status: session.status };
  if (session.status === "confirmed") {
    // 一次性换码票据，绝不下发 webToken
    if (!session.redeemTicket) {
      session.redeemTicket = qrTicket.createRedeemTicket(qid, session.username);
      qrTicket.bindWebToken(session.redeemTicket, session.webToken);
    }
    result.ticket = session.redeemTicket;
    result.username = session.username;
    // 票据已交付，webToken 从会话对象里摘掉，避免任何后续路径二次取用
    session.webToken = null;
  }
  res.json(result);
});

// 用一次性票据换取登录会话（PC 端在 check 拿到 ticket 后调用）
router.post("/qrcode/redeem", (req, res) => {
  const { ticket, qid } = req.body || {};
  const raw = String(ticket || "");
  if (!/^[0-9a-f]{64}$/i.test(raw)) return fail(res, 400, "登录票据无效");

  // 票据必须从"本人的 qid 会话"里长出来
  if (!qrTicket.isOwner(req, String(qid || ""))) {
    logger.warn("auth-route", `[F-01] 拒绝非发起者换码: qid=${qid}, ip=${req.ip}`);
    return fail(res, 400, "登录票据无效");
  }

  const r = qrTicket.consumeRedeemTicket(raw, String(qid || ""));
  if (!r.ok) {
    const msg = r.reason === "expired"
      ? "登录票据已过期，请重新扫码"
      : r.reason === "notready"
        ? "登录尚未完成，请稍候"
        : "登录票据无效，请重新扫码";
    return fail(res, 400, msg);
  }

  // 换取成功后二维码会话使命完成，立即销毁
  sessionMgr.destroyQrSession(String(qid || ""));
  qrTicket.clearTicketCookie(req, res);
  // VULN-CONCURRENT-01：把会话画像刷新为 PC 端真实设备（confirm 阶段是手机画像）
  sessionPolicy.adopt(req, r.webToken);
  // R4-02/R4-03：redeem 是 PC 端真正落地登录态的地方，服务端在此下发
  // HttpOnly web_token + 轮换 CSRF；confirm 阶段不签发 Cookie（那是手机端）。
  finalizeLogin(req, res, r.webToken);
  logger.info("auth-route", `扫码会话已换取: ${r.username}, ip=${req.ip}`);
  ok(res, { webToken: r.webToken, username: r.username });
});

// 标记已扫码（手机端调用）
router.get("/qrcode/scanned", (req, res) => {
  const qid = String(req.query.qid || "");
  const session = sessionMgr.getQrSession(qid);
  if (!session) return fail(res, 400, "会话无效");
  if (session.status === "pending") {
    session.status = "scanned";
    logger.info("auth-route", `二维码已扫码: ${qid}`);
  }
  ok(res, { status: session.status });
});

// 手机端确认登录
//
// 同时带 confirmLimiter：复用 /api/login 的锁定计数（N-01/N-02/N-11）。
// 旧实现这里直接调 verifyPassword 且完全不计数，等于给了一条
// 绕过 /api/login 限速的无限爆破通道。
//
// BUG-02 / 4-5-01（P0）：旧实现 `const user = userModel.verifyPassword(u, p);`
// 漏了 await。verifyPassword 是 async，返回 Promise，而 Promise 恒 truthy，
// 于是 `if (!user)` 永远不成立 —— 任意密码都能通过确认，攻击者可匿名把任意
// qid 的归属账号伪造成 admin 等任意账号，redeem 后拿到合法 webToken，构成
// 完整的身份伪造链（4-5 专项已实测复现）。
//
// 修复三处：
//   1. 改 asyncHandler(async …) + await verifyPassword，让校验真正生效；
//   2. R4-01：严格 typeof 断言，拒绝数组/对象/数字等隐式转换（String(["x"])
//      会把数组拼成字符串，是类型混淆的入口）；
//   3. subject 用通过密码校验后的规范账号 u，绝不直接信任未经校验的请求体原值。
router.post("/qrcode/confirm", confirmLimiter, asyncHandler(async (req, res) => {
  const { qid, username, password } = req.body || {};
  const ip = req.loginIp || req.ip;

  // 严格类型：三者都必须是字符串，避免 String() 隐式转换造成类型混淆
  if (typeof qid !== "string" || typeof username !== "string" || typeof password !== "string") {
    return fail(res, 400, "账号或密码错误");
  }
  const u = username.trim();
  const p = password;
  if (!qid || !u || !p) return fail(res, 400, "账号或密码错误");

  const session = sessionMgr.getQrSession(qid);
  if (!session) return fail(res, 400, "会话失效，请刷新二维码后重试");
  if (session.status === "confirmed") return fail(res, 400, "二维码已经使用过");

  // BUG-02 核心：必须 await，否则 Promise 恒 truthy，密码校验形同虚设
  const user = await userModel.verifyPassword(u, p);
  if (!user) {
    // 失败计数与 /api/login 完全共用同一个 store，两边互相消耗（N-11）
    const r = failureResponse(ip, u);
    logger.warn("auth-route", `[N-01] 扫码确认密码错误: user=${u}, ip=${ip}, status=${r.status}`);
    // 不返回剩余次数：confirm 是"陌生设备"路径，多给一个 bit 都是白送
    return fail(res, r.status, r.status === 429 ? r.msg : "账号或密码错误");
  }

  // 成功：清掉该 IP+账号的失败记录（与 /api/login 一致）
  clearFailure(ip, u);

  // u 已通过 verifyPassword（账号存在 + 密码正确 + 精确匹配库中账号名），
  // 即服务端校验后的规范 subject，安全可用于签发会话。
  const subject = u;
  session.status = "confirmed";
  session.username = subject;
  // VULN-CONCURRENT-01：统一走 sessionPolicy 签发，触发同账号并发策略。
  // 此时画像来自手机确认端； redeem 阶段会用 PC 端 requestProfile 覆盖为真实登录设备。
  const issued = sessionPolicy.issue(req, subject);
  session.webToken = issued.webToken;
  logger.info("auth-route", `二维码确认登录: ${subject}, ip=${ip}, 顶掉旧会话=${issued.evicted.length}`);
  // 确认端不返回 webToken —— 它属于 PC 端，走一次性 ticket 换发
  ok(res, { username: subject, status: "confirmed" });
}));

// ========== 账号注册/登录 ==========

// 注册（对公网开放，不做 IP 限制）
// 如需临时关闭注册：环境变量 ALLOW_REGISTER=false
//
// F-04：旧实现用 409「该账号已被注册」区分存在/不存在，构成稳定的
// 账号存在性 oracle（实测可直接确认 admin 存在）。现在两种情况都返回
// 完全相同的 200 + 文案，服务端只在内部日志里区分。攻击者无法从响应
// 判断账号是否存在，只能靠"能不能登进去"来倒推 —— 而那条路已被
// loginLock 限速。
router.post("/register", asyncHandler(async (req, res) => {
  // 注册总开关：默认开启，显式 false 时关闭
  if (String(process.env.ALLOW_REGISTER || "").toLowerCase() === "false") {
    logger.warn("auth-route", `注册已被 ALLOW_REGISTER=false 关闭，来源IP=${req.ip}`);
    return fail(res, 403, "本站暂未开放注册");
  }

  // 8-01：服务端验证码。旧版注册接口既无验证码也无独立限速，脚本可以
  // 无成本地批量撞库/灌账号。challenge 由服务端签发并一次性消费，答案
  // 不下发，客户端无法伪造；配合 server.js 上按 IP 的注册限速形成两层。
  const cap = captcha.verify(
    req.body?.captchaId,
    req.body?.captchaToken,
    req.body?.captchaAnswer
  );
  if (!cap.ok) {
    logger.warn("auth-route", `注册验证码校验失败: ip=${req.ip}, reason=${cap.msg}`);
    return fail(res, 400, cap.msg);
  }

  const { username, password } = req.body || {};
  // R4-01 / BUG-03：注册也强制字符串类型，避免数组/对象被 String() 隐式转换后
  // 绕过账号格式校验、把畸形值写进 MySQL。
  if (typeof username !== "string" || typeof password !== "string") {
    return fail(res, 400, "账号或密码格式错误");
  }
  const u = username.trim();

  const userErr = validateUsername(u);
  if (userErr) return fail(res, 400, userErr);
  const passErr = validatePassword(password);
  if (passErr) return fail(res, 400, passErr);

  const SAME_MSG = "注册请求已受理，请返回使用该账号登录";
  const SAME_MSG_EXISTS = "注册请求已受理，请返回使用该账号登录";

  if (userModel.exists(u)) {
    // 账号已存在：不透露任何信息，故意走与成功完全一致的响应对
    logger.info("auth-route", `注册请求命中已存在账号（对外静默）: ${u}, ip=${req.ip}`);
    // 轻微延时对齐成功分支的耗时，抹掉时间侧信道
    await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
    return ok(res, null, SAME_MSG_EXISTS);
  }

  try {
    await userModel.create(u, password, false);
    logger.info("auth-route", `用户注册: ${u}`);
    ok(res, null, SAME_MSG);
  } catch (e) {
    // 并发注册撞主键：同样静默，不暴露"刚才被别人注册了"
    if (e && (e.statusCode === 409 || /Duplicate entry/i.test(String(e.message)))) {
      logger.info("auth-route", `注册并发冲突（对外静默）: ${u}`);
      return ok(res, null, SAME_MSG_EXISTS);
    }
    throw e;
  }
}));

// 账号密码登录
//
// F-08：旧实现在中间件阶段就直接拒绝锁定中的请求，于是一个不知道密码的人
// 只要周期性打错密码，就能让真实管理员永久进不来（纯 DoS）。
// 现在改为「先算密码再决定」：密码对的永远放行并清空计数，密码错的才吃锁。
router.post("/login", loginLockCheck, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.loginIp || req.ip;
  // R4-01：严格类型断言，拒绝数组/对象/数字，避免 String() 隐式转换的类型混淆
  if (typeof username !== "string" || typeof password !== "string") {
    return fail(res, 400, "请输入账号和密码");
  }
  const u = username.trim();
  const p = password;
  if (!u || !p) return fail(res, 400, "请输入账号和密码");

  // P-10：scrypt 改异步，密码校验不再阻塞事件循环
  const user = await userModel.verifyPassword(u, p);

  if (!user) {
    // 9-02：统一失败文案，不回显剩余次数 / 锁定秒数
    const r = failureResponse(ip, u);
    return fail(res, r.status, r.msg);
  }

  // 密码正确 → 无论此前是否处于锁定中，一律放行，并清空全部计数。
  // 这是 F-08 的修复核心：锁定只惩罚失败的猜测，不惩罚正确的人。
  clearFailure(ip, u);
  if (req.loginLocked?.locked) {
    logger.info("login-lock", `锁定期间正确密码登录成功，已解锁: ip=${ip}, username=${u}`);
  }
  // VULN-CONCURRENT-01：统一走 sessionPolicy 签发 + 并发策略 + 顶号标记
  const issued = sessionPolicy.issue(req, u);
  // R4-02/R4-03：服务端下发 HttpOnly web_token + 轮换 CSRF
  finalizeLogin(req, res, issued.webToken);
  logger.info("auth-route", `账号密码登录: ${u}, 顶掉旧会话=${issued.evicted.length}`);
  ok(res, { webToken: issued.webToken, username: u });
}));

// 直接登录（个人免密入口：仅受信任 IP 可调用，公网默认拒绝）
router.post("/direct-login", directLoginGuard, (req, res) => {
  // 免密入口同样纳入会话注册表：否则 local 账号会绕过并发治理与审计。
  const issued = sessionPolicy.issue(req, "local");
  // R4-02/R4-03：免密登录也由服务端下发 HttpOnly web_token + 轮换 CSRF
  finalizeLogin(req, res, issued.webToken);
  logger.info("auth-route", `直接登录（个人免密）来源IP=${req.ip} trusted=${req.ipTrusted}, 顶掉旧会话=${issued.evicted.length}`);
  ok(res, { webToken: issued.webToken, username: "local" });
});

// 登出
//
// F-03：旧实现会读请求体里的 token 并直接销毁 —— 任何人构造一个
// POST {token:"受害者的token"} 就能把别人踢下线。现在只认"当前请求自己
// 携带的凭据"，请求体里的 token 一律忽略。
router.post("/logout", (req, res) => {
  const token = getTokenFromReq(req);
  if (token) {
    // 只有真实存在的会话才会被销毁；不存在的 token 静默忽略
    const ws = sessionMgr.getWebSession(token);
    if (ws) {
      sessionMgr.destroyWebSession(token);
      logger.info("auth-route", `用户登出: ${ws.username}`);
    }
  }
  // R4-03：HttpOnly web_token JS 清不掉，必须由服务端清理全套 Cookie
  clearLoginCookies(res);
  ok(res, null, "已退出登录");
});

// 查询当前登录态
router.get("/me", (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  // VULN-CONCURRENT-01：被并发登录顶掉 / 被撤销的旧会话，返回 401 KICKED
  // 专用码，前端据此立即弹「账号已在其他设备登录」，而不是笼统跳登录页。
  if (!ws) {
    const st = sessionMgr.getSessionStatus(token);
    if (st.status === "kicked") return sendKicked(res, st);
    // 4-01 / 报告5：普通未授权统一为 401 + 同一句文案，避免接口地图差异
    return fail(res, 401, "请先登录");
  }
  ok(res, { username: ws.username, sessionId: ws.id });
});

// 修改密码
router.post("/change-password", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  const { oldPassword, newPassword } = req.body || {};
  // R4-01：拒绝非字符串类型，避免 String() 隐式转换影响 scrypt 校验
  if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
    return fail(res, 400, "请输入旧密码和新密码");
  }
  if (!oldPassword || !newPassword) return fail(res, 400, "请输入旧密码和新密码");
  const passErr = validatePassword(newPassword);
  if (passErr) return fail(res, 400, passErr);
  try {
    await userModel.changePassword(ws.username, oldPassword, newPassword);
    // 改密后销毁该账号全部会话：旧密码已泄露的场景下，只踢当前 token
    // 会让攻击者持有的其它会话继续有效（VULN-CONCURRENT-01 会话治理要求）。
    for (const [t, s] of sessionMgr.webSessions) {
      if (s.username === ws.username && s.status === "active") {
        sessionMgr.destroyWebSession(t, "password_changed");
      }
    }
    ok(res, null, "密码修改成功，全部设备已下线，请重新登录");
  } catch (e) {
    if (e.isOperational) return fail(res, e.statusCode, e.message);
    logger.error("auth-route", "修改密码失败", e);
    fail(res, 500, "修改密码失败");
  }
}));

// ========== 会话管理（VULN-CONCURRENT-01） ==========
// 这三个端点走 server.js 的 /api 全局守卫：loginFirstGuard 保证已登录、
// verifyCsrfToken 防跨站；本文件内再用当前 token 二次确认归属，绝不信任请求体里的账号。

// 登录设备列表：只返回当前账号名下的活跃会话，脱敏（短 ID + 掩码 IP）
router.get("/sessions", (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) {
    const st = sessionMgr.getSessionStatus(token);
    if (st.status === "kicked") return sendKicked(res, st);
    return fail(res, 401, "请先登录");
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  ok(res, {
    sessions: sessionMgr.listSessions(ws.username, token),
    policy: String(process.env.SESSION_POLICY || "single").toLowerCase(),
    maxSessions: String(process.env.SESSION_POLICY || "single").toLowerCase() === "limit"
      ? (Number(process.env.MAX_ACTIVE_SESSIONS) || 3)
      : 1
  });
});

// 强制下线某台设备（按短 ID）。不能撤销当前会话（要走 /api/logout）
router.post("/sessions/revoke", (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) {
    const st = sessionMgr.getSessionStatus(token);
    if (st.status === "kicked") return sendKicked(res, st);
    return fail(res, 401, "请先登录");
  }
  const id = req.body?.sessionId;
  if (typeof id !== "string" || !/^[0-9a-f]{12}$/i.test(id)) {
    return fail(res, 400, "设备标识无效");
  }
  const out = sessionPolicy.revoke(ws.username, id, token);
  if (!out) return fail(res, 404, "设备不存在或已下线");
  logger.info("auth-route", `用户撤销设备: ${ws.username}, session=${id}`);
  ok(res, { revoked: id }, "该设备已下线");
});

// 撤销当前账号全部其它设备
router.post("/sessions/revoke-others", (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) {
    const st = sessionMgr.getSessionStatus(token);
    if (st.status === "kicked") return sendKicked(res, st);
    return fail(res, 401, "请先登录");
  }
  let n = 0;
  for (const [t, s] of sessionMgr.webSessions) {
    if (t === token || s.username !== ws.username || s.status !== "active") continue;
    s.status = "revoked";
    s.revokeReason = "session_revoked";
    s.revokedAt = Date.now();
    try { require("../presence").getPresence().markKicked(t, ws.username, "session_revoked"); }
    catch (e) { logger.warn("auth-route", "批量撤销标记失败", e.message); }
    n++;
  }
  logger.info("auth-route", `用户撤销全部其它设备: ${ws.username}, count=${n}`);
  ok(res, { revoked: n }, n ? `已下线 ${n} 台设备` : "没有其它在线设备");
});

// 当前账号的登录 / 顶号 / 撤销审计（内存环形缓冲，完整历史在 3100 审计后台）
router.get("/sessions/audit", (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) {
    const st = sessionMgr.getSessionStatus(token);
    if (st.status === "kicked") return sendKicked(res, st);
    return fail(res, 401, "请先登录");
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  ok(res, { events: sessionMgr.getSessionAudit(ws.username, limit) });
});

// ========== 用户业务数据（MySQL，按用户隔离） ==========

// 单用户数据配额（N-03）
//
// 旧实现是纯 Object.assign 语义 + 无任何上限：PUT {data:{}} 清空无效，
// 键只增不减，任何账号都能囤到 10MB+，磁盘可被持续吃满，而且像 API Key
// 这种敏感值一旦写进去就永远删不掉。
//
// 现在的规则：
//   - 单键值序列化后 ≤ 256KB
//   - 单用户键数量 ≤ 500
//   - 单用户总量 ≤ 2MB
//   - PUT 是**替换**语义：请求体里没有的键会被删除
//   - 额外提供 DELETE 单键 / DELETE 全量，让"删"成为一等公民
const DATA_MAX_KEY_BYTES = 256 * 1024;
const DATA_MAX_KEYS = 500;
const DATA_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const DATA_MAX_KEY_LEN = 64;

// W2-04：键名白名单。旧版只拦了 __proto__/constructor/prototype，
// 于是 ""、"a.b"、"../escape" 都能落库。现在统一成一处显式白名单，
// 前端实际使用的键（workbench / earth_inventory / foods / carts / orders…）
// 全部符合，线上存量键名也已核验过不会误伤。
const DATA_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

// V2-02（2.0 复测）：白名单本身允许下划线，所以 "__proto__"、
// "constructor"、"prototype" 都能通过 DATA_KEY_RE。虽然这些键最终进的是
// MySQL，但服务端组装响应/合并快照时用的是普通 {}，写入这类键会触发
// 原型链赋值，属于可被利用的原型污染面。这里补回显式黑名单（大小写不敏感），
// 与第一次修复的口径保持一致，同时也作为纵深防御。
const DATA_KEY_DENY = new Set(["__proto__", "constructor", "prototype", "__definegetter__", "__definesetter__"]);

function isValidKey(k) {
  const s = String(k);
  if (DATA_KEY_DENY.has(s.toLowerCase())) return false;
  return DATA_KEY_RE.test(s);
}

function byteLen(str) {
  return Buffer.byteLength(String(str || ""), "utf8");
}

// 校验待写入数据集，返回错误描述或 null
function validateDataset(data) {
  const keys = Object.keys(data);
  if (keys.length > DATA_MAX_KEYS) {
    return `数据项过多（${keys.length}/${DATA_MAX_KEYS}），请清理后再保存`;
  }
  let total = 0;
  for (const k of keys) {
    if (!isValidKey(k)) {
      return `数据含有非法键名："${String(k).slice(0, 40)}"（只允许字母、数字、下划线、连字符，1-${DATA_MAX_KEY_LEN} 字符）`;
    }
    let serialized;
    try {
      serialized = JSON.stringify(data[k]);
    } catch (e) {
      return `键 "${k}" 的值无法序列化（可能存在循环引用）`;
    }
    const n = byteLen(serialized);
    if (n > DATA_MAX_KEY_BYTES) {
      return `键 "${k}" 的值过大（${(n / 1024).toFixed(0)}KB / 上限 ${DATA_MAX_KEY_BYTES / 1024}KB）`;
    }
    total += n;
  }
  if (total > DATA_MAX_TOTAL_BYTES) {
    return `数据总量超限（${(total / 1024 / 1024).toFixed(2)}MB / 上限 ${DATA_MAX_TOTAL_BYTES / 1024 / 1024}MB）`;
  }
  return null;
}

// 把库里的 data_value（已是 JSON 字符串）还原成真实值再算配额。
// 旧版直接把字符串塞进 merged，validateDataset 又 stringify 一次，
// 导致存量数据被双序列化、usedBytes 虚高、配额统计与实际不一致。
function parseStoredValue(raw) {
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

// 取当前用户已占用的总量（用于写入前后的二次校验）
async function currentUsage(username) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS cnt, COALESCE(SUM(OCTET_LENGTH(data_value)), 0) AS bytes FROM user_data WHERE username = ?",
    [username]
  );
  const r = rows[0] || {};
  return { count: Number(r.cnt || 0), bytes: Number(r.bytes || 0) };
}

// 获取用户数据
//
// W2-05：旧版忽略全部 query，永远返回全量。配合 W2-03 的存储放大，
// 客户端每次刷新都要拉完整快照。现在支持：
//   GET /api/data/all              全量（兼容旧前端）
//   GET /api/data/all?key=workbench      只取一个键
//   GET /api/data/all?keys=a,b,c         只取多个键
// 响应附带 totalKeys / truncated，前端可据此判断是否需要分片。
router.get("/data/all", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");

  let wanted = null;
  if (req.query.key !== undefined) {
    wanted = [String(req.query.key)];
  } else if (req.query.keys !== undefined) {
    wanted = String(req.query.keys).split(",").map(s => s.trim()).filter(Boolean);
  }
  if (wanted) {
    for (const k of wanted) {
      if (!isValidKey(k)) return fail(res, 400, "查询键名非法");
    }
    if (wanted.length > DATA_MAX_KEYS) return fail(res, 400, "查询键数过多");
  }

  let rows;
  if (wanted && wanted.length > 0) {
    const placeholders = wanted.map(() => "?").join(",");
    [rows] = await pool.query(
      `SELECT data_key, data_value FROM user_data WHERE username = ? AND data_key IN (${placeholders})`,
      [ws.username, ...wanted]
    );
  } else if (wanted && wanted.length === 0) {
    rows = [];
  } else {
    [rows] = await pool.query("SELECT data_key, data_value FROM user_data WHERE username = ?", [ws.username]);
  }

  // V2-02：用无原型对象承接来自数据库的键名，彻底断掉原型链赋值路径
  const data = Object.create(null);
  for (const r of rows) data[r.data_key] = r.data_value;

  // 全量键数（按需查询时也有意义，前端可判断是否需要拉全量）
  let totalKeys = rows.length;
  if (wanted) {
    const [c] = await pool.query("SELECT COUNT(*) AS c FROM user_data WHERE username = ?", [ws.username]);
    totalKeys = Number(c[0]?.c || 0);
  }

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  ok(res, {
    data,
    totalKeys,
    truncated: wanted ? rows.length < totalKeys : false
  });
}));

// 保存用户数据 —— **替换语义**
//
// F-03 报告里的 N-03 核心问题就是 merge 语义：旧实现只 UPSERT 不删键，
// 于是 PUT {data:{}} 看着成功了，旧数据一条没少。
// 现在改成事务内"差异同步"：请求体里有的 -> UPSERT；库里多出来的 -> DELETE。
// 这样前端只要提交完整快照，服务端就得到完整一致的状态，删得掉才是真删。
router.put("/data/all", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  if (String(process.env.ALLOW_DATA_WRITE || "").toLowerCase() === "false") {
    return fail(res, 403, "数据写入已关闭");
  }

  // W2-02：PUT 是"全量替换"，缺 data 字段必须显式拒绝。
  // 旧版用 safeGet(req, "body.data", {}) 把缺失当成空快照执行 replace，
  // 一次前端 bug / API 误用 / 重试逻辑就会 200 静默清空该用户全部数据。
  const body = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(body, "data")) {
    return fail(res, 400, "缺少 data 字段：PUT 为全量替换，必须显式提交完整快照（清空请传 {\"data\":{}}）");
  }
  const data = body.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail(res, 400, "数据格式错误");
  }

  const vErr = validateDataset(data);
  if (vErr) {
    logger.warn("auth-route", `[N-03] 数据超配额被拒: ${ws.username} - ${vErr}`);
    return fail(res, 413, vErr);
  }

  const now = Date.now();
  const keys = Object.keys(data);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) 写入/更新请求体里的所有键
    for (const key of keys) {
      await conn.execute(
        "INSERT INTO user_data (username, data_key, data_value, updated_at) VALUES (?,?,?,?) "
        + "ON DUPLICATE KEY UPDATE data_value=VALUES(data_value), updated_at=VALUES(updated_at)",
        [ws.username, key, JSON.stringify(data[key]), now]
      );
    }

    // 2) 删除库里有、请求体里没有的键（替换语义的关键一步）
    let deleted = 0;
    if (keys.length === 0) {
      const [r] = await conn.execute("DELETE FROM user_data WHERE username = ?", [ws.username]);
      deleted = r.affectedRows || 0;
    } else {
      const placeholders = keys.map(() => "?").join(",");
      const [r] = await conn.execute(
        `DELETE FROM user_data WHERE username = ? AND data_key NOT IN (${placeholders})`,
        [ws.username, ...keys]
      );
      deleted = r.affectedRows || 0;
    }

    await conn.commit();
    logger.info(
      "auth-route",
      `用户数据已保存(替换): ${ws.username}, keys=${keys.length}, 删除=${deleted}`
    );
    ok(res, { keys: keys.length, deleted }, "保存成功");
  } catch (e) {
    await conn.rollback().catch(() => {});
    logger.error("auth-route", "保存用户数据失败", e);
    throw e;
  } finally {
    conn.release();
  }
}));

// 增量保存（PATCH）—— 前端 blog-storage.js 默认走这条
//
// 为什么需要 PATCH 而不是只用 PUT：
// PUT 是"全量替换"，语义最干净，但前端每改一个键就得把整个快照推上来。
// 数据到 MB 级时这是纯浪费（N-03/N-04 的放大器）。PATCH 只传变更键与
// 删除键，既保证"删得掉"，又不用重传全量。
//
// 请求体：{ set: {k: v, ...}, remove: ["k1", "k2"] }
// 配额校验按"合并后的最终状态"算，而不是按单次 patch 算 —— 否则
// 攻击者可以分 100 次各塞 200KB 绕过总量限制（这正是 N-03 的原始手法）。
router.patch("/data/all", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  if (String(process.env.ALLOW_DATA_WRITE || "").toLowerCase() === "false") {
    return fail(res, 403, "数据写入已关闭");
  }

  const body = req.body || {};
  const setObj = body.set;
  const removeArr = body.remove;

  if (setObj !== undefined && (typeof setObj !== "object" || setObj === null || Array.isArray(setObj))) {
    return fail(res, 400, "set 必须是对象");
  }
  if (removeArr !== undefined && !Array.isArray(removeArr)) {
    return fail(res, 400, "remove 必须是数组");
  }

  const setData = setObj || {};
  // 去重，避免同一键在 remove 里出现多次导致计数虚高
  const removeKeys = [...new Set((removeArr || []).map(x => String(x)).filter(Boolean))];

  for (const k of Object.keys(setData)) {
    if (!isValidKey(k)) {
      return fail(res, 400, `数据含有非法键名："${String(k).slice(0, 40)}"`);
    }
  }
  for (const k of removeKeys) {
    if (!isValidKey(k)) return fail(res, 400, `删除键名非法："${String(k).slice(0, 40)}"`);
  }
  if (Object.keys(setData).length === 0 && removeKeys.length === 0) {
    return ok(res, { set: 0, removed: 0 }, "无变更");
  }

  // 计算合并后的最终状态并做配额校验
  const [rows] = await pool.query(
    "SELECT data_key, data_value FROM user_data WHERE username = ?",
    [ws.username]
  );
  // V2-02：无原型对象，避免数据键名触发原型链赋值
  const merged = Object.create(null);
  for (const r of rows) merged[r.data_key] = parseStoredValue(r.data_value);
  for (const k of removeKeys) delete merged[k];
  for (const k of Object.keys(setData)) merged[k] = setData[k];

  const vErr = validateDataset(merged);
  if (vErr) {
    logger.warn("auth-route", `[N-03] PATCH 超配额被拒: ${ws.username} - ${vErr}`);
    return fail(res, 413, vErr);
  }

  const now = Date.now();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const k of Object.keys(setData)) {
      await conn.execute(
        "INSERT INTO user_data (username, data_key, data_value, updated_at) VALUES (?,?,?,?) "
        + "ON DUPLICATE KEY UPDATE data_value=VALUES(data_value), updated_at=VALUES(updated_at)",
        [ws.username, k, JSON.stringify(setData[k]), now]
      );
    }
    // W2-06：用 affectedRows 累加真实删除数，不再把"请求里列出的键数"
    // 当成"实际删掉的行数"回报（删不存在的键以前也回 removed:1）。
    let removed = 0;
    for (const k of removeKeys) {
      const [r] = await conn.execute(
        "DELETE FROM user_data WHERE username = ? AND data_key = ?",
        [ws.username, k]
      );
      removed += r.affectedRows || 0;
    }

    await conn.commit();
    logger.info(
      "auth-route",
      `用户数据增量保存: ${ws.username}, set=${Object.keys(setData).length}, remove=${removeKeys.length}, 实际删除=${removed}`
    );
    ok(res, { set: Object.keys(setData).length, removed }, "保存成功");
  } catch (e) {
    await conn.rollback().catch(() => {});
    logger.error("auth-route", "增量保存用户数据失败", e);
    throw e;
  } finally {
    conn.release();
  }
}));

// 删除单个键
router.delete("/data/all", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");

  // 带 ?key= 删单个；不带 key 则清空该用户全部数据
  const key = req.query.key !== undefined ? String(req.query.key) : "";

  if (key) {
    if (!isValidKey(key)) return fail(res, 400, "删除键名非法");
    const [r] = await pool.execute(
      "DELETE FROM user_data WHERE username = ? AND data_key = ?",
      [ws.username, key]
    );
    logger.info("auth-route", `删除数据键: ${ws.username} / ${key} (${r.affectedRows || 0} 行)`);
    return ok(res, { deleted: r.affectedRows || 0 }, r.affectedRows ? "已删除" : "该键不存在");
  }

  const [r] = await pool.execute("DELETE FROM user_data WHERE username = ?", [ws.username]);
  logger.info("auth-route", `清空用户数据: ${ws.username} (${r.affectedRows || 0} 行)`);
  ok(res, { deleted: r.affectedRows || 0 }, "已清空");
}));

// 查询当前配额占用（前端可用来提示）
router.get("/data/quota", asyncHandler(async (req, res) => {
  const token = getTokenFromReq(req);
  const ws = sessionMgr.getWebSession(token);
  if (!ws) return fail(res, 401, "请先登录");
  const usage = await currentUsage(ws.username);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  ok(res, {
    quota: {
      usedBytes: usage.bytes,
      maxBytes: DATA_MAX_TOTAL_BYTES,
      usedKeys: usage.count,
      maxKeys: DATA_MAX_KEYS,
      maxValueBytes: DATA_MAX_KEY_BYTES
    }
  });
}));

module.exports = router;
module.exports.__limits = {
  DATA_MAX_KEY_BYTES,
  DATA_MAX_KEYS,
  DATA_MAX_TOTAL_BYTES,
  DATA_MAX_KEY_LEN,
  DATA_KEY_RE,
  isValidKey,
  validateDataset
};
