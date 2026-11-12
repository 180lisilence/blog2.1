/**
 * 博客静态资源安全托管（替代 express.static 直接挂载）
 * ============================================================================
 * 解决三个问题：
 *
 * F-06 / N-10  路径遍历
 *   现象：`/blog/projects/woldvein/..%2f..%2findex.html` 能读到 /blog/index.html。
 *   成因：nginx 只拦字面量 `../`，编码斜杠绕过；express.static 解码后仍落在
 *        挂载根范围内的越界路径照样服务。
 *   修法：自己接管。对解码后的路径做 path.resolve 归一化，强制校验结果必须
 *        在 BLOG_CONTENT 之内（比较时带分隔符，防 blog-evil 前缀混淆）。
 *        越界直接 400 —— 不给 404，不暴露任何路径存在性。
 *
 * N-08  静态资源的 MIME 伪装 / 页面鉴权状态码
 *   现象：未登录请求 /blog/assets/js/blog-storage.js 返回 200 + text/html；
 *        页面类路径又统一 200 返回登录页实体，导致「200 vs 404」的目录枚举面。
 *   修法：静态资源 401 JSON；页面类 302 跳回首页登录页（1.0 复测残留项）。
 *        登录页实体仍由 `/` 正常提供，功能不退化，只是状态码语义正确了。
 *
 * N-09  私有页面缓存头
 *   现象：带 token 的私有页面响应带 `Cache-Control: public`，Vary 不含 Cookie。
 *   修法：所有 /blog 响应统一 private + no-store，并显式 Vary: Cookie。
 */
const fs = require("fs");
const path = require("path");
const logger = require("../core/logger");

// 常见静态类型（够用且不引入 mime 依赖）
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function contentTypeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
}

// 是否是"文档型"响应（能装登录页的）
function isDocumentExt(p) {
  const ext = path.extname(p).toLowerCase();
  return ext === "" || ext === ".html" || ext === ".htm";
}

// 博客内容公开访问（SEO 友好）
function applyPublicCacheHeaders(res) {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Vary", "Accept-Encoding");
}

// 私有内容（登录后才能看）的缓存头
function applyPrivateCacheHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vary", "Cookie, Accept-Encoding");
}

// 路径归一化 + 越界检查
//
// req.path 已被 Express 解码过一次（%2e%2e%2f -> ../）。再手动解一次是为兜住
// 双编码（%252e -> %2e）。解码后照样要归一化 + 前缀校验，所以多解一次不引入新风险。
//
// ⚠️ 重要：只做"归一化后是否越界"是不够的。
// 报告 F-06 / N-10 的 payload 是 `/blog/projects/woldvein/../../index.html`
// —— 归一化后正好落回 /blog/index.html，**在根内**，所以前缀校验放行。
// 它确实出不了 /blog，但依然构成了"任意资源可达"（用任意子站路径都能读到
// /blog 下任何文件，绕过目录隔离），而且这是 nginx 已明确拦截的字面量 `../`。
// nginx 拦了，应用层却放行 = 解析差异，这正是漏洞成因。
// 因此这里额外加一条硬规则：**原始路径里出现 `..` 段一律拒绝**。
function resolveSafe(root, reqPath) {
  let decoded = String(reqPath || "");
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (e) {
      break; // 非法编码序列，按未解码处理
    }
  }

  // 拒绝 NUL 字节
  if (decoded.indexOf("\0") !== -1) return { ok: false, resolved: "" };

  // 拒绝任何 `..` 段（含 %2e%2e 解出来的、以及 ..%2f 这种只编码斜杠的）
  // 统一按 / 和 \ 切段判断，兼容 Windows 路径分隔符
  const segments = decoded.split(/[\/\\]+/);
  for (const seg of segments) {
    if (seg === "..") {
      return { ok: false, resolved: path.resolve(root, decoded.replace(/^\/+/, "")) };
    }
  }

  const rel = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, rel);
  const rootResolved = path.resolve(root);

  // 前缀校验必须带分隔符，否则 /www/blog 会匹配到 /www/blog-evil
  const withSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (resolved !== rootResolved && !resolved.startsWith(withSep)) {
    return { ok: false, resolved };
  }

  // 点文件/点目录一律不服务。
  // 注意：必须逐段检查，不能只看 path.basename ——
  // `/.git/config` 的 basename 是 `config`，只看最后一段会把 .git 放过去。
  const relParts = resolved.slice(rootResolved.length).split(/[\/\\]+/).filter(Boolean);
  for (const part of relParts) {
    if (part.startsWith(".")) {
      return { ok: false, resolved };
    }
  }
  return { ok: true, resolved };
}

