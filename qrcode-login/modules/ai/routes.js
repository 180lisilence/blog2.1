/**
 * 服务端 AI 代理（W2-01 / W3-01 / W3-02）
 * ============================================================================
 * 为什么必须有这一层
 * ---------------------------------------------------------------------------
 * 旧版前端 `api-ai.js` 直接 fetch 第三方 AI 端点，于是三件事同时成立：
 *
 *   1. W3-01：CSP `connect-src 'self'` 拦掉全部第三方请求，AI 功能事实上不可用。
 *   2. W3-02：`ALLOWED_HOSTS` 是挂在 window 上的运行时 Set，同源脚本可以
 *      `AIMod.ALLOWED_HOSTS.add('attacker.example')` 直接改掉；`__aiKeyMem`
 *      全局可读。客户端白名单根本不是安全边界。
 *   3. W2-01：N-06 把 Key 从 config 剥离到内存后，UI 仍判 `!apiKey`，
 *      AI 对话 / 快捷对话 / 状态显示全部拒绝发送。
 *
 * 报告三轮 W3-01 给了两条路：加服务端代理，或放宽 CSP connect-src。
 * **放宽 CSP 是错的** —— 报告自己警告：一旦放通第三方连接，W3-02 的
 * 「配置污染 → API Key 外带」就从条件性变成真实可用链。所以走代理：
 *
 *   - 前端只连 `'self'`，CSP 一个字不用改；
 *   - 目标域名由本文件的硬编码表决定，前端传什么 apiUrl 都不看；
 *   - Key 只在本次请求里出现，不落日志、不落库、不写 Cookie；
 *   - 上游错误正文不回传前端（避免成为 boot.js 未转义 innerHTML 的触发源）；
 *   - 即便有同源 XSS，它也只能让服务端把 Key 转发到 6 个官方域名，
 *     攻击者拿不到 Key，CSP 又挡着直连外带 —— 链 A 保持断开。
 *
 * 安全边界声明：本代理只做「白名单转发」，不做 Key 托管。Key 仍由用户在
 * 浏览器侧本次会话内持有并随请求提交，这是 N-06「Key 不持久化」的延续。
 */
const express = require("express");
const logger = require("../../core/logger");
const { ok, fail, asyncHandler } = require("../../core/errors");

const router = express.Router();

// ---------------------------------------------------------------------------
// 服务端专属端点表：前端传 provider 名，URL 由这里决定。
// 前端 AI_PROVIDERS 里的 defaultUrl 仅用于展示与本地预校验，不参与转发。
// 想加自建反代，改这张表 + 前端配置表，不要开放「前端传 apiUrl」。
// ---------------------------------------------------------------------------
const AI_ENDPOINTS = {
  doubao:   { host: "ark.cn-beijing.volces.com",  url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions" },
  qwen:     { host: "dashscope.aliyuncs.com",     url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" },
  deepseek: { host: "api.deepseek.com",           url: "https://api.deepseek.com/v1/chat/completions" },
  openai:   { host: "api.openai.com",             url: "https://api.openai.com/v1/chat/completions" },
  moonshot: { host: "api.moonshot.cn",            url: "https://api.moonshot.cn/v1/chat/completions" },
  zhipu:    { host: "open.bigmodel.cn",           url: "https://open.bigmodel.cn/api/paas/v4/chat/completions" }
};

const UPSTREAM_TIMEOUT_MS = 30 * 1000;
const MAX_UPSTREAM_BYTES = 512 * 1024;
const MAX_MESSAGES = 100;
const MAX_CONTENT_CHARS = 32 * 1024;
const MAX_MODEL_LEN = 128;

// 每 IP 每分钟最多 30 次代理请求（正常工作台对话远低于此）
const PROXY_WINDOW_MS = 60 * 1000;
const PROXY_MAX_PER_WINDOW = 30;
const proxyHits = new Map(); // ip -> { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of proxyHits) if (now > rec.resetAt) proxyHits.delete(ip);
}, PROXY_WINDOW_MS).unref?.();

function rateLimit(req, res) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  let rec = proxyHits.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + PROXY_WINDOW_MS };
    proxyHits.set(ip, rec);
  }
  rec.count++;
  if (rec.count > PROXY_MAX_PER_WINDOW) {
    return fail(res, 429, "AI 请求过于频繁，请稍后再试");
  }
  return null;
}

