/* ===================================================================
 * api.js - 数据接口封装层
 * 策略：优先调用后端 API（http://localhost:3000/api）；
 *       后端不可用时，自动降级为本地 JSON 数据（前端 fetch 本地文件）。
 *       实现前端可独立运行（file:// 协议双击即开），也可配合后端运行。
 * =================================================================== */
window.App = window.App || {};

App.API = {
  /* 后端是否可用（启动时检测一次） */
  _backendOnline: null,

  /* 检测后端是否在线 */
  async checkBackend() {
    if (this._backendOnline !== null) return this._backendOnline;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(App.Config.apiBase + '/config', { signal: ctrl.signal });
      clearTimeout(t);
      // 不仅检查 res.ok，还要检查返回的是 JSON（GitHub Pages 会对不存在路径返回 200 + HTML）
      const contentType = res.headers.get('content-type') || '';
      this._backendOnline = res.ok && contentType.includes('application/json');
    } catch (e) {
      this._backendOnline = false;
    }
    if (!this._backendOnline) console.warn('[API] 后端未启动，降级为本地 JSON 数据模式');
    return this._backendOnline;
  },

  /* 本地 JSON 数据缓存 */
  _localDB: null,
  async _loadLocal() {
    if (this._localDB) return this._localDB;
    try {
      const res = await fetch('server/data/db.json');
      this._localDB = await res.json();
    } catch (e) {
      // file:// 协议下 fetch 可能失败，用内置兜底数据
      this._localDB = this._fallbackDB();
    }
    return this._localDB;
  },
  /* file:// 协议兜底数据（极简版，保证离线可看） */
  _fallbackDB() {
    return {
      users: [{ id:'u1', username:'admin', password:'123456', email:'admin@portal.com', role:'admin', vip:true, phone:'13800000000', avatar:'' }],
      articles: [], products: [], orders: [], messages: [], comments: [],
      categories: { article: ['行业资讯','技术分享'], product: ['云服务','AI应用'] },
      siteConfig: App.Config.site
    };
  },

  /* ===== 统一请求方法 ===== */
  async request(method, url, body) {
    const online = await this.checkBackend();
    if (online) {
      // 走后端 API
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      const token = App.Store.getToken();
      if (token) opts.headers['Authorization'] = 'Bearer ' + token;
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(App.Config.apiBase + url, opts);
      const data = await res.json();
      if (data.code !== 0 && data.code !== undefined) throw new Error(data.msg || '请求失败');
      return data.data;
    }
    // 降级：操作本地 JSON（内存数据，刷新后重置；登录态走 localStorage）
    return this._localRequest(method, url, body);
  },

  /* 本地模式 CRUD（基于内存 JSON） */
  async _localRequest(method, url, body) {
    const db = await this._loadLocal();
    // 解析 url: /articles, /articles/a1, /articles?keyword=xx
    const [path, queryStr] = url.split('?');
    const parts = path.split('/').filter(Boolean);
    const collection = parts[0];
    const id = parts[1];
    const query = {};
    if (queryStr) queryStr.split('&').forEach(p => { const [k,v] = p.split('='); query[k] = decodeURIComponent(v); });

    let list = db[collection] || [];

    if (method === 'GET' && !id) {
      // 列表 + 筛选 + 分页
      if (query.keyword) { const kw = query.keyword.toLowerCase(); list = list.filter(i => JSON.stringify(i).toLowerCase().includes(kw)); }
      if (query.category) list = list.filter(i => i.category === query.category);
      if (query.tag) list = list.filter(i => i.tags && i.tags.includes(query.tag));
      if (query.sort === 'newest') list = [...list].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
      if (query.sort === 'hottest') list = [...list].sort((a,b) => (b.views||0)-(a.views||0));
      const total = list.length;
      const page = Number(query.page || 1), pageSize = Number(query.pageSize || 10);
      const rows = list.slice((page-1)*pageSize, page*pageSize);
      return { rows, total, page, pageSize };
    }
    if (method === 'GET' && id) {
      const item = list.find(i => i.id === id);
      if (!item) throw new Error('未找到记录');
      return item;
    }
    if (method === 'POST') {
      const item = Object.assign({ id: 'l'+Date.now().toString(36), createdAt: new Date().toLocaleString('zh-CN') }, body);
      list.unshift(item); db[collection] = list;
      return item;
    }
    if (method === 'PUT' && id) {
      const idx = list.findIndex(i => i.id === id);
      if (idx === -1) throw new Error('未找到');
      list[idx] = Object.assign({}, list[idx], body);
      return list[idx];
    }
    if (method === 'DELETE' && id) {
      const idx = list.findIndex(i => i.id === id);
      if (idx > -1) list.splice(idx, 1);
      return { ok: true };
    }
    return null;
  },

  /* ===== 业务 API 封装 ===== */
  // 文章
  getArticles(params) { return this.request('GET', '/articles' + (params ? '?' + new URLSearchParams(params).toString() : '')); },
  getArticle(id) { return this.request('GET', '/articles/' + id); },
  saveArticle(data) { return this.request(data.id ? 'PUT' : 'POST', '/articles' + (data.id ? '/' + data.id : ''), data); },
  deleteArticle(id) { return this.request('DELETE', '/articles/' + id); },
  // 产品
  getProducts(params) { return this.request('GET', '/products' + (params ? '?' + new URLSearchParams(params).toString() : '')); },
  getProduct(id) { return this.request('GET', '/products/' + id); },
  saveProduct(data) { return this.request(data.id ? 'PUT' : 'POST', '/products' + (data.id ? '/' + data.id : ''), data); },
  deleteProduct(id) { return this.request('DELETE', '/products/' + id); },
  // 用户
  getUsers() { return this.request('GET', '/users'); },
  saveUser(data) { return this.request(data.id ? 'PUT' : 'POST', '/users' + (data.id ? '/' + data.id : ''), data); },
  deleteUser(id) { return this.request('DELETE', '/users/' + id); },
  // 订单
  getOrders() { return this.request('GET', '/orders'); },
  saveOrder(data) { return this.request(data.id ? 'PUT' : 'POST', '/orders' + (data.id ? '/' + data.id : ''), data); },
  deleteOrder(id) { return this.request('DELETE', '/orders/' + id); },
  // 留言
  getMessages() { return this.request('GET', '/messages'); },
  saveMessage(data) { return this.request('POST', '/messages', data); },
  replyMessage(id, reply) { return this.request('PUT', '/messages/' + id, { reply, status: '已回复' }); },
  deleteMessage(id) { return this.request('DELETE', '/messages/' + id); },
  // 评论
  getComments(targetType, targetId) {
    const params = new URLSearchParams({ targetType, targetId }).toString();
    return this.request('GET', '/comments?' + params);
  },
  addComment(data) { return this.request('POST', '/comments', data); },
  // 分类
  getCategories() { return this.request('GET', '/categories'); },
  // 统计
  getStats() { return this.request('GET', '/stats'); },
  // 站点配置
  getConfig() { return this.request('GET', '/config'); },
  saveConfig(data) { return this.request('PUT', '/config', data); },
  // 登录
  async login(username, password) {
    const online = await this.checkBackend();
    if (online) {
      const opts = { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password}) };
      const res = await fetch(App.Config.apiBase + '/login', opts);
      const data = await res.json();
      if (data.code !== 0) throw new Error(data.msg);
      return data.data;
    }
    // 本地登录
    const db = await this._loadLocal();
    const user = (db.users || []).find(u => u.username === username && u.password === password);
    if (!user) throw new Error('账号或密码错误');
    return { token: btoa(user.id + ':' + Date.now()), user: { id:user.id, username:user.username, role:user.role, vip:user.vip, email:user.email, avatar:user.avatar, phone:user.phone } };
  },
  // 文件上传（本地模式返回占位）
  async upload(file) {
    const online = await this.checkBackend();
    if (!online) return { url: URL.createObjectURL(file), originalName: file.name, size: file.size };
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(App.Config.apiBase + '/upload', { method: 'POST', body: fd });
    const data = await res.json();
    return data.data;
  }
};
