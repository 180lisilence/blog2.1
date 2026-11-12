const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/server.js';
let c = fs.readFileSync(f, 'utf8');

// 错误的代码块
const wrong = `app.get("/architecture.html", (req, res) => {
app.get("/robots.txt", (req, res) => { res.type("text/plain").sendFile(path.join(config.blogRoot, "robots.txt")); });
app.get("/sitemap.xml", (req, res) => { res.type("application/xml").sendFile(path.join(config.blogRoot, "sitemap.xml")); });
  res.sendFile(path.join(config.blogRoot, "architecture.html"));
});`;

// 正确的代码块
const right = `app.get("/architecture.html", (req, res) => {
  res.sendFile(path.join(config.blogRoot, "architecture.html"));
});
app.get("/robots.txt", (req, res) => { res.type("text/plain").sendFile(path.join(config.blogRoot, "robots.txt")); });
app.get("/sitemap.xml", (req, res) => { res.type("application/xml").sendFile(path.join(config.blogRoot, "sitemap.xml")); });`;

c = c.replace(wrong, right);
fs.writeFileSync(f, c);
console.log('fixed');
