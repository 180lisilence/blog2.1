// renderer/api-ai.js
'use strict';
const Store = window.Store;
const UI = window.UI;

// ============================================================================
// W2-01 / W3-01 / W3-02：AI 请求改走服务端代理
// ---------------------------------------------------------------------------
// 旧版由浏览器直接 fetch 第三方 AI 端点，于是三件事同时成立：
//   1. CSP connect-src 'self' 把第三方请求全拦掉，AI 功能事实上不可用（W3-01）；
//   2. ALLOWED_HOSTS 是挂 window 的运行时 Set，同源脚本可 .add() 改掉，
//      __aiKeyMem 全局可读 —— 客户端白名单根本不是安全边界（W3-02）；
//   3. N-06 把 Key 从 config 剥离到内存后，UI 仍判 !apiKey，全面拒绝发送（W2-01）。
//
// 现在统一走 POST /api/ai/chat（同源）：
//   - 目标域名由 qrcode-login/modules/ai/routes.js 的硬编码表决定，
//     前端传什么 apiUrl 都不参与转发；CSP 一个字都不用放宽；
//   - Key 只随本次请求提交到本站，不落库、不落日志、不写 Cookie；
//   - 上游原始错误正文由服务端脱敏后才回传，不会变成 boot.js 的注入源；
//   - ALLOWED_HOSTS 不再对外暴露可变引用，Key 收进 Store.AIKey 闭包。
// ============================================================================