/**
 * 创建 /blog 静态托管中间件（博客内容公开访问，SEO 友好）
 * @param {object} opts
 * @param {string}   opts.root           物理根目录（config.blogContent）
 */
function createBlogStatic(opts) {
  const { root } = opts;
  const rootResolved = path.resolve(root);

  return function blogStatic(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const safe = resolveSafe(rootResolved, req.path);

    // 越界：直接 400，不区分"不存在"和"越界"（F-06 / N-10）
    if (!safe.ok) {
      logger.warn("blog-static", `[F-06/N-10] 拒绝越界路径: ${req.originalUrl} -> ${safe.resolved}`);
      applyPublicCacheHeaders(res);
      return res.status(400).type("text/plain; charset=utf-8").send("400 - 请求路径非法");
    }

    let target = safe.resolved;
    let stat = null;
    try {
      stat = fs.statSync(target);
    } catch (e) {
      stat = null;
    }

    // 目录 -> 补 index.html
    if (stat && stat.isDirectory()) {
      const idx = path.join(target, "index.html");
      try {
        const s2 = fs.statSync(idx);
        if (s2.isFile()) {
          target = idx;
          stat = s2;
        } else {
          stat = null;
        }
      } catch (e) {
        stat = null;
      }
    }

    // 路径本身不存在
    if (!stat || !stat.isFile()) {
      applyPublicCacheHeaders(res);
      return res.status(404).type("text/plain; charset=utf-8").send("404 - 页面不存在");
    }

    // 博客内容公开访问（SEO 友好，不需要登录）
    applyPublicCacheHeaders(res);
    res.setHeader("Content-Type", contentTypeFor(target));

    const inm = req.headers["if-none-match"];
    function sendBody(buf, size) {
      res.setHeader("Content-Length", size);
      // ETag 必须反映注入后的真实字节数，否则浏览器 304 会拿回未注入的旧 HTML
      const etag = `W/"${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", stat.mtime.toUTCString());
      if (inm && inm === etag) return res.status(304).end();
      if (req.method === "HEAD") return res.status(200).end();
      if (buf) return res.status(200).end(buf);

      const stream = fs.createReadStream(target);
      stream.on("error", (e) => {
        logger.error("blog-static", `读取失败: ${target}`, e);
        if (!res.headersSent) res.status(500).type("text/plain; charset=utf-8").end("500");
        else res.end();
      });
      stream.pipe(res);
    }

    // 在线状态提示 + 顶号提示：所有 /blog HTML 文档注入这两个脚本，一处改动全站生效。
    // 用户在博客任意页面被管理员下线都能收到弹窗；非 HTML 资源与未登录请求不受影响。
    // 脚本同源、零外部依赖，严格 CSP（script-src 'self'）下可正常加载。
    //
    // 2.2.8：session-kicked.js 此前只挂在顶层三页（index / projects / settings），
    // 文章页（/blog/posts/*.html）没有它 —— 评论接口返回 401 KICKED 时没人接手，
    // 用户只看到「请先登录后再发表评论」。现在一并注入，
    // 保证「被顶号」这件事在任何页面都能立刻弹窗，而不是等 presence 轮询。
    if (/\.(?:html?|htm)$/i.test(target)) {
      return fs.readFile(target, "utf8", (err, raw) => {
        if (err) {
          logger.error("blog-static", `读取失败: ${target}`, err);
          return res.status(500).type("text/plain; charset=utf-8").end("500");
        }
        let injected = raw;
        // 版本号必须随脚本改动同步升号，否则浏览器 / 代理缓存会继续用旧脚本
        if (injected.indexOf("/presence-client.js") === -1) {
          const tag = '<script src="/presence-client.js?v=3" defer></script>';
          injected = /<\/body\s*>/i.test(injected)
            ? injected.replace(/<\/body\s*>/i, tag + "</body>")
            : injected + tag;
        }
        if (injected.indexOf("/session-kicked.js") === -1) {
          const tag = '<script src="/session-kicked.js?v=2" defer></script>';
          injected = /<\/body\s*>/i.test(injected)
            ? injected.replace(/<\/body\s*>/i, tag + "</body>")
            : injected + tag;
        }
        const buf = Buffer.from(injected, "utf8");
        sendBody(buf, buf.length);
      });
    }

    sendBody(null, stat.size);
  };
}

module.exports = { createBlogStatic, resolveSafe, applyPrivateCacheHeaders, contentTypeFor };
