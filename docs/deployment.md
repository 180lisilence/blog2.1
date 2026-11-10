# blog2.1 服务器部署文档

> 部署日期：2026-11-10
> 服务器：206.187.214.190
> **访问地址：https://lizyi.asia**
> 备用（IP 直连，仅排查用）：http://206.187.214.190

---

## 一、部署结果

| 项 | 状态 | 说明 |
|---|---|---|
| 主站地址 | ✅ 运行中 | **https://lizyi.asia** |
| 证书 | ✅ 有效 | Let's Encrypt ECC，`www.lizyi.asia` 同证书，2027-02-08 到期 |
| 协议 | ✅ HTTP/2 | TLS 1.2 / 1.3，HSTS 已开 |
| HTTP 跳转 | ✅ 301 | `http://lizyi.asia` → `https://lizyi.asia` |
| 健康检查 | ✅ ok | `GET /health`，数据库 status=up |
| 数据库 | ✅ MySQL 5.7.43 | 库名 `myself_blog2`，已建 users / user_data |
| 进程守护 | ✅ pm2 | `blog2.1`，已配置开机自启 |
| 反向代理 | ✅ Nginx 1.30.6 | 443/80 → 127.0.0.1:3000 |
| 登录门禁 | ✅ 生效 | 未登录访问 /projects.html、/blog/ 均 302 |
| Cookie Secure | ✅ TRUE | `csrf_token` 仅 https 发送 |
| 站内项目 | 10 个 | /api/projects 返回正常 |
| 外链作品 | 10 个 | /api/links 返回正常 |

---

## 二、服务器环境

```
系统      Ubuntu 22.04 LTS（Proxmox 虚拟化）
内存      4 GB（可用 3.5 GB）
磁盘      9.8 GB（已用 4.7 GB，可用 4.6 GB）
Node      v18.20.8（NodeSource 源安装）
npm       10.8.2
pm2       7.1.2
MySQL     5.7.43（宝塔 /www/server/mysql）
Nginx     1.30.6（宝塔 /www/server/nginx，配置目录 /www/server/panel/vhost/nginx/）
Python    3.10.12
面板      宝塔 13.2.0，https://206.187.214.190:22682/langlangy
证书工具  acme.sh v3.1.7（/root/.acme.sh）
```

---

## 二·五、HTTPS 配置详解

### 域名

```
lizyi.asia        A 记录 → 206.187.214.190
www.lizyi.asia    A 记录 → 206.187.214.190
```

### 证书

```
CA        Let's Encrypt（免费，90 天有效期）
类型      ECC P-256
覆盖      lizyi.asia + www.lizyi.asia
签发时间  2026-11-10
到期时间  2027-02-08
自动续期  每天 0/6/12/18 点检查，到期前 30 天自动续
```

证书文件位置：

```
/etc/letsencrypt/live/lizyi.asia/fullchain.pem   # 证书链
/etc/letsencrypt/live/lizyi.asia/privkey.pem     # 私钥（chmod 600）
/etc/letsencrypt/live/lizyi.asia/chain.pem       # 中间证书
```

续期后会自动执行 `nginx -s reload`，无需人工干预。

### 为什么用 acme.sh 而不是 certbot

宝塔环境里 `apt-get install snapd` 会卡死（系统源问题）。acme.sh 是纯 shell 脚本，无依赖，用 webroot 模式验证，几秒就能签完。同样支持自动续期。

### 关键配置分工

| 层 | 职责 |
|---|---|
| Nginx | 终止 TLS、80→443 跳转、ACME 验证目录、静态缓存、gzip |
| Node 应用 | 只处理业务，监听 127.0.0.1:3000，不再做 HTTPS 跳转 |

> ⚠️ `FORCE_HTTPS` 必须为 `false`。Nginx 已经负责跳转，如果应用层也跳，会出现双层跳转甚至死循环。

### 自动续期验证方法

```bash
# 查看证书状态
~/.acme.sh/acme.sh --list

# 手动触发续期测试
~/.acme.sh/acme.sh --renew -d lizyi.asia --ecc --force

# 检查线上证书到期时间
echo | openssl s_client -connect lizyi.asia:443 -servername lizyi.asia 2>/dev/null \
  | openssl x509 -noout -enddate
```

---

## 三、目录结构

```
/www/wwwroot/blog2.1/              # 站点根目录（150 MB）
├── index.html                     # 登录页
├── projects.html                  # 项目中心（需登录）
├── blog/                          # 博客与站内作品（需登录）
│   ├── index.html
│   ├── assets/
│   └── projects/                  # 11 个站内项目
│       ├── earth-online/          # 100 MB（mp3、图片）
│       ├── chatrecord/            # 37 MB（Tesseract 模型）
│       └── ...（其余合计约 13 MB）
├── build-methods/
├── docs/
├── tests/
└── qrcode-login/                  # Node 后端
    ├── server.js                  # 入口
    ├── .env                       # 生产配置（chmod 600）
    ├── node_modules/              # 116 个依赖
    ├── config/  core/  db/  middleware/  modules/
    └── links.json                 # 10 条外链数据
```

