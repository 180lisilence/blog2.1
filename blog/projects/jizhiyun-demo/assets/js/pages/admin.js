/* ===================================================================
 * admin.js - 后台管理控制面板
 * 包含：Dashboard(折线/饼/柱状图 Chart.js)、用户/内容/订单/留言/配置管理
 * =================================================================== */
window.App = window.App || {};
App.Pages = App.Pages || {};

App.Pages.Admin = {
  /* ===== Dashboard 仪表盘 ===== */
  async dashboard() {
    if (!App.Auth.isAdmin()) { App.Router.navigate('/login'); return ''; }
    let stats = {};
    try { stats = await App.API.getStats(); } catch(e) {}
    return `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'后台管理',path:'/admin'}])}
      <div class="flex flex-wrap justify-between items-center mb-6">
        <h1 class="text-2xl font-bold"><i class="fa-solid fa-gauge-high mr-2 text-brand"></i>控制台</h1>
        <span class="text-sm text-slate-400">欢迎，${App.Utils.escape(App.Auth.currentUser().username)} · ${new Date().toLocaleDateString('zh-CN')}</span>
      </div>

      <!-- 数据卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        ${this._kpi('fa-users','用户数',stats.userCount||0,'#3373ff')}
        ${this._kpi('fa-newspaper','文章数',stats.articleCount||0,'#22c55e')}
        ${this._kpi('fa-box','产品数',stats.productCount||0,'#f59e0b')}
        ${this._kpi('fa-bag-shopping','订单数',stats.orderCount||0,'#8b5cf6')}
        ${this._kpi('fa-yen-sign','总收入',App.Utils.formatMoney(stats.totalRevenue||0).replace('¥',''),'#06b6d4')}
        ${this._kpi('fa-comment','留言数',stats.messageCount||0,'#ef4444')}
      </div>

      <!-- 图表区 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-chart-line mr-2 text-brand"></i>近7天访问趋势</h3>
          <canvas id="chartVisits" height="120"></canvas>
        </div>
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-chart-column mr-2 text-brand"></i>近7天订单趋势</h3>
          <canvas id="chartOrders" height="120"></canvas>
        </div>
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-chart-pie mr-2 text-brand"></i>文章分类分布</h3>
          <canvas id="chartCategory" height="120"></canvas>
        </div>
        <div class="glass-card p-6">
          <h3 class="font-bold mb-4"><i class="fa-solid fa-chart-pie mr-2 text-brand"></i>订单状态分布</h3>
          <canvas id="chartOrderStatus" height="120"></canvas>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <a href="#/news-admin" class="glass-card p-6 text-center hover-lift"><i class="fa-solid fa-newspaper text-3xl text-brand mb-2"></i><div>资讯管理</div></a>
        <button onclick="App.Pages.Admin.manage('users')" class="glass-card p-6 text-center hover-lift"><i class="fa-solid fa-users text-3xl text-green-500 mb-2"></i><div>用户管理</div></button>
        <button onclick="App.Pages.Admin.manage('orders')" class="glass-card p-6 text-center hover-lift"><i class="fa-solid fa-bag-shopping text-3xl text-purple-500 mb-2"></i><div>订单管理</div></button>
        <button onclick="App.Pages.Admin.manage('messages')" class="glass-card p-6 text-center hover-lift"><i class="fa-solid fa-comment text-3xl text-red-500 mb-2"></i><div>留言管理</div></button>
        <button onclick="App.Pages.Admin.config()" class="glass-card p-6 text-center hover-lift"><i class="fa-solid fa-gear text-3xl text-cyan-500 mb-2"></i><div>站点配置</div></button>
      </div>

      <!-- 通用管理表格容器 -->
      <div id="adminTable" class="mt-6"></div>
    </div>`;
  },

  _kpi(icon, label, value, color) {
    return `<div class="glass-card p-4" data-aos="zoom-in">
      <div class="flex items-center justify-between">
        <div><div class="text-xs text-slate-400">${label}</div><div class="text-2xl font-bold mt-1">${value}</div></div>
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${color}15;color:${color}"><i class="fa-solid ${icon}"></i></div>
      </div>
    </div>`;
  },

  /* 图表初始化 */
  initCharts(stats) {
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand-color').trim() || '#3373ff';
    const textColor = document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';
    const gridColor = document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0';

    // 访问趋势（折线图）
    new Chart(document.getElementById('chartVisits'), {
      type: 'line',
      data: { labels: ['周一','周二','周三','周四','周五','周六','周日'], datasets: [{ label:'访问量', data: stats.weeklyVisits||[0,0,0,0,0,0,0], borderColor: brand, backgroundColor: brand+'20', fill:true, tension:0.4 }] },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{color:textColor},grid:{color:gridColor}},x:{ticks:{color:textColor},grid:{display:false}}} }
    });
    // 订单趋势（柱状图）
    new Chart(document.getElementById('chartOrders'), {
      type: 'bar',
      data: { labels: ['周一','周二','周三','周四','周五','周六','周日'], datasets: [{ label:'订单', data: stats.weeklyOrders||[0,0,0,0,0,0,0], backgroundColor: '#22c55e', borderRadius:6 }] },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{color:textColor},grid:{color:gridColor}},x:{ticks:{color:textColor},grid:{display:false}}} }
    });
    // 文章分类（饼图）
    const catData = stats.articleCategoryDist || {};
    new Chart(document.getElementById('chartCategory'), {
      type: 'doughnut',
      data: { labels: Object.keys(catData), datasets: [{ data: Object.values(catData), backgroundColor:['#3373ff','#22c55e','#f59e0b','#ef4444','#8b5cf6'] }] },
      options: { responsive:true, plugins:{legend:{position:'right',labels:{color:textColor}}} }
    });
    // 订单状态（饼图）
    const statusData = stats.orderStatusDist || [];
    new Chart(document.getElementById('chartOrderStatus'), {
      type: 'pie',
      data: { labels: (statusData||[]).map(s=>s.name), datasets: [{ data: (statusData||[]).map(s=>s.value), backgroundColor:['#22c55e','#f59e0b','#ef4444'] }] },
      options: { responsive:true, plugins:{legend:{position:'right',labels:{color:textColor}}} }
    });
  },

  /* ===== 通用管理表格 ===== */
  async manage(type) {
    const container = document.getElementById('adminTable');
    if (!container) return;
    container.innerHTML = `<div class="glass-card p-6"><div class="loader-circle mx-auto"></div></div>`;
    let list = [];
    try {
      if (type === 'users') list = (await App.API.getUsers()).rows || [];
      else if (type === 'orders') list = (await App.API.getOrders()).rows || [];
      else if (type === 'messages') list = (await App.API.getMessages()).rows || [];
    } catch(e) {}

    const titles = { users:'用户管理', orders:'订单管理', messages:'留言管理' };
    let html = `<div class="glass-card p-6"><h3 class="font-bold mb-4"><i class="fa-solid fa-table mr-2 text-brand"></i>${titles[type]}</h3>`;

    if (type === 'users') {
      html += `<div class="overflow-x-auto"><table class="data-table"><thead><tr><th>用户名</th><th>邮箱</th><th>手机</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>`;
      list.forEach(u => { html += `<tr>
        <td class="font-medium">${App.Utils.escape(u.username)}</td><td>${App.Utils.escape(u.email||'')}</td><td>${App.Utils.escape(u.phone||'')}</td>
        <td><span class="badge ${u.role==='admin'?'badge-red':u.role==='vip'?'badge-orange':'badge-brand'}">${App.Config.roles[u.role]?.name||u.role}</span></td>
        <td><span class="badge ${u.status==='active'?'badge-green':'badge-gray'}">${u.status==='active'?'正常':'禁用'}</span></td>
        <td class="text-xs text-slate-400">${App.Utils.formatDate(u.createdAt)}</td>
        <td><button class="btn-ghost btn-sm mr-1" onclick="App.Pages.Admin.editUser('${u.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-danger btn-sm" onclick="App.Pages.Admin.del('${u.id}','users')"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`; });
      html += `</tbody></table></div>`;
    }
    if (type === 'orders') {
      html += `<div class="overflow-x-auto"><table class="data-table"><thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>`;
      list.forEach(o => { html += `<tr>
        <td class="font-mono text-xs">${o.id}</td><td>${o.items.map(i=>App.Utils.escape(i.name)).join('<br>')}</td>
        <td class="text-brand font-semibold">${App.Utils.formatMoney(o.total)}</td>
        <td><span class="badge ${o.status==='已完成'?'badge-green':o.status==='处理中'?'badge-orange':'badge-red'}">${o.status}</span></td>
        <td class="text-xs text-slate-400">${App.Utils.formatDate(o.createdAt)}</td>
        <td><button class="btn-ghost btn-sm" onclick="App.Pages.Admin.editOrder('${o.id}')"><i class="fa-solid fa-pen"></i></button></td>
      </tr>`; });
      html += `</tbody></table></div>`;
    }
    if (type === 'messages') {
      html += `<div class="overflow-x-auto"><table class="data-table"><thead><tr><th>姓名</th><th>联系方式</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>`;
      list.forEach(m => { html += `<tr>
        <td class="font-medium">${App.Utils.escape(m.name)}</td><td>${App.Utils.escape(m.phone)}<br><span class="text-xs text-slate-400">${App.Utils.escape(m.email||'')}</span></td>
        <td class="max-w-xs truncate">${App.Utils.escape(m.content)}</td>
        <td><span class="badge ${m.status==='已回复'?'badge-green':'badge-orange'}">${m.status}</span></td>
        <td class="text-xs text-slate-400">${App.Utils.formatDate(m.createdAt)}</td>
        <td><button class="btn-ghost btn-sm" onclick="App.Pages.Admin.replyMsg('${m.id}')"><i class="fa-solid fa-reply"></i></button><button class="btn-danger btn-sm" onclick="App.Pages.Admin.del('${m.id}','messages')"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`; });
      html += `</tbody></table></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
  },

  async editUser(id) {
    let users = (await App.API.getUsers()).rows||[];
    const u = users.find(x=>x.id===id); if(!u) return;
    App.Utils.modal({
      title:'编辑用户', confirmText:'保存',
      content:`<div class="space-y-3">
        <div><label class="form-label">用户名</label><input class="form-input" id="u-username" value="${App.Utils.escape(u.username)}"></div>
        <div><label class="form-label">邮箱</label><input class="form-input" id="u-email" value="${App.Utils.escape(u.email||'')}"></div>
        <div><label class="form-label">手机</label><input class="form-input" id="u-phone" value="${App.Utils.escape(u.phone||'')}"></div>
        <div><label class="form-label">角色</label><select class="form-select" id="u-role">${['user','vip','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${App.Config.roles[r].name}</option>`).join('')}</select></div>
        <div><label class="form-label">状态</label><select class="form-select" id="u-status"><option value="active" ${u.status==='active'?'selected':''}>正常</option><option value="disabled" ${u.status==='disabled'?'selected':''}>禁用</option></select></div>
      </div>`,
      onConfirm: async (close)=>{ try{ await App.API.saveUser({id, username:document.getElementById('u-username').value, email:document.getElementById('u-email').value, phone:document.getElementById('u-phone').value, role:document.getElementById('u-role').value, status:document.getElementById('u-status').value}); App.Utils.toast('已更新','success'); close(); App.Pages.Admin.manage('users'); }catch(e){App.Utils.toast('失败','error');} }
    });
  },
  async editOrder(id) {
    let orders = (await App.API.getOrders()).rows||[];
    const o = orders.find(x=>x.id===id); if(!o) return;
    App.Utils.modal({
      title:'修改订单状态', confirmText:'保存',
      content:`<div><label class="form-label">订单号</label><input class="form-input" value="${o.id}" disabled><div class="mt-3"><label class="form-label">状态</label><select class="form-select" id="o-status">${['待付款','处理中','已完成','已取消'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></div></div>`,
      onConfirm: async (close)=>{ try{ await App.API.saveOrder({id, status:document.getElementById('o-status').value}); App.Utils.toast('已更新','success'); close(); App.Pages.Admin.manage('orders'); }catch(e){App.Utils.toast('失败','error');} }
    });
  },
  async replyMsg(id) {
    let msgs = (await App.API.getMessages()).rows||[];
    const m = msgs.find(x=>x.id===id); if(!m) return;
    App.Utils.modal({
      title:'回复留言', confirmText:'回复',
      content:`<div class="space-y-2"><div class="text-sm text-slate-500">${App.Utils.escape(m.name)}：${App.Utils.escape(m.content)}</div><textarea class="form-textarea" id="m-reply" rows="3" placeholder="输入回复内容...">${App.Utils.escape(m.reply||'')}</textarea></div>`,
      onConfirm: async (close)=>{ const r=document.getElementById('m-reply').value.trim(); if(!r){App.Utils.toast('请输入回复','error');return;} try{ await App.API.replyMessage(id,r); App.Utils.toast('已回复','success'); close(); App.Pages.Admin.manage('messages'); }catch(e){App.Utils.toast('失败','error');} }
    });
  },
  async del(id, type) {
    const ok = await App.Utils.confirm('确定删除该记录吗？'); if(!ok) return;
    try { await App.API['delete'+type.charAt(0).toUpperCase()+type.slice(1)](id); App.Utils.toast('已删除','success'); this.manage(type); } catch(e){ App.Utils.toast('删除失败','error'); }
  },

  /* ===== 站点配置 ===== */
  async config() {
    let cfg = App.Config.site;
    try { cfg = Object.assign({}, cfg, await App.API.getConfig()); } catch(e) {}
    App.Utils.modal({
      title:'站点配置', confirmText:'保存',
      content:`<div class="space-y-3">
        <div><label class="form-label">站点名称</label><input class="form-input" id="c-siteName" value="${App.Utils.escape(cfg.siteName||'')}"></div>
        <div><label class="form-label">Logo文字</label><input class="form-input" id="c-logo" value="${App.Utils.escape(cfg.logo||'')}"></div>
        <div><label class="form-label">标语</label><input class="form-input" id="c-slogan" value="${App.Utils.escape(cfg.slogan||'')}"></div>
        <div><label class="form-label">客服电话</label><input class="form-input" id="c-phone" value="${App.Utils.escape(cfg.phone||'')}"></div>
        <div><label class="form-label">联系邮箱</label><input class="form-input" id="c-email" value="${App.Utils.escape(cfg.email||'')}"></div>
        <div><label class="form-label">地址</label><input class="form-input" id="c-address" value="${App.Utils.escape(cfg.address||'')}"></div>
        <div><label class="form-label">备案号</label><input class="form-input" id="c-icp" value="${App.Utils.escape(cfg.icp||'')}"></div>
      </div>`,
      onConfirm: async (close)=>{ const data={ siteName:document.getElementById('c-siteName').value, logo:document.getElementById('c-logo').value, slogan:document.getElementById('c-slogan').value, phone:document.getElementById('c-phone').value, email:document.getElementById('c-email').value, address:document.getElementById('c-address').value, icp:document.getElementById('c-icp').value }; try{ await App.API.saveConfig(data); Object.assign(App.Config.site,data); App.Components.renderNavbar(); App.Components.renderFooter(); App.Utils.toast('配置已保存','success'); close(); }catch(e){App.Utils.toast('保存失败','error');} }
    });
  },

  /* afterRender：初始化图表 */
  async afterRender() {
    const path = App.Router.parse().path;
    if (path === '/admin') {
      let stats = {};
      try { stats = await App.API.getStats(); } catch(e) {}
      // 确保 Chart 已加载
      if (window.Chart) this.initCharts(stats);
    }
  }
};
