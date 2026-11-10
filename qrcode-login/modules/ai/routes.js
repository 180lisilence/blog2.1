/**
 * 服务端 AI 代理（W2-01 / W3-01 / W3-02）+ 模型扫描（2026-11-11）
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
 *   - 目标域名由本文件的硬编码表决定，前端传什么 apiUrl 都不参与 chat 转发；
 *   - Key 只在本次请求里出现，不落日志、不落库、不写 Cookie；
 *   - 上游错误正文不回传前端（避免成为 boot.js 未转义 innerHTML 的触发源）；
 *   - 即便有同源 XSS，它也只能让服务端把 Key 转发到白名单官方域名，
 *     攻击者拿不到 Key，CSP 又挡着直连外带 —— 链 A 保持断开。
 *
 * 安全边界声明：本代理只做「白名单转发」，不做 Key 托管。Key 仍由用户在
 * 浏览器侧本次会话内持有并随请求提交，这是 N-06「Key 不持久化」的延续。
 *
 * ---------------------------------------------------------------------------
 * 模型扫描 POST /api/ai/models
 * ---------------------------------------------------------------------------
 * 用户在设置页填写「模型服务接口地址」「接口密钥」，点「扫描模型」时前端
 * 把这两个值提交到本站，由服务端去请求该供应商的 /models 端点。
 * 仍然不开放任意 URL：地址必须是 https、默认端口、非 IP/本地主机、且 hostname
 * 命中下面 AI_ENDPOINTS 的官方域名白名单；请求目标由服务端按供应商表推导。
 * 失败按 code 分类（EMPTY_INPUT / INVALID_URL / INVALID_KEY / REQUEST_FAILED /
 * EMPTY_RESULT），前端据此给出可区分的提示，并且不改动已有模型列表。
 */
const express = require("express");
const logger = require("../../core/logger");
const { ok, fail, asyncHandler } = require("../../core/errors");

const router = express.Router();

// ---------------------------------------------------------------------------
// 服务端专属端点表：前端传 provider 名，URL 由这里决定。
// 前端 AI_PROVIDERS 里的 defaultUrl 仅用于展示与本地预校验，不参与转发。
//   host       —— 允许出现在「模型服务接口地址」里的官方域名（扫描白名单）
//   url        —— chat 端点
//   modelsUrl  —— 该供应商的模型列表端点
//   style      —— 请求体/响应体风格：openai（默认）/ anthropic / gemini
//   auth       —— 鉴权头：bearer（默认）/ x-api-key / x-goog-api-key
// 想加自建反代，改这张表 + 前端配置表，不要开放「前端传 apiUrl 决定目标」。
// ---------------------------------------------------------------------------
const AI_ENDPOINTS = {
  doubao: {
    host: "ark.cn-beijing.volces.com",
    url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    modelsUrl: "https://ark.cn-beijing.volces.com/api/v3/models",
    style: "openai", auth: "bearer"
  },
  qwen: {
    host: "dashscope.aliyuncs.com",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    modelsUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    style: "openai", auth: "bearer"
  },
  deepseek: {
    host: "api.deepseek.com",
    url: "https://api.deepseek.com/v1/chat/completions",
    modelsUrl: "https://api.deepseek.com/v1/models",
    style: "openai", auth: "bearer"
  },
  openai: {
    host: "api.openai.com",
    url: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
    style: "openai", auth: "bearer"
  },
  moonshot: {
    host: "api.moonshot.cn",
    url: "https://api.moonshot.cn/v1/chat/completions",
    modelsUrl: "https://api.moonshot.cn/v1/models",
    style: "openai", auth: "bearer"
  },
  zhipu: {
    host: "open.bigmodel.cn",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    modelsUrl: "https://open.bigmodel.cn/api/paas/v4/models",
    style: "openai", auth: "bearer"
  },
  anthropic: {
    host: "api.anthropic.com",
    url: "https://api.anthropic.com/v1/messages",
    modelsUrl: "https://api.anthropic.com/v1/models",
    style: "anthropic", auth: "x-api-key"
  },
  gemini: {
    host: "generativelanguage.googleapis.com",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    style: "gemini", auth: "x-goog-api-key"
  },
  siliconflow: {
    host: "api.siliconflow.cn",
    url: "https://api.siliconflow.cn/v1/chat/completions",
    modelsUrl: "https://api.siliconflow.cn/v1/models",
    style: "openai", auth: "bearer"
  },
  hunyuan: {
    host: "api.hunyuan.cloud.tencent.com",
    url: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
    modelsUrl: "https://api.hunyuan.cloud.tencent.com/v1/models",
    style: "openai", auth: "bearer"
  },
  spark: {
    host: "spark-api-open.xf-yun.com",
    url: "https://spark-api-open.xf-yun.com/v1/chat/completions",
    modelsUrl: "https://spark-api-open.xf-yun.com/v1/models",
    style: "openai", auth: "bearer"
  },
  stepfun: {
    host: "api.stepfun.com",
    url: "https://api.stepfun.com/v1/chat/completions",
    modelsUrl: "https://api.stepfun.com/v1/models",
    style: "openai", auth: "bearer"
  },
  yi: {
    host: "api.lingyiwanwu.com",
    url: "https://api.lingyiwanwu.com/v1/chat/completions",
    modelsUrl: "https://api.lingyiwanwu.com/v1/models",
    style: "openai", auth: "bearer"
  },
  minimax: {
    host: "api.minimax.chat",
    url: "https://api.minimax.chat/v1/chat/completions",
    modelsUrl: "https://api.minimax.chat/v1/models",
    style: "openai", auth: "bearer"
  },
  baichuan: {
    host: "api.baichuan-ai.com",
    url: "https://api.baichuan-ai.com/v1/chat/completions",
    modelsUrl: "https://api.baichuan-ai.com/v1/models",
    style: "openai", auth: "bearer"
  },
  mistral: {
    host: "api.mistral.ai",
    url: "https://api.mistral.ai/v1/chat/completions",
    modelsUrl: "https://api.mistral.ai/v1/models",
    style: "openai", auth: "bearer"
  },
  groq: {
    host: "api.groq.com",
    url: "https://api.groq.com/openai/v1/chat/completions",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    style: "openai", auth: "bearer"
  },
  xai: {
    host: "api.x.ai",
    url: "https://api.x.ai/v1/chat/completions",
    modelsUrl: "https://api.x.ai/v1/models",
    style: "openai", auth: "bearer"
  },
  together: {
    host: "api.together.xyz",
    url: "https://api.together.xyz/v1/chat/completions",
    modelsUrl: "https://api.together.xyz/v1/models",
    style: "openai", auth: "bearer"
  },
  openrouter: {
    host: "openrouter.ai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    style: "openai", auth: "bearer"
  },
  cohere: {
    host: "api.cohere.com",
    url: "https://api.cohere.com/compatibility/v1/chat/completions",
    modelsUrl: "https://api.cohere.com/v1/models",
    style: "openai", auth: "bearer"
  },
  qianfan: {
    host: "qianfan.bce.baidu.com",
    url: "https://qianfan.bce.baidu.com/v2/chat/completions",
    modelsUrl: "https://qianfan.bce.baidu.com/v2/models",
    style: "openai", auth: "bearer"
  }
};

