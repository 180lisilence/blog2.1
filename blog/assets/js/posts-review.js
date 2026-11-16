/**
 * 快速审核台交互（3.1）
 * 仅内置管理员可访问；服务端 /api/posts/pending 会再校验一次权限。
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
    return m ? decodeURIComponent(m[2]) : "";
  }

  var csrfMem = "";

  function getCsrf(force) {
    var c = readCookie("csrf_token");
    if (!force && c) { csrfMem = c; return Promise.resolve(c); }
    if (!force && csrfMem) return Promise.resolve(csrfMem);
    return fetch("/api/csrf-token" + (force ? "?fresh=1&_t=" + Date.now() : ""), {
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d && d.ok && d.csrfToken) { csrfMem = d.csrfToken; return d.csrfToken; }
      throw new Error("CSRF 获取失败");
    });
  }

  function api(url, opts) {
    opts = opts || {};
    var method = (opts.method || "GET").toUpperCase();
    var headers = { "Content-Type": "application/json" };
    var prep = method === "GET" ? Promise.resolve("") : getCsrf(false);
    return prep.then(function (token) {
      if (token) headers["X-CSRF-Token"] = token;
      return fetch(url, {
        method: method,
        credentials: "same-origin",
        cache: "no-store",
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) {
          location.href = "/login";
          throw new Error("未登录");
        }
        if (r.status === 403 && d && /CSRF/i.test(d.msg || "")) {
          return getCsrf(true).then(function () { return api(url, opts); });
        }
        return { status: r.status, data: d || {} };
      });
    });
  }

  function fmtDate(ts) {
    var d = new Date(Number(ts));
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2)
      + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  function showToast(kind, msg) {
    var t = $("reviewToast");
    t.hidden = false;
    t.className = "pu-result " + kind;
    t.textContent = msg;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.hidden = true; }, 4000);
  }

  function removeCard(id) {
    var card = $("review-" + id);
    if (card && card.parentNode) card.parentNode.removeChild(card);
    if (!document.querySelector(".pu-review-card")) {
      var list = $("reviewList");
      var empty = document.createElement("p");
      empty.className = "pu-empty";
      empty.textContent = "待审队列已清空。";
      list.appendChild(empty);
    }
  }

  function review(id, action, note) {
    return api("/api/posts/" + id + "/review", {
      method: "POST",
      body: { action: action, note: note || "" }
    }).then(function (res) {
      if (!res.data.ok) {
        showToast("error", res.data.msg || "审核失败");
        return;
      }
      showToast(action === "approve" ? "success" : "warn", res.data.msg || "已处理");
      removeCard(id);
    });
  }

  function renderCard(p) {
    var card = document.createElement("div");
    card.className = "pu-card pu-review-card";
    card.id = "review-" + p.id;

    var head = document.createElement("div");
    head.className = "pu-item-head";
    var h = document.createElement("h3");
    h.textContent = p.title;
    var badge = document.createElement("span");
    badge.className = "pu-badge pending";
    badge.textContent = "待审核";
    head.appendChild(h);
    head.appendChild(badge);

    var meta = document.createElement("div");
    meta.className = "pu-meta";
    var a = document.createElement("span");
    a.textContent = "✍️ " + p.author;
    var t = document.createElement("span");
    t.textContent = "📅 " + fmtDate(p.createdAt);
    var g = document.createElement("span");
    g.textContent = "🏷 " + (p.tag || "随笔");
    meta.appendChild(a);
    meta.appendChild(t);
    meta.appendChild(g);

    card.appendChild(head);
    card.appendChild(meta);

    if (p.summary) {
      var sum = document.createElement("p");
      sum.style.marginTop = "8px";
      sum.style.fontSize = "13px";
      sum.style.color = "var(--muted)";
      sum.textContent = "摘要：" + p.summary;
      card.appendChild(sum);
    }

    if (p.hits && p.hits.length) {
      var chips = document.createElement("div");
      chips.className = "pu-hits";
      p.hits.forEach(function (hit) {
        var chip = document.createElement("span");
        chip.className = "pu-hit";
        chip.textContent = hit.word + (hit.category === "block" ? "（高危）" : "");
        chips.appendChild(chip);
      });
      card.appendChild(chips);
    }

    var preview = document.createElement("div");
    preview.className = "pu-preview";
    preview.textContent = p.content;
    card.appendChild(preview);

    var actions = document.createElement("div");
    actions.className = "pu-item-actions";

    var okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "pu-btn ok small";
    okBtn.textContent = "通过并发布";
    okBtn.addEventListener("click", function () {
      okBtn.disabled = true;
      review(p.id, "approve", "").then(function () { okBtn.disabled = false; });
    });

    var noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.className = "pu-btn danger small";
    noBtn.textContent = "驳回";
    noBtn.addEventListener("click", function () {
      var note = prompt("驳回理由（可留空，作者会在「我的文章」看到）：", "内容不符合发布规范");
      if (note === null) return;
      noBtn.disabled = true;
      review(p.id, "reject", note).then(function () { noBtn.disabled = false; });
    });

    actions.appendChild(okBtn);
    actions.appendChild(noBtn);
    card.appendChild(actions);

    return card;
  }

  function load() {
    var btn = $("refreshBtn");
    btn.disabled = true;
    api("/api/posts/pending").then(function (res) {
      var d = res.data || {};
      if (!d.ok) {
        showToast("error", d.msg || "加载失败");
        return;
      }
      var stats = d.stats || {};
      $("reviewStats").textContent =
        "已发布 " + (stats.published || 0) + " · 待审核 " + (stats.pending || 0) + " · 已拦截 " + (stats.rejected || 0);

      var list = $("reviewList");
      list.textContent = "";
      if (!d.posts || !d.posts.length) {
        var empty = document.createElement("p");
        empty.className = "pu-empty";
        empty.textContent = "待审队列已清空。";
        list.appendChild(empty);
        return;
      }
      d.posts.forEach(function (p) { list.appendChild(renderCard(p)); });
    }).catch(function (err) {
      if (err && err.message === "未登录") return;
      showToast("error", "网络异常，请稍后重试");
    }).then(function () {
      btn.disabled = false;
    });
  }

  $("refreshBtn").addEventListener("click", load);
  load();
})();
