const fs = require('fs');
const f = '/www/server/panel/vhost/nginx/blog2.1.conf';
let c = fs.readFileSync(f, 'utf8');

if (c.includes('proxy_hide_header')) {
  console.log('already exists');
  process.exit(0);
}

// 在 proxy_read_timeout 后面加隐藏头配置
const old = '        proxy_read_timeout    120s;\n    }';
const replacement = `        proxy_read_timeout    120s;

        # 隐藏泄漏的响应头
        proxy_hide_header X-VE-Vortex-IP;
        proxy_hide_header X-VE-Request-Id;
        proxy_hide_header Server;
        proxy_set_header Server "cloud";
    }`;

c = c.replace(old, replacement);
fs.writeFileSync(f, c);
console.log('done');
