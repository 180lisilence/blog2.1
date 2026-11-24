/* ============================================================
 * 主题插件 —— 逻辑
 * ------------------------------------------------------------
 * 三件事：
 *   1. 壁纸：图片 → blob URL → 写在 --dsh-wall 上
 *   2. 可读性：把页面的"面"色变量（token）换成半透明
 *   3. 外观：强调色 / 圆角 / 滚动条 等 token 级覆盖
 *
 * 所有改动都记在 patched 里，禁用时逐个还原 —— 零残留。
 * ============================================================ */
'use strict';

var TOKEN_RE = /^--(dsw|ds)-/i;
var SKIP_RE = /(text|label|icon|logo|border|stroke|divider|shadow|brand|accent|link|warn|error|success|danger|info|scroll|mask|gradient|blur|font|duration|ease|transition|opacity|z-index|transform|translate|rotate|scale)/i;
var SURFACE_RE = /(bg|background|surface|panel|layer|fill|container|card|popover|modal|popup|menu|hover|active|select|sider|sidebar|header|footer|bubble|input|tooltip|code|base)/i;
var NEVER_TOUCH_RE = /(tooltip|toast|skeleton|mask|photo|scrollbar|code|button|markdown|citation|placeholder|tag|state|sidebar-width)/i;
var KNOWN_SURFACES = [
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-bg-module-platform',
    '--dsw-alias-bg-multi-select',
    '--dsw-alias-bg-overlay',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-active',
    '--dsw-alias-interactive-bg-hover-solid'
];
var ACCENT_RE = /^--(dsw|ds)-[a-z0-9-]*(brand|accent|primary)[a-z0-9-]*$/i;
var RADIUS_RE = /^--(dsw|ds)-[a-z0-9-]*(radius|rounded)[a-z0-9-]*$/i;

var ctx = null;
var store = null;
var unsubs = [];
var patched = {};
var aggressivePatched = [];
var imgCache = {};
var assetMap = null;
var verify = { name: null, status: '', text: '' };
var lastDark = null;

