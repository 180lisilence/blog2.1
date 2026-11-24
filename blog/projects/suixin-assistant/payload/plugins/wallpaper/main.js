/* ============================================================
 * 动态壁纸插件 —— 联动 Wallpaper Engine
 * ------------------------------------------------------------
 * 读取 Wallpaper Engine 的 config.json 找到当前壁纸路径，
 * 按类型渲染到聊天窗口最底层：
 *   - Web 壁纸（index.html）→ 隐藏 iframe 铺底
 *   - 视频壁纸（mp4/webm/mov）→ <video> 循环静音
 *   - 图片壁纸 → <img>
 * 渲染层固定在最底（z-index:-2），pointer-events:none 不挡交互。
 * ============================================================ */
'use strict';

var ctx = null;
var store = null;
var stage = null;
var current = null;
var unsubs = [];
var lastPath = '';

var WE_DIR = 'D:/Steam/steamapps/common/wallpaper_engine';
var WE_CONFIG = WE_DIR + '/config.json';

function fileUrl(p) {
    try {
        var fs = ctx.fs || require('fs');
        var ab = fs.readFileSync(p).buffer;
        var ext = p.split('.').pop().toLowerCase();
        var mime = {
            mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
            html: 'text/html', htm: 'text/html'
        }[ext] || 'application/octet-stream';
        var blob = new Blob([ab], { type: mime });
        return URL.createObjectURL(blob);
    } catch (e) {
        ctx.log('读取文件失败：' + p + ' - ' + e.message);
        return null;
    }
}

function currentWallpaper() {
    try {
        var fs = ctx.fs || require('fs');
        var raw = fs.readFileSync(WE_CONFIG, 'utf8');
        var cfg = JSON.parse(raw);
        var profile = null;
        for (var k in cfg) {
            if (k.charAt(0) !== '?') { profile = cfg[k]; break; }
        }
        if (!profile || !profile.general || !profile.general.wallpaperconfig) return null;
        var wc = profile.general.wallpaperconfig;
        var sel = wc.selectedwallpapers || {};
        for (var m in sel) {
            if (sel[m] && sel[m].file) return sel[m].file;
        }
        return null;
    } catch (e) {
        ctx.log('读取 Wallpaper Engine 配置失败：' + e.message);
        return null;
    }
}

function kindOf(p) {
    var ext = p.split('?')[0].toLowerCase();
    if (/\.html?$/.test(ext)) return 'web';
    if (/\.(mp4|webm|mov|m4v)$/.test(ext)) return 'video';
    if (/\.(png|jpe?g|webp|gif|bmp)$/.test(ext)) return 'image';
    if (/\.pkg$/.test(ext)) return 'scene';
    if (/\.json$/.test(ext)) return 'project';
    return null;
}

function recentWallpapers() {
    try {
        var fs = ctx.fs || require('fs');
        var raw = fs.readFileSync(WE_CONFIG, 'utf8');
        var cfg = JSON.parse(raw);
        var profile = null;
        for (var k in cfg) { if (k.charAt(0) !== '?') { profile = cfg[k]; break; } }
        var rec = (profile && profile.general && profile.general.wallpaperconfigrecent) || [];
        var out = [];
        rec.forEach(function (r) {
            var f = r.config && r.config.selectedwallpapers;
            if (f) {
                for (var m in f) { if (f[m] && f[m].file) { out.push({ file: f[m].file, title: r.title || f[m].file }); break; } }
            }
        });
        return out;
    } catch (e) { return []; }
}

function resolveScene(path) {
    try {
        var fs = ctx.fs || require('fs');
        var dir = path.split('/').slice(0, -1).join('/');
        var names = fs.readdirSync(dir);
        if (/\.json$/i.test(path)) {
            try {
                var meta = JSON.parse(fs.readFileSync(path, 'utf8'));
                if (meta.preview && names.indexOf(meta.preview) >= 0) return dir + '/' + meta.preview;
            } catch (e) {}
        }
        var pick = function (re) { for (var i = 0; i < names.length; i++) if (re.test(names[i].toLowerCase())) return dir + '/' + names[i]; return null; };
        return pick(/preview\.gif$/) || pick(/\.gif$/) || pick(/preview\.(mp4|webm)$/) || pick(/\.(mp4|webm)$/) || pick(/preview\.(png|jpe?g|webp)$/) || pick(/\.(png|jpe?g|webp)$/);
    } catch (e) { return null; }
}

function clearStage() {
    if (current) {
        try {
            if (current.tagName === 'VIDEO') { current.pause(); current.src = ''; }
            if (current.tagName === 'IFRAME') current.src = 'about:blank';
        } catch (e) {}
        current = null;
    }
    if (stage && stage.parentNode) {
        while (stage.firstChild) stage.removeChild(stage.firstChild);
    }
}

