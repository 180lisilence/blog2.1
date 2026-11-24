/* ============================================================
 * Harness 内核 —— 设置界面
 * ------------------------------------------------------------
 * 齿轮按钮 + 标签页面板 + 控件工厂。
 * 所有控件统一走这里的工厂，插件不用重复写样式。
 * ============================================================ */
'use strict';

var dom = require('./dom.js');

var GEAR_ID = '__dsh_gear__';
var OVERLAY_ID = '__dsh_overlay__';
var PANEL_ID = '__dsh_panel__';
var BODY_ID = '__dsh_body__';
var TABS_ID = '__dsh_tabs__';
var TITLE_ID = '__dsh_title__';

var api = null;
var anchorEl = null;
var activeTab = 'core';
var stopAlive = null;
var toastEl = null;

function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined && html !== null) n.innerHTML = html;
    return n;
}

function text(tag, cls, str) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = str === undefined || str === null ? '' : String(str);
    return n;
}

function toast(msg) {
    if (!toastEl) {
        toastEl = el('div', 'dsh-toast');
        toastEl.id = '__dsh_toast__';
        document.body.appendChild(toastEl);
        var old = toastEl;
        setTimeout(function () { if (old && old.parentNode) old.parentNode.removeChild(old); toastEl = null; }, 2200);
    }
    toastEl.textContent = msg;
}

function row(label, node, hint) {
    var r = el('div', 'dsh-row');
    var l = el('div', 'dsh-row-label');
    l.appendChild(text('span', '', label));
    if (hint) {
        var h = text('span', 'dsh-hint', '?');
        h.title = hint;
        l.appendChild(h);
    }
    r.appendChild(l);
    var v = el('div', 'dsh-row-ctrl');
    if (node) v.appendChild(node);
    r.appendChild(v);
    return { el: r, ctrl: v, label: l };
}

function slider(opt) {
    opt = opt || {};
    var input = el('input');
    input.type = 'range';
    input.min = opt.min === undefined ? 0 : opt.min;
    input.max = opt.max === undefined ? 100 : opt.max;
    input.step = opt.step === undefined ? 1 : opt.step;
    input.value = opt.value === undefined ? 0 : opt.value;
    var out = text('span', 'dsh-val', opt.format ? opt.format(input.value) : input.value);
    var wrap = el('div', 'dsh-slider');
    wrap.appendChild(input);
    wrap.appendChild(out);
    input.addEventListener('input', function () {
        out.textContent = opt.format ? opt.format(input.value) : input.value;
        if (opt.onInput) opt.onInput(parseFloat(input.value));
    });
    var r = row(opt.label, wrap, opt.hint);
    return { el: r.el, input: input, set: function (v) { input.value = v; out.textContent = opt.format ? opt.format(v) : v; } };
}

function select(opt) {
    opt = opt || {};
    var s = el('select');
    (opt.options || []).forEach(function (o) {
        var op = el('option');
        op.value = o.value;
        op.textContent = o.label;
        if (String(o.value) === String(opt.value)) op.selected = true;
        s.appendChild(op);
    });
    s.addEventListener('change', function () { if (opt.onChange) opt.onChange(s.value); });
    var r = row(opt.label, s, opt.hint);
    return { el: r.el, input: s, set: function (v) { s.value = v; } };
}

function color(opt) {
    opt = opt || {};
    var input = el('input');
    input.type = 'color';
    input.value = opt.value || '#4d6bfe';
    var reset = el('button', 'dsh-mini', '重置');
    var wrap = el('div', 'dsh-color');
    wrap.appendChild(input);
    wrap.appendChild(reset);
    input.addEventListener('input', function () { if (opt.onInput) opt.onInput(input.value); });
    reset.addEventListener('click', function () { if (opt.onReset) opt.onReset(); });
    var r = row(opt.label, wrap, opt.hint);
    return { el: r.el, input: input, set: function (v) { input.value = v; } };
}

function toggle(opt) {
    opt = opt || {};
    var input = el('input');
    input.type = 'checkbox';
    input.checked = !!opt.value;
    input.addEventListener('change', function () { if (opt.onChange) opt.onChange(input.checked); });
    var r = row(opt.label, input, opt.hint);
    return { el: r.el, input: input, set: function (v) { input.checked = !!v; } };
}

function input(opt) {
    opt = opt || {};
    var i = el('input', 'dsh-input');
    i.type = 'text';
    i.value = opt.value || '';
    if (opt.placeholder) i.placeholder = opt.placeholder;
    i.addEventListener('change', function () { if (opt.onChange) opt.onChange(i.value); });
    i.addEventListener('input', function () { if (opt.onInput) opt.onInput(i.value); });
    var r = row(opt.label, i, opt.hint);
    return { el: r.el, input: i, set: function (v) { i.value = v; } };
}

