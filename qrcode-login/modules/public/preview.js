/**
 * 公开内容预览（登录页「看看博客里有什么」）
 *
 * 数据源固定为 blog/index.html 中已有的人工维护卡片，不读用户数据、
 * 不读 user_data、不读任何私有项目或磁盘路径。
 *
 * 对外只输出宣传性字段：文章标题/摘要/标签/日期，项目名称/图标/简介/标签。
 * 所有字段强制去 HTML 标签 + 限长；链接白名单为站内相对路径与少量已知站内绝对路径，
 * 绝不允许 javascript: / data: / 协议相对 / 外部 URL 进入登录页。
 *
 * 缓存 5 分钟：文件变化时靠 mtime 提前失效，避免每次登录页请求都读盘。
 */
const fs = require("fs");
const path = require("path");

const CACHE_MS = 5 * 60 * 1000;
const MAX_POSTS = 6;
const MAX_PROJECTS = 6;

function stripTags(input) {
  return String(input == null ? "" : input)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 站内链接白名单：
 *  - 相对路径（posts/xxx.html、workbench/index.html）→ 前缀 /blog/
 *  - 已知站内绝对路径（/projects.html、/blog/...）→ 原样保留
 *  - 其余一律丢弃，返回空字符串（由调用方用安全 fallback）
 */
function safeInternalHref(raw) {
  let s = String(raw == null ? "" : raw).trim();
  try { s = decodeURIComponent(s); } catch { /* 非法编码按原样处理 */ }
  if (!s) return "";
  // 协议绝对 / 协议相对 / 反斜杠 / 目录穿越 / 控制字符 一律拒绝
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//") || s.indexOf("..") !== -1 || /[\x00-\x1f\\]/.test(s)) {
    return "";
  }
  s = s.split("#")[0].split("?")[0].replace(/^\.\//, "");
  if (!s) return "";
  if (s.startsWith("/")) {
    return /^\/(?:blog\/|projects\.html$|settings\.html$|index\.html$)/.test(s) ? s.slice(0, 200) : "";
  }
  return "/blog/" + s.slice(0, 200);
}

function extractBlocks(html, cardClass) {
  // 匹配 <article class="... post-card ..."> ... </article>
  const re = new RegExp(
    '<article\\b[^>]*\\bclass\\s*=\\s*["\'][^"\']*\\b' + cardClass + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/article>',
    "gi"
  );
  const out = [];
  let m;
  while ((m = re.exec(html)) && out.length < 32) out.push(m[1]);
  return out;
}

function pickClass(block, cls) {
  const re = new RegExp(
    '<(?:span|div|p|h[1-6])\\b[^>]*\\bclass\\s*=\\s*["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/(?:span|div|p|h[1-6])>',
    "i"
  );
  const m = block.match(re);
  return m ? m[1] : "";
}

function pickHeadingLink(block) {
  const m = block.match(/<h[1-6]\b[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  return m ? { href: m[1], title: m[2] } : { href: "", title: "" };
}

function pickFirstParagraph(block) {
  const m = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return m ? m[1] : "";
}

function pickTags(block, cls) {
  const re = new RegExp(
    '<span\\b[^>]*\\bclass\\s*=\\s*["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/span>',
    "gi"
  );
  const out = [];
  let m;
  while ((m = re.exec(block)) && out.length < 4) {
    const t = stripTags(m[1]).slice(0, 16);
    if (t) out.push(t);
  }
  return out;
}

function buildPreview(indexFile) {
  const empty = { ok: true, generatedAt: Date.now(), tagline: "", posts: [], projects: [] };
  let html;
  try {
    html = fs.readFileSync(indexFile, "utf8");
  } catch (e) {
    return { ...empty, msg: "预览源暂不可用" };
  }

  const desc = html.match(/<meta\s+name\s*=\s*["']description["']\s+content\s*=\s*["']([^"']*)["']/i);
  const tagline = desc ? stripTags(desc[1]).slice(0, 200) : "";

  const posts = [];
  for (const block of extractBlocks(html, "post-card")) {
    const link = pickHeadingLink(block);
    const title = stripTags(link.title).slice(0, 80);
    if (!title) continue;
    posts.push({
      title,
      href: safeInternalHref(link.href) || "/blog/",
      summary: stripTags(pickFirstParagraph(block)).slice(0, 140),
      tag: stripTags(pickClass(block, "tag")).slice(0, 20),
      date: stripTags(pickClass(block, "date")).slice(0, 32)
    });
    if (posts.length >= MAX_POSTS) break;
  }

  const projects = [];
  for (const block of extractBlocks(html, "project-card")) {
    const link = pickHeadingLink(block);
    const name = stripTags(link.title).slice(0, 64);
    if (!name) continue;
    projects.push({
      name,
      href: safeInternalHref(link.href) || "/projects.html",
      icon: stripTags(pickClass(block, "proj-icon")).slice(0, 8) || "📦",
      summary: stripTags(pickFirstParagraph(block)).slice(0, 130),
      tags: pickTags(block, "proj-tag")
    });
    if (projects.length >= MAX_PROJECTS) break;
  }

  return { ok: true, generatedAt: Date.now(), tagline, posts, projects };
}

function createPreview(deps = {}) {
  const indexFile = deps.indexFile;
  const logger = deps.logger || null;
  const cacheMs = deps.cacheMs === undefined ? CACHE_MS : Math.max(0, Number(deps.cacheMs) || 0);
  let cache = null;
  let cacheAt = 0;
  let cachedMtimeMs = -1;

  function resolveIndexFile() {
    if (indexFile) return indexFile;
    // 兼容两种调用位置：从 qrcode-login/ 起或项目根起
    const fromModules = path.join(__dirname, "..", "..", "..", "blog", "index.html");
    const fromRoot = path.join(process.cwd(), "blog", "index.html");
    return fs.existsSync(fromModules) ? fromModules : fromRoot;
  }

  function get(force = false) {
    const file = resolveIndexFile();
    let mtimeMs = -1;
    try { mtimeMs = fs.statSync(file).mtimeMs; } catch { /* 文件不存在时仍返回空预览 */ }
    const now = Date.now();
    if (!force && cache && now - cacheAt < cacheMs && mtimeMs === cachedMtimeMs) return cache;
    const data = buildPreview(file);
    cache = data;
    cacheAt = now;
    cachedMtimeMs = mtimeMs;
    if (logger && data.msg) logger.warn("preview", data.msg);
    return data;
  }

  return { get, safeInternalHref, stripTags };
}

let singleton = null;
function getPreview(deps = {}) {
  if (!singleton) singleton = createPreview(deps);
  return singleton;
}
function resetPreviewForTest() { singleton = null; }

module.exports = { createPreview, getPreview, resetPreviewForTest, safeInternalHref, stripTags };