function toRgba(value, alpha) {
    var v = String(value || '').trim();
    var m;
    if ((m = v.match(/^#([0-9a-f]{3})$/i))) {
        var s = m[1];
        return 'rgba(' + parseInt(s[0] + s[0], 16) + ',' + parseInt(s[1] + s[1], 16) + ',' + parseInt(s[2] + s[2], 16) + ',' + alpha + ')';
    }
    if ((m = v.match(/^#([0-9a-f]{6})$/i))) {
        var h = m[1];
        return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + alpha + ')';
    }
    if ((m = v.match(/^rgba?\(([^)]+)\)$/i))) {
        var p = m[1].split(/[,\s\/]+/).filter(function (x) { return x !== ''; });
        if (p.length >= 3) return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + alpha + ')';
    }
    return null;
}

function setVar(name, value) {
    var style = document.documentElement.style;
    if (value === null || value === undefined) style.removeProperty(name);
    else style.setProperty(name, String(value));
}

function setToken(name, value) {
    var style = document.documentElement.style;
    if (value === null) {
        if (patched[name]) { style.removeProperty(name); delete patched[name]; }
        return;
    }
    style.setProperty(name, String(value), 'important');
    patched[name] = true;
}

function revertTokens() {
    var style = document.documentElement.style;
    Object.keys(patched).forEach(function (n) { style.removeProperty(n); });
    patched = {};
}

function allTokens() {
    try {
        if (window.__DSH__ && window.__DSH__.tokens) return window.__DSH__.tokens();
    } catch (e) {}
    return {};
}

function assetPath(name) {
    if (!assetMap) {
        assetMap = {};
        ctx.listAssets().forEach(function (a) { assetMap[a.name] = a.path; });
    }
    return assetMap[name] || null;
}

function mimeOf(file) {
    var ext = String(file).split('.').pop().toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'bmp') return 'image/bmp';
    if (ext === 'avif') return 'image/avif';
    return 'application/octet-stream';
}

function imageOf(name) {
    if (!name) return { url: null, error: '未选择图片', bytes: 0, kind: '' };
    if (imgCache[name]) return imgCache[name];
    var entry = { url: null, error: null, bytes: 0, kind: '' };
    imgCache[name] = entry;
    try {
        var p = assetPath(name);
        if (!p) { entry.error = '找不到文件：' + name; return entry; }
        var buf = ctx.fs.readFileSync(p);
        entry.bytes = buf.length;
        var mime = mimeOf(name);
        if (typeof Blob === 'function' && typeof URL !== 'undefined' && URL.createObjectURL) {
            entry.url = URL.createObjectURL(new Blob([buf], { type: mime }));
            entry.kind = 'blob';
        } else {
            entry.url = 'data:' + mime + ';base64,' + buf.toString('base64');
            entry.kind = 'data';
        }
    } catch (e) {
        entry.error = String(e && e.message ? e.message : e);
    }
    return entry;
}

function resolveImageName(name) {
    if (!name) return name;
    if (assetPath(name)) return name;
    var base = name.replace(/\.[^.]+$/, '');
    var list = ctx.listAssets();
    for (var i = 0; i < list.length; i++) {
        if (list[i].name.replace(/\.[^.]+$/, '') === base) return list[i].name;
    }
    return name;
}

function normalizeImageConfig() {
    var cur = store.get('image');
    var real = resolveImageName(cur);
    if (real && real !== cur) {
        store.set('image', real);
        ctx.log('原图片已不在，自动改用同名文件：' + cur + ' → ' + real);
    }
}

function thumbOf(name) {
    return new Promise(function (resolve) {
        var entry = imageOf(name);
        if (!entry.url) { resolve(null); return; }
        var img = new Image();
        img.onload = function () {
            try {
                var cv = document.createElement('canvas');
                cv.width = 116;
                cv.height = 76;
                var g = cv.getContext('2d');
                if (!g) { resolve(smallFallback(entry)); return; }
                var s = Math.max(cv.width / img.width, cv.height / img.height);
                var w = img.width * s, h = img.height * s;
                g.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
                resolve(cv.toDataURL('image/jpeg', 0.72));
            } catch (e) { resolve(smallFallback(entry)); }
        };
        img.onerror = function () { resolve(null); };
        img.src = entry.url;
    });
}

function smallFallback(entry) {
    return entry.kind === 'data' && entry.bytes < 900000 ? entry.url : null;
}

function verifyWall(name, url) {
    if (!url || verify.name === name) return;
    verify.name = name;
    verify.status = 'loading';
    var probe = new Image();
    probe.onload = function () { verify.status = 'ok'; };
    probe.onerror = function () {
        verify.status = 'error';
        ctx.log('壁纸加载失败：' + name);
        try { ctx.ui.toast('背景图加载失败：' + name); } catch (e) {}
    };
    probe.src = url;
}

function statusText() {
    var c = store.all();
    if (!c.image) return '当前没有使用背景图。';
    var e = imageOf(c.image);
    var size = e.bytes ? (e.bytes / 1048576).toFixed(1) + ' MB' : '?';
    var s = '当前：' + c.image + '（' + size + '，' + (e.kind || '-') + '）';
    if (e.error) return s + ' — 读取失败：' + e.error;
    if (verify.status === 'error') return s + ' — ⚠ 加载失败，请看控制台';
    if (verify.status === 'loading') return s + ' — 加载中…';
    if (verify.status === 'ok') return s + ' — ✓ 已加载';
    return s;
}

function applyTokens(c, wallOn) {
    revertTokens();
    var tokens = allTokens();
    var names = Object.keys(tokens);
    var keep = {};
    var alpha = wallOn ? Math.max(0, Math.min(1, (c.card === undefined ? 60 : c.card) / 100)) : 1;
    if (alpha < 0.999) {
        names.forEach(function (name) {
            var lower = name.toLowerCase();
            var known = KNOWN_SURFACES.indexOf(lower) >= 0;
            if (!known) {
                if (!TOKEN_RE.test(name)) return;
                if (SKIP_RE.test(name)) return;
                if (!SURFACE_RE.test(name)) return;
            }
            if (NEVER_TOUCH_RE.test(name)) return;
            var v = toRgba(tokens[name], alpha);
            if (!v) return;
            keep[name] = true;
            setToken(name, v);
        });
    }
    if (c.radius !== undefined && c.radius >= 0) {
        names.forEach(function (name) {
            if (!RADIUS_RE.test(name)) return;
            if (!/^\d+(\.\d+)?(px|rem|em)$/.test(String(tokens[name]).trim())) return;
            keep[name] = true;
            setToken(name, c.radius + 'px');
        });
    }
    if (c.accent) {
        names.forEach(function (name) {
            if (!ACCENT_RE.test(name)) return;
            if (/(text|label|icon|fg|foreground)/i.test(name)) return;
            keep[name] = true;
            setToken(name, c.accent);
        });
    }
    Object.keys(patched).forEach(function (name) {
        if (!keep[name]) setToken(name, null);
    });
}

function revertAggressive() {
    aggressivePatched.forEach(function (el) {
        try { el.style.removeProperty('background-color'); } catch (e) {}
    });
    aggressivePatched = [];
}

function applyAggressive(c, wallOn) {
    revertAggressive();
    if (!wallOn || !c.aggressive) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    ctx.dom.qa('body *').forEach(function (el) {
        if (!el.id && !el.className) return;
        if (el.id && el.id.indexOf('__dsh_') === 0) return;
        if (el.getAttribute && el.getAttribute('data-dsh')) return;
        var r = el.getBoundingClientRect();
        if (r.width < vw * 0.45 || r.height < vh * 0.45) return;
        if (r.left < 240) return;
        var bg = '';
        try { bg = getComputedStyle(el).backgroundColor; } catch (e) { return; }
        var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return;
        var a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a <= 0.5) return;
        el.style.setProperty('background-color', 'transparent', 'important');
        aggressivePatched.push(el);
    });
}

function apply() {
    var c = store.all();
    var root = document.documentElement;
    var img = null;
    var wallOn = false;
    try {
        img = c.image ? imageOf(c.image) : null;
        wallOn = !!(img && img.url && !img.error);
    } catch (e) { ctx.log('读取图片出错', e); }
    try {
        root.classList.toggle('dsh-wall-on', wallOn);
        root.classList.toggle('dsh-shadow-text', !!(wallOn && c.textShadow));
        root.classList.toggle('dsh-hide-scrollbar', !!c.hideScrollbar);
        if (wallOn) {
            setVar('--dsh-wall', 'url("' + img.url + '")');
            setVar('--dsh-wall-size', (c.zoom && c.zoom !== 100) ? (c.zoom + '%') : cube(c.fit));
            setVar('--dsh-wall-pos', posOf(c));
            setVar('--dsh-wall-blur', (c.blur || 0) + 'px');
            setVar('--dsh-overlay-color', c.overlayColor === 'auto' ? (ctx.dom.isDark() ? '#000000' : '#ffffff') : c.overlayColor);
            setVar('--dsh-overlay', String((c.overlay || 0) / 100));
        } else {
            ['--dsh-wall', '--dsh-wall-size', '--dsh-wall-pos', '--dsh-wall-blur', '--dsh-overlay-color'].forEach(function (n) {
                setVar(n, null);
            });
            setVar('--dsh-overlay', '0');
            if (img && img.error) ctx.log('背景图不可用：' + img.error);
        }
    } catch (e) { ctx.log('设置壁纸变量出错', e); }
    try { if (wallOn) verifyWall(c.image, img.url); } catch (e) {}
    try { applyTokens(c, wallOn); } catch (e) { ctx.log('token 覆盖出错', e); }
    try { applyAggressive(c, wallOn); } catch (e) { ctx.log('宽松透明模式出错', e); }
    if (c.textColor) {
        root.style.setProperty('--dsw-alias-label-primary', c.textColor);
        root.style.setProperty('--dsw-alias-label-secondary', c.textColor);
        root.style.setProperty('--dsw-alias-label-tertiary', c.textColor);
        root.style.setProperty('--dsw-alias-text-primary', c.textColor);
        root.style.setProperty('--dsw-alias-text-secondary', c.textColor);
    }
    try { applyWelcome(c.welcomeText, c.welcomeColor); } catch (e) {}
    try { if (ctx.panelRefresh) ctx.panelRefresh(); } catch (e) {}
}

function applyWelcome(text, color) {
    if (!text) return;
    var input = document.querySelector('textarea, [contenteditable="true"]');
    if (!input) return;
    var el = input;
    for (var i = 0; i < 6; i++) {
        el = el.parentElement;
        if (!el) return;
        var children = el.children;
        for (var j = 0; j < children.length; j++) {
            var child = children[j];
            var t = (child.textContent || '').trim();
            if (t.length > 0 && t.length < 60 &&
                child.querySelector('input, textarea, button') === null &&
                child !== input) {
                child.textContent = text;
                if (color) child.style.color = color;
                return;
            }
        }
    }
}

function cube(fit) {
    if (fit === 'contain') return 'contain';
    if (fit === 'fill') return '100% 100%';
    return 'cover';
}

function posOf(c) {
    var x = c.offsetX || 0, y = c.offsetY || 0;
    if (!x && !y) return 'center';
    return 'calc(50% + ' + x + '%) calc(50% + ' + y + '%)';
}

function settings(c) {
    var ui = c.ui;
    var wrap = ui.el('div');
    var cfg = c.config;
    var assets = c.listAssets();
    var thumbsWidget = null;
    var s1 = ui.section('背景图');
    var status = ui.el('div', 'dsh-note');
    status.textContent = statusText();
    c.panelRefresh = function () { if (status.isConnected) status.textContent = statusText(); };
    s1.add(status);
    if (!assets.length) {
        s1.add(ui.note('没找到图片。把 png / jpg / webp 放进 <code>inject/assets/bg/</code> 或 <code>inject/plugins/theme/assets/</code>，然后重启。'));
    } else {
        thumbsWidget = ui.thumbs({
            items: assets.map(function (a) {
                return { value: a.name, label: a.name, getUrl: function () { return thumbOf(a.name); } };
            }),
            value: cfg.get('image'),
            lazy: true,
            onPick: function (v) { cfg.set('image', v); }
        });
        s1.add(ui.row('图片', thumbsWidget.el, '来自插件 assets 目录 / inject/assets/bg'));
    }
    s1.add(ui.select({
        label: '填充方式', value: cfg.get('fit'),
        options: [
            { value: 'cover', label: '铺满裁切' },
            { value: 'contain', label: '完整显示' },
            { value: 'fill', label: '拉伸填满' }
        ],
        onChange: function (v) { cfg.set('fit', v); }
    }));
    s1.add(ui.slider({ label: '缩放', min: 100, max: 200, step: 5, value: cfg.get('zoom'), format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('zoom', v); } }));
    s1.add(ui.slider({ label: '水平偏移', min: -50, max: 50, step: 5, value: cfg.get('offsetX'), format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('offsetX', v); } }));
    s1.add(ui.slider({ label: '垂直偏移', min: -50, max: 50, step: 5, value: cfg.get('offsetY'), format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('offsetY', v); } }));
    s1.add(ui.slider({ label: '模糊', min: 0, max: 40, step: 1, value: cfg.get('blur'), format: function (v) { return v + 'px'; }, onInput: function (v) { cfg.set('blur', v); } }));
    wrap.appendChild(s1.el);
    var s2 = ui.section('可读性');
    s2.add(ui.slider({ label: '蒙版浓度', min: 0, max: 90, step: 5, value: cfg.get('overlay'), format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('overlay', v); } }));
    s2.add(ui.select({ label: '蒙版颜色', value: cfg.get('overlayColor'), options: [ { value: 'auto', label: '跟随明暗' }, { value: '#000000', label: '黑' }, { value: '#ffffff', label: '白' } ], onChange: function (v) { cfg.set('overlayColor', v); } }));
    s2.add(ui.slider({ label: '面板不透明度', min: 10, max: 100, step: 5, value: cfg.get('card'), format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('card', v); } }));
    s2.add(ui.toggle({ label: '正文描边', value: cfg.get('textShadow'), onChange: function (v) { cfg.set('textShadow', v); } }));
    s2.add(ui.toggle({ label: '宽松透明模式', value: cfg.get('aggressive'), onChange: function (v) { cfg.set('aggressive', v); } }));
    wrap.appendChild(s2.el);
    var s3 = ui.section('外观');
    s3.add(ui.color({ label: '强调色', value: cfg.get('accent') || '#4d6bfe', onInput: function (v) { cfg.set('accent', v); }, onReset: function () { cfg.set('accent', ''); } }));
    s3.add(ui.slider({ label: '圆角', min: -1, max: 24, step: 1, value: cfg.get('radius'), format: function (v) { return v < 0 ? '不改' : (v + 'px'); }, onInput: function (v) { cfg.set('radius', v); } }));
    s3.add(ui.toggle({ label: '隐藏滚动条', value: cfg.get('hideScrollbar'), onChange: function (v) { cfg.set('hideScrollbar', v); } }));
    wrap.appendChild(s3.el);
    var s4 = ui.section('欢迎词');
    s4.add(ui.input({ label: '自定义欢迎词', value: cfg.get('welcomeText') || '', placeholder: '留空恢复原版', onChange: function (v) { cfg.set('welcomeText', v); apply(); } }));
    s4.add(ui.color({ label: '欢迎词颜色', value: cfg.get('welcomeColor') || '', onChange: function (v) { cfg.set('welcomeColor', v); apply(); } }));
    s4.add(ui.color({ label: '全部字体颜色', value: cfg.get('textColor') || '', onChange: function (v) { cfg.set('textColor', v); apply(); } }));
    wrap.appendChild(s4.el);
    var actions = ui.el('div', 'dsh-actions');
    actions.appendChild(ui.button('重置主题', function () {
        cfg.reset();
        if (thumbsWidget) thumbsWidget.set('');
        if (window.__DSH__) window.__DSH__.toast('主题已重置');
    }, 'danger'));
    wrap.appendChild(actions);
    var det = ui.el('details', 'dsh-note');
    det.appendChild(ui.text('summary', '', 'Token 探针（开发者）'));
    var tokens = allTokens();
    var names = Object.keys(tokens).sort();
    var pre = ui.el('pre');
    pre.style.cssText = 'max-height:180px;overflow:auto;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;margin:8px 0 0;';
    pre.textContent = names.length ? names.map(function (n) { return n + ': ' + tokens[n]; }).join('\n') : '（没读到 CSS 变量）';
    det.appendChild(pre);
    wrap.appendChild(det);
    return wrap;
}

