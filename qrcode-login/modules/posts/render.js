/**
 * 动态文章页渲染（3.1）
 *
 * 新发文章不再生成静态 HTML，而是由数据库按 slug 动态渲染。
 * 正文按纯文本处理：先整体 HTML 转义，再按空行拆段、段内换行转 <br>，
 * 不允许任何原始 HTML 进入页面 —— 这是文章内容唯一的 XSS 边界。
 */

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(ts) {
  const n = Number(ts) || 0;
  if (!n) return "";
  // 统一按东八区展示，避免服务器时区差异导致日期偏移
  const d = new Date(n + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function renderParagraphs(content) {
  const text = escapeHtml(content);
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n      ");
}

const HEADER = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__ · 我的博客</title>
<meta name="description" content="__DESC__">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/assets/css/blog.css">
<link rel="stylesheet" href="/assets/css/comments.css">
</head>
<body>

<header class="site-header">
  <div class="nav-wrap">
    <a href="/" class="brand"><span class="dot"></span>我的博客</a>
    <nav class="nav-links">
      <a href="/">首页</a>
      <a href="/#posts">文章</a>
      <a href="/write">写文章</a>
      <a href="/my">我的发布</a>
      <a href="/#about">关于</a>
    </nav>
  </div>
</header>
`;

const FOOTER = `
<footer class="site-footer">
  <p>© 2026 我的博客 · 所有数据本地存储 · 不追踪、不收集</p>
</footer>
</body>
</html>`;

/**
 * 渲染一篇已发布文章
 * @param {object} post 数据库行
 */
function renderPostPage(post) {
  const title = escapeHtml(post.title);
  const desc = escapeHtml(post.summary || String(post.content || "").slice(0, 120));
  const date = formatDate(post.created_at);
  const tag = escapeHtml(post.tag || "随笔");
  const author = escapeHtml(post.author);
  const slug = escapeHtml(post.slug);

  return HEADER
    .replace(/__TITLE__/g, title)
    .replace(/__DESC__/g, desc)
    + `
<article class="article">
  <a class="back-link" href="/">← 返回首页</a>
  <h1>${title}</h1>
  <div class="article-meta">
    <span>📅 ${date}</span>
    <span>🏷 ${tag}</span>
    <span>✍️ ${author}</span>
  </div>
  <div class="content">
      ${renderParagraphs(post.content)}
  </div>
</article>

<section class="comments" id="comments" data-slug="${slug}"></section>
<script src="/assets/js/comments.js" defer></script>
`
    + FOOTER;
}

/**
 * 文章不存在 / 已下架
 */
function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>文章不存在 · 我的博客</title>
<link rel="stylesheet" href="/assets/css/blog.css">
</head>
<body>
<header class="site-header">
  <div class="nav-wrap">
    <a href="/" class="brand"><span class="dot"></span>我的博客</a>
    <nav class="nav-links"><a href="/">首页</a><a href="/write">写文章</a></nav>
  </div>
</header>
<article class="article">
  <a class="back-link" href="/">← 返回首页</a>
  <h1>文章不存在或已下架</h1>
  <div class="content"><p>这篇文章可能还在审核中，或者已被删除。</p></div>
</article>
${FOOTER}`;
}

module.exports = { escapeHtml, formatDate, renderPostPage, renderNotFoundPage };
