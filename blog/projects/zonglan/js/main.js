/* ============================================================
   woldvein 项目总览 · 共享交互
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 字底黄匾：把 .plaque 元素逐字包成黄底金字块 ---------- */
  document.querySelectorAll(".plaque").forEach(function (el) {
    if (!el.textContent.trim()) return;
    el.classList.remove("gold", "gold-thick");
    var frag = document.createDocumentFragment();
    var run = null; // 当前连续字符块
    Array.prototype.forEach.call(el.textContent, function (ch) {
      if (/[a-zA-Z0-9\u4e00-\u9fff.]/.test(ch)) {
        if (!run) {
          run = document.createElement("span");
          run.className = "plaque-char";
          frag.appendChild(run);
        }
        var inner = document.createElement("span");
        inner.className = "gold";
        inner.textContent = ch;
        run.appendChild(inner);
      } else {
        run = null;
        if (ch !== "\n" && ch !== "\r" && ch !== "\t") {
          frag.appendChild(document.createTextNode(ch));
        }
      }
    });
    el.innerHTML = "";
    el.appendChild(frag);
  });

  /* ---------- 侧边导航开关 ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var sideNav = document.getElementById("sideNav");
  var mask = document.getElementById("sideMask");
  function closeSide() {
    if (sideNav) sideNav.classList.remove("open");
    if (mask) mask.classList.remove("show");
  }
  if (toggle && sideNav) {
    toggle.addEventListener("click", function () {
      var open = sideNav.classList.toggle("open");
      if (mask) mask.classList.toggle("show", open);
    });
    sideNav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeSide);
    });
    if (mask) mask.addEventListener("click", closeSide);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSide();
    });
  }

  /* ---------- 当前页高亮 ---------- */
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (page === "") page = "index.html";
  document.querySelectorAll(".side-links a, .nav a").forEach(function (a) {
    var href = (a.getAttribute("href") || "").toLowerCase();
    if (href === page || (page === "index.html" && href === "index.html")) {
      a.classList.add("active");
    }
  });

  /* ---------- 滚动显现 ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- 返回顶部 ---------- */
  var toTop = document.querySelector(".to-top");
  if (toTop) {
    window.addEventListener("scroll", function () {
      toTop.classList.toggle("show", window.scrollY > 420);
    }, { passive: true });
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- 表格搜索过滤 ---------- */
  document.querySelectorAll("[data-filter]").forEach(function (input) {
    var targetId = input.getAttribute("data-filter");
    var table = document.getElementById(targetId);
    if (!table) return;
    input.addEventListener("input", function () {
      var kw = input.value.trim().toLowerCase();
      var rows = table.querySelectorAll("tbody tr");
      var shown = 0;
      rows.forEach(function (tr) {
        var hit = !kw || tr.textContent.toLowerCase().indexOf(kw) !== -1;
        tr.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      var empty = table.parentNode.querySelector(".tbl-empty");
      if (empty) empty.style.display = shown === 0 ? "" : "none";
    });
  });

  /* ---------- 数字滚动 ---------- */
  function setNumText(el, v) {
    var tile = el.querySelector(".plaque-char");
    if (tile) {
      tile.innerHTML = "";
      var inner = document.createElement("span");
      inner.className = "gold";
      inner.textContent = v;
      tile.appendChild(inner);
    } else {
      el.textContent = v;
    }
  }

  function animateNumber(el) {
    var target = parseFloat(el.getAttribute("data-num") || "0");
    var suffix = el.getAttribute("data-suffix") || "";
    var prefix = el.getAttribute("data-prefix") || "";
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var dur = 1200;
    var t0 = null;
    function fmt(v) {
      return prefix + v.toFixed(decimals) + suffix;
    }
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      setNumText(el, fmt(target * eased));
      if (p < 1) requestAnimationFrame(step);
      else setNumText(el, fmt(target));
    }
    requestAnimationFrame(step);
  }

  var statNums = document.querySelectorAll(".stat-num[data-num]");
  if ("IntersectionObserver" in window && statNums.length) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          animateNumber(en.target);
          so.unobserve(en.target);
        }
      });
    }, { threshold: 0.4 });
    statNums.forEach(function (el) { so.observe(el); });
  } else {
    statNums.forEach(function (el) {
      var v = (el.getAttribute("data-prefix") || "") +
        el.getAttribute("data-num") + (el.getAttribute("data-suffix") || "");
      setNumText(el, v);
    });
  }

  /* ---------- 复制代码块按钮 ---------- */
  document.querySelectorAll("pre.code-block").forEach(function (pre) {
    var btn = document.createElement("button");
    btn.className = "code-copy";
    btn.textContent = "复制";
    btn.setAttribute("aria-label", "复制代码");
    btn.style.cssText =
      "position:absolute;top:8px;right:8px;font-size:12.5px;color:#ffe9ab;" +
      "background:rgba(23,3,3,.6);border:1px solid #eec23f;border-radius:4px;" +
      "padding:2px 10px;cursor:pointer;letter-spacing:.1em;";
    pre.style.position = "relative";
    pre.appendChild(btn);
    btn.addEventListener("click", function () {
      var text = pre.innerText.replace(/\n复制$/, "");
      function done() {
        btn.textContent = "已复制";
        setTimeout(function () { btn.textContent = "复制"; }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    });
  });

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }
})();