// AI 服务商配置表（label / model 用于 UI；defaultUrl 仅用于展示与本地预校验，
// 真正的转发目标由服务端决定）
// 注意：这里的 defaultUrl 只用于展示、本地预校验与扫描地址预填；
// 真正的转发目标由服务端 qrcode-login/modules/ai/routes.js 的 AI_ENDPOINTS 决定。
// 扩充供应商时必须两边同步加 host，否则扫描会被域名白名单拦下。
const AI_PROVIDERS = {
    doubao: {
        label: '豆包 (Doubao)',
        defaultModel: 'doubao-seed-evolving',
        defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        models: [
            { value: 'doubao-seed-evolving', label: 'Seed Evolving（通用）' },
            { value: 'doubao-1-5-pro-32k-250115', label: 'Doubao 1.5 Pro 32K' },
            { value: 'doubao-1-5-lite-32k-250115', label: 'Doubao 1.5 Lite 32K' }
        ]
    },
    qwen: {
        label: '通义千问 (Qwen)',
        defaultModel: 'qwen-plus',
        defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        models: [
            { value: 'qwen-plus', label: 'Qwen Plus' },
            { value: 'qwen-max', label: 'Qwen Max' },
            { value: 'qwen-turbo', label: 'Qwen Turbo' }
        ]
    },
    deepseek: {
        label: 'DeepSeek',
        defaultModel: 'deepseek-chat',
        defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
        models: [
            { value: 'deepseek-chat', label: 'DeepSeek Chat' },
            { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
        ]
    },
    openai: {
        label: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        defaultUrl: 'https://api.openai.com/v1/chat/completions',
        models: [
            { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
        ]
    },
    moonshot: {
        label: 'Kimi (Moonshot)',
        defaultModel: 'moonshot-v1-8k',
        defaultUrl: 'https://api.moonshot.cn/v1/chat/completions',
        models: [
            { value: 'moonshot-v1-8k', label: 'Moonshot v1 8K' },
            { value: 'moonshot-v1-32k', label: 'Moonshot v1 32K' },
            { value: 'moonshot-v1-128k', label: 'Moonshot v1 128K' }
        ]
    },
    zhipu: {
        label: '智谱 GLM',
        defaultModel: 'glm-4-flash',
        defaultUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        models: [
            { value: 'glm-4-flash', label: 'GLM-4 Flash（免费）' },
            { value: 'glm-4-plus', label: 'GLM-4 Plus' },
            { value: 'glm-4-air', label: 'GLM-4 Air' }
        ]
    },
    anthropic: {
        label: 'Anthropic Claude',
        defaultModel: 'claude-sonnet-4-5',
        defaultUrl: 'https://api.anthropic.com/v1/messages',
        models: [
            { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
            { value: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
            { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }
        ]
    },
    gemini: {
        label: 'Google Gemini',
        defaultModel: 'gemini-2.5-flash',
        defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        models: [
            { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
        ]
    },
    siliconflow: {
        label: '硅基流动 (SiliconFlow)',
        defaultModel: 'deepseek-ai/DeepSeek-V3',
        defaultUrl: 'https://api.siliconflow.cn/v1/chat/completions',
        models: [
            { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
            { value: 'Qwen/Qwen3-8B', label: 'Qwen3 8B' },
            { value: 'THUDM/glm-4-9b-chat', label: 'GLM-4 9B Chat' }
        ]
    },
    qianfan: {
        label: '百度千帆 (ERNIE)',
        defaultModel: 'ernie-4.0-8k',
        defaultUrl: 'https://qianfan.bce.baidu.com/v2/chat/completions',
        models: [
            { value: 'ernie-4.0-8k', label: 'ERNIE 4.0 8K' },
            { value: 'ernie-3.5-8k', label: 'ERNIE 3.5 8K' },
            { value: 'ernie-speed-8k', label: 'ERNIE Speed 8K' }
        ]
    },
    hunyuan: {
        label: '腾讯混元 (Hunyuan)',
        defaultModel: 'hunyuan-turbo',
        defaultUrl: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
        models: [
            { value: 'hunyuan-turbo', label: 'Hunyuan Turbo' },
            { value: 'hunyuan-standard', label: 'Hunyuan Standard' },
            { value: 'hunyuan-pro', label: 'Hunyuan Pro' }
        ]
    },
    spark: {
        label: '讯飞星火 (Spark)',
        defaultModel: 'generalv3.5',
        defaultUrl: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
        models: [
            { value: 'generalv3.5', label: 'Spark 3.5' },
            { value: '4.0Ultra', label: 'Spark 4.0 Ultra' },
            { value: 'lite', label: 'Spark Lite' }
        ]
    },
    minimax: {
        label: 'MiniMax',
        defaultModel: 'MiniMax-Text-01',
        defaultUrl: 'https://api.minimax.chat/v1/chat/completions',
        models: [
            { value: 'MiniMax-Text-01', label: 'MiniMax Text 01' },
            { value: 'abab6.5s-chat', label: 'abab6.5s Chat' },
            { value: 'abab6.5g-chat', label: 'abab6.5g Chat' }
        ]
    },
    stepfun: {
        label: '阶跃星辰 (StepFun)',
        defaultModel: 'step-2-16k',
        defaultUrl: 'https://api.stepfun.com/v1/chat/completions',
        models: [
            { value: 'step-2-16k', label: 'Step 2 16K' },
            { value: 'step-1-8k', label: 'Step 1 8K' },
            { value: 'step-1v-8k', label: 'Step 1V 8K（视觉）' }
        ]
    },
    yi: {
        label: '零一万物 (Yi)',
        defaultModel: 'yi-large',
        defaultUrl: 'https://api.lingyiwanwu.com/v1/chat/completions',
        models: [
            { value: 'yi-large', label: 'Yi Large' },
            { value: 'yi-medium', label: 'Yi Medium' },
            { value: 'yi-spark', label: 'Yi Spark' }
        ]
    },
    baichuan: {
        label: '百川智能 (Baichuan)',
        defaultModel: 'Baichuan4',
        defaultUrl: 'https://api.baichuan-ai.com/v1/chat/completions',
        models: [
            { value: 'Baichuan4', label: 'Baichuan 4' },
            { value: 'Baichuan3-Turbo', label: 'Baichuan 3 Turbo' },
            { value: 'Baichuan2-Turbo', label: 'Baichuan 2 Turbo' }
        ]
    },
    mistral: {
        label: 'Mistral AI',
        defaultModel: 'mistral-large-latest',
        defaultUrl: 'https://api.mistral.ai/v1/chat/completions',
        models: [
            { value: 'mistral-large-latest', label: 'Mistral Large' },
            { value: 'mistral-small-latest', label: 'Mistral Small' },
            { value: 'open-mistral-nemo', label: 'Mistral Nemo' }
        ]
    },
    groq: {
        label: 'Groq',
        defaultModel: 'llama-3.3-70b-versatile',
        defaultUrl: 'https://api.groq.com/openai/v1/chat/completions',
        models: [
            { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
            { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
            { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' }
        ]
    },
    xai: {
        label: 'xAI (Grok)',
        defaultModel: 'grok-3',
        defaultUrl: 'https://api.x.ai/v1/chat/completions',
        models: [
            { value: 'grok-4', label: 'Grok 4' },
            { value: 'grok-3', label: 'Grok 3' },
            { value: 'grok-3-mini', label: 'Grok 3 Mini' }
        ]
    },
    together: {
        label: 'Together AI',
        defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        defaultUrl: 'https://api.together.xyz/v1/chat/completions',
        models: [
            { value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
            { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
            { value: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen2.5 72B Turbo' }
        ]
    },
    openrouter: {
        label: 'OpenRouter',
        defaultModel: 'openai/gpt-4o',
        defaultUrl: 'https://openrouter.ai/api/v1/chat/completions',
        models: [
            { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
            { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
            { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' }
        ]
    },
    cohere: {
        label: 'Cohere',
        defaultModel: 'command-r-plus',
        defaultUrl: 'https://api.cohere.com/compatibility/v1/chat/completions',
        models: [
            { value: 'command-r-plus', label: 'Command R+' },
            { value: 'command-r', label: 'Command R' },
            { value: 'command', label: 'Command' }
        ]
    }
};

// ============================================================================
// W3-02：白名单不再是安全边界
// ---------------------------------------------------------------------------
// 旧版 buildAllowedHosts() 生成一个可变 Set 并挂到 window.AIMod，同源脚本
// 可以 AIMod.ALLOWED_HOSTS.add('attacker.example') 直接污染。
// 现在目标 URL 由服务端硬编码，前端这份表只用于「本地展示/预校验」，
// 且冻结、不再对外暴露可变引用。
// ============================================================================
const OFFICIAL_HOSTS = Object.freeze(
    Object.keys(AI_PROVIDERS).map(function (k) {
        try { return new URL(AI_PROVIDERS[k].defaultUrl).hostname.toLowerCase(); }
        catch (e) { return ''; }
    }).filter(Boolean)
);

/**
 * 校验并规范化 API 地址（仅本地展示/预校验，不参与实际网络请求）。
 * 实际转发目标由服务端 /api/ai/chat 决定。
 * @param {string} raw
 * @returns {string}
 * @throws {Error}
 */
function resolveApiUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) throw new Error('API 地址为空');

    let u;
    try {
        u = new URL(s);
    } catch (e) {
        throw new Error('API 地址格式不合法');
    }

    if (u.protocol !== 'https:') {
        throw new Error('API 地址必须使用 https://');
    }

    // W3-03：只允许默认 443 端口。非标端口常被用来指向内网服务或自架中转，
    // 服务端代理根本不看 apiUrl，这里一并封死，避免留下可误解的入口。
    if (u.port && u.port !== '443') {
        throw new Error('API 地址不允许使用非标准端口：' + u.port);
    }

    const host = u.hostname.toLowerCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost' || host.endsWith('.local')) {
        throw new Error(`API 地址不允许指向 IP 或本地主机：${host}`);
    }

    if (OFFICIAL_HOSTS.indexOf(host) === -1) {
        throw new Error(
            `API 地址不在允许列表：${host}\n`
            + `允许的域名：${OFFICIAL_HOSTS.join(', ')}`
        );
    }

    if (u.username || u.password) {
        throw new Error('API 地址不允许包含用户名/密码');
    }

    return u.toString();
}

/**
 * 校验 API Key 形状（与服务端 ai/routes.js validateKey 对齐）
 * W3-04：旧版 /^[\x21-\x7E]+$/ 放行 < > " ' 等 HTML 元字符，
 * 曾可被拼进全局错误面板的 innerHTML。这里收紧到白名单字符集。
 * @param {string} key
 * @returns {string}
 * @throws {Error}
 */
function validateApiKey(key) {
    const k = String(key || '').trim();
    if (!k) throw new Error('未配置 API Key');
    if (k.length > 512) throw new Error('API Key 过长');
    if (!/^[A-Za-z0-9._\-]{1,512}$/.test(k)) {
        throw new Error('API Key 含非法字符（只允许字母、数字、. _ -）');
    }
    return k;
}

// ============================================================================
// 同源 POST 封装：自动带 CSRF token，拿不到就补，403「CSRF」时补一次再重试
// （与 blog-storage.js / comments.js 相同的成熟模式）
// ============================================================================
function readCsrfCookie() {
    var m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
}

var csrfCache = '';
function getCsrf() {
    var v = readCsrfCookie();
    if (v && v !== 'null' && v !== 'undefined') { csrfCache = v; return v; }
    return csrfCache;
}

var csrfPending = null;
function refreshCsrf(force) {
    if (csrfPending) return csrfPending;
    var url = '/api/csrf-token' + (force ? '?fresh=1&_t=' + Date.now() : '');
    csrfPending = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.ok && d.csrfToken) { csrfCache = d.csrfToken; return d.csrfToken; }
            return '';
        })
        .catch(function () { return ''; })
        .then(function (t) { csrfPending = null; return t; });
    return csrfPending;
}

function parseJson(r) {
    return r.json().catch(function () {
        return { ok: false, msg: '服务器返回异常（HTTP ' + r.status + '）' };
    });
}

function aiFetch(path, body) {
    function send(token) {
        var h = { 'Content-Type': 'application/json' };
        if (token) h['X-CSRF-Token'] = token;
        return fetch(path, {
            method: 'POST',
            headers: h,
            credentials: 'same-origin',
            body: JSON.stringify(body)
        });
    }

    var token = getCsrf();
    return (token ? Promise.resolve(token) : refreshCsrf())
        .then(send)
        .then(function (r) {
            if (r.status !== 403) return r;
            return parseJson(r.clone()).then(function (d) {
                if (!d || String(d.msg || '').indexOf('CSRF') < 0) return r;
                return refreshCsrf(true).then(function (fresh) {
                    return fresh ? send(fresh) : r;
                });
            });
        })
        .then(parseJson)
        .then(function (d) {
            if (!d || !d.ok) {
                const err = new Error((d && d.msg) || 'AI 请求失败');
                // 模型扫描的失败原因靠 code 区分（空输入 / 地址 / 密钥 / 请求 / 空结果）
                err.code = (d && d.code) || 'REQUEST_FAILED';
                throw err;
            }
            return d;
        });
}

const AI = {
    async chat(messages, opts = {}) {
        const aiCfg = Store.Config.get('ai', Store.Config.defaults.ai);

        // Key 只从受控内存容器取（N-06 / W3-02），不再读取全局内存变量
        const apiKey = validateApiKey(
            (opts.apiKey !== undefined ? opts.apiKey : null)
            || aiCfg.apiKey
            || Store.AIKey.get()
        );

        const providerKey = AI_PROVIDERS[aiCfg.provider] ? aiCfg.provider : 'doubao';
        const provider = AI_PROVIDERS[providerKey];
        const model = String(aiCfg.model || provider.defaultModel).trim().slice(0, 128);

        // 只连本站同源；provider 名决定服务端转发到哪个官方端点
        const data = await aiFetch('/api/ai/chat', {
            provider: providerKey,
            apiKey,
            messages,
            model,
            temperature: opts.temperature ?? 0.7
        });
        return String(data.content);
    },
    /**
     * 扫描可用模型：只连本站同源 /api/ai/models，由服务端按域名白名单代取。
     * 失败时抛出带 code 的 Error（EMPTY_INPUT / INVALID_URL / INVALID_KEY /
     * REQUEST_FAILED / EMPTY_RESULT），调用方据此给出可区分提示并保留原列表。
     */
    async scanModels(opts = {}) {
        const aiCfg = Store.Config.get('ai', Store.Config.defaults.ai);
        const provider = AI_PROVIDERS[opts.provider || aiCfg.provider]
            ? (opts.provider || aiCfg.provider) : 'doubao';
        const data = await aiFetch('/api/ai/models', {
            provider,
            apiUrl: String(opts.apiUrl || '').trim(),
            apiKey: String(opts.apiKey || '').trim()
        });
        return Array.isArray(data.models) ? data.models : [];
    },
    buildMessages(systemPrompt, history, userText) {
        const msgs = [];
        if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
        (history || []).forEach(m => msgs.push({ role: m.role, content: m.content }));
        msgs.push({ role: 'user', content: userText });
        return msgs;
    },
    // 供设置页使用
    resolveApiUrl,
    validateApiKey
};

/**
 * 持久化前剥离敏感字段（N-06 B）
 * store.js 每次 debouncePersistStore 前都应该调它，
 * 或者由 Config.set 在写入 ai 配置时先行剥离。
 */
function stripSecretForPersist(appStore) {
    try {
        const ai = appStore?.config?.ai;
        if (!ai) return appStore;
        if (ai.apiKey) {
            // 只保留在受控内存容器里，不挂 window
            Store.AIKey.set(ai.apiKey);
            ai.apiKey = '';
            ai.__keySet = true;
        }
        return appStore;
    } catch (e) {
        return appStore;
    }
}

async function AI_newConv(title = '新对话') {
    const aiCfg = Store.Config.get('ai', Store.Config.defaults.ai);
    const conv = await Store.DBadd('aiConvs', {
        title,
        provider: aiCfg.provider,
        model: aiCfg.model,
        systemPrompt: aiCfg.systemPrompt || '',
        lastMsgAt: U.now()
    });
    return conv;
}
async function AI_listConvs() {
    const items = await Store.DBgetAll('aiConvs');
    return items.sort((a, b) => (b.lastMsgAt || 0) - (a.lastMsgAt || 0));
}
async function AI_getMsgs(convId) {
    const all = await Store.DBgetAll('aiMsgs');
    return all.filter(m => m.convId === convId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
async function AI_addMsg(convId, role, content) {
    const msg = await Store.DBadd('aiMsgs', { convId, role, content });
    const conv = await Store.DBget('aiConvs', convId);
    if (conv) {
        conv.lastMsgAt = U.now();
        if (role === 'user' && !conv.title) conv.title = content.slice(0, 30);
        await Store.DBput('aiConvs', conv);
    }
    return msg;
}
async function AI_deleteConv(convId) {
    await Store.DBpurge('aiConvs', convId);
    const all = await Store.DBgetAll('aiMsgs');
    for (const m of all.filter(x => x.convId === convId)) await Store.DBpurge('aiMsgs', m.id);
}

function renderChatMsg(msg) {
    const cls = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'error';
    return U.el('div', { class: 'chat-msg ' + cls }, [
        U.el('div', { class: 'chat-avatar', text: msg.role === 'user' ? '我' : 'AI' }),
        U.el('div', {}, [
            U.el('div', { class: 'chat-bubble', text: msg.content }),
            msg.role === 'assistant' ? U.el('div', { class: 'chat-actions' }, [
                U.el('button', { class: 'chat-action-btn', text: '📋 复制', onclick: () => { navigator.clipboard.writeText(msg.content); UI.Toast.ok('已复制'); } }),
                U.el('button', { class: 'chat-action-btn', text: '🗑 删除', onclick: () => { Store.DBpurge('aiMsgs', msg.id); UI.Toast.ok('已删除'); } })
            ]) : null
        ])
    ]);
}
function renderTyping() {
    return U.el('div', { class: 'chat-msg assistant', id: 'typing-indicator' }, [
        U.el('div', { class: 'chat-avatar', text: 'AI' }),
        U.el('div', { class: 'chat-bubble typing' }, [U.el('span'), U.el('span'), U.el('span')])
    ]);
}

// 注意：不再对外暴露 ALLOWED_HOSTS（W3-02 的可变 Set 入口已彻底移除）
window.AIMod = {
    AI_PROVIDERS,
    AI,
    AI_newConv,
    AI_listConvs,
    AI_getMsgs,
    AI_addMsg,
    AI_deleteConv,
    renderChatMsg,
    renderTyping,
    resolveApiUrl,
    validateApiKey,
    stripSecretForPersist
};
