const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/middleware/blogStatic.js';
let c = fs.readFileSync(f, 'utf8');

// 直接把 loggedIn 改成 true，不管什么情况都放行
c = c.replace('const loggedIn = !!(ws && Date.now() <= ws.expireAt);', 'const loggedIn = true; // 博客公开访问');

fs.writeFileSync(f, c);
console.log('done');
