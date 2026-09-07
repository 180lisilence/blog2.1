/**
 * 集成测试
 * 测试完整用户流程：注册 → 登录 → 项目列表 → ChatRecord 会话 CRUD → 分享
 *
 * 用法：node tests/integration.test.js
 * 注意：会自动启动和停止服务，需要 MySQL 可用
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const BASE_URL = "http://127.0.0.1:3999"; // 用非默认端口避免冲突
const SERVER_DIR = path.join(__dirname, "..", "qrcode-login");
const TEST_USER = "it" + Date.now().toString().slice(-8); // 最多10位，符合2-20位限制
const TEST_PASS = "test123456";

let serverProc = null;
let passed = 0;
let failed = 0;

// HTTP 请求工具
function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Cookie"] = `web_token=${token}`;
    const postData = body ? JSON.stringify(body) : null;
    if (postData) headers["Content-Length"] = Buffer.byteLength(postData);

    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${name}`);
      console.log(`     ${e.message}`);
      failed++;
    }
  };
}

// 启动服务（用 HTTP 轮询检测就绪）
function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn("node", ["server.js"], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: "3999", LOG_LEVEL: "ERROR" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const startTime = Date.now();
    const maxWait = 30000; // 最多等 30 秒

    // 轮询检测服务是否就绪
    const poll = setInterval(async () => {
      if (Date.now() - startTime > maxWait) {
        clearInterval(poll);
        return reject(new Error("服务启动超时（30秒）"));
      }
      try {
        const res = await request("GET", "/api/qrcode/generate");
        if (res.status === 200 && res.body.ok) {
          clearInterval(poll);
          setTimeout(resolve, 500);
        }
      } catch (e) {
        // 服务还没启动，继续轮询
      }
    }, 1000);

    serverProc.on("error", (e) => {
      clearInterval(poll);
      reject(e);
    });
  });
}

// 停止服务
function stopServer() {
  if (serverProc) {
    serverProc.kill("SIGTERM");
    serverProc = null;
  }
}

// 清理测试用户
async function cleanup() {
  try {
    // 删除测试用户的 ChatRecord 数据目录
    const userDir = path.join(SERVER_DIR, "data", "chatrecord", TEST_USER);
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
  } catch (e) {
    // 忽略清理错误
  }
}

// ========== 测试用例 ==========

const tests = [
  test("服务健康检查（二维码生成）", async () => {
    const res = await request("GET", "/api/qrcode/generate");
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.ok === true, "响应 ok 应为 true");
    assert(res.body.qid, "应返回 qid");
    assert(res.body.qrBase64, "应返回 qrBase64");
  }),

  test("注册新用户", async () => {
    const res = await request("POST", "/api/register", {
      username: TEST_USER,
      password: TEST_PASS
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.ok === true, "注册应成功");
  }),

  test("重复注册被拒绝（409）", async () => {
    const res = await request("POST", "/api/register", {
      username: TEST_USER,
      password: TEST_PASS
    });
    assert(res.status === 409, `应返回 409，实际 ${res.status}`);
  }),

  test("账号密码登录", async () => {
    const res = await request("POST", "/api/login", {
      username: TEST_USER,
      password: TEST_PASS
    });
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.ok === true, "登录应成功");
    assert(res.body.webToken, "应返回 webToken");
    assert(res.body.username === TEST_USER, "用户名应匹配");
    global.__testToken = res.body.webToken;
  }),

  test("错误密码登录被拒绝", async () => {
    const res = await request("POST", "/api/login", {
      username: TEST_USER,
      password: "wrongpassword"
    });
    assert(res.status === 400, `应返回 400，实际 ${res.status}`);
  }),

  test("查询登录态 /api/me", async () => {
    const res = await request("GET", "/api/me", null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.username === TEST_USER, "用户名应匹配");
  }),

  test("未登录访问 /api/me 返回 401", async () => {
    const res = await request("GET", "/api/me");
    assert(res.status === 401, `应返回 401，实际 ${res.status}`);
  }),

  test("获取项目列表", async () => {
    const res = await request("GET", "/api/projects", null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(Array.isArray(res.body.projects), "projects 应为数组");
    assert(res.body.projects.length >= 8, `至少 8 个内置项目，实际 ${res.body.projects.length}`);
  }),

  test("未登录访问项目列表返回 401", async () => {
    const res = await request("GET", "/api/projects");
    assert(res.status === 401, `应返回 401，实际 ${res.status}`);
  }),

  test("扫描可导入项目", async () => {
    const res = await request("GET", "/api/projects/scan", null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(Array.isArray(res.body.available), "available 应为数组");
  }),

  test("创建 ChatRecord 会话", async () => {
    const res = await request("POST", "/api/chatrecord/sessions", {
      title: "集成测试会话"
    }, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.session, "应返回 session");
    assert(res.body.session.title === "集成测试会话", "标题应匹配");
    global.__testSessionId = res.body.session.id;
  }),

  test("获取 ChatRecord 会话列表", async () => {
    const res = await request("GET", "/api/chatrecord/sessions", null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(Array.isArray(res.body.sessions), "sessions 应为数组");
    assert(res.body.sessions.length >= 1, "至少 1 个会话");
  }),

  test("获取单个 ChatRecord 会话", async () => {
    const res = await request("GET", `/api/chatrecord/sessions/${global.__testSessionId}`, null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.session.id === global.__testSessionId, "会话 ID 应匹配");
  }),

  test("更新 ChatRecord 会话（导入消息）", async () => {
    const messages = [
      { sender: "Alice", content: "你好", timestamp: Date.now() - 100000 },
      { sender: "Bob", content: "你好呀", timestamp: Date.now() - 90000 },
      { sender: "Alice", content: "在干嘛", timestamp: Date.now() - 80000 }
    ];
    const res = await request("POST", `/api/chatrecord/sessions/${global.__testSessionId}/import`, {
      messages
    }, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.session.messages.length === 3, `应导入 3 条消息，实际 ${res.body.session.messages.length}`);
  }),

  test("创建 ChatRecord 分享", async () => {
    const res = await request("POST", `/api/chatrecord/sessions/${global.__testSessionId}/share`, null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.shareId, "应返回 shareId");
    assert(res.body.url, "应返回分享 URL");
    global.__testShareId = res.body.shareId;
  }),

  test("公开访问分享数据（无需登录）", async () => {
    const res = await request("GET", `/api/chatrecord/share/${global.__testShareId}`);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.session, "应返回 session");
    assert(res.body.sharedBy === TEST_USER, "分享者应匹配");
  }),

  test("访问不存在的分享返回 404", async () => {
    const res = await request("GET", "/api/chatrecord/share/nonexistent");
    assert(res.status === 404, `应返回 404，实际 ${res.status}`);
  }),

  test("OCR 健康检查", async () => {
    const res = await request("GET", "/api/chatrecord/ocr/health");
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.ocr, "应返回 ocr 状态");
    assert(typeof res.body.ocr.available === "boolean", "available 应为布尔值");
  }),

  test("删除 ChatRecord 会话", async () => {
    const res = await request("DELETE", `/api/chatrecord/sessions/${global.__testSessionId}`, null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
  }),

  test("登出", async () => {
    const res = await request("POST", "/api/logout", null, global.__testToken);
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(res.body.ok === true, "登出应成功");
  }),

  test("登出后 token 失效", async () => {
    const res = await request("GET", "/api/me", null, global.__testToken);
    assert(res.status === 401, `应返回 401，实际 ${res.status}`);
  })
];

// ========== 主流程 ==========

async function main() {
  console.log("========================================");
  console.log("  集成测试 - 完整用户流程");
  console.log("========================================");

  try {
    console.log("\n  启动服务...");
    await startServer();
    console.log("  服务已启动\n");

    for (const t of tests) {
      await t();
    }
  } catch (e) {
    console.log(`\n  ❌ 测试框架错误: ${e.message}`);
    failed++;
  } finally {
    console.log("\n  清理测试数据...");
    await cleanup();
    console.log("  停止服务...");
    stopServer();
  }

  console.log("\n========================================");
  console.log(`  集成测试结果: ${passed} 通过, ${failed} 失败`);
  console.log("========================================");

  if (failed > 0) process.exit(1);
  else console.log("\n🎉 全部集成测试通过！");
}

main();
