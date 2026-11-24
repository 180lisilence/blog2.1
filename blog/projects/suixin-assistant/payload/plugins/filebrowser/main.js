/* ============================================================
 * 文件浏览器插件 —— 右侧面板（图标嵌在小鱼娘身上）
 * ============================================================ */
'use strict';

var ctx = null;
var store = null;
var panel = null;
var fileIcon = null;
var currentDir = '';

function fs() { return ctx.fs || require('fs'); }
function path() { return ctx.path || require('path'); }

function listDir(dir) {
    try {
        var items = fs().readdirSync(dir, { withFileTypes: true });
        var dirs = [], files = [];
        items.forEach(function (it) {
            try {
                var full = path().join(dir, it.name);
                var st = fs().statSync(full);
                if (it.isDirectory()) dirs.push({ name: it.name, type: 'dir' });
                else files.push({ name: it.name, type: 'file', size: st.size });
            } catch (e) {}
        });
        dirs.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        files.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        return dirs.concat(files);
    } catch (e) { return []; }
}

function isImage(name) { return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name); }
function isText(name) { return /\.(txt|md|json|js|css|html|csv|log|xml|yml|yaml)$/i.test(name); }

function fileUrl(p) {
    try {
        var ab = fs().readFileSync(p).buffer;
        var ext = p.split('.').pop().toLowerCase();
        var mime = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
        }[ext] || 'application/octet-stream';
        return URL.createObjectURL(new Blob([ab], { type: mime }));
    } catch (e) { return null; }
}

function buildFileIcon() {
    var tryAttach = function () {
        var whale = document.getElementById('ds-whale-widget');
        if (!whale) {
            setTimeout(tryAttach, 500);
            return;
        }
        if (document.getElementById('__dsh_file_icon__')) return;
        fileIcon = document.createElement('div');
        fileIcon.id = '__dsh_file_icon__';
        fileIcon.textContent = '🐋';
        fileIcon.title = '文件面板（点击切换）';
        fileIcon.style.cssText =
            'position:absolute;left:50%;top:-6px;transform:translateX(-50%);' +
            'width:28px;height:28px;line-height:28px;text-align:center;' +
            'background:rgba(40,40,60,.9);border:2px solid #6a6aff;border-radius:50%;' +
            'cursor:pointer;font-size:13px;z-index:10;pointer-events:auto;' +
            'box-shadow:0 2px 8px rgba(0,0,0,.4);transition:transform .15s;';
        fileIcon.onmouseenter = function () { fileIcon.style.transform = 'translateX(-50%) scale(1.15)'; };
        fileIcon.onmouseleave = function () { fileIcon.style.transform = 'translateX(-50%) scale(1)'; };
        fileIcon.onclick = function (e) {
            e.stopPropagation();
            e.preventDefault();
            setVisible(!store.get('visible'));
            store.set('visible', !!store.get('visible'));
        };
        whale.appendChild(fileIcon);
        ctx.log('文件图标已嵌到小鱼娘身上');
    };
    tryAttach();
}

function buildPanel() {
    if (panel && panel.parentNode) return panel;
    panel = document.createElement('div');
    panel.id = '__dsh_filebrowser__';
    panel.style.cssText =
        'position:fixed;right:0;top:0;height:100vh;' +
        'width:' + (store.get('width') || 320) + 'px;' +
        'background:rgba(20,20,28,.92);backdrop-filter:blur(12px);' +
        'border-left:1px solid #2a2a37;z-index:9999;' +
        'display:flex;flex-direction:column;color:#e8e8f0;font-size:13px;' +
        'font-family:system-ui,sans-serif;box-shadow:-4px 0 24px rgba(0,0,0,.3);' +
        'transition:transform .25s ease;';
    document.body.appendChild(panel);
    var grip = document.createElement('div');
    grip.id = '__dsh_filebrowser_grip__';
    grip.style.cssText =
        'position:absolute;left:0;top:0;width:6px;height:100%;cursor:ew-resize;' +
        'background:transparent;z-index:10;';
    grip.onmouseenter = function () { grip.style.background = 'rgba(100,150,255,.3)'; };
    grip.onmouseleave = function () { grip.style.background = 'transparent'; };
    var dragging = false, startX = 0, startW = 0;
    grip.addEventListener('mousedown', function (e) {
        dragging = true;
        startX = e.clientX;
        startW = panel.offsetWidth;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = startX - e.clientX;
        var newW = Math.max(240, Math.min(600, startW + dx));
        panel.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', function () {
        if (dragging) {
            dragging = false;
            store.set('width', panel.offsetWidth);
        }
    });
    panel.appendChild(grip);
    return panel;
}

