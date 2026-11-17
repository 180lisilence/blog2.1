// renderer/store.js
// boot.js 原来的代码： window.workbenchAPI.initStore();
'use strict';
// 用 wbAPI 避免与 preload contextBridge 注入的 workbenchAPI 标识符冲突
const wbAPI = window.workbenchAPI || {
    _lsKey: 'workbench-data', // 旧版 localStorage 键（用于迁移）
    _key: 'workbench',        // 新版 BS 键（走后端）
    async load() {
        try {
            let data = (window.BS) ? window.BS.get(this._key) : null;
            if (data === null || data === undefined) {
                // 旧版数据迁移：localStorage 的 workbench-data → 后端
                try {
                    const raw = localStorage.getItem(this._lsKey);
                    if (raw) {
                        data = JSON.parse(raw);
                        if (window.BS) window.BS.set(this._key, data);
                    }
                } catch (e2) {}
            }
            return {
                success: true,
                data: data || null,
                // 旧版把函数本身当布尔值用，永远为 true；这里显式调用。
                server: !!(window.BS && typeof window.BS.server === 'function' && window.BS.server())
            };
        } catch (e) { return { success: false, error: e.message }; }
    },
    async save(data) {
        try {
            if (window.BS) window.BS.set(this._key, data);
            else localStorage.setItem(this._lsKey, JSON.stringify(data));
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    },
    async exportBackup(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'workbench-backup-' + new Date().toISOString().slice(0,10) + '.json';
        a.click(); URL.revokeObjectURL(url);
        return { success: true, filePath: '下载文件' };
    }
};
// ==================== 常量定义 ====================
// 模块名称映射表：用于编辑弹窗标题、回收站行等位置的显示
const STORE_LABELS = {
    todos: '今日计划',
    media: '自媒体',
    develop: '开发工作',
    consult: '咨询工作',
    fitness: '健身计划',
    diet: '饮食计划',
    game: '游戏娱乐',
    notes: '备忘',
    recycleBin: '回收站',
    aiConvs: 'AI 对话',
    aiMsgs: 'AI 消息',
    config: '配置'
};

// ==================== 磁盘存储模块 ====================
// 数据流：启动读取磁盘 → 内存 appStore → 修改后防抖写入磁盘
let appStore = {};
let saveTimeout = null;
let isSaving = false;
let saveQueued = false;

// API Key 管理：
// - config.ai.apiKey 是持久化的值（受"记住 Key"开关控制）
// - sessionKey 是本次会话临时输入的 Key（不持久化）
// - get() 返回：优先持久化的，其次是本次会话临时的
let sessionKey = ''; // 仅内存，不持久化
const AIKey = {
    set(v, persist = true) {
        if (!appStore || !appStore.config) appStore.config = {};
        if (!appStore.config.ai) appStore.config.ai = {};
        const val = String(v || '');
        if (persist) {
            appStore.config.ai.apiKey = val;
            appStore.config.ai.rememberKey = true;
        } else {
            sessionKey = val; // 只存内存
        }
        appStore.config.ai.__keySet = !!val;
    },
    get() {
        // 优先返回持久化的，其次返回本次会话临时的
        return appStore?.config?.ai?.apiKey || sessionKey || '';
    },
    has() {
        return !!this.get();
    },
    clear() {
        this.set('', true);
        sessionKey = '';
    }
};

// 所有需要持久化的 store 名称
const STORES = ['todos','media','develop','consult','fitness','diet','game','notes','recycleBin','config','aiConvs','aiMsgs'];

// 数据格式版本：后续字段调整时按版本做迁移，导入备份时也做校验。
const SCHEMA_VERSION = 2;
// AI 消息上限：单会话保留最近 200 条，全局最多 2000 条，超出自动丢弃最老的。
const AI_MSG_PER_CONV = 200;
const AI_MSG_TOTAL = 2000;

function getDefaultStore() {
    const store = {};
    STORES.forEach(s => { store[s] = []; });
    store.config = Config._clone(Config.defaults);
    store._meta = { schemaVersion: SCHEMA_VERSION, updatedAt: U.now() };
    return store;
}

let statusBound = false;
function bindStatus() {
    if (statusBound) return;
    statusBound = true;
    const chip = document.getElementById('db-status');
    if (chip && !chip._retryBound) {
        chip._retryBound = true;
        chip.addEventListener('click', () => {
            if (!window.BS || typeof window.BS.status !== 'function') return;
            if (window.BS.status() === 'failed') { window.BS.retryNow(); UI.Toast.ok('正在重试同步…'); }
            else if (window.BS.status() === 'local') UI.Toast.warn('当前是本地模式，登录后才会同步到云端');
        });
    }
    if (!window.BS || typeof window.BS.onStatus !== 'function') return;
    window.BS.onStatus(function (info) {
        const el = document.getElementById('db-status');
        if (!el) return;
        if (info.status === 'saving') {
            el.textContent = '☁️ 正在保存…';
            el.className = 'status-chip';
            el.title = '';
        } else if (info.status === 'saved') {
            el.textContent = '☁️ 云端已保存';
            el.className = 'status-chip';
            el.title = '最近一次保存已写入云端';
        } else if (info.status === 'failed') {
            el.textContent = '⚠️ 待同步 ' + info.pending + ' 项 · 点此重试';
            el.className = 'status-chip err clickable';
            el.title = info.error || '网络异常';
        } else if (info.status === 'local') {
            el.textContent = '💾 本地模式（未连云端）';
            el.className = 'status-chip warn clickable';
            el.title = '登录后才会同步到云端';
        }
    });
}

async function initStore() {
    bindStatus();
    try {
        // 关键：先等云端首次全量拉取结束。新设备没有本地快照时，
        // 旧代码会立刻把默认空数据写回去，等于用空数据覆盖云端。
        if (window.BS && window.BS.ready) { try { await window.BS.ready; } catch (e) {} }
        const result = await wbAPI.load();
        if (result.success && result.data) {
            appStore = result.data;
            STORES.forEach(s => { if (!appStore[s]) appStore[s] = []; });
            if (!appStore.config) appStore.config = Config._clone(Config.defaults);
            migrateConfig();
            migrateSchema();
            const el = document.getElementById('db-status');
            if (el) {
                el.textContent = result.server ? '☁️ 云端数据已同步' : '💾 本地模式（未连云端）';
                el.className = result.server ? 'status-chip' : 'status-chip warn clickable';
            }
        } else {
            appStore = getDefaultStore();
            // 只有确认连上云端才写初始数据；离线/未登录只写本地快照。
            if (result.server) {
                try { await persistStore(); } catch (e) { console.warn('persistStore保存警告', e); }
            }
        }
    } catch (err) {
        appStore = getDefaultStore();
        document.getElementById('db-status').textContent = '⚠️ 云端连接失败，离线模式';
        document.getElementById('db-status').className = 'status-chip err';
        console.error('initStore error:', err);
        // 连接失败时只保留内存默认数据，不再写盘，避免把空数据覆盖到云端。
    }
}

// 旧版本使用 config.global 嵌套存储整个配置对象；新版本改为扁平键。
// 加载时若检测到 config.global，则将其内容提升为扁平键，并移除 global。
function migrateConfig() {
    if (!appStore || !appStore.config) return;
    const g = appStore.config.global;
    if (g && typeof g === 'object') {
        for (const k of Object.keys(g)) {
            if (appStore.config[k] === undefined) appStore.config[k] = g[k];
        }
        delete appStore.config.global;
        debouncePersistStore();
    }
}

// 数据格式版本迁移。v1 → v2：给缺 _store 的历史条目补上归属模块。
function migrateSchema() {
    if (!appStore) return;
    if (!appStore._meta || typeof appStore._meta !== 'object') {
        appStore._meta = { schemaVersion: 1 };
    }
    const v = Number(appStore._meta.schemaVersion) || 1;
    if (v < SCHEMA_VERSION) {
        STORES.forEach(s => {
            if (!Array.isArray(appStore[s])) return;
            appStore[s].forEach(i => { if (i && typeof i === 'object' && !i._store) i._store = s; });
        });
        appStore._meta.schemaVersion = SCHEMA_VERSION;
        debouncePersistStore();
    }
    appStore._meta.updatedAt = U.now();
}

async function persistStore() {
    // 旧版 isSaving 时直接 return，保存期间的新改动会被丢掉。
    // 现在改成「保存中再排一次」，确保最后一次修改也会落盘。
    if (isSaving) { saveQueued = true; return; }
    isSaving = true;
    try {
        if (!wbAPI) {
            throw new Error('workbenchAPI 未就绪，请检查 preload');
        }
        const result = await wbAPI.save(appStore);
        if (!result.success) {
            document.getElementById('db-status').textContent = '⚠️ 云端保存失败: ' + result.error;
            document.getElementById('db-status').className = 'status-chip err clickable';
        }
        // 成功时交给 BS 的状态回调显示「正在保存 / 已保存 / 待重试」，
        // 避免在 push 还没发出时就提前显示「已保存」。
    } catch (err) {
        document.getElementById('db-status').textContent = '⚠️ 云端保存异常: ' + err.message;
        document.getElementById('db-status').className = 'status-chip err clickable';
    } finally {
        isSaving = false;
        if (saveQueued) {
            saveQueued = false;
            debouncePersistStore();
        }
    }
}
// async function persistStore() {
//     if (isSaving) return;
//     isSaving = true;
//     try {
//         const result = await workbenchAPI.save(appStore);
//

function debouncePersistStore() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        persistStore();
    }, 300);
}

