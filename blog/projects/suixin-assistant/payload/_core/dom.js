/* ============================================================
 * Harness 内核 —— DOM 工具
 * ------------------------------------------------------------
 * 页面是 SPA，节点会被反复重建，所以所有"找节点"的操作都要
 * 支持等待 + 保活轮询，而不是只在启动时查一次。
 * ============================================================ */
'use strict';

/** DOM 就绪后执行（body 已存在即立刻执行） */
function ready(fn) {
    if (document.body) {
        safe(fn);
    } else {
        document.addEventListener('DOMContentLoaded', function () { safe(fn); }, { once: true });
    }
}

function safe(fn) {
    try { fn(); } catch (e) { console.error('[DSH]', e); }
}

/** 安全 querySelector（选择器非法时返回 null） */
function q(sel, root) {
    try { return (root || document).querySelector(sel); } catch (e) { return null; }
}

/** 安全 querySelectorAll，返回真数组 */
function qa(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; }
}

/**
 * 等待某个选择器出现。
 * @returns 取消函数
 */
function waitFor(sel, cb, opts) {
    opts = opts || {};
    var timeout = opts.timeout === undefined ? 15000 : opts.timeout;
    var interval = opts.interval || 200;
    var started = Date.now();
    var done = false;
    var timer = null;

    function tick() {
        if (done) return;
        var el = q(sel, opts.root);
        if (el) {
            done = true;
            safe(function () { cb(el); });
            return;
        }
        if (timeout > 0 && Date.now() - started > timeout) {
            done = true;
            if (opts.onTimeout) safe(opts.onTimeout);
            return;
        }
        timer = setTimeout(tick, interval);
    }
    tick();

    return function cancel() {
        done = true;
        if (timer) clearTimeout(timer);
    };
}

/**
 * 监听 body 变化（防抖），用于 SPA 重渲染后的保活。
 * @returns 停止函数
 */
function keepAlive(fn, opts) {
    opts = opts || {};
    var debounce = opts.debounce || 250;
    var target = opts.target || document.body || document.documentElement;
    var timer = null;
    var mo = new MutationObserver(function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { safe(fn); }, debounce);
    });
    try {
        mo.observe(target, {
            childList: true,
            subtree: true,
            attributes: !!opts.attributes,
            attributeFilter: opts.attributeFilter
        });
    } catch (e) {}
    return function stop() {
        if (timer) clearTimeout(timer);
        try { mo.disconnect(); } catch (e) {}
    };
}

/** 监听某个属性（例如 body 的 class，用于明暗主题切换） */
function onChange(fn, opts) {
    opts = opts || {};
    var target = opts.target || document.body;
    var mo = new MutationObserver(function () { safe(fn); });
    try {
        mo.observe(target, { attributes: true, attributeFilter: opts.attributeFilter || ['class'] });
    } catch (e) {}
    return function stop() { try { mo.disconnect(); } catch (e) {} };
}

/**
 * 找一个稳定的锚点元素，用来挂齿轮按钮。
 *
 * 这是整个 Harness 最脆弱的一环：DeepSeek 的 class 名是构建期生成的，
 * 改版就会变，所以这里不能只赌一个选择器，用四级策略依次降级，
 * 保证任何情况下都能返回一个可挂载的容器（最差是 body）。
 */
function anchor() {
    // 策略 1：找左下角的圆形小头像 img，向上爬 3 层
    var imgs = qa('img');
    for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        if (r.width < 16 || r.width > 96) continue;
        if (Math.abs(r.width - r.height) > 8) continue;
        if (r.left > 420 || r.left < 0) continue;
        if (r.top < window.innerHeight * 0.25) continue;
        var p = imgs[i].parentElement;
        for (var j = 0; j < 3 && p && p.parentElement; j++) p = p.parentElement;
        if (p) return p;
    }

    // 策略 2：class 里带 sidebar / sider / nav 的容器
    var sel = [
        '[class*="sidebar"]',
        '[class*="sider"]',
        '[class*="left-panel"]',
        '[class*="nav-panel"]',
        'aside'
    ];
    for (var k = 0; k < sel.length; k++) {
        var el2 = q(sel[k]);
        if (el2) return el2;
    }

    // 策略 3：几何特征 —— 贴着左上角、窄而高的固定宽度容器
    var divs = qa('div');
    for (var m = 0; m < divs.length; m++) {
        var rr = divs[m].getBoundingClientRect();
        if (rr.left < 10 && rr.top < 10 && rr.width > 150 && rr.width < 400 && rr.height > 400) {
            return divs[m];
        }
    }

    // 策略 4：兜底挂 body（齿轮会出现在左上角，至少功能不丢）
    return document.body;
}

/** 判断当前页面是否处在深色模式 */
function isDark() {
    if (document.body && document.body.classList.contains('dark')) return true;
    try {
        var bg = getComputedStyle(document.body).backgroundColor;
        var m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
            var lum = (parseInt(m[1], 10) * 0.299 + parseInt(m[2], 10) * 0.587 + parseInt(m[3], 10) * 0.114);
            if (lum < 128) return true;
        }
    } catch (e) {}
    return false;
}

module.exports = {
    ready: ready,
    q: q,
    qa: qa,
    waitFor: waitFor,
    keepAlive: keepAlive,
    onChange: onChange,
    anchor: anchor,
    isDark: isDark
};
