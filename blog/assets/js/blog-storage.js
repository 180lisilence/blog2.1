/* =========================================================
   blog-storage.js —— 全站统一数据存储层
   优先级：后端（按登录用户隔离持久化） > 本地 localStorage 兜底
   提供与 localStorage 兼容的同步接口，页面改动最小：
     BS.get(key)      -> 读取（返回存储值或 null）
     BS.set(key,val)  -> 写入（自动防抖推送后端）
     BS.remove(key)   -> 删除
     BS.server        -> 是否已连接后端（true/false）
   用法：在页面 <head> 靠前引入本脚本，即可同步读写。
   ========================================================= */
(function () {
  var LS_PREFIX = 'bs2_';
  var cache = {};
  var server = false;
  var pushTimer = null;

  // 启动时同步预加载：优先从后端拉当前登录用户数据
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/data/all', false); // 同步：保证后续脚本能立即读到数据
    xhr.send();
    if (xhr.status === 200) {
      var res = JSON.parse(xhr.responseText);
      if (res && res.ok && res.data && typeof res.data === 'object') {
        cache = res.data;
        server = true;
      }
    }
  } catch (e) {}

  // 后端不可用时回退 localStorage
  if (!server) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + 'cache');
      if (raw) { cache = JSON.parse(raw) || {}; }
    } catch (e) {}
  }

  function has(k) { return Object.prototype.hasOwnProperty.call(cache, k); }

  function get(k) { return has(k) ? cache[k] : null; }

  function set(k, v) { cache[k] = v; schedulePush(); }

  function remove(k) { delete cache[k]; schedulePush(); }

  function clear() { cache = {}; schedulePush(); }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 400);
  }

  // 防抖整体推送
  function push() {
    if (server) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/data/all', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ data: cache }));
        if (xhr.status === 200) return; // 后端保存成功
      } catch (e) { /* 失败则落到本地 */ }
    }
    try { localStorage.setItem(LS_PREFIX + 'cache', JSON.stringify(cache)); }
    catch (e) {}
  }

  // 页面卸载前立即落盘，避免丢失最后一次修改
  window.addEventListener('beforeunload', function () {
    clearTimeout(pushTimer);
    push();
  });

  window.BS = {
    get: get,
    set: set,
    remove: remove,
    clear: clear,
    getSync: get,
    setSync: set,
    removeSync: remove,
    server: server,
    loaded: true,
    _cache: cache
  };
})();
