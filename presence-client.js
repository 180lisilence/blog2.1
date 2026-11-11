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
})();
