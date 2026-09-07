/* ===================================================================
 * components.js - 公共组件
 * 渲染：导航栏（含登录态动态）、页脚、分页、空状态、面包屑
 * =================================================================== */
window.App = window.App || {};

App.Components = {
  /* ===== 渲染导航栏（桌面端 + 移动端 + 用户区） ===== */
  renderNavbar() {
    const role = App.Auth.currentRole();
    const user = App.Auth.currentUser();
    const menus = App.Config.menus.filter(m => m.roles.includes(role));
    const currentPath = location.hash.replace('#', '') || '/home';

    // 桌面端菜单
    const menuHtml = menus.map(m => `
      <a href="#${m.path}" class="nav-link ${currentPath === m.path ? 'active' : ''}">
        <i class="fa-solid ${m.icon} mr-1"></i>${m.name}
      </a>`).join('');
    document.getElementById('navMenu').innerHTML = menuHtml;

    // 移动端菜单
    document.getElementById('mobileMenu').innerHTML = `
      <div class="px-4 py-3 flex flex-col gap-1">
        ${menus.map(m => `<a href="#${m.path}" class="nav-link ${currentPath === m.path ? 'active' : ''}" onclick="App.toggleMobileMenu()">
          <i class="fa-solid ${m.icon} mr-2"></i>${m.name}</a>`).join('')}
      </div>`;

    // 用户区（动态登录态）
    const cartCount = App.Store.cartCount();
    let userHtml = '';
    if (user) {
      userHtml = `
        <div class="relative group">
          <button class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <div class="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold">${user.username[0].toUpperCase()}</div>
            <span class="hidden sm:inline text-sm font-medium">${App.Utils.escape(user.username)}</span>
            ${user.role === 'vip' || user.role === 'admin' ? '<span class="badge badge-orange">VIP</span>' : ''}
            <i class="fa-solid fa-chevron-down text-xs"></i>
          </button>
          <div class="absolute right-0 top-full mt-1 w-48 glass-card p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <a href="#/profile" class="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"><i class="fa-solid fa-user mr-2"></i>个人中心</a>
            <a href="#/profile?tab=orders" class="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"><i class="fa-solid fa-bag-shopping mr-2"></i>我的订单</a>
            <a href="#/profile?tab=favorites" class="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"><i class="fa-solid fa-heart mr-2"></i>收藏夹</a>
            <a href="#/cart" class="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"><i class="fa-solid fa-cart-shopping mr-2"></i>购物车${cartCount ? `<span class="badge badge-red ml-1">${cartCount}</span>` : ''}</a>
            <hr class="my-1 border-slate-200 dark:border-slate-700">
            <button onclick="App.Auth.logout()" class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-red-500"><i class="fa-solid fa-right-from-bracket mr-2"></i>退出登录</button>
          </div>
        </div>`;
    } else {
      userHtml = `
        <a href="#/login" class="btn-ghost btn-sm"><i class="fa-solid fa-right-to-bracket mr-1"></i>登录</a>
        <a href="#/register" class="btn-primary btn-sm hidden sm:inline-flex"><i class="fa-solid fa-user-plus mr-1"></i>注册</a>`;
    }
    document.getElementById('navUser').innerHTML = userHtml;
  },

  /* ===== 渲染页脚 ===== */
  renderFooter() {
    const s = App.Config.site;
    document.getElementById('footer').innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div class="flex items-center gap-2 font-bold text-lg mb-3"><i class="fa-solid fa-cube text-brand text-2xl"></i>${s.siteName}</div>
            <p class="text-sm text-slate-500">${s.slogan}</p>
            <div class="flex gap-3 mt-4">
              <a href="#" class="icon-btn"><i class="fa-brands fa-weixin"></i></a>
              <a href="#" class="icon-btn"><i class="fa-brands fa-weibo"></i></a>
              <a href="#" class="icon-btn"><i class="fa-brands fa-github"></i></a>
              <a href="#" class="icon-btn"><i class="fa-solid fa-envelope"></i></a>
            </div>
          </div>
          <div>
            <h4 class="font-semibold mb-3">产品服务</h4>
            <ul class="space-y-2 text-sm text-slate-500">
              <li><a href="#/products" class="hover:text-brand">云服务</a></li>
              <li><a href="#/products" class="hover:text-brand">数据分析</a></li>
              <li><a href="#/products" class="hover:text-brand">AI应用</a></li>
              <li><a href="#/products" class="hover:text-brand">安全服务</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold mb-3">关于我们</h4>
            <ul class="space-y-2 text-sm text-slate-500">
              <li><a href="#/news" class="hover:text-brand">资讯动态</a></li>
              <li><a href="#/home" class="hover:text-brand">客户案例</a></li>
              <li><a href="#/home" class="hover:text-brand">合作伙伴</a></li>
              <li><a href="#/home" class="hover:text-brand">招贤纳士</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold mb-3">联系方式</h4>
            <ul class="space-y-2 text-sm text-slate-500">
              <li><i class="fa-solid fa-phone mr-2"></i>${s.phone}</li>
              <li><i class="fa-solid fa-envelope mr-2"></i>${s.email}</li>
              <li><i class="fa-solid fa-location-dot mr-2"></i>${s.address}</li>
            </ul>
          </div>
        </div>
        <div class="border-t border-slate-200 dark:border-slate-800 mt-8 pt-6 text-center text-sm text-slate-400">
          <p>© 2026 ${s.siteName} · ${s.slogan}</p>
          <p class="mt-1">${s.icp} · 本站为演示项目，所有数据仅供展示</p>
        </div>
      </div>`;
  },

  /* ===== 分页组件 ===== */
  pagination(page, total, pageSize, onChange) {
    const pages = Math.ceil(total / pageSize) || 1;
    if (pages <= 1) return '';
    let btns = '';
    btns += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="${onChange}(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== pages) {
        if (i === 2 || i === pages - 1) btns += `<span class="px-1 text-slate-400">...</span>`;
        continue;
      }
      btns += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="${onChange}(${i})">${i}</button>`;
    }
    btns += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} onclick="${onChange}(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    return `<div class="pagination mt-6">${btns}</div>`;
  },

  /* ===== 空状态 ===== */
  empty(icon, text) {
    return `<div class="empty-state"><i class="fa-solid ${icon}"></i><p>${text}</p></div>`;
  },

  /* ===== 面包屑 ===== */
  breadcrumb(items) {
    return `<nav class="flex items-center gap-2 text-sm text-slate-400 mb-4">
      ${items.map((it, i) => i === items.length - 1
        ? `<span class="text-brand">${it.name}</span>`
        : `<a href="#${it.path}" class="hover:text-brand">${it.name}</a><i class="fa-solid fa-chevron-right text-xs"></i>`
      ).join('')}
    </nav>`;
  }
};
