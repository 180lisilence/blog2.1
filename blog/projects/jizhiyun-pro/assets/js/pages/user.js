/* ===================================================================
 * user.js - 用户中心模块
 * 包含：登录、注册(邮箱验证码模拟)、忘记密码、个人中心(信息/头像/订单/收藏/消息/安全)
 * =================================================================== */
window.App = window.App || {};
App.Pages = App.Pages || {};

App.Pages.User = {
  /* ===== 登录页 ===== */
  login() {
    return `
    <div class="max-w-md mx-auto px-4 py-12">
      <div class="neu-card p-8" data-aos="zoom-in">
        <div class="text-center mb-6">
          <div class="w-16 h-16 rounded-2xl bg-brand text-white flex items-center justify-center mx-auto mb-3 text-2xl"><i class="fa-solid fa-right-to-bracket"></i></div>
          <h1 class="text-2xl font-bold">欢迎回来</h1>
          <p class="text-slate-500 text-sm mt-1">登录您的极智云账户</p>
        </div>
        <form id="loginForm">
          <div class="mb-4">
            <label class="form-label">账号</label>
            <input class="form-input" name="username" placeholder="请输入用户名" value="admin">
            <div class="form-error" id="err-username"></div>
          </div>
          <div class="mb-4">
            <label class="form-label">密码</label>
            <div class="relative">
              <input class="form-input pr-10" name="password" type="password" placeholder="请输入密码" value="123456" id="pwdInput">
              <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onclick="const i=document.getElementById('pwdInput');i.type=i.type==='password'?'text':'password';this.querySelector('i').className=i.type==='password'?'fa-solid fa-eye':'fa-solid fa-eye-slash'"><i class="fa-solid fa-eye"></i></button>
            </div>
            <div class="form-error" id="err-password"></div>
          </div>
          <div class="flex items-center justify-between mb-5">
            <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" name="remember" class="accent-brand-500"> 记住登录</label>
            <a href="#/forgot" class="text-sm text-brand">忘记密码？</a>
          </div>
          <button type="submit" class="btn-primary w-full py-3"><i class="fa-solid fa-right-to-bracket mr-1"></i>登 录</button>
        </form>
        <div class="text-center mt-5 text-sm text-slate-500">还没有账号？<a href="#/register" class="text-brand font-medium">立即注册</a></div>
        <div class="mt-6 p-3 neu-inset rounded-lg text-xs text-slate-400">
          <p class="font-medium text-slate-500 mb-1">演示账号：</p>
          <p>管理员：admin / 123456</p>
          <p>VIP用户：vipuser / 123456</p>
          <p>普通用户：demo / 123456</p>
        </div>
      </div>
    </div>`;
  },

  /* ===== 注册页（邮箱验证码模拟） ===== */
  register() {
    return `
    <div class="max-w-md mx-auto px-4 py-12">
      <div class="neu-card p-8" data-aos="zoom-in">
        <div class="text-center mb-6">
          <div class="w-16 h-16 rounded-2xl bg-brand text-white flex items-center justify-center mx-auto mb-3 text-2xl"><i class="fa-solid fa-user-plus"></i></div>
          <h1 class="text-2xl font-bold">创建账户</h1>
          <p class="text-slate-500 text-sm mt-1">加入极智云，开启数字化之旅</p>
        </div>
        <form id="registerForm">
          <div class="mb-4">
            <label class="form-label">用户名 <span class="text-red-500">*</span></label>
            <input class="form-input" name="username" placeholder="3-20位字符">
            <div class="form-error" id="err-username"></div>
          </div>
          <div class="mb-4">
            <label class="form-label">邮箱 <span class="text-red-500">*</span></label>
            <div class="flex gap-2">
              <input class="form-input flex-1" name="email" placeholder="请输入邮箱">
              <button type="button" class="btn-outline btn-sm whitespace-nowrap" id="sendCodeBtn" onclick="App.Pages.User.sendCode()">发送验证码</button>
            </div>
            <div class="form-error" id="err-email"></div>
          </div>
          <div class="mb-4">
            <label class="form-label">邮箱验证码 <span class="text-red-500">*</span></label>
            <input class="form-input" name="code" placeholder="请输入6位验证码">
            <div class="form-error" id="err-code"></div>
            <div class="form-hint" id="codeHint"></div>
          </div>
          <div class="mb-4">
            <label class="form-label">密码 <span class="text-red-500">*</span></label>
            <input class="form-input" name="password" type="password" placeholder="至少6位">
            <div class="form-error" id="err-password"></div>
          </div>
          <div class="mb-5">
            <label class="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="agree" class="accent-brand-500 mt-1">
              <span>我已阅读并同意<a href="#" class="text-brand">《服务协议》</a>与<a href="#" class="text-brand">《隐私政策》</a></span>
            </label>
            <div class="form-error" id="err-agree"></div>
          </div>
          <button type="submit" class="btn-primary w-full py-3"><i class="fa-solid fa-user-plus mr-1"></i>注 册</button>
        </form>
        <div class="text-center mt-5 text-sm text-slate-500">已有账号？<a href="#/login" class="text-brand font-medium">立即登录</a></div>
      </div>
    </div>`;
  },

  /* ===== 忘记密码页 ===== */
  forgot() {
    return `
    <div class="max-w-md mx-auto px-4 py-12">
      <div class="neu-card p-8" data-aos="zoom-in">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold">找回密码</h1>
          <p class="text-slate-500 text-sm mt-1">通过邮箱重置您的密码</p>
        </div>
        <form id="forgotForm">
          <div class="mb-4">
            <label class="form-label">注册邮箱</label>
            <input class="form-input" name="email" placeholder="请输入注册邮箱">
            <div class="form-error" id="err-email"></div>
          </div>
          <div class="mb-4">
            <label class="form-label">新密码</label>
            <input class="form-input" name="password" type="password" placeholder="至少6位">
            <div class="form-error" id="err-password"></div>
          </div>
          <button type="submit" class="btn-primary w-full py-3"><i class="fa-solid fa-key mr-1"></i>重置密码</button>
        </form>
        <div class="text-center mt-5"><a href="#/login" class="text-sm text-brand">← 返回登录</a></div>
      </div>
    </div>`;
  },

  /* ===== 个人中心（多 Tab） ===== */
  async profile(query) {
    if (!App.Auth.isLogin()) { App.Router.navigate('/login'); return ''; }
    const tab = (query && query.tab) || 'info';
    const user = App.Auth.currentUser();
    const cart = App.Store.getCart();
    const favs = App.Store.getFavorites();

    // 拉取我的订单
    let myOrders = [];
    try { const all = await App.API.getOrders(); myOrders = (all.rows||all).filter(o => o.userId === user.id); } catch(e) {}

    return `
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${App.Components.breadcrumb([{name:'首页',path:'/home'},{name:'个人中心',path:'/profile'}])}
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- 侧边导航 -->
        <aside class="lg:col-span-1">
          <div class="glass-card p-6 text-center mb-4">
            <div class="w-20 h-20 rounded-full bg-brand text-white flex items-center justify-center text-3xl font-bold mx-auto mb-3" id="avatarDisplay">${user.username[0].toUpperCase()}</div>
            <h3 class="font-bold">${App.Utils.escape(user.username)}</h3>
            <p class="text-xs text-slate-400 mt-1">${App.Config.roles[user.role].name}</p>
            ${user.role==='vip'||user.role==='admin' ? '<span class="badge badge-orange mt-2">VIP 会员</span>' : '<span class="badge badge-gray mt-2">普通用户</span>'}
          </div>
          <div class="glass-card p-2">
            ${this._profileTab('info','fa-user','个人信息',tab)}
            ${this._profileTab('orders','fa-bag-shopping','我的订单',tab)}
            ${this._profileTab('favorites','fa-heart','我的收藏',tab)}
            ${this._profileTab('messages','fa-bell','消息通知',tab)}
            ${this._profileTab('security','fa-shield','账户安全',tab)}
          </div>
        </aside>
        <!-- 内容区 -->
        <section class="lg:col-span-3">
          <div class="glass-card p-6">
            ${tab==='info' ? this._profileInfo(user) : ''}
            ${tab==='orders' ? this._profileOrders(myOrders) : ''}
            ${tab==='favorites' ? this._profileFavorites(favs) : ''}
            ${tab==='messages' ? this._profileMessages() : ''}
            ${tab==='security' ? this._profileSecurity(user) : ''}
          </div>
        </section>
      </div>
    </div>`;
  },

  _profileTab(key, icon, name, current) {
    return `<a href="#/profile?tab=${key}" class="flex items-center gap-3 px-4 py-3 rounded-lg ${current===key?'bg-brand text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'} transition">
      <i class="fa-solid ${icon} w-5"></i><span>${name}</span>
    </a>`;
  },
  _profileInfo(user) {
    return `<h2 class="text-xl font-bold mb-6"><i class="fa-solid fa-user mr-2 text-brand"></i>个人信息</h2>
    <form id="profileForm" class="space-y-4 max-w-lg">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-16 h-16 rounded-full bg-brand text-white flex items-center justify-center text-2xl font-bold">${user.username[0].toUpperCase()}</div>
        <div>
          <label class="btn-ghost btn-sm cursor-pointer"><i class="fa-solid fa-upload mr-1"></i>上传头像
            <input type="file" accept="image/*" class="hidden" onchange="App.Pages.User.uploadAvatar(this)">
          </label>
          <p class="text-xs text-slate-400 mt-1">支持 JPG/PNG，最大 5MB</p>
        </div>
      </div>
      <div><label class="form-label">用户名</label><input class="form-input" value="${App.Utils.escape(user.username)}" disabled></div>
      <div><label class="form-label">邮箱</label><input class="form-input" name="email" value="${App.Utils.escape(user.email||'')}"></div>
      <div><label class="form-label">手机号</label><input class="form-input" name="phone" value="${App.Utils.escape(user.phone||'')}"></div>
      <div><label class="form-label">角色</label><input class="form-input" value="${App.Config.roles[user.role].name}" disabled></div>
      <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk mr-1"></i>保存修改</button>
    </form>`;
  },
  _profileOrders(orders) {
    return `<h2 class="text-xl font-bold mb-6"><i class="fa-solid fa-bag-shopping mr-2 text-brand"></i>我的订单</h2>
    ${orders.length ? `<div class="overflow-x-auto"><table class="data-table">
      <thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
      <tbody>${orders.map(o => `<tr>
        <td class="font-mono text-xs">${o.id}</td>
        <td>${o.items.map(i=>i.name).join('<br>')}</td>
        <td class="text-brand font-semibold">${App.Utils.formatMoney(o.total)}</td>
        <td><span class="badge ${o.status==='已完成'?'badge-green':o.status==='处理中'?'badge-orange':'badge-red'}">${o.status}</span></td>
        <td class="text-xs text-slate-400">${App.Utils.formatDate(o.createdAt)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : App.Components.empty('fa-bag-shopping','暂无订单')}`;
  },
  _profileFavorites(favs) {
    return `<h2 class="text-xl font-bold mb-6"><i class="fa-solid fa-heart mr-2 text-brand"></i>我的收藏</h2>
    ${favs.length ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${favs.map(f => `
      <div class="glass-card p-4 flex justify-between items-center">
        <div><span class="badge badge-gray">${f.type==='article'?'资讯':'产品'}</span><span class="ml-2 font-medium">${f.id}</span></div>
        <a href="#/${f.type==='article'?'news-detail':'product-detail'}?id=${f.id}" class="text-brand text-sm">查看</a>
      </div>`).join('')}</div>` : App.Components.empty('fa-heart','暂无收藏')}`;
  },
  _profileMessages() {
    const msgs = [
      { title:'欢迎加入极智云', content:'感谢您注册，新用户专享优惠券已到账', time:'2026-07-20 09:30', read:false },
      { title:'系统维护通知', content:'将于2026-08-05凌晨进行系统升级维护', time:'2026-07-28 16:00', read:true },
      { title:'订单完成', content:'您的订单 ORD20260728001 已完成', time:'2026-07-28 18:23', read:true }
    ];
    return `<h2 class="text-xl font-bold mb-6"><i class="fa-solid fa-bell mr-2 text-brand"></i>消息通知</h2>
    <div class="space-y-3">${msgs.map(m => `
      <div class="glass-card p-4 ${m.read?'':'border-brand'}">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2"><h4 class="font-semibold">${m.title}</h4>${m.read?'':'<span class="badge badge-red">新</span>'}</div>
          <span class="text-xs text-slate-400">${m.time}</span>
        </div>
        <p class="text-sm text-slate-500 mt-1">${m.content}</p>
      </div>`).join('')}</div>`;
  },
  _profileSecurity(user) {
    return `<h2 class="text-xl font-bold mb-6"><i class="fa-solid fa-shield mr-2 text-brand"></i>账户安全</h2>
    <div class="space-y-4 max-w-lg">
      <div class="glass-card p-4 flex justify-between items-center">
        <div><h4 class="font-semibold">登录密码</h4><p class="text-sm text-slate-400 mt-1">建议定期更换密码</p></div>
        <button class="btn-ghost btn-sm" onclick="App.Utils.toast('请前往修改密码功能','info')">修改</button>
      </div>
      <div class="glass-card p-4 flex justify-between items-center">
        <div><h4 class="font-semibold">手机绑定</h4><p class="text-sm text-slate-400 mt-1">${user.phone||'未绑定'}</p></div>
        <button class="btn-ghost btn-sm" onclick="App.Utils.toast('演示功能','info')">更换</button>
      </div>
      <div class="glass-card p-4 flex justify-between items-center">
        <div><h4 class="font-semibold">两步验证</h4><p class="text-sm text-slate-400 mt-1">提升账户安全性</p></div>
        <label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" class="sr-only peer" onchange="App.Utils.toast('已'+(this.checked?'开启':'关闭')+'两步验证','success')"><div class="w-11 h-6 bg-slate-300 peer-checked:bg-brand rounded-full transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition peer-checked:after:translate-x-5"></div></label>
      </div>
      <div class="glass-card p-4 flex justify-between items-center border-red-200 dark:border-red-900">
        <div><h4 class="font-semibold text-red-500">注销账户</h4><p class="text-sm text-slate-400 mt-1">永久删除账户及数据</p></div>
        <button class="btn-danger btn-sm" onclick="App.Utils.confirm('确定注销账户吗？此操作不可恢复').then(ok=>{if(ok)App.Utils.toast('演示功能，无法真实注销','warning')})">注销</button>
      </div>
    </div>`;
  },

  /* ===== 注册：发送验证码（模拟） ===== */
  _sentCode: null,
  sendCode() {
    const emailInput = document.querySelector('#registerForm [name=email]');
    const errEl = document.getElementById('err-email');
    const email = emailInput.value.trim();
    const err = App.Utils.validate.required(email,'邮箱') || App.Utils.validate.email(email);
    if (err) { errEl.textContent = err; return; }
    errEl.textContent = '';
    this._sentCode = String(Math.floor(100000 + Math.random()*900000));
    document.getElementById('codeHint').textContent = '验证码已发送（模拟）：' + this._sentCode;
    App.Utils.toast('验证码已发送至邮箱', 'success');
    // 倒计时
    const btn = document.getElementById('sendCodeBtn');
    let n = 60; btn.disabled = true;
    const timer = setInterval(() => { btn.textContent = `${n}s 后重发`; n--; if (n<0){ clearInterval(timer); btn.disabled=false; btn.textContent='发送验证码'; } }, 1000);
  },

  /* 上传头像 */
  async uploadAvatar(input) {
    const file = input.files[0]; if (!file) return;
    try { const r = await App.API.upload(file); App.Auth.updateUser({ avatar: r.url }); App.Utils.toast('头像上传成功','success'); App.Router.handle(); } catch(e){ App.Utils.toast('上传失败','error'); }
  },

  /* ===== 登录表单提交（afterRender 中绑定） ===== */
  afterRender(query) {
    const path = App.Router.parse().path;
    if (path === '/login') {
      document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        let ok = true;
        const eu = App.Utils.validate.required(data.username,'用户名'); document.getElementById('err-username').textContent = eu; if(eu) ok=false;
        const ep = App.Utils.validate.required(data.password,'密码'); document.getElementById('err-password').textContent = ep; if(ep) ok=false;
        if (!ok) return;
        try {
          const user = await App.Auth.login(data.username, data.password);
          App.Utils.toast('登录成功，欢迎回来！','success');
          App.Router.navigate('/home');
        } catch (err) { App.Utils.toast(err.message,'error'); }
      });
    }
    if (path === '/register') {
      document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        let ok = true;
        const eu = App.Utils.validate.minLen(data.username,3,'用户名'); document.getElementById('err-username').textContent = eu; if(eu) ok=false;
        const ee = App.Utils.validate.email(data.email); document.getElementById('err-email').textContent = ee; if(ee) ok=false;
        if (!this._sentCode) { document.getElementById('err-code').textContent = '请先发送验证码'; ok=false; }
        else if (data.code !== this._sentCode) { document.getElementById('err-code').textContent = '验证码不正确'; ok=false; }
        else document.getElementById('err-code').textContent = '';
        const ep = App.Utils.validate.password(data.password); document.getElementById('err-password').textContent = ep; if(ep) ok=false;
        if (!data.agree) { document.getElementById('err-agree').textContent = '请同意服务协议'; ok=false; } else document.getElementById('err-agree').textContent='';
        if (!ok) return;
        try {
          await App.Auth.register(data.username, data.password, data.email);
          App.Utils.toast('注册成功，已自动登录','success');
          App.Router.navigate('/home');
        } catch (err) { App.Utils.toast(err.message,'error'); }
      });
    }
    if (path === '/forgot') {
      document.getElementById('forgotForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target); const data = Object.fromEntries(fd);
        let ok = true;
        const ee = App.Utils.validate.email(data.email); document.getElementById('err-email').textContent = ee; if(ee) ok=false;
        const ep = App.Utils.validate.password(data.password); document.getElementById('err-password').textContent = ep; if(ep) ok=false;
        if (ok) { App.Utils.toast('密码已重置，请重新登录','success'); App.Router.navigate('/login'); }
      });
    }
    if (path === '/profile') {
      const form = document.getElementById('profileForm');
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form); const data = Object.fromEntries(fd);
        App.Auth.updateUser({ email: data.email, phone: data.phone });
        App.Utils.toast('信息已保存','success');
      });
    }
  }
};
