/* ============================================================
 * 启动动画插件 —— 逻辑
 * ------------------------------------------------------------
 * 从旧版 inject/splash.js 移植而来，行为保持一致：
 *   - Logo 从插件目录的 logo.svg 读取（不再把官方 SVG 硬编码进代码）
 *   - 本次会话只播一次（sessionStorage）
 *   - 等 #root 有内容才收，最短 1.2s / 最长兜底 4s
 * ============================================================ */
'use strict';

var ctx = null;
var store = null;
var logoText = null;      // logo.svg 内容，null = 还没读
var timers = [];
var finished = false;

var SHOWN_KEY = '__dsh_splash_shown__';
var LEGACY_KEY = '__ds_splash_v3__';

/* ---------- 工具 ---------- */
function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    timers = [];
}

function later(fn, ms) {
    var t = setTimeout(fn, ms);
    timers.push(t);
    return t;
}

function every(fn, ms) {
    var t = setInterval(fn, ms);
    timers.push(t);
    return t;
}

function readLogo() {
    if (logoText !== null) return logoText;
    logoText = '';
    try {
        var p = ctx.path.join(ctx.dir, 'logo.svg');
        if (ctx.fs.existsSync(p)) logoText = ctx.fs.readFileSync(p, 'utf8');
    } catch (e) { ctx.log('读取 logo.svg 失败', e); }
    if (!logoText) ctx.log('未找到 logo.svg，将使用文字模式');
    return logoText;
}

/* 从旧版配置迁移一次（老用户的无感升级） */
function migrateLegacy() {
    try {
        var raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) return;
        var old = JSON.parse(raw);
        var patch = {};
        ['enabled', 'style', 'minDuration', 'maxDuration', 'fadeOut', 'accent', 'text'].forEach(function (k) {
            if (old[k] !== undefined) patch[k] = old[k];
        });
        store.patch(patch);
        ctx.log('已从旧版配置迁移', patch);
    } catch (e) {}
}

/* ---------- 播放 ---------- */
function teardown(reason) {
    if (finished) return;
    finished = true;
    clearTimers();
    var el = document.getElementById('__dsh_splash__');
    if (!el) return;
    el.classList.add('dsh-fade-out');
    var fade = store.get('fadeOut') || 400;
    later(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, fade);
    ctx.log('启动动画结束', reason);
}

function play(force) {
    var cfg = store.all();
    if (!force && !cfg.enabled) return;

    if (!force) {
        try {
            if (sessionStorage.getItem(SHOWN_KEY) === '1') return;
            sessionStorage.setItem(SHOWN_KEY, '1');
        } catch (e) {}
    }

    var old = document.getElementById('__dsh_splash__');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    clearTimers();
    finished = false;

    var svg = readLogo();
    var el = document.createElement('div');
    el.id = '__dsh_splash__';
    el.className = 'dsh-style-' + (cfg.style || 'breathe') + (svg ? '' : ' dsh-no-logo');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="dsh-splash-logo" data-text="' + escapeAttr(cfg.text || 'D') + '">' + svg + '</div>';

    document.documentElement.style.setProperty('--dsh-splash-accent', cfg.accent || '#4D6BFE');
    document.body.appendChild(el);

    var start = Date.now();
    var minD = cfg.minDuration || 1200;
    var maxD = cfg.maxDuration || 4000;

    function ready() {
        var root = document.getElementById('root');
        if (root && root.children.length > 0) {
            var wait = Math.max(0, minD - (Date.now() - start));
            later(function () { teardown('页面就绪'); }, wait);
            return true;
        }
        return false;
    }

    if (!ready()) every(ready, 100);
    later(function () { teardown('兜底超时'); }, maxD);
}

function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
}

/* ---------- 设置面板 ---------- */
function settings(c) {
    var ui = c.ui;
    var cfg = c.config;
    var wrap = ui.el('div');

    var s1 = ui.section('启动动画');
    s1.add(ui.toggle({
        label: '启用动画', value: cfg.get('enabled'),
        onChange: function (v) { cfg.set('enabled', v); }
    }));
    s1.add(ui.select({
        label: '动画风格', value: cfg.get('style'),
        options: [
            { value: 'breathe', label: '呼吸' },
            { value: 'spin', label: '旋转' },
            { value: 'bounce', label: '弹跳' },
            { value: 'text', label: '纯文字' }
        ],
        onChange: function (v) { cfg.set('style', v); }
    }));
    s1.add(ui.color({
        label: '主题色', value: cfg.get('accent'),
        onInput: function (v) { cfg.set('accent', v); },
        onReset: function () { cfg.set('accent', '#4D6BFE'); }
    }));
    s1.add(ui.slider({
        label: '最短展示', min: 500, max: 3000, step: 100, value: cfg.get('minDuration'),
        format: function (v) { return v + 'ms'; },
        onInput: function (v) { cfg.set('minDuration', v); }
    }));
    s1.add(ui.slider({
        label: '最长兜底', min: 1500, max: 8000, step: 500, value: cfg.get('maxDuration'),
        format: function (v) { return v + 'ms'; },
        onInput: function (v) { cfg.set('maxDuration', v); }
    }));
    wrap.appendChild(s1.el);

    var s2 = ui.section('Logo');
    if (readLogo()) {
        s2.add(ui.note('当前使用的 Logo 来自 <code>plugins/splash/logo.svg</code>，换掉这个文件再重启即可更换。'));
    } else {
        s2.add(ui.note('没找到 <code>plugins/splash/logo.svg</code>，现在显示文字。放一个 svg 进去再重启即可。'));
    }
    s2.add(ui.row('文字', (function () {
        var input = ui.el('input');
        input.type = 'text';
        input.value = cfg.get('text') || 'D';
        input.maxLength = 8;
        input.addEventListener('input', function () { cfg.set('text', input.value); });
        return input;
    })()));
    wrap.appendChild(s2.el);

    var actions = ui.el('div', 'dsh-actions');
    actions.appendChild(ui.button('预览动画', function () {
        c.ui.closePanel();
        later(function () { play(true); }, 250);
    }));
    wrap.appendChild(actions);

    return wrap;
}

/* ---------- 生命周期 ---------- */
function enable(c) {
    ctx = c;
    store = c.config;
    migrateLegacy();

    ctx.onCleanup(function () {
        clearTimers();
        var el = document.getElementById('__dsh_splash__');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        document.documentElement.style.removeProperty('--dsh-splash-accent');
    });

    play(false);
}

function disable() {
    ctx.log('启动动画已关闭');
}

module.exports = {
    enable: enable,
    disable: disable,
    settings: settings
};
