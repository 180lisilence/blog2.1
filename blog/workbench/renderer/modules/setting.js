// renderer/modules/setting.js
'use strict';


Router.registerRoute('setting', async (root) => {
    root.innerHTML = '';
    const cfg = {
        notifyEnabled: Store.Config.get('notifyEnabled', Store.Config.defaults.notifyEnabled),
        defaultPriority: Store.Config.get('defaultPriority', Store.Config.defaults.defaultPriority),
        ai: Store.Config.get('ai', Store.Config.defaults.ai)
    };
    const notifyStatus = Notification.permission;
    const requestNotify = () => { Notification.requestPermission().then(p => { UI.Toast.ok('权限：' + p); renderConfig(); }); };

    function renderConfig() {
        root.innerHTML = '';
        const configCard = U.el('div', { class: 'dashboard-card' }, [
            U.el('div', { class: 'card-head' }, [U.el('h3', { text: '⚙️ 全局配置' })]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '桌面到期提醒' }),
                U.el('label', { class: 'switch' }, [
                    U.el('input', { type: 'checkbox', checked: cfg.notifyEnabled, onchange: (e) => { cfg.notifyEnabled = e.target.checked; Store.Config.set('notifyEnabled', cfg.notifyEnabled); UI.Toast.ok('已保存'); } }),
                    U.el('span', { class: 'slider' })
                ])
            ]),

            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '深色模式' }),
                U.el('label', { class: 'switch' }, [
                    U.el('input', {
                        type: 'checkbox',
                        checked: document.documentElement.getAttribute('data-theme') === 'dark',
                        onchange: (e) => {
                            const targetTheme = e.target.checked ? 'dark' : 'light';
                            window.Theme.set(targetTheme);
                            UI.Toast.ok(targetTheme === 'dark' ? '已切换深色模式' : '已切换浅色模式');
                            // ✅ 删掉这里的 renderConfig(); 不要整页刷新！！
                        }
                    }),
                    U.el('span', { class: 'slider' })
                ])
            ]),


            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '默认优先级' }),
                U.el('select', { class: 'form-input', style: 'max-width:120px', value: cfg.defaultPriority, onchange: (e) => { cfg.defaultPriority = e.target.value; Store.Config.set('defaultPriority', cfg.defaultPriority); } }, [
                    U.el('option', { value: 'high', text: '🔴 高', selected: cfg.defaultPriority === 'high' }),
                    U.el('option', { value: 'mid', text: '🟡 中', selected: cfg.defaultPriority === 'mid' }),
                    U.el('option', { value: 'low', text: '🟢 低', selected: cfg.defaultPriority === 'low' })
                ])
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '浏览器通知权限：' + (notifyStatus === 'granted' ? '✅ 已授权' : notifyStatus === 'denied' ? '⛔ 已拒绝' : '⚠️ 未请求') }),
                notifyStatus !== 'granted' ? U.el('button', { class: 'btn btn-ghost', text: '请求授权', onclick: requestNotify }) : null
            ])
        ]);

        const aiCfg = cfg.ai || { ...Store.Config.defaults.ai };
        const aiProviderEl = U.el('select', { class: 'form-input', style: 'max-width:200px' },
            Object.entries(AIMod.AI_PROVIDERS).map(([k, p]) => U.el('option', { value: k, text: p.label, selected: aiCfg.provider === k }))
        );
        const aiApiKeyEl = U.el('input', { class: 'form-input', placeholder: 'sk-xxxxxxxxxxx', type: 'password', value: aiCfg.apiKey || '' });
        const aiApiUrlEl = U.el('input', { class: 'form-input', placeholder: '留空使用默认地址', value: aiCfg.apiUrl || '' });
        const aiModelInput = U.el('input', { class: 'form-input', style: 'max-width:220px', list: 'ai-model-list', placeholder: '选一个或手动填' });
        const aiModelList = U.el('datalist', { id: 'ai-model-list' });
        document.body.appendChild(aiModelList);
        const aiSystemPromptEl = U.el('textarea', { class: 'form-input', rows: 2, placeholder: 'System Prompt（可选）', text: aiCfg.systemPrompt || '' });
        aiModelInput.value = aiCfg.model || '';

        function refreshModelOptions() {
            const providerKey = aiProviderEl.value;
            const provider = AIMod.AI_PROVIDERS[providerKey];
            aiModelList.innerHTML = '';
            provider.models.forEach(m => {
                aiModelList.appendChild(U.el('option', { value: m.value, text: m.label }));
            });
            const current = aiModelInput.value;
            if (current && !provider.models.some(m => m.value === current)) {
                const exists = Array.from(aiModelList.children).some(o => o.value === current);
                if (!exists) aiModelList.appendChild(U.el('option', { value: current }));
            }
        }
        refreshModelOptions();
        aiProviderEl.addEventListener('change', refreshModelOptions);

        function saveAiCfg() {
            cfg.ai = {
                provider: aiProviderEl.value,
                apiKey: aiApiKeyEl.value.trim(),
                apiUrl: aiApiUrlEl.value.trim(),
                model: aiModelInput.value.trim(),
                systemPrompt: aiSystemPromptEl.value.trim()
            };
            Store.Config.set('ai', cfg.ai);
            UI.Toast.ok('AI 配置已保存');
        }

        async function testAi() {
            saveAiCfg();
            UI.Toast.show('测试中...', 'info');
            try {
                const reply = await AIMod.AI.chat([{ role: 'user', content: '你好，用一句话自我介绍' }]);
                UI.Toast.ok('✅ 连接成功：' + reply.slice(0, 60));
            } catch (e) {
                UI.Toast.err('❌ 连接失败：' + e.message);
            }
        }

        const aiCard = U.el('div', { class: 'dashboard-card' }, [
            U.el('div', { class: 'card-head' }, [U.el('h3', { text: '🤖 AI 对话配置' })]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: 'AI 服务商' }),
                aiProviderEl
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: 'API Key' }),
                U.el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
                    aiApiKeyEl,
                    U.el('button', { class: 'btn btn-ghost btn-sm', text: '👁', title: '显示/隐藏', onclick: () => { aiApiKeyEl.type = aiApiKeyEl.type === 'password' ? 'text' : 'password'; } })
                ])
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '模型（或 Endpoint ID）' }),
                aiModelInput
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '自定义 API 地址' }),
                aiApiUrlEl
            ]),
            U.el('div', { class: 'setting-row', style: 'flex-direction:column;align-items:stretch;gap:8px;' }, [
                U.el('div', { class: 'setting-label', text: 'System Prompt（人设）' }),
                aiSystemPromptEl
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: AIMod.AI_PROVIDERS[aiCfg.provider].label + ' Key：' + (aiCfg.apiKey ? '✅ 已填 (' + aiCfg.apiKey.slice(0,6) + '...' + aiCfg.apiKey.slice(-4) + ')' : '❌ 未填') }),
                U.el('div', { style: 'display:flex;gap:8px;' }, [
                    U.el('button', { class: 'btn btn-ghost', text: '💾 保存', onclick: saveAiCfg }),
                    U.el('button', { class: 'btn btn-primary', text: '🧪 测试连接', onclick: testAi })
                ])
            ])
        ]);

        const backupCard = U.el('div', { class: 'dashboard-card' }, [
            U.el('div', { class: 'card-head' }, [U.el('h3', { text: '💾 数据备份' })]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '导出全部数据为 JSON' }),
                U.el('button', {
                    class: 'btn btn-primary',
                    text: '导出 JSON',
                    onclick: async () => {
                        const result = await Store.workbenchAPI.exportBackup(Store.appStore);
                        if (result.success) UI.Toast.ok('导出成功: ' + result.filePath);
                        else if (result.canceled) UI.Toast.warn('取消导出');
                        else UI.Toast.err('导出失败: ' + result.error);
                    }
                })
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '从 JSON 导入数据（覆盖）' }),
                U.el('button', { class: 'btn btn-ghost', text: '选择文件导入', onclick: async () => {
                        const f = await U.readFile(); if (!f) return;
                        const text = await f.text();
                        try {
                            const data = JSON.parse(text);
                            if (!data || typeof data !== 'object') throw new Error('备份格式无效');
                            Store.STORES.forEach(s => { if (Array.isArray(data[s])) Store.appStore[s] = data[s].slice(); });
                            if (data.config && typeof data.config === 'object') Store.appStore.config = Store.Config._clone(data.config);
                            Store.migrateConfig();
                            await Store.persistStore();
                            UI.Toast.ok('导入成功');
                            Router.navigate();
                        } catch (e) { UI.Toast.err('解析失败：' + e.message); }
                    }})
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '导出 CSV（今日计划）' }),
                U.el('button', { class: 'btn btn-ghost', text: '导出 CSV', onclick: async () => {
                        const items = await Store.DBgetAll('todos');
                        const csv = ['id,title,desc,priority,deadline,done,createdAt', ...items.map(i =>
                            [i.id, (i.title||'').replace(/"/g,'""'), (i.desc||'').replace(/"/g,'""'), i.priority, i.deadline||'', i.done?'1':'0', i.createdAt].join(',')
                        )].join('\n');
                        U.download('todos-' + U.todayStr() + '.csv', '\ufeff' + csv, 'text/csv');
                    }})
            ])
        ]);

        const recycleCard = U.el('div', { class: 'dashboard-card' }, [
            U.el('div', { class: 'card-head', style: 'display:flex;justify-content:space-between;align-items:center;' }, [
                U.el('h3', { text: '🗑️ 回收站' }),
                U.el('button', { class: 'btn btn-danger btn-sm', text: '清空回收站', onclick: async () => {
                        UI.Modal.confirm('清空回收站', '所有已删除的数据将永久丢失，确定？', async () => {
                            const items = await Store.DBgetAll('recycleBin');
                            for (const i of items) await Store.DBpurge('recycleBin', i.id);
                            UI.Toast.ok('已清空'); renderConfig();
                        }, '确认清空', '取消', true);
                    }})
            ])
        ]);

        Store.DBgetAll('recycleBin').then(items => {
            if (items.length === 0) {
                recycleCard.appendChild(U.el('div', { class: 'empty', text: '回收站是空的' }));
            } else {
                items.slice().reverse().forEach(item => {
                    const row = U.el('div', { class: 'recycle-row' }, [
                        U.el('span', { class: 'badge', text: Store.STORE_LABELS[item._origStore] || item._origStore }),
                        U.el('span', { class: 'recycle-title', text: item.title || item.name || item.text || '(无标题)' }),
                        U.el('span', { class: 'recycle-time', text: U.fmtDateTime(item._deletedAt) }),
                        U.el('button', { class: 'btn btn-ghost btn-sm', text: '恢复', onclick: async () => {
                                const origStore = item._origStore;
                                delete item._origStore; delete item._deletedAt;
                                await Store.DBpurge('recycleBin', item.id);
                                await Store.DBput(origStore, item);
                                UI.Toast.ok('已恢复'); renderConfig();
                            }}),
                        U.el('button', { class: 'btn btn-danger btn-sm', text: '彻底删除', onclick: async () => {
                                UI.Modal.confirm('彻底删除', '无法恢复', async () => { await Store.DBpurge('recycleBin', item.id); UI.Toast.ok('已彻底删除'); renderConfig(); }, '确认', '取消', true);
                            }})
                    ]);
                    recycleCard.appendChild(row);
                });
            }
        });

        const resetCard = U.el('div', { class: 'dashboard-card danger-zone' }, [
            U.el('div', { class: 'card-head' }, [U.el('h3', { text: '⚠️ 危险区域' })]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '一键重置系统（清空全部数据，不可恢复）' }),
                U.el('button', { class: 'btn btn-danger', text: '重置全部', onclick: () => {
                        UI.Modal.confirm('系统重置', '这会删除所有模块数据，且无法恢复！\n建议先导出备份。', async () => {
                            UI.Modal.confirm('最终确认', '真的要清空全部数据吗？', async () => {
                                Store.STORES.forEach(s => { Store.appStore[s] = []; });
                                Store.appStore.config = Store.Config._clone(Store.Config.defaults);
                                await Store.persistStore();
                                localStorage.clear();
                                UI.Toast.ok('已重置');
                                renderConfig();
                            }, '我确定', '取消', true);
                        }, '继续', '取消', true);
                    }})
            ])
        ]);

        root.appendChild(U.el('div', { class: 'dashboard-grid' }, [configCard, aiCard, backupCard, recycleCard, resetCard]));
    }
    renderConfig();
}, '数据与设置');