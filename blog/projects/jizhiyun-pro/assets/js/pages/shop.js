/* ===================================================================
 * shop.js - 产品展示与购物系统
 * 包含：产品列表(分类侧边/网格列表双布局/分页)、详情(规格/评论)、购物车、结算下单
 * =================================================================== */
window.App = window.App || {};
App.Pages = App.Pages || {};

App.Pages.Shop = {
  _state: { category:'', keyword:'', sort:'newest', page:1, pageSize:8, view:'grid' },

  /* ===== 产品列表页 ===== */
  async list() {
    let categories = [];
    try { const r = await App.API.getCategories(); categories = (r && r.product) || []; } catch(e) {}
    return `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'产品中心',path:'/products'}])}
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- ① 分类侧边栏 -->
        <aside class="lg:col-span-1">
          <div class="glass-card p-4 sticky top-20">
            <h3 class="font-bold mb-3"><i class="fa-solid fa-filter mr-2 text-brand"></i>分类筛选</h3>
            <div class="space-y-1">
              <button class="w-full text-left px-3 py-2 rounded-lg ${!this._state.category?'bg-brand text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="App.Pages.Shop.setCategory('')">全部产品</button>
              ${categories.map(c=>`<button class="w-full text-left px-3 py-2 rounded-lg ${this._state.category===c?'bg-brand text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="App.Pages.Shop.setCategory('${c}')"><i class="fa-solid fa-tag mr-2 text-xs"></i>${c}</button>`).join('')}
            </div>
          </div>
        </aside>
        <!-- ② 产品列表区 -->
        <div class="lg:col-span-3">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div class="flex-1 min-w-[180px] relative">
              <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input class="form-input pl-9" placeholder="搜索产品..." value="${this._state.keyword}" oninput="App.Pages.Shop.onFilter({keyword:this.value})">
            </div>
            <div class="flex items-center gap-2">
              <select class="form-select w-auto" onchange="App.Pages.Shop.onFilter({sort:this.value})">
                <option value="newest" ${this._state.sort==='newest'?'selected':''}>最新</option>
                <option value="sales" ${this._state.sort==='sales'?'selected':''}>销量优先</option>
                <option value="price-asc" ${this._state.sort==='price-asc'?'selected':''}>价格升序</option>
                <option value="price-desc" ${this._state.sort==='price-desc'?'selected':''}>价格降序</option>
              </select>
              <!-- 网格/列表双布局切换 -->
              <div class="flex glass-card p-1">
                <button class="icon-btn ${this._state.view==='grid'?'bg-brand text-white':''}" onclick="App.Pages.Shop.setView('grid')" title="网格"><i class="fa-solid fa-grip"></i></button>
                <button class="icon-btn ${this._state.view==='list'?'bg-brand text-white':''}" onclick="App.Pages.Shop.setView('list')" title="列表"><i class="fa-solid fa-list"></i></button>
              </div>
            </div>
          </div>
          <div id="productList" class="${this._state.view==='grid'?'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4':'space-y-4'}">
            ${App.Utils.skeleton(6)}
          </div>
          <div id="productPagination"></div>
        </div>
      </div>
    </div>`;
  },

  setCategory(c) { this._state.category=c; this._state.page=1; this._doFilter(); },
  setView(v) { this._state.view=v; this.render(); },  // 重新渲染列表容器并刷新
  onFilter: null,
  async _doFilter() {
    const list = document.getElementById('productList');
    if (!list) return;
    list.className = this._state.view==='grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-4';
    list.innerHTML = App.Utils.skeleton(6);
    try {
      const r = await App.API.getProducts(this._state);
      // 排序（本地模式补充）
      let rows = (r && r.rows) || [];
      const total = (r && r.total) || 0;
      if (this._state.sort==='sales') rows.sort((a,b)=>(b.sales||0)-(a.sales||0));
      if (this._state.sort==='price-asc') rows.sort((a,b)=>a.price-b.price);
      if (this._state.sort==='price-desc') rows.sort((a,b)=>b.price-a.price);
      list.innerHTML = rows.length ? rows.map((p,i)=>this._card(p,i)).join('') : App.Components.empty('fa-box','暂无产品');
      document.getElementById('productPagination').innerHTML = App.Components.pagination(this._state.page, total, this._state.pageSize, 'App.Pages.Shop.goPage');
      App.Utils.lazyLoadImages(list);
    } catch(e) { list.innerHTML = App.Components.empty('fa-triangle-exclamation','加载失败'); }
  },
  goPage(p) { this._state.page=p; this._doFilter(); window.scrollTo({top:300,behavior:'smooth'}); },
  async render() {
    // view 切换时只更新列表容器布局
    const list = document.getElementById('productList');
    if (list) { list.className = this._state.view==='grid'?'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4':'space-y-4'; this._doFilter(); }
  },

  _card(p, i) {
    if (this._state.view === 'list') {
      return `<div class="glass-card p-4 flex gap-4 hover-lift" data-aos="fade-up">
        <img class="lazy w-32 h-32 rounded-lg object-cover flex-shrink-0" data-src="${p.cover}" alt="${App.Utils.escape(p.name)}" onclick="App.previewImage('${p.cover}')">
        <div class="flex-1 flex flex-col">
          <a href="#/product-detail?id=${p.id}"><h3 class="font-bold text-lg">${App.Utils.escape(p.name)}</h3></a>
          <p class="text-sm text-slate-500 mt-1 line-clamp-2">${App.Utils.escape(p.desc)}</p>
          <div class="flex flex-wrap gap-1 mt-2">${(p.tags||[]).map(t=>`<span class="badge badge-orange">${t}</span>`).join('')}</div>
          <div class="flex items-center justify-between mt-auto pt-2">
            <div><span class="text-brand font-bold text-xl">${App.Utils.formatMoney(p.price)}</span><span class="text-xs text-slate-400 line-through ml-2">${App.Utils.formatMoney(p.originalPrice)}</span></div>
            <button class="btn-primary btn-sm" onclick="App.Pages.Shop.quickAdd('${p.id}','${App.Utils.escape(p.name)}',${p.price})"><i class="fa-solid fa-cart-plus mr-1"></i>加入购物车</button>
          </div>
        </div>
      </div>`;
    }
    return `<div class="glass-card overflow-hidden hover-lift" data-aos="fade-up" data-aos-delay="${(i%3)*100}">
      <div class="relative">
        <img class="lazy w-full h-48 object-cover" data-src="${p.cover}" alt="${App.Utils.escape(p.name)}" onclick="App.previewImage('${p.cover}')">
        ${p.tags&&p.tags[0]?`<span class="absolute top-2 left-2 badge badge-orange">${p.tags[0]}</span>`:''}
        <span class="absolute top-2 right-2 badge badge-red">-${Math.round((1-p.price/p.originalPrice)*100)}%</span>
      </div>
      <div class="p-4">
        <a href="#/product-detail?id=${p.id}"><h3 class="font-bold line-clamp-1">${App.Utils.escape(p.name)}</h3></a>
        <p class="text-sm text-slate-500 mt-1 line-clamp-2">${App.Utils.escape(p.desc)}</p>
        <div class="flex items-end justify-between mt-3">
          <div><span class="text-brand font-bold text-xl">${App.Utils.formatMoney(p.price)}</span></div>
          <span class="text-xs text-slate-400">销量 ${p.sales||0}</span>
        </div>
        <button class="btn-primary w-full mt-3 btn-sm" onclick="App.Pages.Shop.quickAdd('${p.id}','${App.Utils.escape(p.name)}',${p.price})"><i class="fa-solid fa-cart-plus mr-1"></i>加入购物车</button>
      </div>
    </div>`;
  },

  quickAdd(id, name, price) {
    App.Store.addToCart(id, name, price, '默认', 1);
    App.Components.renderNavbar();
    App.Utils.toast('已加入购物车','success');
  },

  /* ===== 产品详情页 ===== */
  async detail(query) {
    const id = query && query.id;
    if (!id) return App.Router.notFound();
    let p;
    try { p = await App.API.getProduct(id); if (!p) throw new Error('产品不存在'); } catch(e) { return App.Router.serverError(e.message); }
    let comments = [];
    try { const c = await App.API.getComments('product', id); comments = (c && c.rows) || c || []; } catch(e) {}
    const faved = App.Store.isFavorited('product', id);
    return `
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'产品',path:'/products'},{name:p.name,path:'/product-detail?id='+id}])}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <img class="lazy w-full h-80 md:h-96 object-cover rounded-xl" data-src="${p.cover}" onclick="App.previewImage('${p.cover}')">
          <div class="grid grid-cols-4 gap-2 mt-3">${[1,2,3,4].map(n=>`<img class="lazy w-full h-20 object-cover rounded-lg cursor-pointer border-2 border-transparent hover:border-brand" data-src="https://picsum.photos/seed/${p.id}${n}/200" onclick="App.previewImage(this.dataset.src)">`).join('')}</div>
        </div>
        <div>
          <div class="flex gap-2 mb-2">${(p.tags||[]).map(t=>`<span class="badge badge-orange">${t}</span>`).join('')}<span class="badge badge-gray">${p.category}</span></div>
          <h1 class="text-3xl font-bold">${App.Utils.escape(p.name)}</h1>
          <p class="text-slate-500 mt-2">${App.Utils.escape(p.desc)}</p>
          <div class="my-4 p-4 neu-inset rounded-xl">
            <div class="flex items-end gap-3">
              <span class="text-4xl font-black text-brand">${App.Utils.formatMoney(p.price)}</span>
              <span class="text-slate-400 line-through mb-1">${App.Utils.formatMoney(p.originalPrice)}</span>
              <span class="badge badge-red mb-1">省${App.Utils.formatMoney(p.originalPrice-p.price)}</span>
            </div>
            <div class="flex gap-4 mt-3 text-sm text-slate-500">
              <span><i class="fa-solid fa-box mr-1"></i>库存 ${p.stock}</span>
              <span><i class="fa-solid fa-fire mr-1"></i>销量 ${p.sales||0}</span>
            </div>
          </div>
          <!-- 规格选择 -->
          <div class="mb-4">
            <label class="form-label">规格选择</label>
            <div class="flex flex-wrap gap-2" id="specGroup">
              ${p.specs.map((s,i)=>`<button class="px-4 py-2 rounded-lg border-2 ${i===0?'border-brand text-brand':'border-slate-200 dark:border-slate-700'} hover:border-brand transition" onclick="App.Pages.Shop.selectSpec(this)">${s}</button>`).join('')}
            </div>
          </div>
          <!-- 数量 -->
          <div class="mb-4">
            <label class="form-label">购买数量</label>
            <div class="inline-flex items-center glass-card p-1">
              <button class="icon-btn" onclick="App.Pages.Shop.changeQty(-1)"><i class="fa-solid fa-minus"></i></button>
              <input id="qtyInput" type="number" value="1" min="1" class="w-16 text-center bg-transparent border-none outline-none">
              <button class="icon-btn" onclick="App.Pages.Shop.changeQty(1)"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <!-- 操作按钮 -->
          <div class="flex gap-3 mt-6">
            <button class="btn-primary flex-1 py-3" onclick="App.Pages.Shop.addToCart('${p.id}','${App.Utils.escape(p.name)}',${p.price})"><i class="fa-solid fa-cart-plus mr-1"></i>加入购物车</button>
            <button class="btn-outline py-3 px-6" onclick="App.Pages.Shop.buyNow('${p.id}','${App.Utils.escape(p.name)}',${p.price})">立即购买</button>
            <button class="btn-ghost py-3 px-4" onclick="App.Pages.Shop.favProduct('${p.id}')"><i class="fa-solid fa-heart ${faved?'text-red-500':''}"></i></button>
          </div>
        </div>
      </div>
      <!-- 详情/评论 Tab -->
      <div class="mt-10">
        <div class="flex border-b border-slate-200 dark:border-slate-700 mb-6">
          <div class="tab active" onclick="App.Pages.Shop.tab(this,'detail')">产品详情</div>
          <div class="tab" onclick="App.Pages.Shop.tab(this,'comments')">用户评价(${comments.length})</div>
        </div>
        <div id="tab-detail" class="prose dark:prose-invert max-w-none">
          <h3>产品介绍</h3>
          <p>${App.Utils.escape(p.desc)}</p>
          <p>本产品提供完整的部署文档与技术支持，支持7天无理由退款，14天免费试用。VIP客户享受专属折扣与优先服务。</p>
          <h3>核心特性</h3>
          <ul><li>弹性扩容，按需付费</li><li>企业级安全防护</li><li>7×24技术支持</li><li>多可用区容灾</li></ul>
        </div>
        <div id="tab-comments" class="hidden space-y-3">
          ${comments.length ? comments.map(c=>`<div class="glass-card p-4"><div class="flex items-center gap-3 mb-2"><div class="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold">${c.username[0].toUpperCase()}</div><span class="font-medium">${App.Utils.escape(c.username)}</span><span class="text-xs text-slate-400">${App.Utils.formatDate(c.createdAt)}</span></div><p class="text-sm text-slate-600 dark:text-slate-300">${App.Utils.escape(c.content)}</p></div>`).join('') : App.Components.empty('fa-comment','暂无评价')}
        </div>
      </div>
    </div>`;
  },
  selectSpec(btn) {
    btn.parentNode.querySelectorAll('button').forEach(b=>{b.className='px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand transition';});
    btn.className='px-4 py-2 rounded-lg border-2 border-brand text-brand transition';
  },
  changeQty(d) { const i=document.getElementById('qtyInput'); i.value=Math.max(1,Number(i.value)+d); },
  addToCart(id,name,price) {
    const spec = document.querySelector('#specGroup button.border-brand')?.textContent || '默认';
    const qty = Number(document.getElementById('qtyInput').value)||1;
    App.Store.addToCart(id, name, price, spec, qty);
    App.Components.renderNavbar();
    App.Utils.toast('已加入购物车','success');
  },
  buyNow(id,name,price) {
    this.addToCart(id,name,price);
    App.Router.navigate('/cart');
  },
  favProduct(id) {
    const ok = App.Store.toggleFavorite('product', id);
    App.Utils.toast(ok?'已收藏':'已取消', ok?'success':'info');
    App.Router.handle();
  },
  tab(el, key) {
    el.parentNode.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-detail').classList.toggle('hidden', key!=='detail');
    document.getElementById('tab-comments').classList.toggle('hidden', key!=='comments');
  },

  /* ===== 购物车页 ===== */
  cart() {
    if (!App.Auth.isLogin()) { App.Router.navigate('/login'); return ''; }
    const cart = App.Store.getCart();
    return `
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'购物车',path:'/cart'}])}
      <h1 class="text-2xl font-bold mb-6"><i class="fa-solid fa-cart-shopping mr-2 text-brand"></i>购物车</h1>
      ${cart.length ? `
      <div class="glass-card overflow-x-auto mb-4">
        <table class="data-table">
          <thead><tr><th>商品</th><th>规格</th><th>单价</th><th>数量</th><th>小计</th><th>操作</th></tr></thead>
          <tbody>${cart.map((item,i)=>`<tr>
            <td class="font-medium">${App.Utils.escape(item.name)}</td>
            <td>${App.Utils.escape(item.spec)}</td>
            <td>${App.Utils.formatMoney(item.price)}</td>
            <td><div class="inline-flex items-center"><button class="icon-btn btn-sm" onclick="App.Pages.Shop.cartQty(${i},-1)"><i class="fa-solid fa-minus"></i></button><span class="px-3">${item.qty}</span><button class="icon-btn btn-sm" onclick="App.Pages.Shop.cartQty(${i},1)"><i class="fa-solid fa-plus"></i></button></div></td>
            <td class="text-brand font-semibold">${App.Utils.formatMoney(item.price*item.qty)}</td>
            <td><button class="btn-danger btn-sm" onclick="App.Pages.Shop.cartDel(${i})"><i class="fa-solid fa-trash"></i></button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="glass-card p-4 flex flex-wrap justify-between items-center">
        <button class="btn-ghost btn-sm" onclick="App.Store.setCart([]);App.Router.handle()"><i class="fa-solid fa-trash mr-1"></i>清空购物车</button>
        <div class="flex items-center gap-4">
          <span>合计：<span class="text-brand text-2xl font-bold">${App.Utils.formatMoney(cart.reduce((s,i)=>s+i.price*i.qty,0))}</span></span>
          <a href="#/checkout" class="btn-primary"><i class="fa-solid fa-credit-card mr-1"></i>去结算</a>
        </div>
      </div>` : App.Components.empty('fa-cart-shopping','购物车是空的，去 <a href="#/products" class="text-brand">逛逛</a> 吧')}
    </div>`;
  },
  cartQty(i,d) { const c=App.Store.getCart(); c[i].qty=Math.max(1,c[i].qty+d); App.Store.setCart(c); App.Components.renderNavbar(); App.Router.handle(); },
  cartDel(i) { const c=App.Store.getCart(); c.splice(i,1); App.Store.setCart(c); App.Components.renderNavbar(); App.Router.handle(); },

  /* ===== 结算页 ===== */
  checkout() {
    if (!App.Auth.isLogin()) { App.Router.navigate('/login'); return ''; }
    const cart = App.Store.getCart();
    if (!cart.length) { App.Router.navigate('/products'); return ''; }
    const user = App.Auth.currentUser();
    const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
    return `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'购物车',path:'/cart'},{name:'结算',path:'/checkout'}])}
      <h1 class="text-2xl font-bold mb-6"><i class="fa-solid fa-credit-card mr-2 text-brand"></i>确认订单</h1>
      <form id="checkoutForm" class="space-y-6">
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-location-dot mr-2 text-brand"></i>收货信息</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="form-label">联系人</label><input class="form-input" name="contact" value="${App.Utils.escape(user.username)}" placeholder="收货人姓名"></div>
            <div><label class="form-label">手机号</label><input class="form-input" name="phone" value="${App.Utils.escape(user.phone||'')}" placeholder="联系电话"></div>
            <div class="md:col-span-2"><label class="form-label">地址</label><input class="form-input" name="address" placeholder="请输入详细地址"></div>
          </div>
        </div>
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-wallet mr-2 text-brand"></i>支付方式</h3>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 glass-card p-3 px-4 cursor-pointer border-brand"><input type="radio" name="pay" value="alipay" checked class="accent-brand-500"><i class="fa-brands fa-alipay text-blue-500"></i>支付宝</label>
            <label class="flex items-center gap-2 glass-card p-3 px-4 cursor-pointer"><input type="radio" name="pay" value="wechat" class="accent-brand-500"><i class="fa-brands fa-weixin text-green-500"></i>微信支付</label>
            <label class="flex items-center gap-2 glass-card p-3 px-4 cursor-pointer"><input type="radio" name="pay" value="bank" class="accent-brand-500"><i class="fa-solid fa-building-columns"></i>对公转账</label>
          </div>
        </div>
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-list mr-2 text-brand"></i>商品清单</h3>
          <div class="space-y-2">${cart.map(i=>`<div class="flex justify-between text-sm"><span>${App.Utils.escape(i.name)} (${App.Utils.escape(i.spec)}) × ${i.qty}</span><span class="font-medium">${App.Utils.formatMoney(i.price*i.qty)}</span></div>`).join('')}</div>
          <div class="flex justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <span class="font-bold">应付总额</span>
            <span class="text-brand text-2xl font-bold">${App.Utils.formatMoney(total)}</span>
          </div>
        </div>
        <div class="text-center">
          <button type="submit" class="btn-primary px-12 py-3"><i class="fa-solid fa-check mr-1"></i>提交订单</button>
        </div>
      </form>
    </div>`;
  },

  /* afterRender */
  afterRender() {
    const path = App.Router.parse().path;
    if (path === '/products') {
      this.onFilter = App.Utils.debounce((patch) => { Object.assign(this._state, patch, {page:1}); this._doFilter(); }, 350);
      this._doFilter();
    }
    if (path === '/checkout') {
      document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        if (!data.contact?.trim()) { App.Utils.toast('请填写联系人','error'); return; }
        if (!App.Utils.validate.phone(data.phone)) { App.Utils.toast('手机号格式不正确','error'); return; }
        if (!data.address?.trim()) { App.Utils.toast('请填写地址','error'); return; }
        const cart = App.Store.getCart();
        const user = App.Auth.currentUser();
        const order = {
          id: 'ORD' + new Date().toISOString().slice(0,10).replace(/-/g,'') + String(Math.floor(Math.random()*999)).padStart(3,'0'),
          userId: user.id,
          items: cart,
          total: cart.reduce((s,i)=>s+i.price*i.qty,0),
          status: '待付款',
          contact: data.contact, phone: data.phone, address: data.address, pay: data.pay
        };
        try {
          await App.API.saveOrder(order);
          App.Store.setCart([]);
          App.Components.renderNavbar();
          App.Utils.toast('订单提交成功！','success');
          setTimeout(()=>App.Router.navigate('/profile?tab=orders'), 1000);
        } catch(err) { App.Utils.toast('提交失败：'+err.message,'error'); }
      });
    }
  }
};
