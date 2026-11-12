const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/middleware/blogStatic.js';
let c = fs.readFileSync(f, 'utf8');

// 1. 去掉 noindex，允许搜索引擎抓取
c = c.replace('X-Robots-Tag", "noindex, nofollow, noarchive"', 'X-Robots-Tag", "all"');

// 2. 找到未登录判断的地方，改成直接放行
// 原来的逻辑：未登录就 401 或 302
// 改成：不管有没有登录，都直接返回文件

// 先看看原来的代码块
const oldBlock = `    // 文件存在但未登录
    if (!ws) {
      if (isDocumentExt(fullPath)) {
        return res.redirect('/');
      } else {
        return res.status(401).json({ ok: false, msg: "请先登录" });
      }
    }`;

const newBlock = `    // 博客内容公开访问，不需要登录
    // （原来的强制登录逻辑已移除）`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  console.log('removed auth check');
} else {
  console.log('auth block not found, trying simpler approach');
  // 简单粗暴：直接把所有 401 和 redirect 都去掉
  // 找到 ws 定义的地方，直接设为 true
  c = c.replace('const ws = token ? getSession(token) : null;', 'const ws = { public: true }; // 公开访问，不校验登录');
}

fs.writeFileSync(f, c);
console.log('done');
