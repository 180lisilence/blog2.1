const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/server.js';
let c = fs.readFileSync(f, 'utf8');

if (c.includes('/favicon.svg')) {
  console.log('already exists');
  process.exit(0);
}

// 在 robots.txt 路由后面加 favicon 路由
const line = 'app.get("/robots.txt", (req, res) => { res.type("text/plain").sendFile(path.join(config.blogRoot, "robots.txt")); });';
const add = line + '\napp.get("/favicon.svg", (req, res) => { res.type("image/svg+xml").sendFile(path.join(config.blogRoot, "favicon.svg")); });';

c = c.replace(line, add);
fs.writeFileSync(f, c);
console.log('done');
