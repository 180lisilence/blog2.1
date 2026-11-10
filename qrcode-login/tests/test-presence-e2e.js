"use strict";
/**
 * presence 三端联动 · 本地 HTTP 端到端测试
 *
 * 用独立测试库 + 独立端口启动真实主站（qrcode-login/server.js 的子集：
 * 这里直接复用 Express app 的关键中间件，而不启动 OCR / sentinel 适配器），
 * 走完整 HTTP 链路验证：
 *   1. 公开 /api/public/preview 返回脱敏文章 / 项目卡片
 *   2. /api/presence/state 未登录 / 在线 / 被踢 / 过期四种状态
 *   3. 带 x-sentinel-key 读写 /api/presence/settings 并即时影响 state
 *   4. /presence-client.js 可公开访问
 *   5. /blog/index.html 被注入 presence 轮询脚本，且越界路径仍 400
 *   6. 管理员 kick → 目标 token 变 kicked，用户端逻辑可识别
 *   7. 鉴权守卫：无密钥不能直接改开关
 *
 * 不污染真实开发库：所有会话写在内存，settings 落到临时目录。
 * 用法：cd qrcode-login && node tests/test-presence-e2e.js
 */
const assert = require("assert");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");

const ROOT = path.join(__dirname, "..");
const BLOG_ROOT = path.join(ROOT, "..");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "presence-e2e-"));
const logger = { info() {}, warn() {}, debug() {}, error() {} };

// ---- 依赖：真实 session / presence / admin，mock model 与 pool ----
const authSession = require("../modules/auth/session");
const { createPresence } = require("../modules/presence");
const { createMembersAdmin } = require("../modules/audit/members-admin");
const { createPreview } = require("../modules/public/preview");
const { createBlogStatic } = require("../middleware/blogStatic");

const presence = createPresence({ logger, session: authSession, settingsFile: path.join(tmp, "presence-settings.json") });
const model = { users: new Map([["alice", { createdAt: 1, builtin: false }]]) };
const pool = {
  async getConnection() {
    return {
      async beginTransaction() {}, async execute() {}, async commit() {}, async rollback() {}, release() {}
    };
  }
};
const admin = createMembersAdmin({ logger, session: authSession, model, pool, users: model.users, presence });
const preview = createPreview({ indexFile: path.join(BLOG_ROOT, "blog", "index.html"), cacheMs: 0 });

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log("PASS  " + name); })
    .catch(e => { fail++; console.log("FAIL  " + name + " :: " + (e && e.message)); });
}

// ---- 搭建精简 Express app：只挂新增路由 + blogStatic，鉴权语义与 server.js 一致 ----
const app = express();
app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
const INGEST_KEY = "test-ingest-key-1234567890";
function requireSentinelKey(req, res, next) {
  const got = String(req.get("x-sentinel-key") || "");
  const a = Buffer.from(got), b = Buffer.from(INGEST_KEY);
  if (a.length !== b.length || !require("crypto").timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, msg: "unauthorized" });
  }
  next();
}
function getToken(req) {
  if (req.cookies?.web_token) return req.cookies.web_token;
  const a = req.headers?.authorization;
  if (a?.startsWith("Bearer ")) return a.substring(7);
  return "";
}
// 与 server.js 同款 presence 路由
app.get("/api/presence/state", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, ...presence.state(getToken(req)) });
});
app.get("/api/presence/settings", requireSentinelKey, (req, res) => res.json({ ok: true, settings: presence.getSettings() }));
app.post("/api/presence/settings", requireSentinelKey, (req, res) => {
  const b = req.body || {}, patch = {};
  for (const k of ["enabled", "onlineNotice", "offlineNotice"]) if (typeof b[k] === "boolean") patch[k] = b[k];
  if (typeof b.offlineMessage === "string") patch.offlineMessage = b.offlineMessage;
  if (b.pollMs !== undefined) patch.pollMs = b.pollMs;
  res.json({ ok: true, settings: presence.updateSettings(patch) });
});
app.get("/api/public/preview", (req, res) => res.json(preview.get()));
app.get("/presence-client.js", (req, res) => {
  res.type("application/javascript").send(fs.readFileSync(path.join(BLOG_ROOT, "presence-client.js"), "utf8"));
});
// 后台模拟 kick（带密钥）
app.post("/api/test/kick", requireSentinelKey, async (req, res) => {
  const out = await admin.kick(req.body?.username);
  res.json({ ok: true, ...out });
});
// blogStatic：已登录才放行，用于验证脚本注入 + 越界防护
app.use("/blog", createBlogStatic({
  root: path.join(BLOG_ROOT, "blog"),
  getToken,
  getSession: (tok) => authSession.getWebSession(tok)
}));
// 登录：签一个真实 web session
app.post("/api/test/login", (req, res) => {
  const tok = authSession.createWebSession(String(req.body?.username || "alice"));
  res.json({ ok: true, webToken: tok });
});