const HOST_TO_PROVIDER = Object.create(null);
for (const [key, ep] of Object.entries(AI_ENDPOINTS)) HOST_TO_PROVIDER[ep.host] = key;
const ALLOWED_HOSTS = Object.freeze(Object.keys(HOST_TO_PROVIDER));

const UPSTREAM_TIMEOUT_MS = 30 * 1000;
const SCAN_TIMEOUT_MS = 12 * 1000;
const MAX_UPSTREAM_BYTES = 512 * 1024;
const MAX_MESSAGES = 100;
const MAX_CONTENT_CHARS = 32 * 1024;
const MAX_MODEL_LEN = 128;
const MAX_SCAN_MODELS = 500;
const MODEL_ID_RE = /^[A-Za-z0-9._:\-\/]{1,128}$/;

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

/** 按供应商风格生成鉴权头（Key 只进 header，绝不拼进 URL / 日志）。 */
function buildAuthHeaders(ep, key) {
  if (ep.auth === "x-api-key") {
    return { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  }
  if (ep.auth === "x-goog-api-key") {
    return { "Content-Type": "application/json", "x-goog-api-key": key };
  }
  return { "Content-Type": "application/json", "Authorization": "Bearer " + key };
}

/**
 * 构造 chat 请求。openai 分支与原实现完全一致，保证原有 6 家行为不变；
 * anthropic / gemini 只是让新扩充的供应商「选中即可对话」，不是只摆个选项。
 */
function buildChatRequest(ep, model, messages, temperature, key) {
  const headers = buildAuthHeaders(ep, key);
  const systemText = messages.filter(m => m.role === "system").map(m => m.content).join("\n");

  if (ep.style === "anthropic") {
    const rest = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
    const bodyObj = { model, max_tokens: 2048, messages: rest, temperature };
    if (systemText) bodyObj.system = systemText;
    return { url: ep.url, headers, payload: JSON.stringify(bodyObj) };
  }

  if (ep.style === "gemini") {
    const m = model.replace(/^models\//, "");
    const contents = messages.filter(x => x.role !== "system").map(x => ({
      role: x.role === "assistant" ? "model" : "user",
      parts: [{ text: x.content }]
    }));
    const bodyObj = { contents, generationConfig: { temperature } };
    if (systemText) bodyObj.systemInstruction = { parts: [{ text: systemText }] };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    return { url, headers, payload: JSON.stringify(bodyObj) };
  }

  return {
    url: ep.url,
    headers,
    payload: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      stream: false
    })
  };
}

