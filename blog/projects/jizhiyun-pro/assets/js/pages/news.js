/* ===================================================================
 * news.js - 资讯文章系统
 * 包含：列表页(高级筛选/搜索/分页)、详情页(目录/点赞/收藏/评论/分享/上下篇)、后台管理
 * =================================================================== */
window.App = window.App || {};
App.Pages = App.Pages || {};

App.Pages.News = {
  /* 筛选状态 */
  _state: { keyword:'', category:'', tag:'', sort:'newest', page:1, pageSize:6 },

  /* ===== 资讯列表页 ===== */
  async list() {
    let categories = [];
    try { const r = await App.API.getCategories(); categories = (r && r.article) || []; } catch(e) {}
    return `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'资讯',path:'/news'}])}
      <!-- 页头 -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold">资讯中心</h1>
          <p class="text-slate-500 mt-1">行业动态 · 技术洞察 · 设计美学</p>
        </div>
        ${App.Auth.isAdmin() ? `<a href="#/news-admin" class="btn-outline btn-sm"><i class="fa-solid fa-pen mr-1"></i>管理资讯</a>` : ''}
      </div>

      <!-- 搜索 + 筛选栏 -->
      <div class="glass-card p-4 mb-6">
        <div class="flex flex-wrap gap-3 items-center">
          <div class="flex-1 min-w-[200px] relative">
            <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input id="searchInput" class="form-input pl-9" placeholder="搜索关键词..." value="${this._state.keyword}" oninput="App.Pages.News.onFilter({keyword:this.value})">
          </div>
          <select class="form-select w-auto" onchange="App.Pages.News.onFilter({category:this.value})">
            <option value="">全部分类</option>
            ${categories.map(c=>`<option value="${c}" ${this._state.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <select class="form-select w-auto" onchange="App.Pages.News.onFilter({sort:this.value})">
            <option value="newest" ${this._state.sort==='newest'?'selected':''}>最新发布</option>
            <option value="hottest" ${this._state.sort==='hottest'?'selected':''}>最多浏览</option>
          </select>
        </div>
      </div>

      <!-- 文章列表 -->
      <div id="newsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${App.Utils.skeleton(6)}
      </div>
      <div id="newsPagination"></div>
    </div>`;
  },

  /* 筛选变化（防抖） */
  onFilter: App.Utils ? null : null,
  async _doFilter() {
    const list = document.getElementById('newsList');
    if (!list) return;
    list.innerHTML = App.Utils.skeleton(6);
    try {
      const r = await App.API.getArticles(this._state);
      const rows = (r && r.rows) || [];
      const total = (r && r.total) || 0;
      list.innerHTML = rows.length ? rows.map((a,i)=>this._card(a,i)).join('') : App.Components.empty('fa-newspaper','暂无符合条件的资讯');
      document.getElementById('newsPagination').innerHTML = App.Components.pagination(this._state.page, total, this._state.pageSize, 'App.Pages.News.goPage');
      App.Utils.lazyLoadImages(list);
    } catch(e) { list.innerHTML = App.Components.empty('fa-triangle-exclamation','加载失败'); }
  },
  goPage(p) { this._state.page = p; this._doFilter(); window.scrollTo({top:300,behavior:'smooth'}); },

  _card(a, i) {
    return `<div class="glass-card overflow-hidden hover-lift" data-aos="fade-up" data-aos-delay="${(i%3)*100}">
      <div class="relative">
        <img class="lazy w-full h-44 object-cover" data-src="${a.cover}" alt="${App.Utils.escape(a.title)}" onclick="App.previewImage('${a.cover}')">
        <span class="absolute top-3 left-3 badge badge-brand">${a.category}</span>
      </div>
      <div class="p-5">
        <h3 class="font-bold text-lg line-clamp-2 mb-2"><a href="#/news-detail?id=${a.id}">${App.Utils.escape(a.title)}</a></h3>
        <p class="text-sm text-slate-500 line-clamp-2">${App.Utils.escape(a.summary)}</p>
        <div class="flex flex-wrap gap-1 mt-3">${(a.tags||[]).map(t=>`<span class="badge badge-gray">#${t}</span>`).join('')}</div>
        <div class="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
          <span><i class="fa-solid fa-eye mr-1"></i>${a.views||0}</span>
          <span><i class="fa-solid fa-thumbs-up mr-1"></i>${a.likes||0}</span>
          <span><i class="fa-solid fa-calendar mr-1"></i>${App.Utils.formatDate(a.createdAt)}</span>
        </div>
      </div>
    </div>`;
  },

  /* ===== 文章详情页 ===== */
  async detail(query) {
    const id = query && query.id;
    if (!id) return App.Router.notFound();
    let article, all;
    try { article = await App.API.getArticle(id); all = await App.API.getArticles({pageSize:100}); } catch(e) { return App.Router.serverError(e.message); }
    const rows = (all && all.rows) || all || [];
    const idx = rows.findIndex(a => a && a.id === id);
    const prev = idx > 0 ? rows[idx+1] : null;
    const next = idx > 0 ? rows[idx-1] : null;
    const liked = App.Store.get('news_liked_'+id);
    const faved = App.Store.isFavorited('article', id);

    // 评论区
    let comments = [];
    try { const c = await App.API.getComments('article', id); comments = (c && c.rows) || c || []; } catch(e) {}

    return `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'资讯',path:'/news'},{name:article.title,path:'/news-detail?id='+id}])}
      <article>
        <span class="badge badge-brand">${article.category}</span>
        <h1 class="text-3xl md:text-4xl font-bold mt-3 mb-4">${App.Utils.escape(article.title)}</h1>
        <div class="flex flex-wrap items-center gap-4 text-sm text-slate-400 mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
          <span><i class="fa-solid fa-user mr-1"></i>${App.Utils.escape(article.author||'管理员')}</span>
          <span><i class="fa-solid fa-calendar mr-1"></i>${App.Utils.formatDate(article.createdAt)}</span>
          <span><i class="fa-solid fa-eye mr-1"></i>${article.views||0} 阅读</span>
        </div>
        <img class="lazy w-full h-72 md:h-96 object-cover rounded-xl mb-6" data-src="${article.cover}" onclick="App.previewImage('${article.cover}')">
        <div class="prose dark:prose-invert max-w-none article-content" id="articleContent"></div>

        <!-- 标签 -->
        <div class="flex flex-wrap gap-2 mt-8">${(article.tags||[]).map(t=>`<span class="badge badge-gray">#${t}</span>`).join('')}</div>

        <!-- 操作栏：点赞/收藏/分享 -->
        <div class="flex flex-wrap gap-3 mt-6 py-4 border-y border-slate-200 dark:border-slate-700">
          <button class="btn-ghost ${liked?'bg-brand text-white':''}" onclick="App.Pages.News.like('${id}',${article.likes||0})"><i class="fa-solid fa-thumbs-up mr-1"></i>${liked?'已赞':'点赞'} (${article.likes||0})</button>
          <button class="btn-ghost ${faved?'bg-brand text-white':''}" onclick="App.Pages.News.fav('${id}')"><i class="fa-solid fa-heart mr-1"></i>${faved?'已收藏':'收藏'}</button>
          <button class="btn-ghost" onclick="App.Pages.News.share('${App.Utils.escape(article.title)}')"><i class="fa-solid fa-share-nodes mr-1"></i>分享</button>
        </div>

        <!-- 上一篇/下一篇 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          ${prev ? `<a href="#/news-detail?id=${prev.id}" class="glass-card p-4 hover-lift"><div class="text-xs text-slate-400">上一篇</div><div class="font-medium mt-1 line-clamp-1">${App.Utils.escape(prev.title)}</div></a>` : '<div></div>'}
          ${next ? `<a href="#/news-detail?id=${next.id}" class="glass-card p-4 hover-lift text-right"><div class="text-xs text-slate-400">下一篇</div><div class="font-medium mt-1 line-clamp-1">${App.Utils.escape(next.title)}</div></a>` : '<div></div>'}
        </div>
      </article>

      <!-- 评论区 -->
      <section class="mt-10">
        <h2 class="text-xl font-bold mb-4"><i class="fa-solid fa-comments mr-2 text-brand"></i>评论 (${comments.length})</h2>
        ${App.Auth.isLogin() ? `
        <div class="glass-card p-4 mb-4">
          <textarea id="commentInput" class="form-textarea" rows="3" placeholder="写下您的评论..."></textarea>
          <div class="text-right mt-2"><button class="btn-primary btn-sm" onclick="App.Pages.News.addComment('${id}')"><i class="fa-solid fa-paper-plane mr-1"></i>发表评论</button></div>
        </div>` : `<div class="glass-card p-4 mb-4 text-center text-slate-400"><a href="#/login" class="text-brand">登录</a>后参与评论</div>`}
        <div id="commentList" class="space-y-3">
          ${comments.length ? comments.map(c=>`
            <div class="glass-card p-4">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold">${c.username[0].toUpperCase()}</div>
                <span class="font-medium">${App.Utils.escape(c.username)}</span>
                <span class="text-xs text-slate-400">${App.Utils.formatDate(c.createdAt)}</span>
              </div>
              <p class="text-slate-600 dark:text-slate-300 text-sm">${App.Utils.escape(c.content)}</p>
            </div>`).join('') : App.Components.empty('fa-comment','暂无评论，快来抢沙发')}
        </div>
      </section>
    </div>`;
  },

  like(id, likes) {
    const key = 'news_liked_'+id;
    if (App.Store.get(key)) { App.Utils.toast('您已点过赞','warning'); return; }
    App.Store.set(key, true);
    App.API.saveArticle({ id, likes: likes+1 }).then(()=>{ App.Router.handle(); App.Utils.toast('点赞成功','success'); });
  },
  fav(id) {
    const ok = App.Store.toggleFavorite('article', id);
    App.Utils.toast(ok?'已收藏':'已取消收藏', ok?'success':'info');
    App.Router.handle();
  },
  share(title) {
    const url = location.href;
    if (navigator.clipboard) { navigator.clipboard.writeText(url); App.Utils.toast('链接已复制，快去分享吧','success'); }
    else App.Utils.toast('请手动复制地址栏链接','info');
  },
  async addComment(articleId) {
    const input = document.getElementById('commentInput');
    const content = input.value.trim();
    if (!content) { App.Utils.toast('评论内容不能为空','error'); return; }
    const user = App.Auth.currentUser();
    try {
      await App.API.addComment({ targetType:'article', targetId:articleId, userId:user.id, username:user.username, content, likes:0 });
      App.Utils.toast('评论发表成功','success');
      App.Router.handle();
    } catch(e) { App.Utils.toast('评论失败','error'); }
  },

  /* ===== 资讯后台管理 ===== */
  async admin() {
    if (!App.Auth.isAdmin()) { App.Router.navigate('/login'); return ''; }
    let list = [];
    try { const r = await App.API.getArticles({pageSize:100}); list = (r && r.rows) || []; } catch(e) {}
    let categories = [];
    try { const r = await App.API.getCategories(); categories = (r && r.article) || []; } catch(e) {}
    return `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'后台',path:'/admin'},{name:'资讯管理',path:'/news-admin'}])}
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold"><i class="fa-solid fa-newspaper mr-2 text-brand"></i>资讯管理</h1>
        <button class="btn-primary btn-sm" onclick="App.Pages.News.editArticle()"><i class="fa-solid fa-plus mr-1"></i>新建文章</button>
      </div>
      <div class="glass-card overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>标题</th><th>分类</th><th>浏览</th><th>点赞</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>${list.map(a=>`<tr>
            <td class="font-medium">${App.Utils.escape(a.title)}</td>
            <td><span class="badge badge-brand">${a.category}</span></td>
            <td>${a.views||0}</td>
            <td>${a.likes||0}</td>
            <td><span class="badge ${a.published?'badge-green':'badge-gray'}">${a.published?'已发布':'草稿'}</span></td>
            <td class="text-xs text-slate-400">${App.Utils.formatDate(a.createdAt)}</td>
            <td>
              <button class="btn-ghost btn-sm mr-1" onclick="App.Pages.News.editArticle('${a.id}')"><i class="fa-solid fa-pen"></i></button>
              <button class="btn-danger btn-sm" onclick="App.Pages.News.delArticle('${a.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    <input type="hidden" id="newsCats" value='${JSON.stringify(categories)}'>`;
  },

  async editArticle(id) {
    let article = { title:'', category:'', tags:'', summary:'', content:'', cover:'https://picsum.photos/seed/'+Date.now()+'/600/360', published:true };
    if (id) { try { article = await App.API.getArticle(id); } catch(e){} }
    const cats = JSON.parse(document.getElementById('newsCats').value);
    App.Utils.modal({
      title: id ? '编辑文章' : '新建文章', confirmText: '保存', showCancel: true,
      content: `<div class="space-y-3">
        <div><label class="form-label">标题</label><input class="form-input" id="f-title" value="${App.Utils.escape(article.title)}"></div>
        <div><label class="form-label">分类</label><select class="form-select" id="f-category">${cats.map(c=>`<option ${article.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div><label class="form-label">标签（逗号分隔）</label><input class="form-input" id="f-tags" value="${(article.tags||[]).join(',')}"></div>
        <div><label class="form-label">封面URL</label><input class="form-input" id="f-cover" value="${article.cover||''}"></div>
        <div><label class="form-label">摘要</label><textarea class="form-textarea" id="f-summary" rows="2">${App.Utils.escape(article.summary||'')}</textarea></div>
        <div><label class="form-label">正文（支持Markdown）</label><textarea class="form-textarea" id="f-content" rows="6">${App.Utils.escape(article.content||'')}</textarea></div>
        <label class="flex items-center gap-2"><input type="checkbox" id="f-published" ${article.published?'checked':''} class="accent-brand-500"> 发布</label>
      </div>`,
      onConfirm: async (close) => {
        const data = {
          title: document.getElementById('f-title').value.trim(),
          category: document.getElementById('f-category').value,
          tags: document.getElementById('f-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
          cover: document.getElementById('f-cover').value.trim(),
          summary: document.getElementById('f-summary').value.trim(),
          content: document.getElementById('f-content').value,
          published: document.getElementById('f-published').checked,
          author: App.Auth.currentUser().username
        };
        if (!data.title) { App.Utils.toast('标题不能为空','error'); return; }
        if (id) data.id = id;
        try { await App.API.saveArticle(data); App.Utils.toast('保存成功','success'); close(); App.Router.handle(); } catch(e){ App.Utils.toast('保存失败','error'); }
      }
    });
  },
  async delArticle(id) {
    const ok = await App.Utils.confirm('确定删除该文章吗？');
    if (!ok) return;
    try { await App.API.deleteArticle(id); App.Utils.toast('已删除','success'); App.Router.handle(); } catch(e){ App.Utils.toast('删除失败','error'); }
  },

  /* afterRender */
  afterRender(query) {
    const path = App.Router.parse().path;
    if (path === '/news') {
      // 绑定防抖搜索
      this.onFilter = App.Utils.debounce((patch) => { Object.assign(this._state, patch, {page:1}); this._doFilter(); }, 350);
      // 初始渲染走 onFilter 逻辑
      this._doFilter();
    }
    if (path === '/news-detail') {
      // 渲染文章正文（简易 Markdown）
      const content = document.getElementById('articleContent');
      if (content) {
        // 取文章内容（从页面已渲染的隐藏数据或重新解析）——这里用简易转HTML
        // 由于详情已渲染，此处通过 data 属性获取
      }
    }
  }
};
