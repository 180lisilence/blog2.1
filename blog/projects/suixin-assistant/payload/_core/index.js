/* ============================================================
 * DeepSeek Chat Harness —— 内核
 * ------------------------------------------------------------
 * 职责：
 *   1. 发现 inject/plugins/<id>/plugin.json
 *   2. 按 manifest 加载插件入口，建立 ctx 上下文
 *   3. 管理插件生命周期（enable / disable / cleanup）
 *   4. 提供样式句柄，保证任何插件禁用后零残留
 *   5. 暴露 window.__DSH__ 给开发者调试
 * ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var config = require('./config.js');
var dom = require('./dom.js');
var ui = require('./ui.js');

var INJECT_DIR = path.join(__dirname, '..');
var PLUGIN_DIR = path.join(INJECT_DIR, 'plugins');
var CORE_CSS = path.join(__dirname, 'core.css');

/* 版本号必须和 tools/install.ps1 写进 .harness-install.json 的 version 保持一致，
 * 否则面板底部显示的版本会和安装记录对不上。改这里时两个地方一起改。 */
var VERSION = '0.2.0';
var REGISTRY_KEY = '__dsh_registry__';

var plugins = [];
var byId = {};
var cssSeq = 0;
var api = null;

function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[DSH]');
    try { console.log.apply(console, args); } catch (e) {}
}

/* ---------- 注册表：哪些插件开着 ---------- */
function loadRegistry() {
    try {
        var raw = localStorage.getItem(REGISTRY_KEY);
        if (raw) {
            var s = JSON.parse(raw);
            if (s && s.enabled && typeof s.enabled === 'object') return s;
        }
    } catch (e) {}
    return { enabled: {} };
}

function saveRegistry() {
    var reg = { enabled: {} };
    plugins.forEach(function (p) { reg.enabled[p.manifest.id] = !!p.enabled; });
    try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg)); } catch (e) {}
}

/* ---------- 样式注入（带句柄回收） ---------- */
function injectStyle(id, text) {
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('style');
    el.id = id;
    el.setAttribute('data-dsh', '1');
    el.textContent = String(text);
    (document.head || document.documentElement).appendChild(el);
    return el;
}

function dropStyle(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

/* ---------- 插件上下文 ---------- */
function createContext(manifest, dir) {
    var styleHandles = [];
    var cleanups = [];

    var ctx = {
        id: manifest.id,
        name: manifest.name || manifest.id,
        version: manifest.version || '0.0.0',
        manifest: manifest,
        dir: dir,
        sharedDir: INJECT_DIR,
        fs: fs,
        path: path,
        ui: ui,
        dom: dom
    };

    ctx.log = function () {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[' + manifest.id + ']');
        log.apply(null, args);
    };

    ctx.css = function (text, label) {
        var sid = '__dsh_css_' + manifest.id + '_' + (cssSeq++) + (label ? '_' + label : '');
        injectStyle(sid, text);
        var handle = {
            id: sid,
            update: function (t) { injectStyle(sid, t); },
            remove: function () { dropStyle(sid); }
        };
        styleHandles.push(handle);
        return handle;
    };

    ctx.onCleanup = function (fn) { cleanups.push(fn); };

    ctx.cleanup = function () {
        cleanups.splice(0).forEach(function (fn) {
            try { fn(); } catch (e) { ctx.log('cleanup 出错', e); }
        });
        styleHandles.splice(0).forEach(function (h) {
            try { h.remove(); } catch (e) {}
        });
    };

    ctx.config = config.create(manifest.id, manifest.defaults || {});

    ctx.listAssets = function () {
        var exts = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
        var dirs = [
            path.join(dir, 'assets'),
            path.join(INJECT_DIR, 'assets'),
            path.join(INJECT_DIR, 'assets', 'bg')
        ];
        var seen = {};
        var out = [];
        dirs.forEach(function (d, di) {
            try {
                if (!fs.existsSync(d)) return;
                fs.readdirSync(d, { withFileTypes: true }).forEach(function (f) {
                    if (!f.isFile() || !exts.test(f.name)) return;
                    var key = di + '/' + f.name;
                    if (seen[key]) return;
                    seen[key] = true;
                    out.push({ name: f.name, dir: d, path: path.join(d, f.name) });
                });
            } catch (e) {}
        });
        return out;
    };

    ctx.assetUrl = function (file) {
        try {
            if (!file) return null;
            var list = ctx.listAssets();
            for (var i = 0; i < list.length; i++) {
                if (list[i].name === file) {
                    var ext = path.extname(file).slice(1).toLowerCase();
                    if (ext === 'jpg') ext = 'jpeg';
                    var buf = fs.readFileSync(list[i].path);
                    return 'data:image/' + ext + ';base64,' + buf.toString('base64');
                }
            }
        } catch (e) { ctx.log('读取图片失败', file, e); }
        return null;
    };

    return ctx;
}

/* ---------- 插件发现与生命周期 ---------- */
function discover() {
    if (!fs.existsSync(PLUGIN_DIR)) return [];
    var out = [];
    var names = [];
    try {
        fs.readdirSync(PLUGIN_DIR, { withFileTypes: true }).forEach(function (d) {
            if (d.isDirectory()) names.push(d.name);
        });
    } catch (e) { log('扫描插件目录失败', e); return []; }
    names.sort();

    names.forEach(function (name) {
        var dir = path.join(PLUGIN_DIR, name);
        var mf = path.join(dir, 'plugin.json');
        if (!fs.existsSync(mf)) { log('跳过（缺少 plugin.json）', name); return; }
        var manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
        } catch (e) { log('plugin.json 解析失败', name, e); return; }
        if (!manifest.id) manifest.id = name;
        manifest.dir = dir;
        out.push(manifest);
    });
    return out;
}

