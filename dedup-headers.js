const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/middleware/security.js';
let c = fs.readFileSync(f, 'utf8');

// 去掉和 nginx 重复的三个头
c = c.replace('res.setHeader("X-Frame-Options", "SAMEORIGIN");\n', '');
c = c.replace('res.setHeader("X-Content-Type-Options", "nosniff");\n', '');
c = c.replace('res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");\n', '');

fs.writeFileSync(f, c);
console.log('done');
