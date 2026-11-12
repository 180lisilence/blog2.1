// renderer/modules/aiPage.js
'use strict';



Router.registerRoute('ai', async (root) => {
    root.innerHTML = '';
    const convListEl = U.el('div', { class: 'ai-conv-list' }, [
        U.el('div', { class: 'ai-conv-header', text: '对话列表' }),
        U.el('div', { class: 'ai-conv-new' }, [
            U.el('button', { class: 'ai-conv-new-btn', text: '＋ 新对话', onclick: async () => {
                    const conv = await AIMod.AI_newConv();
                    await navigateToConv(conv.id);
                }})
        ]),
        U.el('div', { class: 'ai-conv-items', id: 'ai-conv-items' })
    ]);

    const chatArea = U.el('div', { class: 'ai-page', style: 'flex:1;border-radius:12px;' });

    // 返回按钮（手机端显示）
    const backBtn = U.el('button', {
        class: 'ai-back-btn',
        style: 'display:none;background:none;border:none;color:var(--text-sidebar);font-size:20px;cursor:pointer;padding:4px 8px;margin-right:8px;',
        text: '←',
        title: '返回对话列表',
        onclick: () => {
            // 手机端：回到对话列表
            convListEl.classList.remove('mobile-hidden');
            chatArea.classList.remove('mobile-active');
        }
    });

    root.appendChild(U.el('div', { class: 'ai-page-container', style: 'display:flex;gap:0;height:calc(100vh - 108px);' }, [convListEl, chatArea]));

    let activeConvId = null;
    let currentBody = null;
    let currentConv = null;

    async function renderConvList() {
        const wrap = convListEl.querySelector('#ai-conv-items');
        wrap.innerHTML = '';
        const convs = await AIMod.AI_listConvs();
        if (convs.length === 0) {
            wrap.appendChild(U.el('div', { class: 'empty', text: '还没有对话' }));
            return convs;
        }
        convs.forEach(c => {
            const item = U.el('div', { class: 'ai-conv-item' + (c.id === activeConvId ? ' active' : ''), onclick: () => navigateToConv(c.id) }, [
                U.el('div', { class: 'ai-conv-title', text: c.title || '新对话' }),
                U.el('div', { class: 'ai-conv-time', text: U.fmtDateTime(c.lastMsgAt || c.createdAt) }),
                U.el('button', { class: 'btn-icon', title: '删除对话', style: 'position:absolute;right:4px;top:8px;width:24px;height:24px;font-size:12px;', onclick: (e) => {
                        e.stopPropagation();
                        UI.Modal.confirm('删除对话', '连同全部消息一起删除？', async () => {
                            await AIMod.AI_deleteConv(c.id);
                            if (activeConvId === c.id) {
                                activeConvId = null;
                                renderEmpty();
                            }
                            await renderConvList();
                        }, '删除', '取消', true);
                    }}, '🗑️')
            ]);
            item.style.position = 'relative';
            wrap.appendChild(item);
        });
        return convs;
    }

    function renderEmpty() {
        chatArea.innerHTML = '';
        const needSetup = !Store.Config.aiReady();

        const emptyWrap = U.el('div', { style: 'flex:1;display:flex;flex-direction:column;overflow:hidden;' });
        const emptyBody = U.el('div', { class: 'ai-page-body', style: 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;' }, [
            U.el('div', { class: 'ai-empty-icon', text: '🤖', style: 'font-size:48px;margin-bottom:16px;' }),
            U.el('div', { class: 'ai-empty-text', text: needSetup ? '请先到「数据与设置」配置 AI API' : '输入消息开始新对话' }),
            U.el('div', { class: 'ai-empty-hint', text: '支持豆包 / 通义千问 / DeepSeek / OpenAI / Kimi / 智谱' })
        ]);
        emptyWrap.appendChild(emptyBody);

        // 空状态也保留输入框，用户直接输入即可开始新对话
        const ta = U.el('textarea', { placeholder: '输入消息，Enter 发送，Shift+Enter 换行...', rows: 2 });
        const sendBtn = U.el('button', { class: 'btn btn-primary', text: '发送' });
        const inputWrap = U.el('div', { class: 'ai-page-input-wrap' }, [ta, sendBtn]);

        async function send() {
            const text = ta.value.trim();
            if (!text) return;
            if (!Store.Config.aiReady()) { UI.Toast.err('请先到设置里填写 API Key'); return; }
            ta.value = '';
            // 自动创建新对话
            const conv = await AIMod.AI_newConv();
            activeConvId = conv.id;
            await navigateToConv(conv.id);
            // 触发第一次发送
            setTimeout(async () => {
                const newTa = chatArea.querySelector('.ai-page-input-wrap textarea');
                if (newTa) {
                    newTa.value = text;
                    newTa.dispatchEvent(new Event('input'));
                    const sendBtn = chatArea.querySelector('.ai-page-input-wrap .btn-primary');
                    if (sendBtn) sendBtn.click();
                }
            }, 100);
        }

        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
        });
        sendBtn.addEventListener('click', send);

        chatArea.appendChild(emptyWrap);
        chatArea.appendChild(inputWrap);
    }

    function isMobile() {
        return window.innerWidth < 768;
    }

    async function navigateToConv(convId) {
        activeConvId = convId;
        await renderConvList();
        await renderConv();
        // 手机端：切换到聊天页
        if (isMobile()) {
            convListEl.classList.add('mobile-hidden');
            chatArea.classList.add('mobile-active');
        }
    }

    async function renderConv() {
        chatArea.innerHTML = '';
        if (!activeConvId) { renderEmpty(); return; }
        const conv = await Store.DBget('aiConvs', activeConvId);
        if (!conv) { renderEmpty(); return; }
        currentConv = conv;
        const aiCfg = Store.Config.get('ai', Store.Config.defaults.ai);
        const provider = AIMod.AI_PROVIDERS[conv.provider] || AIMod.AI_PROVIDERS[aiCfg.provider] || AIMod.AI_PROVIDERS.doubao;

        const header = U.el('div', { class: 'ai-page-header' }, [
            U.el('div', { class: 'ai-page-title' }, [
                backBtn,
                U.el('span', { text: '🤖 ' + conv.title }),
                U.el('span', { class: 'ai-provider-tag', text: provider.label.split(' ')[0] + ' · ' + (conv.model || '') })
            ]),
            U.el('div', { class: 'ai-actions' }, [
                U.el('button', { class: 'btn btn-ghost btn-sm', text: '🗑 清空对话', onclick: () => {
                        UI.Modal.confirm('清空对话', '保留对话，只清空消息？', async () => {
                            const msgs = await AIMod.AI_getMsgs(activeConvId);
                            for (const m of msgs) await Store.DBpurge('aiMsgs', m.id);
                            UI.Toast.ok('已清空'); renderConv();
                        });
                    }})
            ])
        ]);

        const body = U.el('div', { class: 'ai-page-body' });
        currentBody = body;
        const msgs = await AIMod.AI_getMsgs(activeConvId);
        if (msgs.length === 0) {
            body.appendChild(U.el('div', { class: 'ai-welcome' }, [
                U.el('h3', { text: '👋 你好，我是你的 AI 助手' }),
                U.el('p', { text: '有什么想聊的？我可以帮你整理思路、写文案、解答技术问题…' })
            ]));
        } else {
            msgs.forEach(m => body.appendChild(AIMod.renderChatMsg(m)));
        }
        setTimeout(() => body.scrollTop = body.scrollHeight, 0);

        const ta = U.el('textarea', { placeholder: '输入消息，Enter 发送，Shift+Enter 换行...', rows: 2 });
        const sendBtn = U.el('button', { class: 'btn btn-primary', text: '发送' });
        const inputWrap = U.el('div', { class: 'ai-page-input-wrap' }, [ta, sendBtn]);

        async function send() {
            const text = ta.value.trim();
            if (!text) return;
            ta.value = '';
            if (!Store.Config.aiReady()) { UI.Toast.err('请先到设置里填写 API Key'); return; }

            await AIMod.AI_addMsg(activeConvId, 'user', text);
            body.appendChild(AIMod.renderChatMsg({ role: 'user', content: text }));
            body.scrollTop = body.scrollHeight;

            const typingEl = AIMod.renderTyping();
            body.appendChild(typingEl);
            body.scrollTop = body.scrollHeight;

            const allMsgs = await AIMod.AI_getMsgs(activeConvId);
            const history = allMsgs.filter(m => m.role === 'user' || m.role === 'assistant').slice(-20);

            try {
                const messages = AIMod.AI.buildMessages(conv.systemPrompt || aiCfg.systemPrompt, history, text);
                const reply = await AIMod.AI.chat(messages);
                await AIMod.AI_addMsg(activeConvId, 'assistant', reply);
                typingEl.remove();
                body.appendChild(AIMod.renderChatMsg({ role: 'assistant', content: reply }));
            } catch (err) {
                typingEl.remove();
                body.appendChild(AIMod.renderChatMsg({ role: 'error', content: '⚠️ ' + err.message }));
            }
            body.scrollTop = body.scrollHeight;
            await renderConvList();
        }

        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
        });
        sendBtn.addEventListener('click', send);

        chatArea.appendChild(header);
        chatArea.appendChild(body);
        chatArea.appendChild(inputWrap);
        ta.focus();
    }

    const convs = await renderConvList();
    if (convs && convs.length > 0) {
        // 宽屏自动选中第一个对话，手机端停留在列表页
        if (!isMobile()) {
            await navigateToConv(convs[0].id);
        } else {
            // 手机端：默认显示列表，聊天页隐藏
            chatArea.classList.remove('mobile-active');
        }
    } else {
        renderEmpty();
    }
}, 'AI 对话');