function setVisible(v) {
    if (!panel) return;
    if (v) { panel.style.transform = ''; }
    else { panel.style.transform = 'translateX(100%)'; }
}

function renderHeader() {
    var hdr = document.createElement('div');
    hdr.style.cssText = 'padding:10px 12px;border-bottom:1px solid #2a2a37;display:flex;align-items:center;gap:8px;flex-shrink:0;';
    var up = document.createElement('button');
    up.textContent = '←';
    up.title = '上级目录';
    up.style.cssText = 'width:28px;height:28px;border-radius:6px;border:0;background:#2a2a37;color:#e8e8f0;cursor:pointer;flex-shrink:0;';
    up.onclick = function () {
        var root = store.get('rootPath');
        if (currentDir && root && currentDir !== root) {
            currentDir = path().dirname(currentDir);
            renderList();
        }
    };
    var title = document.createElement('div');
    title.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9a9aa8;';
    title.textContent = currentDir || '未设置文件夹';
    title.title = currentDir;
    var close = document.createElement('button');
    close.textContent = '×';
    close.title = '收起面板';
    close.style.cssText = 'width:28px;height:28px;border-radius:6px;border:0;background:transparent;color:#9a9aa8;cursor:pointer;flex-shrink:0;font-size:18px;';
    close.onclick = function () {
        setVisible(false);
        store.set('visible', false);
    };
    hdr.appendChild(up);
    hdr.appendChild(title);
    hdr.appendChild(close);
    panel.appendChild(hdr);
}

function renderList() {
    while (panel.children.length > 2) panel.removeChild(panel.children[2]);
    if (!currentDir) {
        var empty = document.createElement('div');
        empty.style.cssText = 'padding:24px;text-align:center;color:#6a6a78;';
        empty.textContent = '在齿轮设置里指定一个文件夹';
        panel.appendChild(empty);
        return;
    }
    var list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;padding:4px;';
    listDir(currentDir).forEach(function (item) {
        var row = document.createElement('div');
        row.style.cssText = 'padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px;';
        row.onmouseenter = function () { row.style.background = 'rgba(255,255,255,.06)'; };
        row.onmouseleave = function () { row.style.background = 'transparent'; };
        var icon = document.createElement('span');
        icon.style.cssText = 'flex-shrink:0;width:18px;text-align:center;';
        icon.textContent = item.type === 'dir' ? '📁' : (isImage(item.name) ? '🖼' : '📄');
        var name = document.createElement('span');
        name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        name.textContent = item.name;
        row.appendChild(icon);
        row.appendChild(name);
        if (item.type === 'dir') {
            row.onclick = function () {
                currentDir = path().join(currentDir, item.name);
                renderList();
            };
        } else {
            row.onclick = function () {
                var full = path().join(currentDir, item.name);
                previewFile(full, item.name);
            };
        }
        list.appendChild(row);
    });
    panel.appendChild(list);
}

function previewFile(full, name) {
    while (panel.children.length > 2) panel.removeChild(panel.children[2]);
    var back = document.createElement('div');
    back.style.cssText = 'padding:8px 12px;cursor:pointer;color:#7ab8ff;flex-shrink:0;';
    back.textContent = '← 返回列表';
    back.onclick = renderList;
    panel.appendChild(back);
    var box = document.createElement('div');
    box.style.cssText = 'flex:1;overflow:auto;padding:8px;';
    if (isImage(name)) {
        var url = fileUrl(full);
        if (url) {
            var img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:100%;border-radius:6px;';
            box.appendChild(img);
        } else {
            box.textContent = '图片加载失败';
        }
    } else if (isText(name)) {
        try {
            var txt = fs().readFileSync(full, 'utf8').slice(0, 5000);
            var pre = document.createElement('pre');
            pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;color:#c8c8d4;';
            pre.textContent = txt;
            box.appendChild(pre);
        } catch (e) {
            box.textContent = '文本读取失败';
        }
    } else {
        box.textContent = '（不支持预览：' + name + '）';
    }
    panel.appendChild(box);
}