function buildStage() {
    if (stage && stage.parentNode) return stage;
    stage = document.createElement('div');
    stage.id = '__dsh_wallpaper_stage__';
    var op = (store && store.get('opacity') != null) ? store.get('opacity') : 100;
    stage.style.cssText =
        'position:fixed;left:0;top:0;width:100vw;height:100vh;' +
        'z-index:-2;pointer-events:none;overflow:hidden;' +
        'opacity:' + (op / 100) + ';transition:opacity .3s;';
    document.body.appendChild(stage);
    return stage;
}

function ensureTransparentBg() {
    var css =
        'html, html body { background: transparent !important; }' +
        'html body #root { background: transparent !important; }' +
        'html body #__dsh_wallpaper_stage__ { z-index: -2 !important; }';
    if (!document.getElementById('__dsh_wallpaper_style__')) {
        var s = document.createElement('style');
        s.id = '__dsh_wallpaper_style__';
        s.textContent = css;
        document.head.appendChild(s);
    }
}

function renderWeb(path) {
    var frame = document.createElement('iframe');
    frame.src = fileUrl(path) || 'about:blank';
    frame.style.cssText =
        'position:absolute;left:0;top:0;width:100%;height:100%;' +
        'border:0;pointer-events:none;';
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('allow', 'autoplay');
    return frame;
}

function renderVideo(path) {
    var v = document.createElement('video');
    v.src = fileUrl(path);
    v.autoplay = true;
    v.loop = true;
    v.muted = !!store.get('muted');
    v.style.cssText =
        'position:absolute;left:0;top:0;width:100%;height:100%;' +
        'object-fit:cover;pointer-events:none;';
    v.play().catch(function () {});
    return v;
}

function renderImage(path) {
    var img = document.createElement('img');
    img.src = fileUrl(path);
    img.style.cssText =
        'position:absolute;left:0;top:0;width:100%;height:100%;' +
        'object-fit:cover;pointer-events:none;';
    return img;
}

function applyScale(el) {
    var scale = store.get('scale') || 100;
    if (scale !== 100 && el) {
        el.style.width = scale + '%';
        el.style.height = scale + '%';
        el.style.left = ((100 - scale) / 2) + '%';
        el.style.top = ((100 - scale) / 2) + '%';
    }
}

function apply() {
    clearStage();
    if (!store.get('enabled')) {
        var st = document.getElementById('__dsh_wallpaper_style__');
        if (st && st.parentNode) st.parentNode.removeChild(st);
        return;
    }
    var src = store.get('source');
    var path = (src === 'manual' || src === 'recent') && store.get('manualPath')
        ? store.get('manualPath')
        : currentWallpaper();
    if (!path) {
        ctx.log('未找到壁纸路径（Wallpaper Engine 未运行或未设置壁纸）');
        return;
    }
    lastPath = path;
    ensureTransparentBg();
    var st = buildStage();
    var kind = kindOf(path);
    ctx.log('壁纸：', path, '类型：', kind);
    var el = null;
    if (kind === 'web') el = renderWeb(path);
    else if (kind === 'video') el = renderVideo(path);
    else if (kind === 'image') el = renderImage(path);
    else if (kind === 'scene' || kind === 'project') {
        var alt = resolveScene(path);
        ctx.log('原生格式壁纸，尝试渲染同目录素材：', alt);
        if (!alt) { ctx.log('该壁纸无法在聊天窗口直接渲染，请换 Web/视频/图片壁纸'); return; }
        kind = kindOf(alt);
        path = alt;
        if (kind === 'video') el = renderVideo(path);
        else if (kind === 'image') el = renderImage(path);
        else if (kind === 'web') el = renderWeb(path);
        else { ctx.log('无可用素材'); return; }
    }
    else { ctx.log('不支持的壁纸类型：' + path); return; }
    applyScale(el);
    st.appendChild(el);
    current = el;
}

var followTimer = null;
function startFollow(c) {
    if (followTimer) { clearInterval(followTimer); followTimer = null; }
    if (!c.config.get('autoFollow')) return;
    followTimer = setInterval(function () {
        if (!c.config.get('enabled') || c.config.get('source') !== 'follow') return;
        var p = currentWallpaper();
        if (p && p !== lastPath) {
            c.log('检测到 WE 壁纸切换：', p);
            apply();
        }
    }, 4000);
}

