/**
 * 服务端验证码（修复 8-01：注册接口无验证码 / 可脚本批量注册）
 * ============================================================================
 * 设计要点：
 *   1. 算术题以 SVG data URI 下发，答案**不出现在任何响应字段里**；
 *   2. challenge 用 HMAC-SHA256 绑定 (id, 过期时间, 答案)，客户端无法伪造
 *      或把答案改成自己想要的值；
 *   3. 一次性：无论校验成功还是失败，challenge 立即作废，防重放；
 *   4. TTL 2 分钟 + 容量上限 + 定时清理，避免内存被撑爆；
 *   5. 可用 CAPTCHA_SECRET 固定密钥；未配置时进程启动随机生成（重启后旧
 *      challenge 自然失效，无副作用）。
 *
 * 路由：GET /api/captcha -> { ok, id, token, image, ttl }
 * 提交：POST /api/register 带 { captchaId, captchaToken, captchaAnswer }
 */
const crypto = require("crypto");

const SECRET = String(process.env.CAPTCHA_SECRET || "").trim() || crypto.randomBytes(32).toString("hex");
const TTL_MS = 2 * 60 * 1000;
const MAX_CHALLENGES = 5000;

// id -> { exp, answer }
const challenges = new Map();

function mac(id, exp, answer) {
  return crypto.createHmac("sha256", SECRET)
    .update(`${id}.${exp}.${answer}`)
    .digest("hex")
    .slice(0, 32);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// 随机干扰线 + 轻微倾斜，避免题目被当成纯文本直接正则提取
function renderImage(a, b) {
  const jitter = () => Math.floor(Math.random() * 34) + 3;
  const lines = Array.from({ length: 4 }, () => {
    const y = jitter();
    return `<path d="M2 ${y} Q 40 ${jitter()} 118 ${jitter()}" stroke="#c9d6e8" stroke-width="1" fill="none"/>`;
  }).join("");
  const rot = (Math.random() * 6 - 3).toFixed(1);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">` +
    `<rect width="120" height="40" fill="#f4f7fc"/>${lines}` +
    `<text x="12" y="27" font-size="19" font-family="monospace" fill="#243447" ` +
    `transform="rotate(${rot} 60 20)">${a} + ${b} = ?</text></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}

function prune() {
  const now = Date.now();
  for (const [id, rec] of challenges) {
    if (now > rec.exp) challenges.delete(id);
  }
  // 极端情况下（被刷接口）直接丢弃最老的一半
  if (challenges.size > MAX_CHALLENGES) {
    let n = Math.floor(MAX_CHALLENGES / 2);
    for (const id of challenges.keys()) {
      if (n-- <= 0) break;
      challenges.delete(id);
    }
  }
}

function issue() {
  prune();
  const id = crypto.randomBytes(12).toString("hex");
  const exp = Date.now() + TTL_MS;
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = String(a + b);
  challenges.set(id, { exp, answer });
  return {
    id,
    token: `${id}.${exp}.${mac(id, exp, answer)}`,
    image: renderImage(a, b),
    ttl: Math.round(TTL_MS / 1000)
  };
}

/**
 * 校验并**立即消费** challenge。
 * @returns {{ok:boolean, msg?:string}}
 */
function verify(id, token, answer) {
  const key = String(id || "").trim();
  if (!key || !token || answer === undefined || answer === null || answer === "") {
    return { ok: false, msg: "请先完成验证码" };
  }
  const rec = challenges.get(key);
  if (!rec) return { ok: false, msg: "验证码已失效，请点击图片刷新" };
  challenges.delete(key); // 一次性，成败都作废

  if (Date.now() > rec.exp) return { ok: false, msg: "验证码已过期，请刷新" };

  const parts = String(token).split(".");
  if (parts.length !== 3 || parts[0] !== key || Number(parts[1]) !== rec.exp) {
    return { ok: false, msg: "验证码无效" };
  }
  if (!safeEqual(parts[2], mac(key, rec.exp, rec.answer))) {
    return { ok: false, msg: "验证码无效" };
  }
  if (String(answer).trim() !== rec.answer) {
    return { ok: false, msg: "验证码错误，请刷新后重试" };
  }
  return { ok: true };
}

// GET /api/captcha（公开，只读，不产生副作用）
function captchaRoute(req, res) {
  const c = issue();
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ ok: true, id: c.id, token: c.token, image: c.image, ttl: c.ttl });
}

// 与登录锁定共用的清理定时器由 server.js 启动
function startCleanup() {
  const t = setInterval(prune, 60 * 1000);
  if (t.unref) t.unref();
}

module.exports = { issue, verify, captchaRoute, startCleanup };
