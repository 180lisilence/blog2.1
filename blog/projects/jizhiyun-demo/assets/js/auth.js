/* ===================================================================
 * auth.js - 权限与登录态管理
 * 三级权限：游客(guest,0) / 普通用户(user,1) / VIP(vip,2) / 管理员(admin,9)
 * 功能：登录、注册、登出、权限校验、路由守卫
 * =================================================================== */
window.App = window.App || {};

App.Auth = {
  /* 当前用户（从 localStorage 读取） */
  currentUser() { return App.Store.getUser(); },

  /* 当前角色 */
  currentRole() {
    const u = this.currentUser();
    return u ? u.role : 'guest';
  },

  /* 是否登录 */
  isLogin() { return !!this.currentUser(); },

  /* 是否管理员 */
  isAdmin() { return this.currentRole() === 'admin'; },

  /* 是否 VIP */
  isVip() { const r = this.currentRole(); return r === 'vip' || r === 'admin'; },

  /* 权限等级数值 */
  level() { return (App.Config.roles[this.currentRole()] || {}).level || 0; },

  /* 校验是否具备某角色权限（路由守卫用） */
  require(minRole) {
    const need = (App.Config.roles[minRole] || {}).level || 0;
    if (this.level() < need) {
      App.Utils.toast('权限不足，请先登录' + (need > 1 ? '或升级会员' : ''), 'warning');
      App.Router.navigate('/login');
      return false;
    }
    return true;
  },

  /* 登录（调用 API） */
  async login(username, password) {
    const data = await App.API.login(username, password);
    App.Store.setUser(data.user);
    App.Store.setToken(data.token);
    App.Components.renderNavbar(); // 刷新导航登录态
    return data.user;
  },

  /* 注册（本地模式写入内存 + localStorage） */
  async register(username, password, email) {
    const online = await App.API.checkBackend();
    if (online) {
      const user = await App.API.saveUser({ username, password, email, role: 'user', vip: false, status: 'active', avatar: '' });
      await this.login(username, password);
      return user;
    }
    // 本地注册
    const user = { id: 'u' + Date.now(), username, password, email, role: 'user', vip: false, status: 'active', avatar: '', createdAt: new Date().toLocaleString('zh-CN') };
    const db = await App.API._loadLocal();
    db.users = db.users || [];
    if (db.users.some(u => u.username === username)) throw new Error('用户名已存在');
    db.users.push(user);
    App.Store.setUser({ id: user.id, username: user.username, role: user.role, vip: user.vip, email: user.email });
    App.Store.setToken(btoa(user.id + ':' + Date.now()));
    App.Components.renderNavbar();
    return user;
  },

  /* 登出 */
  logout() {
    App.Store.clearUser();
    App.Components.renderNavbar();
    App.Utils.toast('已退出登录', 'info');
    App.Router.navigate('/home');
  },

  /* 更新用户信息 */
  updateUser(patch) {
    const u = Object.assign({}, this.currentUser(), patch);
    App.Store.setUser(u);
    App.Components.renderNavbar();
  }
};
