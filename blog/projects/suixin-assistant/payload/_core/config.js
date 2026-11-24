/* ============================================================
 * Harness 内核 —— 配置存储
 * ------------------------------------------------------------
 * 每个插件一个独立的 localStorage 键（命名空间隔离）：
 *     __dsh_plugin_<id>__
 * 键名带前缀 __dsh_ 便于一键清理，也避免和页面自身的数据冲突。
 * ============================================================ */
'use strict';

function keyOf(id) {
    return '__dsh_plugin_' + id + '__';
}

function clone(obj) {
    var out = {};
    for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
}

/**
 * 创建一个插件配置存储。
 * @param {string} id       插件 id
 * @param {object} defaults 默认值
 * @returns 带 get/set/patch/reset/all/subscribe 的存储对象
 */
function create(id, defaults) {
    defaults = clone(defaults || {});
    var listeners = [];
    var data = read();

    function read() {
        var out = clone(defaults);
        try {
            var raw = localStorage.getItem(keyOf(id));
            if (raw) {
                var saved = JSON.parse(raw);
                // 以 __ 开头的键是内核元数据，不参与合并
                if (saved && typeof saved === 'object') {
                    for (var k in saved) {
                        if (k.indexOf('__') !== 0) out[k] = saved[k];
                    }
                }
            }
        } catch (e) {}
        return out;
    }

    function persist() {
        try { localStorage.setItem(keyOf(id), JSON.stringify(data)); } catch (e) {}
    }

    function emit(changed) {
        // 复制一份监听器数组，允许在回调里退订
        listeners.slice().forEach(function (fn) {
            try { fn(clone(data), changed); } catch (e) { console.error('[DSH] config listener', e); }
        });
    }

    return {
        id: id,
        defaults: clone(defaults),
        all: function () { return clone(data); },
        get: function (k) { return data[k]; },
        set: function (k, v) { data[k] = v; persist(); var ch = {}; ch[k] = v; emit(ch); },
        patch: function (obj) {
            for (var k in obj) data[k] = obj[k];
            persist();
            emit(clone(obj));
        },
        reset: function () { data = clone(defaults); persist(); emit(clone(data)); },
        subscribe: function (fn) {
            listeners.push(fn);
            var alive = true;
            return function () {
                if (!alive) return;
                alive = false;
                var i = listeners.indexOf(fn);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
        /** 彻底清空该插件在 localStorage 里的数据 */
        destroy: function () {
            try { localStorage.removeItem(keyOf(id)); } catch (e) {}
            data = clone(defaults);
            emit(clone(data));
        },
        storageKey: keyOf(id)
    };
}

module.exports = { create: create, keyOf: keyOf };