// W3-04：Key 字符集比前端更严，明确拒绝 HTML 元字符与全部控制字符
function validateKey(key) {
  const k = String(key || "").trim();
  if (!k) return { ok: false, msg: "未配置 API Key" };
  if (k.length > 512) return { ok: false, msg: "API Key 过长" };
  if (!/^[A-Za-z0-9._\-]{1,512}$/.test(k)) {
    return { ok: false, msg: "API Key 含非法字符（只允许字母、数字、. _ -）" };
  }
  return { ok: true, key: k };
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "messages 必须是非空数组";
  if (messages.length > MAX_MESSAGES) return `消息条数过多（上限 ${MAX_MESSAGES}）`;
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") return "消息格式非法";
    if (!["system", "user", "assistant"].includes(m.role)) return "消息 role 非法";
    if (typeof m.content !== "string") return "消息 content 必须是字符串";
    if (m.content.length > MAX_CONTENT_CHARS) return "单条消息过长";
    total += m.content.length;
  }
  if (total > 256 * 1024) return "消息总长度超限";
  return null;
}

/**
 * POST /api/ai/chat
 * body: { provider, apiKey, messages, model, temperature }
 * resp: { ok:true, content, provider, model }
 *
 * 该路由挂在 loginFirstGuard + verifyCsrfToken 之后：必须登录、必须过 CSRF。
 */
router.post("/chat", asyncHandler(async (req, res) => {
  const limited = rateLimit(req, res);
  if (limited) return limited;

  const body = req.body || {};
  const provider = String(body.provider || "").trim();
  const ep = AI_ENDPOINTS[provider];
  if (!ep) {
    return fail(res, 400, `不支持的 AI 服务商：${String(provider).slice(0, 40) || "(空)"}`);
  }

  const kv = validateKey(body.apiKey);
  if (!kv.ok) return fail(res, 400, kv.msg);

  const msgErr = validateMessages(body.messages);
  if (msgErr) return fail(res, 400, msgErr);

  const model = String(body.model || "").trim().slice(0, MAX_MODEL_LEN);
  if (!model) return fail(res, 400, "缺少 model");
  if (!/^[A-Za-z0-9._:\-\/]{1,128}$/.test(model)) return fail(res, 400, "model 含非法字符");

  let temperature = Number(body.temperature ?? 0.7);
  if (!Number.isFinite(temperature)) temperature = 0.7;
  temperature = Math.min(2, Math.max(0, temperature));

  const payload = JSON.stringify({
    model,
    messages: body.messages.map(m => ({ role: m.role, content: m.content })),
    temperature,
    stream: false
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + kv.key
      },
      body: payload,
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e?.name === "AbortError" || controller.signal.aborted;
    logger.warn("ai-proxy", `上游请求失败: provider=${provider}, host=${ep.host}, aborted=${aborted}, err=${e?.message || e}`);
    return fail(res, 502, aborted ? "AI 服务响应超时，请稍后重试" : "无法连接 AI 服务，请稍后重试");
  }
  clearTimeout(timer);

  // 只取正文，不把上游的任何响应头透传给浏览器
  let text = "";
  try {
    text = await upstream.text();
  } catch (e) {
    return fail(res, 502, "读取 AI 服务响应失败");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_UPSTREAM_BYTES) {
    return fail(res, 502, "AI 服务响应过大");
  }

  if (!upstream.ok) {
    // 关键：上游原始正文可能含任意字符（api-ai.js 旧版把它拼进 Error，
    // 再经全局错误面板 innerHTML 渲染）。这里只回传脱敏后的状态码，
    // 正文只写日志且不落 Key。
    logger.warn("ai-proxy", `上游返回非 2xx: provider=${provider}, status=${upstream.status}, bodyHead=${text.slice(0, 160).replace(/[\r\n]+/g, " ")}`);
    return fail(res, 502, `AI 服务返回 ${upstream.status}，请检查 API Key 与模型配置`);
  }

  let data;
  try { data = JSON.parse(text); } catch (e) {
    return fail(res, 502, "AI 服务返回格式异常");
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) {
    return fail(res, 502, "AI 服务未返回内容");
  }

  logger.info("ai-proxy", `代理完成: provider=${provider}, host=${ep.host}, model=${model}, bytes=${Buffer.byteLength(content, "utf8")}`);
  return ok(res, { content, provider, model });
}));

// 前端可查询服务端支持的服务商（不含任何 URL / Key）
router.get("/providers", (req, res) => {
  ok(res, { providers: Object.keys(AI_ENDPOINTS) });
});

module.exports = router;
module.exports.AI_ENDPOINTS = AI_ENDPOINTS;
