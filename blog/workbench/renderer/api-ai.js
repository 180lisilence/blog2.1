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

const AI = {
    async chat(messages, opts = {}) {
        const aiCfg = Store.Config.get('ai', Store.Config.defaults.ai);
        if (!aiCfg.apiKey) throw new Error('未配置 API Key，请在「数据与设置」中填写');
        const provider = AI_PROVIDERS[aiCfg.provider] || AI_PROVIDERS.doubao;
        const url = aiCfg.apiUrl || provider.defaultUrl;
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
                'Authorization': 'Bearer ' + aiCfg.apiKey
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
    }
};

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
    renderTyping
};
window.AIMod = AIMod;