/**
 * 我的发布（3.1.1）
 * 仅显示当前账号的文章；删除接口会再校验作者身份。
 */
(function () {
  "use strict";

  var state = { posts: [], filter: "all" };

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

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function statusText(s) {
    return s === "published" ? "已发布" : s === "pending" ? "待审核" : "被拦截";
  }

  function riskText(r) {
    if (r === "high") return "高危";
    if (r === "medium") return "中风险";
    if (r === "low") return "低风险";
    return "";
  }

  function showToast(kind, msg) {
    var t = $("myToast");
    t.hidden = false;
    t.className = "pu-result " + kind;
    t.textContent = msg;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.hidden = true; }, 4000);
  }

  function renderCard(p) {
    var card = el("div", "pu-item");
    card.id = "my-" + p.id;

    var head = el("div", "pu-item-head");
    head.appendChild(el("h3", null, p.title));
    head.appendChild(el("span", "pu-badge " + p.status, statusText(p.status)));
    card.appendChild(head);

    var meta = el("div", "pu-meta");
    meta.appendChild(el("span", null, "📅 " + fmtDate(p.createdAt)));
    meta.appendChild(el("span", null, "🏷 " + (p.tag || "随笔")));
    if (p.autoPassed) meta.appendChild(el("span", null, "⚡ 快速审核通过"));
    var risk = riskText(p.riskLevel);
    if (risk) meta.appendChild(el("span", null, "⚠️ " + risk));
    card.appendChild(meta);

    if (p.summary) card.appendChild(el("p", "my-summary", "摘要：" + p.summary));

    if (p.hits && p.hits.length) {
      var chips = el("div", "pu-hits");
      p.hits.forEach(function (hit) {
        chips.appendChild(el("span", "pu-hit", hit.word + (hit.category === "block" ? "（高危）" : "")));
      });
      card.appendChild(chips);
    }

    if (p.reviewNote) card.appendChild(el("p", "pu-note", "审核意见：" + p.reviewNote));

    var actions = el("div", "pu-item-actions");
    if (p.status === "published") {
      var link = el("a", "pu-btn small", "查看文章");
      link.href = p.url || ("/p/" + p.slug);
      actions.appendChild(link);
    }
    var del = el("button", "pu-btn danger small", "删除");
    del.type = "button";
    del.addEventListener("click", function () {
      if (!window.confirm("确定删除《" + p.title + "》吗？删除后不可恢复。")) return;
      del.disabled = true;
      api("/api/posts/" + p.id, { method: "DELETE" }).then(function (res) {
        if (!res.data.ok) {
          showToast("error", res.data.msg || "删除失败");
          del.disabled = false;
          return;
        }
        showToast("success", "已删除《" + p.title + "》");
        state.posts = state.posts.filter(function (x) { return x.id !== p.id; });
        renderAll();
      }).catch(function (err) {
        if (err && err.message === "未登录") return;
        showToast("error", "网络异常，请稍后重试");
        del.disabled = false;
      });
    });
    actions.appendChild(del);
    card.appendChild(actions);

    return card;
  }

  function renderAll() {
    var stats = { published: 0, pending: 0, rejected: 0 };
    state.posts.forEach(function (p) {
      if (stats[p.status] !== undefined) stats[p.status]++;
    });
    $("statPublished").textContent = stats.published;
    $("statPending").textContent = stats.pending;
    $("statRejected").textContent = stats.rejected;

    var tabs = document.querySelectorAll(".my-tabs button");
    Array.prototype.forEach.call(tabs, function (b) {
      b.classList.toggle("active", b.getAttribute("data-filter") === state.filter);
    });

    var list = $("myList");
    list.textContent = "";

    var rows = state.posts.filter(function (p) {
      return state.filter === "all" ? true : p.status === state.filter;
    });

    if (!rows.length) {
      var empty = el("div", "my-empty",
        state.posts.length ? "这个分类下还没有文章。" : "你还没有发表过文章，写一篇试试？");
      if (!state.posts.length) {
        var go = el("a", null, "去写第一篇 →");
        go.href = "/write";
        empty.appendChild(document.createElement("br"));
        empty.appendChild(go);
      }
      list.appendChild(empty);
      return;
    }

    rows.forEach(function (p) { list.appendChild(renderCard(p)); });
  }

  function load() {
    var btn = $("refreshBtn");
    btn.disabled = true;
    api("/api/posts/mine").then(function (res) {
      var d = res.data || {};
      if (!d.ok) {
        showToast("error", d.msg || "加载失败");
        return;
      }
      state.posts = d.posts || [];
      $("myWho").textContent = "登录账号：" + (d.username || "") + (d.isAdmin ? "（管理员）" : "");
      if (d.isAdmin) {
        var nav = $("adminReviewNav");
        if (nav) nav.hidden = false;
      }
      renderAll();
    }).catch(function (err) {
      if (err && err.message === "未登录") return;
      showToast("error", "网络异常，请稍后重试");
    }).then(function () {
      btn.disabled = false;
    });
  }

  $("myTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    state.filter = btn.getAttribute("data-filter");
    renderAll();
  });

  $("refreshBtn").addEventListener("click", load);

  load();
})();