function extractContent(data, style) {
  if (style === "anthropic") {
    const arr = data?.content;
    if (Array.isArray(arr)) return arr.filter(x => x && x.type === "text").map(x => String(x.text || "")).join("");
    return "";
  }
  if (style === "gemini") {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.map(p => String(p?.text || "")).join("");
    return "";
  }
  const c = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
  return typeof c === "string" ? c : "";
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
  if (!MODEL_ID_RE.test(model)) return fail(res, 400, "model 含非法字符");

  let temperature = Number(body.temperature ?? 0.7);
  if (!Number.isFinite(temperature)) temperature = 0.7;
  temperature = Math.min(2, Math.max(0, temperature));

  const built = buildChatRequest(ep, model, body.messages, temperature, kv.key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(built.url, {
      method: "POST",
      headers: built.headers,
      body: built.payload,
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
  const content = extractContent(data, ep.style);
  if (typeof content !== "string" || !content) {
    return fail(res, 502, "AI 服务未返回内容");
  }

  logger.info("ai-proxy", `代理完成: provider=${provider}, host=${ep.host}, model=${model}, bytes=${Buffer.byteLength(content, "utf8")}`);
  return ok(res, { content, provider, model });
}));

// ===========================================================================
// 模型扫描
// ===========================================================================

/** 带可机器判别的 code，前端据此给出不同提示（不改动已有模型列表）。 */
function scanFail(res, status, code, msg) {
  return res.status(status).json({ ok: false, msg, code });
}

/**
 * 校验「模型服务接口地址」。
 * 返回 { code, msg } 表示失败；返回 { url, host } 表示通过。
 * 白名单只认 AI_ENDPOINTS 里的官方域名 —— 不开放任意 URL，避免 SSRF 与 Key 外带。
 */
function resolveScanUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return { code: "EMPTY_INPUT", msg: "接口地址为空" };

  let u;
  try { u = new URL(s); } catch (e) {
    return { code: "INVALID_URL", msg: "接口地址格式不合法，请填写完整的 https:// 地址" };
  }
  if (u.protocol !== "https:") {
    return { code: "INVALID_URL", msg: "接口地址必须使用 https://" };
  }
  if (u.port && u.port !== "443") {
    return { code: "INVALID_URL", msg: `接口地址不允许使用非标准端口：${u.port}` };
  }
  if (u.username || u.password) {
    return { code: "INVALID_URL", msg: "接口地址不允许包含用户名/密码" };
  }
  if (/[?&](api[_-]?key|key|token|access_token)=/i.test(u.search || "")) {
    return { code: "INVALID_URL", msg: "接口地址不允许在查询参数里携带密钥" };
  }
  const host = u.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost" || host.endsWith(".local") || host.startsWith("[")) {
    return { code: "INVALID_URL", msg: `接口地址不允许指向 IP 或本地主机：${host}` };
  }
  if (!HOST_TO_PROVIDER[host]) {
    return { code: "INVALID_URL", msg: `接口地址不在支持的供应商域名内：${host}；支持的域名：${ALLOWED_HOSTS.join(", ")}` };
  }
  return { url: u, host };
}

/** 用户填的若是 /models 端点就直接用，否则按供应商表推导出该家的 /models 地址。 */
function deriveModelsUrl(u, ep) {
  const p = (u.pathname || "").replace(/\/+$/, "");
  if (/\/models$/.test(p)) return u.origin + p;
  return ep.modelsUrl;
}

/**
 * 兼容各家 /models 返回结构：OpenAI 系 {data:[{id}]}、Gemini {models:[{name}]}、
 * Anthropic {data:[{id,display_name}]}、直接数组、{results/items/model_list} 等。
 * 统一成 [{value,label}]，按 value 小写去重，过滤非法字符，最多 500 项。
 */
function collectModels(data) {
  const out = [];
  const seen = new Set();

  function add(value, label) {
    if (out.length >= MAX_SCAN_MODELS) return;
    const v = String(value == null ? "" : value).trim();
    if (!v || !MODEL_ID_RE.test(v)) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    let l = String(label == null ? "" : label).trim().slice(0, 80);
    if (!l || l === v) l = v;
    out.push({ value: v, label: l });
  }

  const arrays = [];
  if (Array.isArray(data)) {
    arrays.push(data);
  } else if (data && typeof data === "object") {
    ["data", "models", "results", "items", "model_list", "modelList"].forEach(k => {
      if (Array.isArray(data[k])) arrays.push(data[k]);
    });
  }

  for (const arr of arrays) {
    for (const item of arr) {
      if (out.length >= MAX_SCAN_MODELS) break;
      if (typeof item === "string") {
        add(item);
      } else if (item && typeof item === "object") {
        const v = item.id ?? item.name ?? item.model ?? item.modelId ?? item.model_id
          ?? item.slug ?? item.displayName ?? item.display_name;
        const l = item.display_name ?? item.displayName ?? item.label
          ?? item.name ?? item.owned_by ?? item.description;
        add(v, l);
      }
    }
  }
  return out;
}

