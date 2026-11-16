/**
 * 写文章页交互（3.1）
 * - 读 /api/posts/mine 获取登录身份、管理员标记与我的文章
 * - 发布时自动做敏感词检测：即时发布 / 转人工审核 / 直接拦截
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
    if (!ts) return "";
    var d = new Date(Number(ts));
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function statusText(s) {
    if (s === "published") return "已发布";
    if (s === "pending") return "待审核";
    if (s === "rejected") return "已拦截";
    return s;
  }

  function showResult(kind, msg, linkHref) {
    var box = $("formResult");
    box.hidden = false;
    box.className = "pu-result " + kind;
    box.textContent = msg;
    if (linkHref) {
      var a = document.createElement("a");
      a.href = linkHref;
      a.textContent = " 查看文章 →";
      a.style.marginLeft = "6px";
      box.appendChild(a);
    }
  }

  function makeHitChips(hits) {
    var wrap = document.createElement("div");
    wrap.className = "pu-hits";
    (hits || []).forEach(function (h) {
      var chip = document.createElement("span");
      chip.className = "pu-hit";
      chip.textContent = h.word + (h.category === "block" ? "（高危）" : "");
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function renderMine(list) {
    var box = $("myPosts");
    box.textContent = "";
    if (!list || !list.length) {
      var empty = document.createElement("p");
      empty.className = "pu-empty";
      empty.textContent = "还没有发布过文章。";
      box.appendChild(empty);
      return;
    }

    list.forEach(function (p) {
      var item = document.createElement("div");
      item.className = "pu-item";

      var head = document.createElement("div");
      head.className = "pu-item-head";
      var h = document.createElement("h3");
      h.textContent = p.title;
      var badge = document.createElement("span");
      badge.className = "pu-badge " + p.status;
      badge.textContent = statusText(p.status);
      head.appendChild(h);
      head.appendChild(badge);

      var meta = document.createElement("div");
      meta.className = "pu-meta";
      var t = document.createElement("span");
      t.textContent = "📅 " + fmtDate(p.createdAt);
      var g = document.createElement("span");
      g.textContent = "🏷 " + (p.tag || "随笔");
      meta.appendChild(t);
      meta.appendChild(g);

      item.appendChild(head);
      item.appendChild(meta);

      if (p.hits && p.hits.length) {
        item.appendChild(makeHitChips(p.hits));
      }

      if (p.reviewNote) {
        var note = document.createElement("div");
        note.className = "pu-note";
        note.textContent = "审核意见：" + p.reviewNote;
        item.appendChild(note);
      }

      var actions = document.createElement("div");
      actions.className = "pu-item-actions";

      if (p.status === "published") {
        var view = document.createElement("a");
        view.className = "pu-btn ghost small";
        view.href = "/p/" + encodeURIComponent(p.slug);
        view.textContent = "查看文章";
        actions.appendChild(view);
      }

      var del = document.createElement("button");
      del.type = "button";
      del.className = "pu-btn danger small";
      del.textContent = "删除";
      del.addEventListener("click", function () {
        if (!confirm("确定删除《" + p.title + "》吗？")) return;
        del.disabled = true;
        api("/api/posts/" + p.id, { method: "DELETE" }).then(function (res) {
          if (!res.data.ok) {
            alert(res.data.msg || "删除失败");
            del.disabled = false;
            return;
          }
          loadMine();
        }).catch(function () {
          del.disabled = false;
        });
      });
      actions.appendChild(del);

      item.appendChild(actions);
      box.appendChild(item);
    });
  }

  function loadMine() {
    return api("/api/posts/mine").then(function (res) {
      if (!res.data.ok) {
        showResult("error", res.data.msg || "加载失败");
        return;
      }
      var who = res.data.username || "";
      $("whoami").textContent = "当前登录：" + who + (res.data.isAdmin ? "（管理员）" : "");
      $("reviewLink").hidden = !res.data.isAdmin;
      renderMine(res.data.posts);
    });
  }

  function updateCounters() {
    $("titleCount").textContent = $("fTitle").value.length + " / 80";
    $("summaryCount").textContent = $("fSummary").value.length + " / 150";
    $("contentCount").textContent = $("fContent").value.length + " / 20000";
  }

  function bindForm() {
    var form = $("postForm");
    var btn = $("submitBtn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var title = $("fTitle").value.trim();
      var summary = $("fSummary").value.trim();
      var content = $("fContent").value;
      var tag = $("fTag").value.trim();

      if (title.length < 2) return showResult("error", "标题至少 2 个字符");
      if (content.trim().length < 10) return showResult("error", "正文至少 10 个字符");

      btn.disabled = true;
      btn.textContent = "检测并提交中…";

      api("/api/posts", {
        method: "POST",
        body: { title: title, summary: summary, content: content, tag: tag }
      }).then(function (res) {
        var d = res.data || {};
        if (!d.ok) {
          showResult("error", d.msg || "发布失败");
          return;
        }
        if (d.action === "publish") {
          showResult("success", d.msg || "已发布", "/p/" + encodeURIComponent(d.post.slug));
          form.reset();
          updateCounters();
        } else if (d.action === "review") {
          showResult("warn", d.msg || "已进入快速审核队列");
        } else {
          showResult("error", d.msg || "内容已被拦截");
        }
        loadMine();
      }).catch(function (err) {
        if (err && err.message === "未登录") return;
        showResult("error", "网络异常，请稍后重试");
      }).then(function () {
        btn.disabled = false;
        btn.textContent = "发布文章";
      });
    });

    ["fTitle", "fSummary", "fContent"].forEach(function (id) {
      $(id).addEventListener("input", updateCounters);
    });

    $("resetBtn").addEventListener("click", function () {
      form.reset();
      updateCounters();
      $("formResult").hidden = true;
    });
  }

  bindForm();
  updateCounters();
  loadMine().catch(function (err) {
    if (err && err.message === "未登录") return;
    showResult("error", "加载当前登录状态失败，请刷新重试");
  });
})();
