/* ===================================================================
 * comments.js —— 博客文章评论区
 *
 * 用法：在文章页 <article> 之后放一个容器
 *   <section class="comments" id="comments" data-slug="hello-world"></section>
 * 再引入本脚本即可，其余全部自动渲染。
 *
 * 关键安全约定：
 *   - 服务端返回的评论内容一律当作纯文本，全部走 esc() 转义后再插入 DOM，
 *     绝不用 innerHTML 直接拼用户输入。
 *   - 只对「已转义后的文本」做换行替换，避免 &lt; 被二次还原。
 * =================================================================== */
(function () {
  'use strict';

  var PAGE_SIZE = 10;

  // ---------- 工具函数 ----------

  // HTML 转义，所有用户输入都必须过这里
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 读 cookie
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // CSRF token 内存兜底
  // cookie 不一定读得到：Secure cookie 走 http 会被浏览器丢弃、隐私模式会拦截、
  // cookie 也可能在页面开着的时候过期。只靠 document.cookie 拿 token，
  // 一旦拿不到就会带着空 token 发请求，直接被 403 打回"CSRF 验证失败"。
  var csrfCache = '';
  function getCsrf() {
    var v = getCookie('csrf_token');
    if (v && v !== 'null' && v !== 'undefined') {
      csrfCache = v;
      return v;
    }
    return csrfCache;
  }

  // 主动向服务端要 token：GET 接口不过 verifyCsrfToken，响应体里直接带 token
  // force=true 时带 ?fresh=1 强制换发新 token，用于失效重试
  var csrfPending = null;
  function refreshCsrf(force) {
    if (csrfPending) return csrfPending;
    var url = '/api/csrf-token' + (force ? '?fresh=1&_t=' + Date.now() : '');
    csrfPending = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.csrfToken) { csrfCache = d.csrfToken; return d.csrfToken; }
        return '';
      })
      .catch(function () { return ''; })
      .then(function (t) { csrfPending = null; return t; });
    return csrfPending;
  }

  function parseJson(r) {
    return r.json().catch(function () {
      return { ok: false, msg: '服务器返回异常（HTTP ' + r.status + '）' };
    });
  }

  // 统一的 API 请求：自动带 CSRF token，拿不到就先补，403 时补一次再重试
  function api(method, path, body) {
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    var isWrite = String(method).toUpperCase() !== 'GET';

    function send(token) {
      var h = {};
      for (var k in headers) h[k] = headers[k];
      if (token) h['X-CSRF-Token'] = token;
      return fetch(path, {
        method: method,
        headers: h,
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }

    if (!isWrite) {
      return send(null).then(parseJson);
    }

    var token = getCsrf();
    return (token ? Promise.resolve(token) : refreshCsrf())
      .then(send)
      .then(function (r) {
        if (r.status !== 403) return r;
        // 可能是 token 失效，补一个重试一次（只一次，防死循环）
        return parseJson(r.clone()).then(function (d) {
          if (!d || String(d.msg || '').indexOf('CSRF') < 0) return r;
          return refreshCsrf(true).then(function (fresh) {
            if (!fresh) return r;
            return send(fresh);
          });
        });
      })
      .then(parseJson);
  }

  // 时间格式化：刚刚 / N 分钟前 / N 小时前 / 日期
  function timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前';
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // 头像：取用户名首字符，配一个稳定的颜色
  function avatarOf(name) {
    var colors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];
    var sum = 0;
    for (var i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return {
      text: (name || '?').slice(0, 1).toUpperCase(),
      color: colors[sum % colors.length]
    };
  }

  // 把已转义的文本按换行转成 <br>
  function nl2br(escapedText) {
    return escapedText.replace(/\n/g, '<br>');
  }

  // ---------- 主组件 ----------
  function Comments(root) {
    this.root = root;
    this.slug = root.getAttribute('data-slug');
    this.page = 1;
    this.total = 0;
    this.totalPages = 1;
    this.me = null;
    this.replyTo = null;      // 当前正在回复的评论 { id, username }
    this.loading = false;
  }

  Comments.prototype.init = function () {
    var self = this;
    this.renderShell();

    // 先确认登录态，决定发表框是否可用
    api('GET', '/api/me').then(function (res) {
      self.me = res && res.ok ? res.username : null;
      self.renderComposer();
      return self.load(1);
    }).catch(function () {
      self.renderComposer();
      return self.load(1);
    });
  };

  // 骨架：标题 + 发表区 + 列表
  Comments.prototype.renderShell = function () {
    this.root.innerHTML =
      '<div class="cm-head">' +
        '<h2 class="cm-title">评论 <span class="cm-count" id="cmCount">0</span></h2>' +
      '</div>' +
      '<div class="cm-composer" id="cmComposer"></div>' +
      '<div class="cm-list" id="cmList">' +
        '<div class="cm-empty">正在加载评论…</div>' +
      '</div>' +
      '<div class="cm-pager" id="cmPager"></div>';
  };

  // 发表框
  Comments.prototype.renderComposer = function () {
    var box = this.root.querySelector('#cmComposer');
    if (!this.me) {
      box.innerHTML = '<div class="cm-login-tip">请先登录后再发表评论</div>';
      return;
    }
    var self = this;
    var replyTip = '';
    if (this.replyTo) {
      replyTip = '<div class="cm-reply-tip">正在回复 <b>@' + esc(this.replyTo.username) + '</b>' +
        '<button type="button" class="cm-cancel-reply" id="cmCancelReply">取消</button></div>';
    }
    box.innerHTML =
      replyTip +
      '<textarea class="cm-input" id="cmInput" maxlength="1000" ' +
        'placeholder="说点什么…（最多 1000 字）"></textarea>' +
      '<div class="cm-composer-foot">' +
        '<span class="cm-counter" id="cmCounter">0 / 1000</span>' +
        '<button type="button" class="cm-submit" id="cmSubmit">发表评论</button>' +
      '</div>' +
      '<div class="cm-error" id="cmError"></div>';

    var input = box.querySelector('#cmInput');
    var counter = box.querySelector('#cmCounter');

    input.addEventListener('input', function () {
      counter.textContent = input.value.length + ' / 1000';
      counter.classList.toggle('cm-over', input.value.length > 1000);
    });

    // Ctrl/Cmd + Enter 快捷发表
    input.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        self.submit();
      }
    });

    box.querySelector('#cmSubmit').addEventListener('click', function () { self.submit(); });

    var cancel = box.querySelector('#cmCancelReply');
    if (cancel) {
      cancel.addEventListener('click', function () {
        self.replyTo = null;
        self.renderComposer();
      });
    }

    // 聚焦到输入框，方便直接打字
    if (this.replyTo) input.focus();
  };

  // 发表
  Comments.prototype.submit = function () {
    var self = this;
    var input = this.root.querySelector('#cmInput');
    var errEl = this.root.querySelector('#cmError');
    var btn = this.root.querySelector('#cmSubmit');
    if (!input || !btn) return;

    var content = input.value.trim();
    errEl.textContent = '';

    if (!content) { errEl.textContent = '评论内容不能为空'; return; }
    if (content.length > 1000) { errEl.textContent = '评论最多 1000 个字符'; return; }

    var payload = { content: content };
    if (this.replyTo) payload.parentId = this.replyTo.id;

    btn.disabled = true;
    btn.textContent = '发表中…';

    api('POST', '/api/comments/' + encodeURIComponent(this.slug), payload)
      .then(function (res) {
        if (res && res.ok) {
          input.value = '';
          self.replyTo = null;
          self.renderComposer();
          return self.load(1);
        }
        errEl.textContent = (res && res.msg) || '发表失败';
        btn.disabled = false;
        btn.textContent = '发表评论';
      })
      .catch(function () {
        errEl.textContent = '网络错误，请稍后重试';
        btn.disabled = false;
        btn.textContent = '发表评论';
      });
  };

  // 加载列表
  Comments.prototype.load = function (page) {
    var self = this;
    if (this.loading) return Promise.resolve();
    this.loading = true;
    this.page = page;

    return api('GET', '/api/comments/' + encodeURIComponent(this.slug) + '?page=' + page + '&size=' + PAGE_SIZE)
      .then(function (res) {
        self.loading = false;
        if (!res || !res.ok) {
          self.root.querySelector('#cmList').innerHTML =
            '<div class="cm-empty">' + esc((res && res.msg) || '评论加载失败') + '</div>';
          return;
        }
        self.total = res.total || 0;
        self.totalPages = res.totalPages || 1;
        self.renderList(res.comments || []);
        self.renderPager();
        var c = self.root.querySelector('#cmCount');
        if (c) c.textContent = String(self.total);
      })
      .catch(function () {
        self.loading = false;
        self.root.querySelector('#cmList').innerHTML =
          '<div class="cm-empty">网络错误，评论加载失败</div>';
      });
  };

  // 渲染一条评论（含其回复）
  Comments.prototype.renderOne = function (c, isReply) {
    var av = avatarOf(c.username || '?');
    // B1-04：c.id 来自服务端响应，曾被直接拼进 HTML 属性；一旦 id 里带引号
    // 就能闭合属性并注入事件处理器。所有插值统一走 esc()。
    var cid = esc(c.id);
    var delBtn = c.canDelete
      ? '<button type="button" class="cm-act cm-del" data-del="' + cid + '">删除</button>'
      : '';
    var replyBtn = (!isReply && this.me)
      ? '<button type="button" class="cm-act cm-reply" data-reply="' + cid + '" data-user="' +
        esc(c.username || '') + '">回复</button>'
      : '';

    if (c.deleted) {
      return '<div class="cm-item cm-deleted' + (isReply ? ' cm-is-reply' : '') + '">' +
        '<div class="cm-body"><div class="cm-text cm-gone">该评论已删除</div></div>' +
      '</div>';
    }

    var html =
      '<div class="cm-item' + (isReply ? ' cm-is-reply' : '') + '" data-id="' + cid + '">' +
        '<div class="cm-avatar" style="background:' + av.color + '">' + esc(av.text) + '</div>' +
        '<div class="cm-body">' +
          '<div class="cm-meta">' +
            '<span class="cm-user">' + esc(c.username) + '</span>' +
            '<span class="cm-time">' + esc(timeAgo(c.createdAt)) + '</span>' +
          '</div>' +
          '<div class="cm-text">' + nl2br(esc(c.content)) + '</div>' +
          '<div class="cm-actions">' + replyBtn + delBtn + '</div>' +
        '</div>' +
      '</div>';

    if (c.replies && c.replies.length) {
      html += '<div class="cm-replies">';
      for (var i = 0; i < c.replies.length; i++) {
        html += this.renderOne(c.replies[i], true);
      }
      html += '</div>';
    }
    return html;
  };

  // 渲染整个列表
  Comments.prototype.renderList = function (list) {
    var el = this.root.querySelector('#cmList');
    if (!list.length) {
      el.innerHTML = '<div class="cm-empty">还没有评论，来说第一句吧 ✨</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) html += this.renderOne(list[i], false);
    el.innerHTML = html;

    var self = this;

    // 回复
    el.querySelectorAll('[data-reply]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-reply'));
        var user = btn.getAttribute('data-user');
        self.replyTo = { id: id, username: user };
        self.renderComposer();
        var input = self.root.querySelector('#cmInput');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    // 删除
    el.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-del'));
        if (!confirm('确定删除这条评论吗？删除后无法恢复。')) return;
        btn.disabled = true;
        api('DELETE', '/api/comments/' + id).then(function (res) {
          if (res && res.ok) {
            if (res.soft) alert(res.msg || '评论已删除');
            self.load(self.page);
          } else {
            alert((res && res.msg) || '删除失败');
            btn.disabled = false;
          }
        }).catch(function () {
          alert('网络错误，删除失败');
          btn.disabled = false;
        });
      });
    });
  };

  // 分页
  Comments.prototype.renderPager = function () {
    var el = this.root.querySelector('#cmPager');
    if (this.totalPages <= 1) { el.innerHTML = ''; return; }

    var self = this;
    var html = '';
    html += '<button type="button" class="cm-page" data-p="' + (this.page - 1) + '"' +
      (this.page <= 1 ? ' disabled' : '') + '>上一页</button>';
    html += '<span class="cm-page-info">' + this.page + ' / ' + this.totalPages + '</span>';
    html += '<button type="button" class="cm-page" data-p="' + (this.page + 1) + '"' +
      (this.page >= this.totalPages ? ' disabled' : '') + '>下一页</button>';
    el.innerHTML = html;

    el.querySelectorAll('[data-p]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = Number(btn.getAttribute('data-p'));
        if (p < 1 || p > self.totalPages) return;
        self.load(p);
        self.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  // ---------- 自动初始化 ----------
  function boot() {
    var nodes = document.querySelectorAll('.comments[data-slug]');
    for (var i = 0; i < nodes.length; i++) {
      new Comments(nodes[i]).init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