/**
 * POST /api/ai/models
 * body: { provider, apiUrl, apiKey }
 * resp: { ok:true, models:[{value,label}], count, provider, endpoint }
 * err : { ok:false, msg, code } —— code 见文件头说明
 */
router.post("/models", asyncHandler(async (req, res) => {
  const limited = rateLimit(req, res);
  if (limited) return limited;

  const body = req.body || {};
  const rawUrl = String(body.apiUrl || "").trim();
  const rawKey = String(body.apiKey || "").trim();

  // 1) 输入为空
  if (!rawUrl || !rawKey) {
    return scanFail(res, 400, "EMPTY_INPUT", "请填写「模型服务接口地址」与「接口密钥」");
  }

  // 2) 密钥形状 / 上游鉴权失败都归 INVALID_KEY
  const kv = validateKey(rawKey);
  if (!kv.ok) return scanFail(res, 400, "INVALID_KEY", kv.msg);

  // 3) 地址格式 / 域名白名单
  const resolved = resolveScanUrl(rawUrl);
  if (resolved.code) return scanFail(res, 400, resolved.code, resolved.msg);

  const provider = String(body.provider || "").trim();
  let ep = AI_ENDPOINTS[provider];
  if (!ep || ep.host !== resolved.host) {
    // 地址优先：host 命中哪家用哪家，避免选错供应商导致扫描到别家的模型
    ep = AI_ENDPOINTS[HOST_TO_PROVIDER[resolved.host]];
  }
  if (!ep) return scanFail(res, 400, "INVALID_URL", "接口地址与所选服务商不匹配");

  const endpoint = deriveModelsUrl(resolved.url, ep);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "GET",
      headers: buildAuthHeaders(ep, kv.key),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e?.name === "AbortError" || controller.signal.aborted;
    logger.warn("ai-scan", `接口请求失败: provider=${HOST_TO_PROVIDER[ep.host]}, host=${ep.host}, aborted=${aborted}, err=${e?.message || e}`);
    return scanFail(res, 502, "REQUEST_FAILED", aborted ? "接口请求超时（12 秒），请稍后重试" : "无法连接模型服务接口，请检查网络或地址");
  }
  clearTimeout(timer);

  if (upstream.status === 401 || upstream.status === 403) {
    return scanFail(res, 400, "INVALID_KEY", `接口密钥无效或被拒绝（上游返回 ${upstream.status}）`);
  }
  if (upstream.status === 429) {
    return scanFail(res, 502, "REQUEST_FAILED", "接口请求被限流（429），请稍后重试");
  }
  if (!upstream.ok) {
    logger.warn("ai-scan", `接口返回非 2xx: host=${ep.host}, status=${upstream.status}`);
    return scanFail(res, 502, "REQUEST_FAILED", `接口请求失败（上游返回 ${upstream.status}）`);
  }

  let text = "";
  try { text = await upstream.text(); } catch (e) {
    return scanFail(res, 502, "REQUEST_FAILED", "读取接口响应失败");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_UPSTREAM_BYTES) {
    return scanFail(res, 502, "REQUEST_FAILED", "接口响应过大，无法解析模型列表");
  }

  let data;
  try { data = JSON.parse(text); } catch (e) {
    return scanFail(res, 502, "REQUEST_FAILED", "接口返回的不是有效 JSON，可能不是模型列表端点");
  }

  const models = collectModels(data);
  if (!models.length) {
    return scanFail(res, 400, "EMPTY_RESULT", "接口返回成功，但未解析到任何可用模型");
  }

  logger.info("ai-scan", `扫描完成: provider=${HOST_TO_PROVIDER[ep.host]}, host=${ep.host}, count=${models.length}`);
  return ok(res, {
    models,
    count: models.length,
    provider: HOST_TO_PROVIDER[ep.host],
    endpoint
  });
}));

// 前端可查询服务端支持的服务商（不含任何 URL / Key）
router.get("/providers", (req, res) => {
  ok(res, { providers: Object.keys(AI_ENDPOINTS) });
});

module.exports = router;
module.exports.AI_ENDPOINTS = AI_ENDPOINTS;
// 纯逻辑导出，供本地单元测试直接验证（不改变路由行为）
module.exports._internal = {
  resolveScanUrl, deriveModelsUrl, collectModels,
  buildChatRequest, extractContent, buildAuthHeaders
};
