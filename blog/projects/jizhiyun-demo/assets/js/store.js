/* ===================================================================
 * store.js - 本地存储封装（localStorage）
 * 管理：用户登录态、购物车、主题设置、收藏夹等
 * =================================================================== */
window.App = window.App || {};

App.Store = {
  /* 读取（支持 JSON 自动解析） */
  get(key) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch (e) { return localStorage.getItem(key); }
  },

  /* 写入（对象自动序列化） */
  set(key, val) {
    localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
  },

  /* 删除 */
  remove(key) { localStorage.removeItem(key); },

  /* ===== 业务快捷方法 ===== */

  /* 当前登录用户 */
  getUser() { return this.get(App.Config.storageKeys.user); },
  setUser(user) { this.set(App.Config.storageKeys.user, user); },
  clearUser() { this.remove(App.Config.storageKeys.user); this.remove(App.Config.storageKeys.token); },

  /* Token */
  getToken() { return this.get(App.Config.storageKeys.token); },
  setToken(token) { this.set(App.Config.storageKeys.token, token); },

  /* 购物车 */
  getCart() { return this.get(App.Config.storageKeys.cart) || []; },
  setCart(cart) { this.set(App.Config.storageKeys.cart, cart); },
  addToCart(productId, name, price, spec, qty = 1) {
    const cart = this.getCart();
    const exist = cart.find(i => i.productId === productId && i.spec === spec);
    if (exist) exist.qty += qty;
    else cart.push({ productId, name, price, spec, qty });
    this.setCart(cart);
    return cart;
  },
  cartCount() { return this.getCart().reduce((s, i) => s + i.qty, 0); },

  /* 收藏夹 */
  getFavorites() { return this.get(App.Config.storageKeys.favorites) || []; },
  toggleFavorite(type, id) {
    const favs = this.getFavorites();
    const idx = favs.findIndex(f => f.type === type && f.id === id);
    if (idx > -1) { favs.splice(idx, 1); this.set(App.Config.storageKeys.favorites, favs); return false; }
    else { favs.push({ type, id, time: Date.now() }); this.set(App.Config.storageKeys.favorites, favs); return true; }
  },
  isFavorited(type, id) { return this.getFavorites().some(f => f.type === type && f.id === id); }
};