// ---------- DB操作（操作内存 appStore，自动触发防抖保存） ----------
async function DBgetAll(storeName) {
    return appStore[storeName] || [];
}

async function DBget(storeName, id) {
    const arr = appStore[storeName] || [];
    return arr.find(item => item.id === id) || null;
}

async function DBput(storeName, item) {
    const arr = appStore[storeName];
    if (!arr) return;
    const idx = arr.findIndex(i => i.id === item.id);
    if (idx >= 0) {
        arr[idx] = { ...item, _store: storeName, updatedAt: U.now() };
    } else {
        arr.push({ ...item, _store: storeName, updatedAt: U.now() });
    }
    debouncePersistStore();
    return item;
}

async function DBadd(storeName, item) {
    if (!item.id) item.id = U.uid();
    item.createdAt = U.now();
    item.updatedAt = U.now();
    item._store = storeName;
    const arr = appStore[storeName];
    if (!arr) return;
    arr.push(item);
    debouncePersistStore();
    return item;
}

async function DBdelete(storeName, id) {
    const arr = appStore[storeName];
    if (!arr) return;
    const idx = arr.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item = arr[idx];
    const recycleItem = { ...item, _origStore: storeName, _deletedAt: U.now() };
    if (!appStore.recycleBin) appStore.recycleBin = [];
    appStore.recycleBin.push(recycleItem);
    arr.splice(idx, 1);
    debouncePersistStore();
}

