/**
 * 会话被顶号提示（VULN-CONCURRENT-01 前端配合）
 * ---------------------------------------------------------------
 * 服务端在被并发登录顶掉 / 手动撤销的旧会话上返回 401 + { code:"KICKED" }。
 * 本脚本只暴露 window.__handleKicked(response) 一个函数给各页面的 apiFetch 调用：
 *   - 命中 KICKED → 弹「账号已在其他设备登录 / 会话已撤销」→ 清本地态 → 回登录页
 *   - 未命中 → 返回 false，调用方继续原有逻辑（CSRF 403 重试等）
 *
 * 不主动轮询、不注入任何全局网络行为；零依赖、严格 CSP 可用（样式全部走 CSSOM）。
 * 与 presence-client.js 的分工：/blog/* 内部页面由 presence-client 轮询提示，
 * 顶层页面（index / projects / settings）由本脚本在 API 调用时即时提示。
 */
(function () {
  "use strict";
  if (window.__sessionKickedLoaded) return;
  window.__sessionKickedLoaded = true;

  var OVERLAY_ID = "__session_kicked_overlay";

  function applyStyle(node, styles) {
    for (var k in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, k)) node.style[k] = styles[k];
    }
  }
  function el(tag, styles, text) {
    var n = document.createElement(tag);
    if (styles) applyStyle(n, styles);
    if (text != null) n.textContent = text;
    return n;
  }
  function clearCookies() {
    // 非 HttpOnly 的尽力清；HttpOnly 的 web_token 由服务端 sendKicked 下发
    // Set-Cookie 删除（见 middleware/auth.js），这里只能作为兜底。
    try {
      document.cookie = "web_token=; path=/; max-age=0; SameSite=Lax";
      document.cookie = "web_auth=; path=/; max-age=0; SameSite=Lax";
      document.cookie = "web_guest=; path=/; max-age=0; SameSite=Lax";
    } catch (e) {}
  }
  function goLogin() {
    try { location.replace("/"); } catch (e) { location.href = "/"; }
  }
  function showDialog(msg, reason) {
    var old = document.getElementById(OVERLAY_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    // 2.2.8：presence-client.js（轮询触发）与本脚本（401 KICKED 触发）
    // 可能同时命中同一次顶号，两个遮罩叠在一起会互相遮挡。
    // 这里把对方的遮罩一并清掉，保证任意时刻只有一个下线提示。
    var peer = document.getElementById("__blog_presence_overlay");
    if (peer && peer.parentNode) peer.parentNode.removeChild(peer);

    var title = reason === "session_revoked" ? "会话已撤销" : "账号已在其他设备登录";
    var body = msg || (reason === "session_revoked"
      ? "你的会话已在另一台设备上被撤销，当前页面即将退出。"
      : "你的账号已在其他设备登录，当前设备已下线。如非本人操作，请立即修改密码。");

    var overlay = el("div", {
      position: "fixed", left: "0", top: "0", right: "0", bottom: "0",
      zIndex: "2147483647", display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(8,12,24,0.62)", padding: "20px", boxSizing: "border-box",
      fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
    });
    overlay.id = OVERLAY_ID;
    var card = el("div", {
      width: "420px", maxWidth: "100%", background: "#ffffff", color: "#111827",
      borderRadius: "16px", boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
      padding: "28px", boxSizing: "border-box", textAlign: "center"
    });
    var icon = el("div", { fontSize: "38px", lineHeight: "1", marginBottom: "10px" }, "🔒");
    var h = el("h2", { margin: "0 0 10px", fontSize: "20px", fontWeight: "700" }, title);
    var p = el("p", {
      margin: "0 0 22px", fontSize: "15px", lineHeight: "1.7", color: "#4b5563"
    }, body);
    var btn = el("button", {
      border: "0", borderRadius: "10px",
      background: "linear-gradient(135deg,#667eea,#764ba2)",
      color: "#ffffff", fontSize: "15px", fontWeight: "600",
      padding: "11px 26px", cursor: "pointer"
    }, "重新登录");
    btn.type = "button";
    btn.onclick = function () { clearCookies(); goLogin(); };

    card.appendChild(icon);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(btn);
    overlay.appendChild(card);
    (document.body || document.documentElement).appendChild(overlay);
  }

  /**
   * @param {Response} resp 已完成的 fetch 响应
   * @returns {Promise<boolean>} true=已识别为 KICKED 并处理（调用方应停止后续处理）
   */
  window.__handleKicked = async function (resp) {
    if (!resp || resp.status !== 401) return false;
    var body;
    try { body = await resp.clone().json(); } catch (e) { return false; }
    if (!body || body.code !== "KICKED") return false;
    showDialog(body.msg, body.reason);
    return true;
  };
})();
