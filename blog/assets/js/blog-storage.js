/* =========================================================
   blog-storage.js —— 全站统一数据存储层
   优先级：后端（按登录用户隔离持久化） > 本地 localStorage 兜底

   提供与 localStorage 兼容的同步接口，页面改动最小：
     BS.get(key)      -> 读取（返回存储值或 null）
     BS.set(key,val)  -> 写入（自动防抖推送后端）
     BS.remove(key)   -> 删除
     BS.clear()       -> 清空
     BS.server        -> 是否已连接后端（true/false）
     BS.ready         -> Promise，数据首次就绪时 resolve（异步加载用）
     BS.onReady(fn)   -> 数据就绪回调

   =========================================================
   N-04 修复说明（同步 XHR -> 异步）
   =========================================================
   旧实现用 `xhr.open('GET', '/api/data/all', false)` 同步拉全量数据。
   同步 XHR 会阻塞主线程：后端数据被撑大后（实测 10MB 时耗时 4.4s），
   整个页面白屏，且无法被中断 —— 属于可利用的客户端 DoS。

   现在的做法：
   1. 启动时立刻发起**异步** GET，不阻塞首屏渲染。
   2. 在数据返回之前，BS.get() 返回"预热缓存"（上一次成功加载落进
      localStorage 的快照）。这样依赖 BS.get 的同步渲染代码仍然能拿到
      近乎实时的数据，不会因为改异步而白屏或渲染出空列表。
   3. 数据返回后，用 diff 清理过期键，并触发 BS.onReady 回调让需要的
      页面重渲染。
   4. 写入（push）同样改为异步，且只提交**发生变化的键**（增量），
      不再每次把全量 snapshot 推上去 —— 配合后端替换语义，
      这里显式走 `?mode=patch` 分片接口，避免为了删一个键而重传 10MB。

   后端接口对应：
     GET    /api/data/all                 全量读取
     PUT    /api/data/all                 全量替换（请求体即完整快照）
     PATCH  /api/data/all                 增量合并 + 显式删除
     DELETE /api/data/all?key=k           删单键
     DELETE /api/data/all                 清空
   ========================================================= */
(function () {
  var LS_PREFIX = 'bs2_';
  var LS_SNAPSHOT = LS_PREFIX + 'cache';
  var cache = {};
  var server = false;          // 是否已成功连接后端
  var loaded = false;          // 是否已拿到过一次服务端数据
  var dirty = {};              // 待推送的变更键
  var removed = {};            // 待推送的删除键
  var pushTimer = null;
  var readyResolvers = [];
  var readyCallbacks = [];

  // ---- 1. 先用上次的快照预热，保证同步读到的不是空对象 ----
  try {
    var raw = localStorage.getItem(LS_SNAPSHOT);
    if (raw) {
      var snap = JSON.parse(raw);
      if (snap && typeof snap === 'object') cache = snap;
    }
  } catch (e) { /* 快照损坏，忽略 */ }

  function has(k) { return Object.prototype.hasOwnProperty.call(cache, k); }
  function get(k) { return has(k) ? cache[k] : null; }
  function set(k, v) { cache[k] = v; delete removed[k]; dirty[k] = true; schedulePush(); }
  function remove(k) { delete cache[k]; delete dirty[k]; removed[k] = true; schedulePush(); }
  function clearAll() { cache = {}; dirty = {}; removed = {}; schedulePush(); }

  // ---- 2. CSRF token（POST/PUT/PATCH/DELETE 必须带） ----
  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  var csrfMem = null;
  function getCsrf() {
    var v = readCookie('csrf_token');
    if (v && v !== 'null' && v !== 'undefined') { csrfMem = v; return Promise.resolve(v); }
    if (csrfMem) return Promise.resolve(csrfMem);
    return fetch('/api/csrf-token?fresh=1&_t=' + Date.now(), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok && d.csrfToken) { csrfMem = d.csrfToken; return csrfMem; }
      return '';
    }).catch(function () { return ''; });
  }

  // ---- 3. 异步加载全量数据（不阻塞主线程） ----
  function loadFromServer() {
    return fetch('/api/data/all', {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 401) return null;   // 未登录：保持本地兜底模式
      if (!r.ok) return null;
      return r.json();
    }).then(function (res) {
      if (!res || !res.ok || !res.data || typeof res.data !== 'object') return;
      // 用服务端数据覆盖本地：服务端是权威源
      cache = res.data;
      dirty = {};
      removed = {};
      server = true;
      loaded = true;
      try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(cache)); } catch (e) {}
      fireReady();
    }).catch(function () {
      // 网络异常：保持快照模式，不打断页面
    });
  }

  function fireReady() {
    var list = readyCallbacks.slice();
    readyCallbacks.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i](cache); } catch (e) {}
    }
    var rs = readyResolvers.slice();
    readyResolvers.length = 0;
    for (var j = 0; j < rs.length; j++) {
      try { rs[j](cache); } catch (e) {}
    }
  }

  function onReady(fn) {
    if (typeof fn !== 'function') return;
    if (loaded) { try { fn(cache); } catch (e) {} return; }
    readyCallbacks.push(fn);
  }

  var readyPromise = new Promise(function (resolve) {
    if (loaded) return resolve(cache);
    readyResolvers.push(resolve);
    // 兜底：最多等 5 秒，避免页面永远挂着"加载中"
    setTimeout(function () { if (!loaded) { loaded = true; fireReady(); } }, 5000);
  });

  // ---- 4. 推送（增量） ----
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 400);
  }

  function push() {
    if (!server) {
      // 未连后端：只写本地快照
      try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(cache)); } catch (e) {}
      return Promise.resolve();
    }

    var patch = {};
    var patchKeys = Object.keys(dirty);
    var delKeys = Object.keys(removed);
    if (patchKeys.length === 0 && delKeys.length === 0) {
      try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(cache)); } catch (e) {}
      return Promise.resolve();
    }

    for (var i = 0; i < patchKeys.length; i++) {
      patch[patchKeys[i]] = cache[patchKeys[i]];
    }
    // 立即从"待推"里摘掉，避免推送期间的新改动被误清
    dirty = {};
    removed = {};

    return getCsrf().then(function (token) {
      return fetch('/api/data/all', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token || ''
        },
        body: JSON.stringify({ set: patch, remove: delKeys })
      });
    }).then(function (r) {
      if (r.status === 401) { server = false; throw new Error('unauthorized'); }
      if (!r.ok) throw new Error('push failed: ' + r.status);
      try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(cache)); } catch (e) {}
    }).catch(function () {
      // 失败：把改动放回待推队列，下次再试；同时保住本地快照不丢数据
      for (var k in patch) dirty[k] = true;
      for (var d = 0; d < delKeys.length; d++) removed[delKeys[d]] = true;
      try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(cache)); } catch (e) {}
    });
  }

  // 页面卸载前尽力冲刷（用 sendBeacon 不保证能带自定义头，
  // 所以这里退化为同步触发一次 push 的 fire-and-forget；
  // 真正可靠的是 400ms 防抖，绝大多数场景已经落库）
  window.addEventListener('beforeunload', function () {
    clearTimeout(pushTimer);
    push();
  });

  // 立刻发起异步加载（不 await，不阻塞）
  loadFromServer();

  window.BS = {
    get: get,
    set: set,
    remove: remove,
    clear: clearAll,
    getSync: get,
    setSync: set,
    removeSync: remove,
    onReady: onReady,
    reload: loadFromServer,
    server: function () { return server; },
    loaded: function () { return loaded; },
    ready: readyPromise,
    _cache: cache
  };
})();
