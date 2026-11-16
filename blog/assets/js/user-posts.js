/**
 * 首页「读者发布」动态列表（3.1）
 * 读取 /api/posts 的已发布文章，插入 #userPostsGrid。
 * 全部通过 DOM API + textContent 渲染，杜绝标题 / 摘要注入。
 */
(function () {
  "use strict";

  function fmtDate(ts) {
    var d = new Date(Number(ts));
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function card(p) {
    var article = document.createElement("article");
    article.className = "post-card";

    var tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = p.tag || "读者投稿";

    var h = document.createElement("h3");
    var link = document.createElement("a");
    link.href = "/p/" + encodeURIComponent(p.slug);
    link.textContent = p.title;
    h.appendChild(link);

    article.appendChild(tag);
    article.appendChild(h);

    if (p.summary) {
      var desc = document.createElement("p");
      desc.textContent = p.summary;
      article.appendChild(desc);
    }

    var date = document.createElement("span");
    date.className = "date";
    date.textContent = "📅 " + fmtDate(p.createdAt) + " · ✍️ " + p.author;
    article.appendChild(date);

    return article;
  }

  var grid = document.getElementById("userPostsGrid");
  if (!grid) return;

  fetch("/api/posts?size=6", { credentials: "same-origin", cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok || !d.posts || !d.posts.length) {
        var empty = document.getElementById("userPostsEmpty");
        if (empty) empty.hidden = false;
        return;
      }
      d.posts.forEach(function (p) { grid.appendChild(card(p)); });
    })
    .catch(function () {
      var empty = document.getElementById("userPostsEmpty");
      if (empty) empty.hidden = false;
    });
})();
