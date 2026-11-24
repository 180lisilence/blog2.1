/* ============================================================
 * DeepSeek Chat Harness —— 引导层
 * ------------------------------------------------------------
 * 这个文件是整个 Harness 在 inject\ 根目录的唯一入口。
 *
 * 设计约束：nativefier 的 preload 会把这个目录下所有 *.js 挨个 require，
 * 而 require 是在 DOMContentLoaded 时同步跑的 —— 这里一旦抛异常，
 * 后面所有脚本都不会执行，而且异常会顺着 preload 冒到主进程。
 *
 * 所以本文件遵循一条纪律：
 *   **任何一步失败，都只损失那一步，绝不允许波及 core.boot()。**
 * 每个拦截器各自独立 try/catch，boot() 放在最后且自己再包一层。
 * ============================================================ */
(function () {
    'use strict';

    var TAG = '[DSH:bootstrap]';

    if (window.__DSH_BOOTED__) return;
    window.__DSH_BOOTED__ = true;

    /* 最早拿到的、还没被我们污染的 console.error，用来报告自己的失败 */
    var rawError = (function () {
        try { return console.error.bind(console); } catch (e) { return function () {}; }
    })();

    /** 单独隔离一个初始化步骤：它炸了不影响其它步骤 */
    function step(name, fn) {
        try {
            fn();
        } catch (e) {
            try { rawError(TAG, '拦截器安装失败（已跳过）: ' + name, e); } catch (e2) {}
        }
    }

    /* ---------- 要屏蔽的遥测域名 ---------- */
    var BLOCK_HOSTS = ['hif-dliq.deepseek.com'];

    function shouldBlock(url) {
        if (!url) return false;
        url = String(url);
        for (var i = 0; i < BLOCK_HOSTS.length; i++) {
            if (url.indexOf(BLOCK_HOSTS[i]) >= 0) return true;
        }
        return false;
    }

    /* ---------- 1. 拦截 fetch ---------- */
    step('fetch', function () {
        var origFetch = window.fetch;
        if (typeof origFetch !== 'function') return;
        window.fetch = function (input) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (shouldBlock(url)) {
                // 返回一个空 200，让页面自己的 .then 链照常走完，不产生网络错误
                if (typeof Response === 'function') {
                    return Promise.resolve(new Response('', {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
            }
            return origFetch.apply(this, arguments);
        };
    });

    /* ---------- 2. 拦截 XMLHttpRequest ----------
     * 必须做 typeof 守卫：jsdom 测试环境 / 极简 WebView 里这个全局可能不存在，
     * 裸引用会抛 ReferenceError。
     * （历史事故：这一行曾经在 IIFE 顶层裸引用，导致整个 bootstrap 挂掉、
     *   core.boot() 根本执行不到，冒烟测试全红。） */
    step('XMLHttpRequest', function () {
        if (typeof XMLHttpRequest === 'undefined' || !XMLHttpRequest.prototype) return;
        var origXhrOpen = XMLHttpRequest.prototype.open;

        XMLHttpRequest.prototype.open = function (method, url) {
            var self = this;
            var blocked = shouldBlock(url);
            var origSend = this.send;

            this.send = function () {
                if (blocked) {
                    // 模拟一个成功响应，完全不走网络
                    setTimeout(function () {
                        try {
                            Object.defineProperty(self, 'readyState', { value: 4 });
                            Object.defineProperty(self, 'status', { value: 200 });
                            Object.defineProperty(self, 'responseText', { value: '{}' });
                            Object.defineProperty(self, 'response', { value: '{}' });
                            if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
                            if (typeof self.onload === 'function') self.onload();
                        } catch (e) {}
                    }, 0);
                    return;
                }
                return origSend.apply(self, arguments);
            };
            return origXhrOpen.apply(this, arguments);
        };
    });

    /* ---------- 3. 过滤 console.error（兜底降噪） ---------- */
    step('console.error', function () {
        var origError = console.error.bind(console);
        console.error = function () {
            var args = Array.prototype.slice.call(arguments);
            var msg = args.map(function (a) {
                try { return typeof a === 'string' ? a : (a && a.message) || ''; } catch (e) { return ''; }
            }).join(' ');
            if (/hif-dliq|source map|preload\.js\.map/.test(msg)) return;
            origError.apply(console, args);
        };
    });

    /* ---------- 4. 启动内核 ----------
     * 这一步永远会被执行到，不受上面任何拦截器成败影响。 */
    try {
        require('./_core/index.js').boot();
    } catch (e) {
        try { rawError(TAG, 'harness 启动失败', e); } catch (e2) {}
    }
})();