---

## 四、凭据清单

> ⚠️ 本节含敏感信息，请勿外传

### MySQL

```
root 密码      见服务器 /root/.blog2-credentials.txt
应用账号       blog2app
应用密码       <MYSQL_APP_PASSWORD>
数据库名       myself_blog2
权限           SELECT/INSERT/UPDATE/DELETE/CREATE/INDEX/ALTER（仅 myself_blog2.*）
```

root 密码通过宝塔命令 `bt 7` 重置（原密码未知）。宝塔限制密码不能含特殊符号。

### 系统登录

```
管理员账号     admin
管理员密码     <ADMIN_PASSWORD>
```

首次启动时由 `db/init.js` 自动创建。**如需修改，直接改数据库 users 表或通过页面"修改密码"功能。**

### 宝塔面板

```
地址   https://206.187.214.190:22682/langlangy
用户   langlangy
密码   <PANEL_PASSWORD>
```

---

## 五、部署前所做的代码改动

本次部署对源码做了 6 处改动，**均为可部署性/安全性必需**：

### 1. 新增 `qrcode-login/middleware/ipWhitelist.js`

IP 白名单中间件，支持单个 IP、CIDR 网段、通配符 `*`。10 项单元测试全部通过。

### 2. `/api/direct-login` 加白名单（安全关键）

**改动前**：

```js
router.post("/direct-login", (req, res) => {
  const webToken = sessionMgr.createWebSession("local");
  ok(res, { webToken, username: "local" });
});
```

这个接口**没有任何验证**，任何人 POST 一下就能拿到登录 token。本机使用时是"免密快捷入口"，部署到公网就是"任何人都能一键进入你的私密博客"。

**改动后**：

```js
const directLoginGuard = createIpWhitelist({
  envKey: "DIRECT_LOGIN_IPS",
  allowAllWhenEmpty: process.env.DIRECT_LOGIN_IPS_ALLOW_EMPTY !== "false",
  label: "direct-login"
});
router.post("/direct-login", directLoginGuard, (req, res) => { ... });
```

生产环境配置 `DIRECT_LOGIN_IPS=127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16`，公网 IP 不在列表内 → **403**。

### 3. `/api/register` 加白名单

原本对外开放注册，任何人都能注册账号。现改为 `REGISTER_IPS=127.0.0.1,::1`，公网 → **403**。

### 4. `forceHttps` 增加 `FORCE_HTTPS` 开关

**这是本次部署踩到的最大的坑。**

原代码：

```js
function forceHttps(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    if (proto === "http") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
  }
  next();
}
```

你的服务器**只有公网 IP、没有 HTTPS 证书**。设了 `NODE_ENV=production` 后，所有 HTTP 请求被 301 到 `https://206.187.214.190`，而这个地址没有服务 → **全站打不开，死循环**。

改动后增加 `FORCE_HTTPS=false` 开关，纯 HTTP 部署时显式关闭。

### 5. Cookie `secure` 标记同步修正

`middleware/csrf.js` 原本写死 `secure: process.env.NODE_ENV === "production"`。同样的问题：HTTP 部署下浏览器会**直接丢弃**带 Secure 的 Cookie，导致 CSRF 校验永远失败、登录后所有写操作报错。

现改为跟随 `FORCE_HTTPS` 判断。

### 6. `config/index.js` 增加 `PUBLIC_BASE_URL` 与 `HOST`

- `PUBLIC_BASE_URL`：二维码内容基于此地址生成。不设的话会填内网 IP，**手机扫码后连不上**。
- `HOST`：默认 `0.0.0.0`，生产环境设为 `127.0.0.1`（只让 Nginx 访问）。

另外 `server.js` 增加了 `trust proxy` 配置，否则反代后 `req.ip` 永远是 `127.0.0.1`，IP 白名单和限流全部失效。

---

## 六、部署过程踩坑记录

| 问题 | 现象 | 解决 |
|---|---|---|
| tar 解压报 uid/gid 错误 | `Cannot change ownership to uid 197609` | 无害。Windows 的 uid 在 Linux 无法映射，文件实际已正常解压 |
| nginx buffer 配置冲突 | `proxy_busy_buffers_size must be less than...` | 移除自定义 buffer 参数，用 nginx 默认值 |
| **全站 301 死循环** | 公网访问全部跳 https 后打不开 | 增加 `FORCE_HTTPS=false` 开关 |
| npm audit 报 critical | `proxy-addr` IP 伪造漏洞 | `npm audit fix` 升级到 2.0.8。该漏洞可伪造 X-Forwarded-For **绕过 IP 白名单**，必须修 |
| pm2 在 /root 下 start 失败 | `Script not found: /root/blog2.1` | 用绝对路径重新注册，确认 dump.pm2 里 script 与 cwd 都是绝对路径 |
| **MySQL 3306 对公网开放** | `*:3306` 外部可直连 | 改 `/etc/my.cnf` 加 `bind-address = 127.0.0.1`，重启后仅本机监听 |

