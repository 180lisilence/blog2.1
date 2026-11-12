const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/server.js';
let c = fs.readFileSync(f, 'utf8');
const line = 'app.get("/architecture.html", (req, res) => {';
if (c.includes('/robots.txt')) {
  console.log('already exists');
  process.exit(0);
}
const add = line + '\napp.get("/robots.txt", (req, res) => { res.type("text/plain").sendFile(path.join(config.blogRoot, "robots.txt")); });\napp.get("/sitemap.xml", (req, res) => { res.type("application/xml").sendFile(path.join(config.blogRoot, "sitemap.xml")); });';
c = c.replace(line, add);
fs.writeFileSync(f, c);
console.log('done');