function enable(c) {
    try {
        ctx = c;
        store = c.config;
        unsubs.push(store.subscribe(function () { apply(); }));
        startFollow(c);
        unsubs.push(c.dom.keepAlive(function () {
            if (store.get('enabled') && !document.getElementById('__dsh_wallpaper_stage__')) {
                apply();
            }
        }, { debounce: 600 }));
        apply();
        ctx.log('动态壁纸已启用');
    } catch (e) {
        c.log('动态壁纸启动失败：' + e.message);
    }
}

function disable(c) {
    if (followTimer) { clearInterval(followTimer); followTimer = null; }
    unsubs.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
    clearStage();
    var st = document.getElementById('__dsh_wallpaper_stage__');
    if (st && st.parentNode) st.parentNode.removeChild(st);
    stage = null;
    var s = document.getElementById('__dsh_wallpaper_style__');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    c.log('动态壁纸已卸载');
}

function settings(c) {
    var ui = c.ui;
    var wrap = ui.el('div');
    var cfg = c.config;
    var wp = currentWallpaper();
    var curPath = wp || '（未找到，请确认 Wallpaper Engine 已设置壁纸）';
    var s1 = ui.section('Wallpaper Engine');
    s1.add(ui.note('当前壁纸：<code>' + curPath + '</code>'));
    s1.add(ui.toggle({ label: '启用动态壁纸', value: cfg.get('enabled'), onChange: function (v) { cfg.set('enabled', v); } }));
    s1.add(ui.select({ label: '壁纸来源', value: cfg.get('source'), options: [ { value: 'follow', label: '跟随 Wallpaper Engine 当前壁纸' }, { value: 'recent', label: '从最近用过的壁纸里选' }, { value: 'manual', label: '手动指定路径' } ], onChange: function (v) { cfg.set('source', v); apply(); } }));
    var recent = recentWallpapers();
    if (cfg.get('source') === 'recent') {
        var recentOpts = recent.map(function (r) { return { value: r.file, label: (r.title || r.file).slice(0, 28) }; });
        if (recentOpts.length) {
            recentOpts.unshift({ value: '', label: '—— 选择壁纸 ——' });
            s1.add(ui.select({ label: '最近壁纸', value: cfg.get('recentPath') || '', options: recentOpts, onChange: function (v) { if (v) { cfg.set('recentPath', v); cfg.set('manualPath', v); apply(); } } }));
        } else {
            s1.add(ui.note('没读到 Wallpaper Engine 最近壁纸（确认 WE 已安装并切换过壁纸）。'));
        }
    }
    s1.add(ui.toggle({ label: '自动跟随（WE 换壁纸自动切换）', value: !!cfg.get('autoFollow'), onChange: function (v) { cfg.set('autoFollow', v); startFollow(c); } }));
    var manualInput = ui.input({ label: '手动路径', value: cfg.get('manualPath'), placeholder: '如 D:/xxx/壁纸.mp4', onChange: function (v) { cfg.set('manualPath', v); } });
    s1.add(manualInput);
    var pickBtn = ui.button('浏览本地文件…', function () {
        var picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.html,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.gif';
        picker.addEventListener('change', function () {
            var f = picker.files && picker.files[0];
            if (f && f.path) {
                var p = f.path.replace(/\\/g, '/');
                cfg.set('manualPath', p);
                manualInput.set(p);
                cfg.set('source', 'manual');
                apply();
                ui.toast('已选择：' + p);
            } else if (f) {
                ui.toast('拿不到本地路径');
            }
        });
        picker.click();
    });
    s1.add(ui.row('', pickBtn));
    s1.add(ui.slider({ label: '缩放', min: 50, max: 200, step: 5, value: cfg.get('scale'), format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('scale', v); } }));
    s1.add(ui.slider({ label: '壁纸不透明度', min: 10, max: 100, step: 5, value: cfg.get('opacity') != null ? cfg.get('opacity') : 100, format: function (v) { return v + '%'; }, onInput: function (v) { cfg.set('opacity', v); var stg = document.getElementById('__dsh_wallpaper_stage__'); if (stg) stg.style.opacity = (v / 100); } }));
    s1.add(ui.toggle({ label: '视频静音', value: cfg.get('muted'), onChange: function (v) { cfg.set('muted', v); apply(); } }));
    s1.add(ui.button('重新读取壁纸', function () { apply(); ui.toast('已重新读取'); }));
    wrap.appendChild(s1.el);
    wrap.appendChild(ui.note('提示：Web 壁纸含背景音乐时可能无法静音（浏览器同源限制）。<br>若与"主题"插件的背景图叠加，请先在主题里关掉背景图。'));
    return wrap;
}

module.exports = { enable: enable, disable: disable, settings: settings };