const server = http.createServer(app);
const PORT = Number(process.env.PRESENCE_E2E_PORT || 3188);
const BASE = `http://127.0.0.1:${PORT}`;

function req(method, urlPath, { body, token, key, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
    const headers = {};
    if (payload) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = String(payload.length); }
    if (token) headers.Authorization = "Bearer " + token;
    if (key) headers["x-sentinel-key"] = key;
    if (cookie) headers.Cookie = cookie;
    const r = http.request(BASE + urlPath, { method, headers }, res => {
      const bufs = [];
      res.on("data", b => bufs.push(b));
      res.on("end", () => {
        const text = Buffer.concat(bufs).toString("utf8");
        let json = null; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  await new Promise(res => server.listen(PORT, "127.0.0.1", res));

  // 1. 公开预览
  await t("GET /api/public/preview 返回文章+项目", async () => {
    const r = await req("GET", "/api/public/preview");
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert(r.json.posts.length >= 1, "应有文章卡片");
    assert(r.json.projects.length >= 1, "应有项目卡片");
    assert(r.json.tagline && r.json.tagline.length > 5, "应有 tagline");
  });
  await t("预览链接全部站内白名单（无 javascript/http 外链）", async () => {
    const r = await req("GET", "/api/public/preview");
    const hrefs = [...r.json.posts, ...r.json.projects].map(x => x.href);
    for (const h of hrefs) assert(/^\/(?:blog\/|projects\.html|settings\.html|index\.html)/.test(h), "非法链接: " + h);
  });
  await t("预览字段无 HTML 标签注入", async () => {
    const r = await req("GET", "/api/public/preview");
    const all = [...r.json.posts, ...r.json.projects];
    for (const x of all) {
      for (const v of Object.values(x)) {
        if (typeof v === "string") assert(!/[<>]/.test(v), "字段含标签: " + v);
      }
    }
  });

  // 2. presence state 四态
  await t("未登录 state=anonymous", async () => {
    const r = await req("GET", "/api/presence/state");
    assert.equal(r.json.status, "anonymous");
  });
  let token;
  await t("登录后 state=online", async () => {
    const login = await req("POST", "/api/test/login", { body: { username: "alice" } });
    token = login.json.webToken;
    assert(token && token.length > 20, "应签发 webToken");
    const r = await req("GET", "/api/presence/state", { token });
    assert.equal(r.json.status, "online");
    assert.equal(r.json.pollMs, 8000);
  });

  // 3. 开关读写 + 即时影响
  await t("无密钥不能读开关（401）", async () => {
    const r = await req("GET", "/api/presence/settings");
    assert.equal(r.status, 401);
  });
  await t("无密钥不能改开关（401）", async () => {
    const r = await req("POST", "/api/presence/settings", { body: { enabled: false } });
    assert.equal(r.status, 401);
  });
  await t("带密钥读开关默认值", async () => {
    const r = await req("GET", "/api/presence/settings", { key: INGEST_KEY });
    assert.equal(r.status, 200);
    assert.equal(r.json.settings.enabled, true);
    assert.equal(r.json.settings.onlineNotice, true);
    assert.equal(r.json.settings.offlineNotice, true);
  });
  await t("带密钥改文案+pollMs 即时生效", async () => {
    const w = await req("POST", "/api/presence/settings", { key: INGEST_KEY, body: { offlineMessage: "测试：你已下线", pollMs: 5000 } });
    assert.equal(w.status, 200);
    assert.equal(w.json.settings.offlineMessage, "测试：你已下线");
    assert.equal(w.json.settings.pollMs, 5000);
    const r = await req("GET", "/api/presence/settings", { key: INGEST_KEY });
    assert.equal(r.json.settings.pollMs, 5000);
  });
  await t("关总开关后 state=off（用户端停止轮询）", async () => {
    await req("POST", "/api/presence/settings", { key: INGEST_KEY, body: { enabled: false } });
    const r = await req("GET", "/api/presence/state", { token });
    assert.equal(r.json.status, "off");
    await req("POST", "/api/presence/settings", { key: INGEST_KEY, body: { enabled: true } });
  });

  // 4. 用户端脚本公开可访问
  await t("GET /presence-client.js 公开可访问", async () => {
    const r = await req("GET", "/presence-client.js");
    assert.equal(r.status, 200);
    assert(r.text.includes("/api/presence/state"), "脚本应轮询 presence 接口");
    assert(r.text.includes("__blogPresenceLoaded"), "脚本应有防重复加载标记");
    assert(r.text.includes("kicked"), "脚本应处理 kicked 状态");
    assert(r.text.includes("showDialog"), "脚本应能弹窗");
  });

  // 5. blogStatic 注入 + 越界防护
  await t("未登录 /blog/index.html 被 302 回登录页", async () => {
    const r = await req("GET", "/blog/index.html");
    assert.equal(r.status, 302);
  });
  await t("登录后 /blog/index.html 注入 presence-client.js", async () => {
    const r = await req("GET", "/blog/index.html", { token });
    assert.equal(r.status, 200);
    assert(r.text.includes('/presence-client.js'), "HTML 应注入脚本");
    assert(r.text.includes("defer"), "脚本应 defer");
    // 不重复注入
    assert.equal((r.text.match(/\/presence-client\.js/g) || []).length, 1, "只注入一次");
  });
  await t("非 HTML 资源不注入脚本", async () => {
    const r = await req("GET", "/blog/assets/css/blog.css", { token });
    assert.equal(r.status, 200);
    // css 不应含 html script 标签（可能文件本身为空或其他，仅断言非注入的 presence 标签）
    assert(!r.text.includes('<script src="/presence-client.js"'), "CSS 不应被注入脚本");
  });
  await t("目录穿越越界路径仍返回 400（安全回归）", async () => {
    const r = await req("GET", "/blog/projects/woldvein/..%2f..%2findex.html", { token });
    assert.equal(r.status, 400);
  });
  await t("Vary/private 私有缓存头仍在", async () => {
    const r = await req("GET", "/blog/index.html", { token });
    assert(/private/.test(r.headers["cache-control"] || ""));
    assert(/Cookie/.test(r.headers["vary"] || ""));
  });

  // 6. 管理员 kick → 用户端可识别
  await t("管理员 kick 后目标 token 变 kicked", async () => {
    const kick = await req("POST", "/api/test/kick", { key: INGEST_KEY, body: { username: "alice" } });
    assert.equal(kick.status, 200);
    assert.equal(kick.json.sessionsDestroyed, 1);
    const r = await req("GET", "/api/presence/state", { token });
    assert.equal(r.json.status, "kicked");
    assert.equal(r.json.reason, "kick");
    assert(r.json.message.includes("下线"), "应带下线文案");
    assert.equal(r.json.showDialog, true, "应要求弹窗");
  });
  await t("被踢后 token 已失效（无法再访问 blog）", async () => {
    const r = await req("GET", "/blog/index.html", { token });
    assert.equal(r.status, 302, "会话已失效应被重定向");
  });
  await t("关闭下线弹窗开关后 showDialog=false", async () => {
    await req("POST", "/api/presence/settings", { key: INGEST_KEY, body: { offlineNotice: false } });
    const r = await req("GET", "/api/presence/state", { token });
    assert.equal(r.json.status, "kicked");
    assert.equal(r.json.showDialog, false);
    assert.equal(r.json.message, "");
  });

  console.log("\n===== presence 端到端结果 =====");
  console.log(`通过 ${pass} / ${pass + fail}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error("E2E 异常:", e);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  server.close();
  process.exit(2);
});