async function DBpurge(storeName, id) {
    const arr = appStore[storeName];
    if (!arr) return;
    const idx = arr.findIndex(i => i.id === id);
    if (idx !== -1) {
        arr.splice(idx, 1);
        debouncePersistStore();
    }
}

// ===== Config (基于 appStore.config，扁平键值结构) =====
const Config = {
    defaults: {
        notifyEnabled: true,
        defaultPriority: 'mid',
        ai: {
            provider: 'doubao',
            apiKey: '',
            model: 'doubao-seed-evolving',
            apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            scannedModels: [],
            systemPrompt: '你是一个友好、专业的 AI 助手。请用中文回答用户的问题，回答要简洁准确。'
        }
    },
    _clone(o) {
        if (o === null || typeof o !== 'object') return o;
        if (Array.isArray(o)) return o.map(x => this._clone(x));
        const out = {};
        for (const k of Object.keys(o)) out[k] = this._clone(o[k]);
        return out;
    },
    get(k, d) {
        if (!appStore || !appStore.config) return this._clone(d);
        const v = appStore.config[k] !== undefined ? appStore.config[k] : d;
        return this._clone(v);
    },
    set(k, v) {
        if (!appStore) return;
        if (!appStore.config) appStore.config = {};
        appStore.config[k] = v;
        debouncePersistStore();
    },
    // AI 是否已配置：持久化的 Key 或本次会话临时 Key 任一存在即可
    aiReady() {
        const ai = this.get('ai', this.defaults.ai);
        return !!(ai.apiKey || sessionKey);
    },
    sanitizeAi(providers) {
        try {
            const ai = this.get('ai', { ...this.defaults.ai });
            const fixed = { ...ai };
            let changed = false;
            if (!providers[ai.provider]) {
                fixed.provider = 'doubao';
                fixed.model = 'doubao-seed-evolving';
                changed = true;
            } else if (!ai.model) {
                fixed.model = providers[ai.provider].defaultModel;
                changed = true;
            }
            if (changed) {
                this.set('ai', fixed);
            }
        } catch (e) {
            console.warn('sanitizeAi 失败:', e);
        }
    }
};

// 导入校验：旧版只判断「是不是对象」，任意 JSON 都能灌进来。
// 这里按 store 校验顶层类型和条目结构，返回空字符串表示通过。
function validateImport(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return '备份格式无效：顶层必须是对象';
    let itemCount = 0;
    for (const s of STORES) {
        if (s === 'config') continue;
        if (data[s] === undefined) continue;
        if (!Array.isArray(data[s])) return `字段「${STORE_LABELS[s] || s}」必须是数组`;
        for (const item of data[s]) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return `「${STORE_LABELS[s] || s}」里存在非法条目`;
            }
            itemCount++;
        }
    }
    if (data.config !== undefined && (typeof data.config !== 'object' || Array.isArray(data.config))) {
        return 'config 必须是对象';
    }
    if (data._meta !== undefined && (typeof data._meta !== 'object' || Array.isArray(data._meta))) {
        return '_meta 必须是对象';
    }
    if (itemCount === 0 && !data.config) return '备份里没有可导入的数据';
    return '';
}

// 挂载全局
window.Store = {
    workbenchAPI: wbAPI,
    STORES,
    STORE_LABELS,
    SCHEMA_VERSION,
    AI_MSG_PER_CONV,
    AI_MSG_TOTAL,
    initStore,
    persistStore,
    debouncePersistStore,
    migrateConfig,
    migrateSchema,
    validateImport,
    DBgetAll,
    DBget,
    DBput,
    DBadd,
    DBdelete,
    DBpurge,
    Config,
    AIKey,
    getDefaultStore
};
// appStore 在 initStore 里会被整体替换；如果这里直接存引用，
// 设置页的导出/导入会一直操作最初那个空对象。用 getter 始终指向当前数据。
Object.defineProperty(window.Store, 'appStore', {
    enumerable: true,
    get() { return appStore; }
});
