const fs = require('fs');
const f = '/www/wwwroot/blog2.1/qrcode-login/server.js';
let c = fs.readFileSync(f, 'utf8');

if (c.includes('"/projects"')) {
  console.log('already exists');
  process.exit(0);
}

// 把 /projects.html 路由改成同时匹配 /projects 和 /projects.html
c = c.replace('app.get("/projects.html", authGate, (req, res) => {', 'app.get(["/projects", "/projects.html"], authGate, (req, res) => {');

fs.writeFileSync(f, c);
console.log('done');