---

## 七、日常运维命令

### 服务管理

```bash
pm2 list                      # 查看状态
pm2 logs blog2.1              # 实时日志
pm2 restart blog2.1           # 重启
pm2 stop blog2.1              # 停止
pm2 monit                     # 资源监控
```

### 日志位置

```
应用输出   /var/log/blog2.1-out.log
应用错误   /var/log/blog2.1-err.log
Nginx访问  /www/wwwlogs/blog2.1.access.log
Nginx错误  /www/wwwlogs/blog2.1.error.log
```

### Nginx 配置

```bash
nginx -t                                    # 测试配置
/www/server/nginx/sbin/nginx -s reload      # 重载
# 配置文件：/www/server/panel/vhost/nginx/blog2.1.conf
```

### 数据库

```bash
mysql -ublog2app -p'<MYSQL_APP_PASSWORD>' myself_blog2
```

---

## 八、更新部署流程

代码在本地修改后，按以下步骤更新：

```bash
# 1. 本地打包（排除无关文件）
cd /e/workaddress
tar -czf /tmp/blog-deploy.tar.gz \
  --exclude='blog2.1/.git' --exclude='*/node_modules' \
  --exclude='blog2.1/.workbuddy' --exclude='*.zip' --exclude='*.log' \
  blog2.1

# 2. 上传
scp /tmp/blog-deploy.tar.gz root@206.187.214.190:/tmp/

# 3. 服务器解压覆盖（注意不要覆盖 .env）
cd /www/wwwroot
tar -xzf /tmp/blog-deploy.tar.gz --exclude='blog2.1/qrcode-login/.env'

# 4. 若依赖有变，重装
cd /www/wwwroot/blog2.1/qrcode-login && npm install --omit=dev

# 5. 重启
pm2 restart blog2.1
```

---

## 九、安全检查结果

| 检查项 | 结果 |
|---|---|
| HTTPS 传输加密 | ✅ 已启用（Let's Encrypt + HTTP/2） |
| 证书链有效性 | ✅ `Verify return code: 0` |
| HTTP 强制跳转 | ✅ 301 → https |
| HSTS | ✅ max-age=31536000 |
| Cookie Secure 标记 | ✅ TRUE |
| 免密登录公网可调 | ✅ 已封（403） |
| 公开注册 | ✅ 已封（403） |
| 默认弱密码 123456 | ✅ 已换强密码 |
| MySQL 3306 公网暴露 | ✅ 已改仅本机监听 |
| npm 依赖 critical 漏洞 | ✅ 已清零 |
| 应用监听地址 | ✅ 127.0.0.1（仅 Nginx 可达） |
| CSRF 防护 | ✅ 生效（无 token 的 POST 被 403） |
| 登录失败锁定 | ✅ 生效（错误 5 次锁定） |
| 敏感文件（.env / 私钥） | ✅ chmod 600 |

### 仍未处理的风险

1. ~~**无 HTTPS**~~ → ✅ **已解决**：现已启用 Let's Encrypt 证书，全站 HTTPS + HSTS + HTTP/2。
2. **`web_token` 无 HttpOnly**：前端用 `document.cookie` 写入，XSS 可直接窃取登录态。这是架构级问题，改动需要调整前后端配合。
   - 注：`csrf_token` 已带 Secure 标记，但 `web_token` 由前端 JS 写入，无法加 HttpOnly。要解决必须改为服务端 `Set-Cookie` 下发 + HttpOnly。
3. **CSP 宽松**：`unsafe-inline` + `unsafe-eval`，XSS 防护实质失效。
4. **宝塔面板 22682 端口对公网开放**，且使用默认路径 `/langlangy`。
5. **HSTS 已开启但无 preload**：首次访问仍可能被劫持，不过由于是从 HTTP 301 到 HTTPS，风险较低。

---

## 十、回滚方式

如需下线：

```bash
pm2 delete blog2.1
rm -f /www/server/panel/vhost/nginx/blog2.1.conf
/www/server/nginx/sbin/nginx -s reload
```

数据库数据保留在 `myself_blog2`，需手动清理：

```bash
mysql -uroot -p'<MYSQL_ROOT_PASSWORD>' -e "DROP DATABASE myself_blog2;"
```
