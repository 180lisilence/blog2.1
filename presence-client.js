/**
 * 用户端在线状态提示脚本（由 blogStatic 自动注入到所有 /blog HTML 文档）
 *
 * - 同源 GET /api/presence/state，token 只走 Cookie，绝不写进 URL / 日志。
 * - status=kicked  → 按后台开关弹窗「你已下线」，确认后清 web_token 并回登录页。
 * - status=expired → 主动登出 / 会话过期 / 被改密删除：静默失效并回登录页。
 * - status=off     → 后台关了总开关，立即停止轮询。
 * - 页面隐藏时暂停轮询，重新可见时立即查一次。
 *
 * 零依赖、严格 CSP 可用（样式全部走 CSSOM，不写内联 style 属性、不引外部资源）。
 */
(function () {
  "use strict";
  if (window.__blogPresenceLoaded) return;
  window.__blogPresenceLoaded = true;

  var COOKIE_NAME = "web_token";
  var cfg = {
    pollMs: 8000,
    timer: null,
    stopped: false,
    busy: false,
    kickedSeen: false
  };

  function getCookie(name) {
    var parts = document.cookie ? document.cookie.split(";") : [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/^\s+/, "");
      var eq = p.indexOf("=");
      if (eq > 0 && p.slice(0, eq) === name) {
        try { return decodeURIComponent(p.slice(eq + 1)); } catch (e) { return p.slice(eq + 1); }
      }
    }
    return "";
  }

  function clearCookie(name) {
    document.cookie = name + "=; path=/; max-age=0; SameSite=Lax";
    document.cookie = name + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    // R4-03：HttpOnly web_token 由服务端 presence/kicked 响应 clearCookie；
    // 这里顺带清掉非 HttpOnly 的体验标记，避免页面残留"已登录"假象。
    document.cookie = "web_auth=; path=/; max-age=0; SameSite=Lax";
  }

  function applyStyle(node, styles) {
    for (var k in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, k)) node.style[k] = styles[k];
    }
  }

  function el(tag, styles, text) {
    var node = document.createElement(tag);
    if (styles) applyStyle(node, styles);
    if (text != null) node.textContent = text;
    return node;
  }

  function goLogin() {
    try { location.replace("/"); } catch (e) { location.href = "/"; }
  }

  function showDialog(message) {
    if (cfg.kickedSeen) return;
    cfg.kickedSeen = true;
    stop();
    try {
      var old = document.getElementById("__blog_presence_overlay");
      if (old && old.parentNode) old.parentNode.removeChild(old);
      // 2.2.8：session-kicked.js（401 KICKED 触发）与本脚本（presence 轮询触发）
      // 可能同时命中同一次顶号，两个弹窗叠在一起会互相遮挡。
      // 这里把对方的遮罩一并清掉，保证任意时刻只有一个下线提示。
      var peer = document.getElementById("__session_kicked_overlay");
      if (peer && peer.parentNode) peer.parentNode.removeChild(peer);

      var overlay = el("div", {
        position: "fixed", left: "0", top: "0", right: "0", bottom: "0",
        zIndex: "2147483647", display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(8,12,24,0.62)", padding: "20px", boxSizing: "border-box",
        fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
      });
      overlay.id = "__blog_presence_overlay";

      var card = el("div", {
        width: "420px", maxWidth: "100%", background: "#ffffff", color: "#111827",
        borderRadius: "16px", boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        padding: "28px", boxSizing: "border-box", textAlign: "center"
      });
      var icon = el("div", { fontSize: "38px", lineHeight: "1", marginBottom: "10px" }, "🔒");
      var title = el("h2", { margin: "0 0 10px", fontSize: "20px", fontWeight: "700" }, "下线通知");
      var body = el("p", {
        margin: "0 0 22px", fontSize: "15px", lineHeight: "1.7", color: "#4b5563"
      }, message || "你已下线，请重新登录。");
      var btn = el("button", {
        border: "0", borderRadius: "10px",
        background: "linear-gradient(135deg,#667eea,#764ba2)",
        color: "#ffffff", fontSize: "15px", fontWeight: "600",
        padding: "11px 26px", cursor: "pointer"
      }, "重新登录");
      btn.type = "button";
      btn.setAttribute("data-action", "presence-rel login");
      btn.onclick = function () {
        clearCookie(COOKIE_NAME);
        goLogin();
      };

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(body);
      card.appendChild(btn);
      overlay.appendChild(card);
      (document.body || document.documentElement).appendChild(overlay);
    } catch (e) {
      // 弹窗渲染失败也必须让会话失效，绝不把用户留在已失效的页面里
      clearCookie(COOKIE_NAME);
      goLogin();
    }
  }

  function handle(data) {
    if (!data || typeof data !== "object") return;
    if (typeof data.pollMs === "number" && data.pollMs >= 3000) cfg.pollMs = data.pollMs;
    if (data.status === "off") {
      stop();
      return;
    }
    if (data.status === "kicked") {
      // 后台「下线弹窗」开关：showDialog=false 时静默失效并回登录页
      // （会话已真实失效，必须引导重登，只是不弹打扰窗），开关状态由主站统一下发。
      if (data.showDialog === false) {
        stop();
        clearCookie(COOKIE_NAME);
        goLogin();
      } else {
        showDialog(data.message);
      }
      return;
    }
    if (data.status === "expired") {
      // 主动登出 / 自然过期 / 被改密或删号：无「强制下线」标记，静默处理不打扰
      stop();
      clearCookie(COOKIE_NAME);
      goLogin();
    }
    // anonymous / online：保持轮询
  }

  async function poll() {
    if (cfg.stopped || cfg.busy) return;
    if (document.visibilityState === "hidden") return;
    cfg.busy = true;
    try {
      var resp = await fetch("/api/presence/state", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (resp.ok) handle(await resp.json());
    } catch (e) {
      // 网络抖动 / 主站短暂不可用：不处理，下个周期重试
    } finally {
      cfg.busy = false;
      schedule();
    }
  }

  function schedule() {
    if (cfg.stopped) return;
    if (cfg.timer) clearTimeout(cfg.timer);
    cfg.timer = setTimeout(poll, cfg.pollMs);
  }

  function stop() {
    cfg.stopped = true;
    if (cfg.timer) clearTimeout(cfg.timer);
    cfg.timer = null;
  }

  function start() {
    if (cfg.stopped) return;
    if (document.visibilityState === "hidden") {
      cfg.timer = setTimeout(start, 5000);
      return;
    }
    poll();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !cfg.stopped) {
      if (cfg.timer) clearTimeout(cfg.timer);
      poll();
    }
  });

  // 首屏稍后启动，避免和页面自身初始化抢主线程
  setTimeout(start, 1200);

  // ===== 同浏览器多窗口互斥（localStorage 登录纪元）============================
  // 背景：web_token 是 HttpOnly Cookie，同一浏览器所有标签页/窗口共享。第二个窗口
  // 登录会覆盖 Cookie，导致两个窗口都持有新 token，服务端只看到 1 个会话——这正是
  // "后台显示 1 个设备、两个窗口却都显示已登录"的根因。
  // 对策：用 localStorage 的全局登录纪元区分"窗口代次"。最后进入登录态的窗口
  // bump 纪元成为最新代；其他窗口发现纪元比自己新，即判定被顶号并弹窗退出。
  // 与服务端 SessionPolicy=single + presence kicked 互补，覆盖两类场景：
  //   - 同浏览器多窗口 → 本机制（localStorage 同源共享，服务端无法区分）
  //   - 跨浏览器 / 跨设备 → 服务端 presence + 401 KICKED（既有链路）
  // 关键约束：绝不能清共享 Cookie，否则会把新窗口的有效会话一起踢掉。
  var WG = {
    EPOCH: "__blog_session_epoch",   // localStorage：全局登录纪元
    MINE: "__blog_my_epoch",         // sessionStorage：本窗口代次
    GO_LOGIN: "__blog_go_login",     // sessionStorage：回登录页强制显示登录表单
    LOGIN_PATHS: ["/", "/index.html", "/login", "/login.html"],
    timer: null
  };
  function wgLS() { try { return window.localStorage; } catch (e) { return null; } }
  function wgSS() { try { return window.sessionStorage; } catch (e) { return null; } }
  function wgNum(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function wgEpoch(ls) { return ls ? wgNum(ls.getItem(WG.EPOCH)) : 0; }
  function wgIsLoginPage() {
    var p = (window.location && window.location.pathname) || "/";
    return WG.LOGIN_PATHS.indexOf(p) !== -1;
  }

  function wgSuperseded() {
    if (cfg.kickedSeen) return;
    cfg.kickedSeen = true;
    stop();
    if (WG.timer) { clearInterval(WG.timer); WG.timer = null; }
    try {
      var old = document.getElementById("__blog_presence_overlay");
      if (old && old.parentNode) old.parentNode.removeChild(old);

      var overlay = el("div", {
        position: "fixed", left: "0", top: "0", right: "0", bottom: "0",
        zIndex: "2147483647", display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(8,12,24,0.62)", padding: "20px", boxSizing: "border-box",
        fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
      });
      overlay.id = "__blog_presence_overlay";

      var card = el("div", {
        width: "420px", maxWidth: "100%", background: "#ffffff", color: "#111827",
        borderRadius: "16px", boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        padding: "28px", boxSizing: "border-box", textAlign: "center"
      });
      var icon = el("div", { fontSize: "38px", lineHeight: "1", marginBottom: "10px" }, "🔒");
      var title = el("h2", { margin: "0 0 10px", fontSize: "20px", fontWeight: "700" }, "账号已在其他窗口登录");
      var body = el("p", {
        margin: "0 0 22px", fontSize: "15px", lineHeight: "1.7", color: "#4b5563"
      }, "同一账号仅保留一个使用窗口，当前窗口已下线。如非本人操作，请立即修改密码。");
      var btn = el("button", {
        border: "0", borderRadius: "10px",
        background: "linear-gradient(135deg,#667eea,#764ba2)",
        color: "#ffffff", fontSize: "15px", fontWeight: "600",
        padding: "11px 26px", cursor: "pointer"
      }, "重新登录");
      btn.type = "button";
      btn.setAttribute("data-action", "presence-rel login");
      btn.onclick = function () {
        // 同浏览器共享 Cookie：这里绝不能清 Cookie，否则会把新窗口的有效会话一起踢掉。
        // 只标记"回登录页后强制显示登录表单"，再跳转。
        try { wgSS().setItem(WG.GO_LOGIN, "1"); } catch (e) {}
        goLogin();
      };

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(body);
      card.appendChild(btn);
      overlay.appendChild(card);
      (document.body || document.documentElement).appendChild(overlay);
    } catch (e) {
      // 弹窗失败也要阻止本窗口继续被使用，但不清共享 Cookie
      try { wgSS().setItem(WG.GO_LOGIN, "1"); } catch (e2) {}
      goLogin();
    }
  }

  function wgInit() {
    var ls = wgLS(), ss = wgSS();
    if (!ls || !ss) return; // 存储不可用则降级：仅靠服务端 presence 链路
    if (wgIsLoginPage()) {
      // 回到登录页：本窗口放弃原代次，下次进入登录态会 bump 成最新代
      try { ss.removeItem(WG.MINE); } catch (e) {}
      return;
    }
    var mine = wgNum(ss.getItem(WG.MINE));
    if (!mine) {
      mine = Math.max(Date.now(), wgEpoch(ls) + 1);
      try {
        ls.setItem(WG.EPOCH, String(mine));
        ss.setItem(WG.MINE, String(mine));
      } catch (e) {}
    }
    function wgCheck() {
      if (cfg.kickedSeen) return;
      if (wgEpoch(ls) > mine) wgSuperseded();
    }
    wgCheck();
    WG.timer = setInterval(wgCheck, 2500);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") wgCheck();
    });
  }
  wgInit();
})();
