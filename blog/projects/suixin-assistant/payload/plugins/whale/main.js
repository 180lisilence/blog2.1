/* ============================================================
 * 小鲸鱼挂件插件 —— 包装层
 * 读取 assets/whale-inject.js 并在页面上下文执行
 * ============================================================ */
'use strict';

var ctx = null;
var injected = false;

function enable(c) {
    ctx = c;

    // 等启动动画遮罩消失后再加载，避免和 splash 抢画面
    function start() {
        var fs = c.fs || require('fs');
        var path = c.path || require('path');
        var scriptPath = path.join(c.dir, 'assets', 'whale-inject.js');

    try {
        // 从插件配置读 API Key，同步到 localStorage
        var apiKey = c.config.get('apiKey') || '';
        if (apiKey) {
            localStorage.setItem('dsWhaleApiKey', apiKey);
        } else {
            apiKey = localStorage.getItem('dsWhaleApiKey') || '';
        }
        c.log('API Key 存在:', !!apiKey);

        var code = fs.readFileSync(scriptPath, 'utf8');

        // Electron 不支持 prompt，临时替换；同时去掉无 key 直接 return 的逻辑
        var origPrompt = window.prompt;
        window.prompt = function () { return apiKey || 'dummy-key'; };
        code = code.replace("if (!API_KEY) return;", "/* if (!API_KEY) return; */");

        try {
            var fn = new Function(code);
            fn();
        } finally {
            window.prompt = origPrompt;
        }

        injected = true;
        c.log('小鲸鱼挂件已加载');
        setTimeout(function () {
            var el = document.getElementById('ds-whale-widget');
            c.log('鲸鱼元素存在:', !!el);
        }, 1000);
    } catch (e) {
        c.log('加载失败:', e.message, e.stack);
    }

    c.onCleanup(function () {
        var el = document.getElementById('ds-whale-widget');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        window.__dsWhaleWidget = false;
    });
    }

    // 等 splash 遮罩消失（或最多 6 秒），再加载鲸鱼
    var waited = 0;
    var timer = setInterval(function () {
        waited += 200;
        var splashGone = !document.getElementById('__dsh_splash__');
        if (splashGone || waited > 6000) {
            clearInterval(timer);
            start();
        }
    }, 200);
}

function disable(c) {
    c.log('小鲸鱼挂件已卸载');
}

function settings(c) {
    var root = c.ui.el('div');
    root.style.cssText = 'padding: 8px 0;';

    var row = c.ui.el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;';

    var label = c.ui.el('label');
    label.textContent = 'DeepSeek API Key';
    label.style.cssText = 'min-width:120px;color:#9a9aa8;font-size:13px;';

    var input = c.ui.el('input');
    input.type = 'password';
    input.placeholder = 'sk-...';
    input.value = c.config.get('apiKey') || '';
    input.style.cssText = 'flex:1;padding:8px 12px;border-radius:8px;border:1px solid #2a2a37;background:#1b1b23;color:#ececf1;font-size:13px;';

    var eye = c.ui.el('button');
    eye.textContent = '👁';
    eye.title = '显示/隐藏';
    eye.style.cssText = 'width:36px;height:36px;border-radius:8px;border:1px solid #2a2a37;background:#1b1b23;color:#9a9aa8;cursor:pointer;font-size:14px;';
    eye.addEventListener('click', function () {
        input.type = input.type === 'password' ? 'text' : 'password';
    });

    input.addEventListener('change', function () {
        c.config.set('apiKey', input.value.trim());
        localStorage.setItem('dsWhaleApiKey', input.value.trim());
        c.ui.toast('已保存，刷新页面生效');
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(eye);
    root.appendChild(row);

    var tip = c.ui.el('div');
    tip.textContent = '输入 API Key 后刷新页面（Ctrl+R），小鲸鱼就会显示余额了。';
    tip.style.cssText = 'color:#9a9aa8;font-size:12px;line-height:1.6;';
    root.appendChild(tip);

    return root;
}

module.exports = { enable: enable, disable: disable, settings: settings };
