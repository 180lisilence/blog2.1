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
        // 扫描结果随 ai 配置持久化；页面重载后仍是「已合并」状态。
        const scannedModels = Array.isArray(aiCfg.scannedModels)
            ? aiCfg.scannedModels
                .filter(m => m && typeof m.value === 'string' && m.value.trim())
                .map(m => ({ value: m.value.trim(), label: String(m.label || m.value).slice(0, 80) }))
            : [];
        // 旧实现每次 renderConfig 都 append 一个同 id 的 datalist，浏览器只会关联
        // 到第一个，新增的选项因此看不见。先清掉历史节点，保持下拉可用。
        document.querySelectorAll('datalist#ai-model-list').forEach(n => n.remove());

        const aiProviderEl = U.el('select', { class: 'form-input', style: 'max-width:200px' },
            Object.entries(AIMod.AI_PROVIDERS).map(([k, p]) => U.el('option', {
                value: k,
                text: p.label,
                // U.el 走 setAttribute，false 也会被写成 "false" 而让 option 视为选中；
                // 这里只在命中时给 true，保证已保存的服务商正确回填。
                selected: aiCfg.provider === k ? true : undefined
            }))
        );
        // W3-02 / N-06：输入框永不回填内存 Key，避免明文重新出现在 DOM 里。
        // 留空 = 保持已配置的 Key；填写 = 覆盖（只进受控内存容器，不落盘）。
        const aiApiKeyEl = U.el('input', {
            class: 'form-input',
            placeholder: '留空保持已配置的 Key；填写则覆盖（仅存内存，不落盘）',
            type: 'password',
            value: ''
        });
        const aiModelInput = U.el('input', { class: 'form-input', style: 'max-width:220px', list: 'ai-model-list', placeholder: '选一个或手动填' });
        const aiModelList = U.el('datalist', { id: 'ai-model-list' });
        document.body.appendChild(aiModelList);
        const aiSystemPromptEl = U.el('textarea', { class: 'form-input', rows: 2, placeholder: 'System Prompt（可选）', text: aiCfg.systemPrompt || '' });
        aiModelInput.value = aiCfg.model || '';

        // ===== 模型扫描：新增的两个输入项、按钮、状态与结果区 =====
        const initialProvider = AIMod.AI_PROVIDERS[aiCfg.provider] || AIMod.AI_PROVIDERS.doubao;
        const aiScanUrlEl = U.el('input', {
            class: 'form-input', type: 'text', spellcheck: 'false',
            placeholder: 'https://.../v1  或  https://.../v1/models'
        });
        let suggestedUrl = String(aiCfg.apiUrl || initialProvider.defaultUrl || '').trim();
        aiScanUrlEl.value = suggestedUrl;
        const aiScanKeyEl = U.el('input', {
            class: 'form-input', type: 'password', value: '',
            placeholder: '留空沿用已配置的 Key；仅用于本次扫描，不保存'
        });
        const aiScanBtn = U.el('button', { class: 'btn btn-ghost btn-sm', text: '🔍 扫描模型' });
        const aiScanStatusEl = U.el('div', {
            class: 'setting-label',
            style: 'flex:1;min-width:0;font-size:12px;font-weight:500;line-height:1.6;white-space:normal;word-break:break-word;',
            text: scannedModels.length
                ? `已有 ${scannedModels.length} 个扫描模型，可直接选择或再次扫描`
                : '尚未扫描模型'
        });
        const aiScanChipsEl = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;' });

        function providerLabel(key) {
            return (AIMod.AI_PROVIDERS[key] || AIMod.AI_PROVIDERS.doubao).label;
        }
        // W2-01：状态显示不再依赖恒为空的 aiCfg.apiKey，也不回显 Key 片段
        function aiKeyStatusText(key) {
            return providerLabel(key) + ' Key：'
                + (Store.AIKey.has() ? '✅ 本次会话已配置（仅存内存，刷新后需重填）' : '❌ 未配置');
        }
        const aiKeyStatusEl = U.el('div', { class: 'setting-label', text: aiKeyStatusText(aiCfg.provider) });

        // 内置模型永远先加入；扫描结果只做「去重追加」，不覆盖、不删除任何已有项。
        function refreshModelOptions() {
            const provider = AIMod.AI_PROVIDERS[aiProviderEl.value] || AIMod.AI_PROVIDERS.doubao;
            aiModelList.innerHTML = '';
            const seen = new Set();
            function add(v, l) {
                const value = String(v == null ? '' : v).trim();
                if (!value) return;
                const key = value.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                aiModelList.appendChild(U.el('option', {
                    value,
                    text: String(l == null || l === '' ? value : l)
                }));
            }
            (provider.models || []).forEach(m => add(m.value, m.label));
            scannedModels.forEach(m => add(m.value, m.label));
            add(aiModelInput.value); // 当前手填的模型也保留在下拉里
        }
        refreshModelOptions();
        aiProviderEl.addEventListener('change', () => {
            refreshModelOptions();
            // 未被手动改过的地址随服务商切换自动预填；手动改过的原样保留。
            const p = AIMod.AI_PROVIDERS[aiProviderEl.value] || AIMod.AI_PROVIDERS.doubao;
            if (aiScanUrlEl.value.trim() === suggestedUrl) {
                suggestedUrl = p.defaultUrl || '';
                aiScanUrlEl.value = suggestedUrl;
            }
        });

        const MAX_CHIPS = 40;
        function renderScanChips() {
            aiScanChipsEl.innerHTML = '';
            scannedModels.slice(0, MAX_CHIPS).forEach(m => {
                aiScanChipsEl.appendChild(U.el('button', {
                    class: 'badge', type: 'button',
                    style: 'cursor:pointer;border:0;font-size:12px;',
                    title: '点击选用 ' + m.value,
                    text: m.value,
                    onclick: () => {
                        aiModelInput.value = m.value;
                        UI.Toast.ok('已选择模型：' + m.value);
                    }
                }));
            });
            if (scannedModels.length > MAX_CHIPS) {
                aiScanChipsEl.appendChild(U.el('span', {
                    class: 'setting-label', style: 'font-size:12px;',
                    text: `另有 ${scannedModels.length - MAX_CHIPS} 个模型可在上方输入框下拉选择`
                }));
            }
        }
        renderScanChips();

        // 五类失败 + 成功，图标 / 文案 / 颜色 / Toast 级别各自区分
        const SCAN_HINT = {
            EMPTY_INPUT:    { icon: '⚠️', color: '#e8a317', toast: 'warn', title: '输入不完整' },
            INVALID_URL:    { icon: '🔗', color: 'var(--danger, #ff5c72)', toast: 'err',  title: '接口地址格式错误' },
            INVALID_KEY:    { icon: '🔑', color: 'var(--danger, #ff5c72)', toast: 'err',  title: '接口密钥无效' },
            REQUEST_FAILED: { icon: '🌐', color: 'var(--danger, #ff5c72)', toast: 'err',  title: '接口请求失败' },
            EMPTY_RESULT:   { icon: '📭', color: '#e8a317', toast: 'warn', title: '扫描结果为空' },
            OK:             { icon: '✅', color: '#35c47d', toast: 'ok',   title: '扫描完成' }
        };
        function showScanResult(code, detail) {
            const hint = SCAN_HINT[code] || SCAN_HINT.REQUEST_FAILED;
            const line = hint.icon + ' ' + hint.title + (detail ? '：' + detail : '');
            aiScanStatusEl.textContent = line;
            aiScanStatusEl.style.color = hint.color;
            UI.Toast[hint.toast](line.length > 120 ? line.slice(0, 120) + '…' : line);
        }
        function setScanLoading(on) {
            aiScanBtn.disabled = !!on;
            aiScanBtn.textContent = on ? '⏳ 扫描中…' : '🔍 扫描模型';
            aiScanUrlEl.disabled = !!on;
            aiScanKeyEl.disabled = !!on;
            if (on) {
                aiScanStatusEl.textContent = '⏳ 正在从模型服务接口获取可用模型…';
                aiScanStatusEl.style.color = 'var(--text-secondary, #8a8f98)';
            }
        }
        function persistScannedModels() {
            // 只追加 scannedModels 字段：其余保持「已保存」的配置原样，
            // 不把当前表单里尚未保存的输入写进磁盘。
            const latest = Store.Config.get('ai', Store.Config.defaults.ai) || {};
            Store.Config.set('ai', { ...latest, scannedModels: scannedModels.slice() });
            cfg.ai = { ...cfg.ai, scannedModels: scannedModels.slice() };
        }

        let scanning = false;
        async function scanModels() {
            if (scanning) return;
            const url = aiScanUrlEl.value.trim();
            // 密钥优先级：扫描专用输入框 → 上方 API Key 输入框 → 本次会话已配置的 Key
            const key = aiScanKeyEl.value.trim() || aiApiKeyEl.value.trim() || Store.AIKey.get();

            // —— 本地预校验：不发起请求，也不触碰已有模型列表 / 已填配置 ——
            if (!url || !key) {
                showScanResult('EMPTY_INPUT', !url && !key
                    ? '请填写「模型服务接口地址」和「接口密钥」'
                    : !url ? '请填写「模型服务接口地址」'
                        : '请填写「接口密钥」，或先在上方配置 API Key');
                return;
            }
            let parsed;
            try { parsed = new URL(url); }
            catch (e) { showScanResult('INVALID_URL', '不是合法的 URL，请填写完整的 https:// 地址'); return; }
            if (parsed.protocol !== 'https:') { showScanResult('INVALID_URL', '必须使用 https://'); return; }
            if (parsed.port && parsed.port !== '443') { showScanResult('INVALID_URL', '不允许使用非标准端口 ' + parsed.port); return; }
            if (parsed.username || parsed.password) { showScanResult('INVALID_URL', '不允许包含用户名/密码'); return; }
            try { AIMod.validateApiKey(key); }
            catch (e) { showScanResult('INVALID_KEY', e.message); return; }

            scanning = true;
            setScanLoading(true);
            try {
                const models = await AIMod.AI.scanModels({
                    provider: aiProviderEl.value, apiUrl: url, apiKey: key
                });
                if (!models.length) {
                    showScanResult('EMPTY_RESULT', '接口未返回可用模型，原有模型列表保持不变');
                    return;
                }
                const existing = new Set(scannedModels.map(m => m.value.toLowerCase()));
                let added = 0;
                models.forEach(m => {
                    const v = String((m && m.value) || '').trim();
                    if (!v) return;
                    const k = v.toLowerCase();
                    if (existing.has(k)) return;
                    existing.add(k);
                    scannedModels.push({ value: v, label: String((m && m.label) || v).slice(0, 80) });
                    added++;
                });
                // 只有成功才重建下拉；内置模型依旧在最前面，一个都不少。
                refreshModelOptions();
                renderScanChips();
                persistScannedModels();
                showScanResult('OK', `新增 ${added} 个，累计 ${scannedModels.length} 个；已合并进模型下拉，可直接选择`);
            } catch (e) {
                // 任何失败：不重建下拉、不改 scannedModels、不清空输入、不写盘、不调用保存
                showScanResult(e.code || 'REQUEST_FAILED', e.message || '扫描失败，原有模型列表与配置保持不变');
            } finally {
                scanning = false;
                setScanLoading(false);
            }
        }
        aiScanBtn.addEventListener('click', scanModels);

        function saveAiCfg() {
            const typed = aiApiKeyEl.value.trim();
            if (typed) {
                // Key 只进受控内存容器，绝不回写 DOM 或持久化配置
                Store.AIKey.set(typed);
                aiApiKeyEl.value = '';
            }
            cfg.ai = {
                provider: aiProviderEl.value,
                apiKey: '',
                // 扫描用的接口地址随配置一起保存（地址不是密钥，可持久化）
                apiUrl: aiScanUrlEl.value.trim(),
                model: aiModelInput.value.trim(),
                systemPrompt: aiSystemPromptEl.value.trim(),
                scannedModels: scannedModels.slice(),
                __keySet: Store.AIKey.has()
            };
            Store.Config.set('ai', cfg.ai);
            aiKeyStatusEl.textContent = aiKeyStatusText(aiProviderEl.value);
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
                U.el('div', { class: 'setting-label', text: '模型服务接口地址' }),
                aiScanUrlEl
            ]),
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '接口密钥' }),
                U.el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
                    aiScanKeyEl,
                    U.el('button', { class: 'btn btn-ghost btn-sm', text: '👁', title: '显示/隐藏', onclick: () => { aiScanKeyEl.type = aiScanKeyEl.type === 'password' ? 'text' : 'password'; } })
                ])
            ]),
            U.el('div', { class: 'setting-row', style: 'flex-direction:column;align-items:stretch;gap:6px;' }, [
                U.el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between;' }, [
                    aiScanStatusEl,
                    aiScanBtn
                ]),
                aiScanChipsEl
            ]),
            // W3-01 / W3-02：端点不再由前端决定，对话与扫描都走服务端代理
            U.el('div', { class: 'setting-row' }, [
                U.el('div', { class: 'setting-label', text: '请求通道' }),
                U.el('div', { class: 'setting-label', style: 'color:#8a8f98;font-size:12px;line-height:1.6;', text: "对话经本站 /api/ai/chat 代理，扫描经 /api/ai/models 代理；目标端点由服务端白名单固定，浏览器不直连第三方，CSP 保持 connect-src 'self'" })
            ]),
            U.el('div', { class: 'setting-row', style: 'flex-direction:column;align-items:stretch;gap:8px;' }, [
                U.el('div', { class: 'setting-label', text: 'System Prompt（人设）' }),
                aiSystemPromptEl
            ]),
            U.el('div', { class: 'setting-row' }, [
                aiKeyStatusEl,
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