function button(label, onClick, kind) {
    var b = text('button', 'dsh-btn' + (kind ? ' dsh-btn-' + kind : ''), label);
    b.addEventListener('click', function () { if (onClick) onClick(); });
    return b;
}

function note(html) {
    return el('div', 'dsh-note', html);
}

function hr() {
    return el('hr', 'dsh-hr');
}

function thumbs(opt) {
    opt = opt || {};
    var wrap = el('div', 'dsh-thumbs');
    var items = opt.items || [];
    var current = opt.value;
    var nodeOf = {};

    function paint() {
        dom.qa('.dsh-thumb', wrap).forEach(function (n) {
            n.classList.toggle('dsh-active', String(n.dataset.v) === String(current));
        });
    }

    var noneBtn = text('div', 'dsh-thumb dsh-thumb-none', '无');
    noneBtn.dataset.v = '';
    noneBtn.addEventListener('click', function () {
        current = '';
        paint();
        if (opt.onPick) opt.onPick('');
    });
    wrap.appendChild(noneBtn);
    nodeOf[''] = noneBtn;

    items.forEach(function (it) {
        var t = el('div', 'dsh-thumb');
        t.dataset.v = it.value;
        t.title = it.label || it.value;
        if (!opt.lazy && it.url) t.style.backgroundImage = 'url("' + it.url + '")';
        t.addEventListener('click', function () {
            current = it.value;
            paint();
            if (opt.onPick) opt.onPick(it.value);
        });
        wrap.appendChild(t);
        nodeOf[it.value] = t;
    });

    if (opt.lazy) {
        var queue = items.slice();
        function setBg(node, url) {
            if (node) node.style.backgroundImage = 'url("' + url + '")';
        }
        function step() {
            var it = queue.shift();
            if (!it) return;
            var node = nodeOf[it.value];
            var next = function () { setTimeout(step, 40); };
            var u = null;
            try { u = it.getUrl ? it.getUrl() : it.url; } catch (e) {}
            if (u && typeof u.then === 'function') {
                u.then(function (real) { setBg(node, real); next(); }, next);
            } else {
                setBg(node, u);
                next();
            }
        }
        setTimeout(step, 40);
    }

    paint();
    return { el: wrap, refresh: paint, set: function (v) { current = v; paint(); } };
}

function section(title) {
    var s = el('div', 'dsh-section');
    if (title) s.appendChild(text('div', 'dsh-section-title', title));
    var api = {
        el: s,
        add: function (node) {
            if (node) s.appendChild(node.el || node);
            return api;
        }
    };
    return api;
}

function mountGear() {
    var existing = document.getElementById(GEAR_ID);
    if (existing && anchorEl && anchorEl.isConnected && existing.parentNode === anchorEl) return;
    var anchor = (anchorEl && anchorEl.isConnected) ? anchorEl : dom.anchor();
    if (!anchor) return;
    anchorEl = anchor;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var gear = el('div');
    gear.id = GEAR_ID;
    gear.title = 'Harness 设置';
    gear.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/></svg>';
    gear.addEventListener('click', function (e) {
        e.stopPropagation();
        openPanel();
    });
    anchor.appendChild(gear);
}

function buildShell() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = el('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
        '<div id="' + PANEL_ID + '">' +
        '  <div class="dsh-head">' +
        '    <span id="' + TITLE_ID + '">Harness 设置</span>' +
        '    <span class="dsh-close" title="关闭">×</span>' +
        '  </div>' +
        '  <div id="' + TABS_ID + '"></div>' +
        '  <div id="' + BODY_ID + '"></div>' +
        '  <div class="dsh-foot"><span class="dsh-ver">Harness v' + ((api && api.version) || '') + '</span>' +
        '    <span class="dsh-foot-actions"></span></div>' +
        '</div>';
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closePanel();
    });
    overlay.querySelector('.dsh-close').addEventListener('click', closePanel);
    document.body.appendChild(overlay);
    return overlay;
}

function isOpen() {
    var o = document.getElementById(OVERLAY_ID);
    return !!(o && o.classList.contains('dsh-open'));
}

function openPanel(tab) {
    if (tab) activeTab = tab;
    var overlay = buildShell();
    overlay.classList.add('dsh-open');
    rebuild();
    document.addEventListener('keydown', escHandler);
}

function closePanel() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.remove('dsh-open');
    document.removeEventListener('keydown', escHandler);
}

function escHandler(e) {
    if (e.key === 'Escape') closePanel();
}