function makeNativeSidebarResizable() {
    var findSidebar = function () {
        var all = document.querySelectorAll('div, nav, aside');
        var best = null, bestScore = 0;
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var r = el.getBoundingClientRect();
            if (r.left < -5 || r.left > 10) continue;
            if (r.width < 150 || r.width > 400) continue;
            if (r.height < window.innerHeight * 0.7) continue;
            if (el.style.position === 'fixed' || getComputedStyle(el).position === 'fixed') {
                return el;
            }
            if (!best || r.width < bestScore) { best = el; bestScore = r.width; }
        }
        return best;
    };
    var tryInit = function () {
        var sb = findSidebar();
        if (!sb) { setTimeout(tryInit, 1000); return; }
        if (document.getElementById('__dsh_sidebar_grip__')) return;
        var grip = document.createElement('div');
        grip.id = '__dsh_sidebar_grip__';
        grip.style.cssText =
            'position:absolute;right:-3px;top:0;width:6px;height:100%;cursor:ew-resize;' +
            'z-index:100;';
        grip.onmouseenter = function () { grip.style.background = 'rgba(100,150,255,.3)'; };
        grip.onmouseleave = function () { grip.style.background = 'transparent'; };
        var dragging = false, startX = 0, startW = 0;
        grip.addEventListener('mousedown', function (e) {
            dragging = true;
            startX = e.clientX;
            startW = sb.offsetWidth;
            e.preventDefault();
            e.stopPropagation();
        });
        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - startX;
            sb.style.width = Math.max(180, Math.min(500, startW + dx)) + 'px';
        });
        document.addEventListener('mouseup', function () { dragging = false; });
        sb.appendChild(grip);
        ctx.log('原生侧边栏已加拖拽');
    };
    tryInit();
}

function goBack() {
    var root = store.get('rootPath');
    if (currentDir && root && currentDir !== root) {
        currentDir = path().dirname(currentDir);
        renderList();
    }
}

function enable(c) {
    ctx = c;
    store = c.config;
    buildPanel();
    buildFileIcon();
    makeNativeSidebarResizable();
    currentDir = store.get('rootPath') || '';
    renderHeader();
    renderList();
    setVisible(!!store.get('visible'));
    var onKey = function (e) {
        if (e.key === 'Backspace' && store.get('visible')) {
            var tag = (e.target && e.target.tagName) || '';
            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                e.preventDefault();
                goBack();
            }
        }
    };
    var onMouse = function (e) {
        if (e.button === 3 && store.get('visible')) {
            e.preventDefault();
            goBack();
        }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    c.onCleanup(function () {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('mousedown', onMouse);
    });
    c.log('文件浏览器已启用');
}

function disable(c) {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (fileIcon && fileIcon.parentNode) fileIcon.parentNode.removeChild(fileIcon);
    var grip = document.getElementById('__dsh_sidebar_grip__');
    if (grip && grip.parentNode) grip.parentNode.removeChild(grip);
    panel = null;
    fileIcon = null;
    c.log('文件浏览器已卸载');
}

function settings(c) {
    var wrap = c.ui.el('div');
    var cfg = c.config;
    var s1 = c.ui.section('文件夹浏览');
    var input = c.ui.input({
        label: '根文件夹路径',
        value: cfg.get('rootPath') || '',
        placeholder: '如 D:/Notes 或 D:/Pictures',
        onChange: function (v) {
            cfg.set('rootPath', v);
            currentDir = v;
            renderList();
        }
    });
    s1.add(input);
    var pickBtn = c.ui.button('浏览文件夹…', function () {
        var picker = document.createElement('input');
        picker.type = 'file';
        picker.setAttribute('webkitdirectory', '');
        picker.addEventListener('change', function () {
            var f = picker.files && picker.files[0];
            if (f && f.path) {
                var root = f.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                cfg.set('rootPath', root);
                input.set(root);
                currentDir = root;
                renderList();
                c.ui.toast('已选：' + root);
            }
        });
        picker.click();
    });
    s1.add(c.ui.row('', pickBtn));
    wrap.appendChild(s1.el);
    return wrap;
}

module.exports = { enable: enable, disable: disable, settings: settings };