function enable(p) {
    if (!p || p.enabled) return;
    try {
        if (p.mod && typeof p.mod.enable === 'function') p.mod.enable(p.ctx);
        p.enabled = true;
        p.error = null;
    } catch (e) {
        p.error = String(e && e.message ? e.message : e);
        p.enabled = false;
        try { p.ctx.cleanup(); } catch (e2) {}
        log('启用失败', p.manifest.id, e);
    }
}

function disable(p) {
    if (!p || !p.enabled) return;
    try {
        if (p.mod && typeof p.mod.disable === 'function') p.mod.disable(p.ctx);
    } catch (e) { log('disable 出错', p.manifest.id, e); }
    try { p.ctx.cleanup(); } catch (e) {}
    p.enabled = false;
}

/* ---------- 对外 API ---------- */
function buildApi() {
    return {
        version: VERSION,
        log: log,
        list: function () {
            return plugins.map(function (p) {
                return {
                    id: p.manifest.id,
                    name: p.manifest.name || p.manifest.id,
                    description: p.manifest.description || '',
                    version: p.manifest.version || '',
                    author: p.manifest.author || '',
                    enabled: !!p.enabled,
                    broken: !p.mod,
                    error: p.error || null
                };
            });
        },
        isEnabled: function (id) { return !!(byId[id] && byId[id].enabled); },
        toggle: function (id, on) {
            var p = byId[id];
            if (!p) return;
            if (on === undefined) on = !p.enabled;
            if (on) enable(p); else disable(p);
            saveRegistry();
            if (api.onPanelChanged) api.onPanelChanged();
        },
        context: function (id) { return byId[id] ? byId[id].ctx : null; },
        reload: function (id) {
            var p = byId[id];
            if (!p || !p.enabled) return;
            disable(p);
            enable(p);
            if (api.onPanelChanged) api.onPanelChanged();
        },
        tokens: function () {
            var out = {};
            [document.documentElement, document.body].forEach(function (el) {
                if (!el) return;
                var cs = getComputedStyle(el);
                for (var i = 0; i < cs.length; i++) {
                    var n = cs.item ? cs.item(i) : cs[i];
                    if (n && n.indexOf('--') === 0 && out[n] === undefined) {
                        out[n] = (cs.getPropertyValue(n) || '').trim();
                    }
                }
            });
            return out;
        },
        resetAll: function () {
            plugins.forEach(function (p) { disable(p); });
            plugins.forEach(function (p) { try { p.ctx.config.destroy(); } catch (e) {} });
            try { localStorage.removeItem(REGISTRY_KEY); } catch (e) {}
            if (api.onPanelChanged) api.onPanelChanged();
        }
    };
}

/* ---------- 启动 ---------- */
function boot() {
    if (api) return;
    api = buildApi();
    window.__DSH__ = api;

    dom.ready(function () {
        try {
            injectStyle('__dsh_core_css__', fs.readFileSync(CORE_CSS, 'utf8'));
        } catch (e) { log('内核样式加载失败', e); }

        var manifests = discover();
        var reg = loadRegistry();

        manifests.forEach(function (manifest) {
            var ctx = createContext(manifest, manifest.dir);
            var mod = null;
            try {
                mod = require(path.join(manifest.dir, manifest.entry || 'main.js'));
                if (mod && mod.default && mod.default.enable) mod = mod.default;
            } catch (e) { log('加载插件失败', manifest.id, e); }

            if (manifest.style) {
                try {
                    injectStyle('__dsh_css_' + manifest.id + '_base',
                        fs.readFileSync(path.join(manifest.dir, manifest.style), 'utf8'));
                } catch (e) { log('插件样式加载失败', manifest.id, e); }
            }

            ctx.__mod = mod;
            var p = { manifest: manifest, ctx: ctx, mod: mod, enabled: false, error: null };
            plugins.push(p);
            byId[manifest.id] = p;
        });

        plugins.forEach(function (p) {
            var id = p.manifest.id;
            var on = reg.enabled[id] !== undefined ? !!reg.enabled[id] : (p.manifest.defaultEnabled !== false);
            if (on && p.mod) enable(p);
        });

        saveRegistry();

        ui.mount(api);

        log('已加载 ' + plugins.length + ' 个插件', plugins.map(function (p) {
            return p.manifest.id + (p.enabled ? '✓' : '✗');
        }).join(' '));
    });
}

module.exports = { boot: boot };
