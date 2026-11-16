/**
 * 移动端导航（3.2）
 * 窄屏下把导航收进汉堡菜单；不依赖内联脚本，符合 CSP。
 */
(function () {
  "use strict";

  function init() {
    var wrap = document.querySelector(".site-header .nav-wrap");
    if (!wrap || wrap.querySelector(".nav-toggle")) return;
    var links = wrap.querySelector(".nav-links");
    if (!links) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "打开导航菜单");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "☰";
    wrap.appendChild(btn);

    function close() {
      wrap.classList.remove("nav-open");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "☰";
    }

    function toggle(e) {
      e.stopPropagation();
      var open = wrap.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "✕" : "☰";
    }

    btn.addEventListener("click", toggle);
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });
    document.addEventListener("click", function (e) {
      if (wrap.classList.contains("nav-open") && !wrap.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
