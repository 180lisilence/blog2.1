// renderer/api-ai.js
'use strict';
const Store = window.Store;
const UI = window.UI;


// AI 服务商配置表
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
    }
};

// ============================================================================
// N-06 修复：API Key 外带通道 + 明文持久化
// ============================================================================
//
// 原问题：
//   1. apiUrl 完全由用户输入、无任何校验，fetch 直接把
//      `Authorization: Bearer <apiKey>` 发出去 —— 任何能改这个配置的人
//      （或一次 XSS、或拿到账号的第三方）都能把用户的 Key 转发到任意地址。
//   2. apiKey 明文存进 appStore.config.ai，而 appStore 整体 PUT 到
//      /api/data/all，于是 **服务端持久化了用户的 API Key**；
//      叠加 N-03（旧版无法删除）Key 换掉后旧的还留在库里。
//
// 修复策略：
//   A. 端点白名单：只允许已知 AI 服务商的官方域名 + https。
//      自定义端点必须显式加到下面的 EXTRA_ALLOWED_HOSTS 里。
//   B. Key 不落盘：持久化前把 apiKey 置空（见 stripSecretForPersist），
//      只保留在内存里。刷新页面后需要重填 —— 这是安全性的必要代价。
//   C. 值形状校验：Key 必须匹配可打印 ASCII 且长度合理，防止被塞进
//      换行/控制字符做 header 注入。
// ============================================================================

// 允许的自定义端点（如自建反代）。留空 = 只允许官方端点。
const EXTRA_ALLOWED_HOSTS = [];

// 从 AI_PROVIDERS 自动收集所有官方端点域名
function buildAllowedHosts() {
  const hosts = new Set(EXTRA_ALLOWED_HOSTS.map(h => String(h).toLowerCase()));
  for (const key of Object.keys(AI_PROVIDERS)) {
    try {
      const u = new URL(AI_PROVIDERS[key].defaultUrl);
      hosts.add(u.hostname.toLowerCase());
    } catch (e) { /* 忽略格式异常 */ }
  }
  return hosts;
}
const ALLOWED_HOSTS = buildAllowedHosts();

/**
 * 校验并规范化 API 端点
 * @param {string} raw 用户输入的 apiUrl
 * @returns {string} 校验通过的 URL
 * @throws {Error} 不在白名单 / 非 https / 格式非法
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

  // 只允许 https：http 会让 Bearer token 明文过网
  if (u.protocol !== 'https:') {
    throw new Error('API 地址必须使用 https://');
  }

  const host = u.hostname.toLowerCase();

  // 拒绝 IP 直连与特殊主机名，避免被指向内网/回环
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost' || host.endsWith('.local')) {
    throw new Error(`API 地址不允许指向 IP 或本地主机：${host}`);
  }

  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `API 地址不在允许列表：${host}\n`
      + `允许的域名：${Array.from(ALLOWED_HOSTS).join(', ')}`
    );
  }

  // 不允许带 URL 内嵌凭据（https://user:pass@host/ 会把凭据写进日志）
  if (u.username || u.password) {
    throw new Error('API 地址不允许包含用户名/密码');
  }

  return u.toString();
}

/**
 * 校验 API Key 形状
 * @param {string} key
 * @returns {string} 去掉首尾空白后的 key
 * @throws {Error}
 */
function validateApiKey(key) {
  const k = String(key || '').trim();
  if (!k) throw new Error('未配置 API Key');
  if (k.length > 512) throw new Error('API Key 过长');
  // 只允许可见 ASCII：任何控制字符（\r \n \0）都可能导致 header 注入
  if (!/^[\x21-\x7E]+$/.test(k)) {
    throw new Error('API Key 含非法字符（只允许可见 ASCII 字符）');
  }
  return k;
}

const AI = {
    async chat(messages, opts = {}) {
        const aiCfg = Store.Config.get('ai', Store.Config.defaults.ai);

        // B: Key 优先从内存取（sessionStorage 只在同一标签页存活，不落磁盘）
        const apiKey = validateApiKey(
          (opts.apiKey !== undefined ? opts.apiKey : null)
          || aiCfg.apiKey
          || (window.__aiKeyMem || '')
        );

        const provider = AI_PROVIDERS[aiCfg.provider] || AI_PROVIDERS.doubao;
        // A: 端点必须过白名单
        const url = resolveApiUrl(aiCfg.apiUrl || provider.defaultUrl);
        const model = aiCfg.model || provider.defaultModel;

        const body = {
            model,
            messages,
            temperature: opts.temperature ?? 0.7,
            stream: false
        };
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error('API 错误 ' + resp.status + ': ' + (text || resp.statusText));
        }
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('API 返回格式异常：' + JSON.stringify(data).slice(0, 200));
        return String(content);
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
    validateApiKey,
    ALLOWED_HOSTS
};

/**
 * 持久化前剥离敏感字段（N-06 B）
 *
 * store.js 每次 debouncePersistStore 前都应该调它，
 * 或者由 Config.set 在写入 ai 配置时先行剥离。
 */
function stripSecretForPersist(appStore) {
  try {
    const ai = appStore?.config?.ai;
    if (!ai) return appStore;
    if (ai.apiKey) {
      // 只保留内存副本
      window.__aiKeyMem = ai.apiKey;
      ai.apiKey = '';
      ai.__keySet = true;   // 给 UI 用：告诉用户"本次会话已填过"，值在内存里
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
    stripSecretForPersist,
    ALLOWED_HOSTS
};
window.AIMod = AIMod;