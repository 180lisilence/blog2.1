// renderer/store.js
// boot.js 原来的代码： window.workbenchAPI.initStore();
'use strict';
// 用 wbAPI 避免与 preload contextBridge 注入的 workbenchAPI 标识符冲突
const wbAPI = window.workbenchAPI || {
    _lsKey: 'workbench-data', // 旧版 localStorage 键（用于迁移）
    _key: 'workbench',        // 新版 BS 键（走后端）
    async load() {
        try {
            let data = (window.BS) ? BS.get(this._key) : null;
            if (data === null || data === undefined) {
                // 旧版数据迁移：localStorage 的 workbench-data → 后端
                try {
                    const raw = localStorage.getItem(this._lsKey);
                    if (raw) {
                        data = JSON.parse(raw);
                        if (window.BS) BS.set(this._key, data);
                    }
                } catch (e2) {}
            }
            return {
                success: true,
                data: data || null,
                server: !!(window.BS && window.BS.server)
            };
        } catch (e) { return { success: false, error: e.message }; }
    },
    async save(data) {
        try {
            if (window.BS) BS.set(this._key, data);
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

// 所有需要持久化的 store 名称
const STORES = ['todos','media','develop','consult','fitness','diet','game','notes','recycleBin','config','aiConvs','aiMsgs'];

function getDefaultStore() {
    const store = {};
    STORES.forEach(s => { store[s] = []; });
    store.config = Config._clone(Config.defaults);
    return store;
}

async function initStore() {
    try {
        const result = await wbAPI.load();
        if (result.success && result.data) {
            appStore = result.data;
            STORES.forEach(s => { if (!appStore[s]) appStore[s] = []; });
            if (!appStore.config) appStore.config = Config._clone(Config.defaults);
            migrateConfig();
            document.getElementById('db-status').textContent = '● 数据已加载';
            document.getElementById('db-status').className = 'status-chip';
        } else {
            appStore = getDefaultStore();
            document.getElementById('db-status').textContent = '● 新数据初始化';
            document.getElementById('db-status').className = 'status-chip';
            try { await persistStore(); } catch(e) { console.warn('persistStore保存警告', e); }
        }
    } catch (err) {
        appStore = getDefaultStore();
        document.getElementById('db-status').textContent = '● 加载失败，使用空数据';
        document.getElementById('db-status').className = 'status-chip err';
        console.error('initStore error:', err);
        try { await persistStore(); } catch(e) {}
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
async function persistStore() {
    if (isSaving) return;
    isSaving = true;
    try {
        if (!wbAPI) {
            throw new Error('workbenchAPI 未就绪，请检查 preload');
        }
        const result = await wbAPI.save(appStore);
        if (result.success) {
            document.getElementById('db-status').textContent = '● 数据已持久化';
            document.getElementById('db-status').className = 'status-chip';
        } else {
            document.getElementById('db-status').textContent = '● 保存失败: ' + result.error;
            document.getElementById('db-status').className = 'status-chip err';
        }
    } catch (err) {
        document.getElementById('db-status').textContent = '● 保存异常: ' + err.message;
        document.getElementById('db-status').className = 'status-chip err';
    } finally {
        isSaving = false;
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
        arr[idx] = { ...item, updatedAt: U.now() };
    } else {
        arr.push({ ...item, updatedAt: U.now() });
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

// 挂载全局
window.Store = {
    workbenchAPI: wbAPI,
    appStore,
    STORES,
    STORE_LABELS,
    initStore,
    persistStore,
    debouncePersistStore,
    migrateConfig,
    DBgetAll,
    DBget,
    DBput,
    DBadd,
    DBdelete,
    DBpurge,
    Config,
    getDefaultStore
};