function rebuild() {
    if (!api) return;
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    var list = api.list();
    var tabs = document.getElementById(TABS_ID);
    var body = document.getElementById(BODY_ID);
    if (!tabs || !body) return;
    var available = [{ id: 'core', name: '插件管理' }];
    list.forEach(function (p) {
        var pctx = api.context(p.id);
        var pmod = pctx && pctx.__mod;
        if (p.enabled && pmod && typeof pmod.settings === 'function') {
            available.push({ id: p.id, name: p.name });
        }
    });
    var found = false;
    available.forEach(function (t) { if (t.id === activeTab) found = true; });
    if (!found) activeTab = 'core';
    tabs.innerHTML = '';
    available.forEach(function (t) {
        var b = text('div', 'dsh-tab' + (t.id === activeTab ? ' dsh-active' : ''), t.name);
        b.addEventListener('click', function () {
            activeTab = t.id;
            rebuild();
        });
        tabs.appendChild(b);
    });
    body.innerHTML = '';
    body.scrollTop = 0;
    var title = document.getElementById(TITLE_ID);
    if (title) {
        var current = null;
        available.forEach(function (t) { if (t.id === activeTab) current = t; });
        title.textContent = activeTab === 'core' ? 'Harness 设置' : ('设置 · ' + (current ? current.name : ''));
    }
    if (activeTab === 'core') {
        body.appendChild(renderCoreTab(list));
        return;
    }
    var node = null;
    try {
        var ctx = api.context(activeTab);
        node = ctx.__mod.settings(ctx);
    } catch (e) {
        node = note('插件设置面板渲染失败：' + (e && e.message ? e.message : e));
    }
    if (node) body.appendChild(node.el || node);
}

function renderCoreTab(list) {
    var root = el('div', 'dsh-core-tab');
    root.appendChild(note(
        'Harness 是一层可插拔的插件壳。关掉插件后页面立即回到原版，删掉 <code>inject/_core</code> 和 <code>inject/plugins</code> 后连 Harness 本身都不会留下。'
    ));
    var listWrap = el('div', 'dsh-plugins');
    list.forEach(function (p) {
        var item = el('div', 'dsh-plugin');
        var info = el('div', 'dsh-plugin-info');
        var nameRow = el('div', 'dsh-plugin-name');
        nameRow.appendChild(text('span', '', p.name));
        if (p.version) nameRow.appendChild(text('span', 'dsh-plugin-ver', 'v' + p.version));
        if (p.broken) nameRow.appendChild(text('span', 'dsh-plugin-bad', '加载失败'));
        info.appendChild(nameRow);
        if (p.description) info.appendChild(text('div', 'dsh-plugin-desc', p.description));
        if (p.error) info.appendChild(text('div', 'dsh-plugin-err', p.error));
        item.appendChild(info);
        var sw = el('label', 'dsh-switch');
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!p.enabled;
        cb.disabled = !!p.broken;
        cb.addEventListener('change', function () {
            api.toggle(p.id, cb.checked);
            toast(p.name + (cb.checked ? ' 已启用' : ' 已关闭'));
        });
        sw.appendChild(cb);
        sw.appendChild(el('span', 'dsh-switch-track'));
        item.appendChild(sw);
        listWrap.appendChild(item);
    });
    root.appendChild(listWrap);
    var actions = el('div', 'dsh-actions');
    actions.appendChild(button('全部重置（含配置）', function () {
        if (window.confirm('确定清空所有插件配置并回到原版？')) {
            api.resetAll();
            toast('已重置');
        }
    }, 'danger'));
    actions.appendChild(button('刷新 Harness', function () {
        location.reload();
    }));
    root.appendChild(actions);
    root.appendChild(hr());
    root.appendChild(note(
        '开发者：控制台里可用 <code>__DSH__.tokens()</code> 查看页面所有 CSS 变量，<code>__DSH__.list()</code> 查看插件状态。'
    ));
    return root;
}

function mount(apiRef) {
    api = apiRef;
    api.onPanelChanged = function () { if (isOpen()) rebuild(); };
    dom.ready(function () {
        mountGear();
        if (stopAlive) stopAlive();
        stopAlive = dom.keepAlive(mountGear, { debounce: 400 });
    });
}

module.exports = {
    mount: mount,
    openPanel: openPanel,
    closePanel: closePanel,
    rebuild: rebuild,
    toast: toast,
    row: row,
    slider: slider,
    select: select,
    color: color,
    toggle: toggle,
    input: input,
    button: button,
    note: note,
    hr: hr,
    thumbs: thumbs,
    section: section,
    el: el,
    text: text
};