function enable(c) {
    ctx = c;
    store = c.config;
    assetMap = null;
    verify = { name: null, status: '', text: '' };
    unsubs.push(store.subscribe(function () { apply(); }));
    unsubs.push(ctx.dom.onChange(function () {
        var dark = ctx.dom.isDark();
        if (dark !== lastDark) { lastDark = dark; apply(); }
    }, { target: document.body, attributeFilter: ['class'] }));
    unsubs.push(ctx.dom.keepAlive(function () {
        var cfg = store.all();
        if (cfg.aggressive && cfg.image) applyAggressive(cfg, true);
    }, { debounce: 500 }));
    ctx.onCleanup(function () {
        unsubs.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
        revertTokens();
        revertAggressive();
        Object.keys(imgCache).forEach(function (k) {
            var e = imgCache[k];
            if (e.url && e.kind === 'blob') { try { URL.revokeObjectURL(e.url); } catch (err) {} }
        });
        imgCache = {};
        assetMap = null;
        var root = document.documentElement;
        root.classList.remove('dsh-wall-on', 'dsh-shadow-text', 'dsh-hide-scrollbar');
        ['--dsh-wall', '--dsh-wall-size', '--dsh-wall-pos', '--dsh-wall-blur', '--dsh-overlay', '--dsh-overlay-color'].forEach(function (n) {
            root.style.removeProperty(n);
        });
    });
    lastDark = ctx.dom.isDark();
    normalizeImageConfig();
    apply();
    ctx.log('主题已启用', store.all());
}

function disable() {
    ctx.log('主题已关闭');
}

module.exports = { enable: enable, disable: disable, settings: settings };
