/* ===================================================================
 * router.js - SPA 路由（基于 hash）
 * 实现：无刷新切换页面、路由守卫、参数解析、页面滚动复位
 * =================================================================== */
window.App = window.App || {};

App.Router = {
  /* 路由表（path → {render, require}） */
  routes: {},

  /* 注册路由 */
  register(path, handler) { this.routes[path] = handler; },

  /* 初始化：监听 hash 变化 + 注册所有页面路由 */
  init() {
    // 注册各页面路由（render 渲染页面，afterRender 渲染后初始化交互）
    App.Router.register('/home',     { render: () => App.Pages.Home.render(),       afterRender: (q) => App.Pages.Home.afterRender && App.Pages.Home.afterRender(q),       title: '首页' });
    App.Router.register('/login',    { render: () => App.Pages.User.login(),        afterRender: (q) => App.Pages.User.afterRender && App.Pages.User.afterRender(q),        title: '登录' });
    App.Router.register('/register', { render: () => App.Pages.User.register(),     afterRender: (q) => App.Pages.User.afterRender && App.Pages.User.afterRender(q),        title: '注册' });
    App.Router.register('/forgot',   { render: () => App.Pages.User.forgot(),       afterRender: (q) => App.Pages.User.afterRender && App.Pages.User.afterRender(q),        title: '找回密码' });
    App.Router.register('/profile',  { render: () => App.Pages.User.profile(),      afterRender: (q) => App.Pages.User.afterRender && App.Pages.User.afterRender(q),        title: '个人中心', auth: 'user' });
    App.Router.register('/news',     { render: () => App.Pages.News.list(),         afterRender: (q) => App.Pages.News.afterRender && App.Pages.News.afterRender(q),         title: '资讯' });
    App.Router.register('/news-detail', { render: () => App.Pages.News.detail(),    afterRender: (q) => App.Pages.News.afterRender && App.Pages.News.afterRender(q),         title: '文章详情' });
    App.Router.register('/news-admin',  { render: () => App.Pages.News.admin(),     afterRender: (q) => App.Pages.News.afterRender && App.Pages.News.afterRender(q),         title: '资讯管理', auth: 'admin' });
    App.Router.register('/products',    { render: () => App.Pages.Shop.list(),      afterRender: (q) => App.Pages.Shop.afterRender && App.Pages.Shop.afterRender(q),         title: '产品中心' });
    App.Router.register('/product-detail', { render: () => App.Pages.Shop.detail(), afterRender: (q) => App.Pages.Shop.afterRender && App.Pages.Shop.afterRender(q),         title: '产品详情' });
    App.Router.register('/cart',      { render: () => App.Pages.Shop.cart(),        afterRender: (q) => App.Pages.Shop.afterRender && App.Pages.Shop.afterRender(q),         title: '购物车', auth: 'user' });
    App.Router.register('/checkout',  { render: () => App.Pages.Shop.checkout(),    afterRender: (q) => App.Pages.Shop.afterRender && App.Pages.Shop.afterRender(q),         title: '结算', auth: 'user' });
    App.Router.register('/admin',     { render: () => App.Pages.Admin.dashboard(),  afterRender: (q) => App.Pages.Admin.afterRender && App.Pages.Admin.afterRender(q),       title: '后台管理', auth: 'admin' });

    window.addEventListener('hashchange', () => this.handle());
    this.handle(); // 首次加载
  },

  /* 解析当前 hash → { path, query } */
  parse() {
    const hash = location.hash.replace('#', '') || '/home';
    const [path, queryStr] = hash.split('?');
    const query = {};
    if (queryStr) queryStr.split('&').forEach(p => { const [k, v] = p.split('='); query[k] = decodeURIComponent(v || ''); });
    return { path, query };
  },

  /* 跳转 */
  navigate(path) {
    location.hash = path;
    // hashchange 会触发 handle
  },

  /* 处理路由切换 */
  async handle() {
    const { path, query } = this.parse();
    const route = this.routes[path];

    const app = document.getElementById('app');

    // 路由不存在 → 404
    if (!route) {
      app.innerHTML = this.notFound();
      document.title = '404 - 页面未找到';
      window.scrollTo(0, 0);
      App.Utils.lazyLoadImages();
      return;
    }

    // 权限校验
    if (route.auth && !App.Auth.require(route.auth)) return;

    // 刷新导航高亮
    App.Components.renderNavbar();

    // 渲染页面（加 loading）
    app.innerHTML = `<div class="flex items-center justify-center py-20"><div class="loader-circle"></div><span class="ml-3 text-slate-400">加载中...</span></div>`;
    document.title = (route.title || '') + ' · ' + App.Config.site.siteName;

    try {
      const html = await route.render(query);
      app.innerHTML = html || '';
      // 页面渲染后执行各模块的 afterRender（如果定义了）
      if (route.afterRender) route.afterRender(query);
      // 通用后处理：懒加载、AOS 重新初始化
      App.Utils.lazyLoadImages(app);
      if (window.AOS) AOS.refresh();
      window.scrollTo(0, 0);
      App.Components.renderNavbar(); // 确保登录态最新
    } catch (e) {
      console.error('[Router] 渲染失败:', e);
      app.innerHTML = this.serverError(e.message);
    }
  },

  /* 404 页面 */
  notFound() {
    return `<div class="max-w-2xl mx-auto text-center py-20 px-4">
      <div class="text-9xl font-black text-brand opacity-20">404</div>
      <h1 class="text-2xl font-bold mt-4">页面未找到</h1>
      <p class="text-slate-500 mt-2">您访问的页面不存在或已被移除</p>
      <a href="#/home" class="btn-primary mt-6"><i class="fa-solid fa-house mr-1"></i>返回首页</a>
    </div>`;
  },

  /* 500 页面 */
  serverError(msg) {
    return `<div class="max-w-2xl mx-auto text-center py-20 px-4">
      <div class="text-9xl font-black text-red-500 opacity-20">500</div>
      <h1 class="text-2xl font-bold mt-4">服务器异常</h1>
      <p class="text-slate-500 mt-2">${App.Utils.escape(msg || '页面渲染时发生错误')}</p>
      <a href="#/home" class="btn-primary mt-6"><i class="fa-solid fa-house mr-1"></i>返回首页</a>
    </div>`;
  }
};
