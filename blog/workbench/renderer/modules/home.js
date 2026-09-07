// renderer/modules/home.js
// 个人工作台 - 首页总览
// 按 finesse-brief 方法改造：首屏从上到下 = ① 结论条（每日一句话）→ ② 该管什么清单 → ③ 今日计划 → ④ 高优摘要 → ⑤ 快速备忘 → ⑥ 统计 → ⑦ 模块入口
'use strict';

Router.registerRoute('home', async (root) => {
    const notes = await Store.DBgetAll('notes');
    const todos = await Store.DBgetAll('todos');
    const media = await Store.DBgetAll('media');
    const develop = await Store.DBgetAll('develop');
    const consult = await Store.DBgetAll('consult');
    const fitness = await Store.DBgetAll('fitness');
    const diet = await Store.DBgetAll('diet');
    const game = await Store.DBgetAll('game');

    const today = U.todayStr();
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    const toTs = (s) => { if (!s) return NaN; const t = new Date(String(s).replace(' ', 'T')).getTime(); return isNaN(t) ? NaN : t; };
    const within24h = (ts) => !isNaN(ts) && ts > now && ts <= now + DAY;

    /* ===== ① 结论条：今天该干什么（所有数字来自真实数据） ===== */
    const todayTodos = todos.filter(t => !t.done && (t.deadline ? t.deadline.startsWith(today) : true));
    const allPending = todos.filter(t => !t.done);

    // 24h 内到期（跨模块：待办截止 / 咨询下次跟进 / 自媒体计划发布）
    const dueTodos = todos.filter(t => !t.done && within24h(toTs(t.deadline)));
    const dueConsults = consult.filter(c => c.status !== 'done' && within24h(toTs(c.nextFollow)));
    const dueMedia = media.filter(m => !m.published && within24h(toTs(m.planPublish)));
    const dueCount = dueTodos.length + dueConsults.length + dueMedia.length;

    // 高优未处理（跨模块）
    const highItems = [
        ...todos.filter(t => !t.done && t.priority === 'high').map(t => ({ store: '今日计划', name: t.title, href: '#/todayPlan' })),
        ...develop.filter(d => !d.done && d.priority === 'high').map(d => ({ store: '开发工作', name: d.title, href: '#/develop' })),
        ...consult.filter(c => c.status === 'open' && c.priority === 'high').map(c => ({ store: '咨询工作', name: c.title, href: '#/consult' })),
        ...media.filter(m => !m.published && m.priority === 'high').map(m => ({ store: '自媒体', name: m.title, href: '#/media' }))
    ];

    // 今日饮食热量（diet.date 为 YYYY-MM-DD）
    const todayDiet = diet.filter(d => d.date === today);
    const todayKcal = todayDiet.reduce((s, d) => s + (Number(d.calories) || 0), 0);

    // 本月健身次数（fitness.date 为 YYYY-MM-DD）
    const thisMonth = today.slice(0, 7);
    const monthFitness = fitness.filter(f => (f.date || '').startsWith(thisMonth)).length;

    const hookPanel = U.el('div', { class: 'dashboard-card hook-card' }, [
        U.el('div', { class: 'hook-head' }, [
            U.el('h3', { text: '📌 今天该干什么 · ' + today }),
            U.el('span', { class: 'hook-sub', text: '数字来自你的真实记录，不是写死的' })
        ]),
        U.el('div', { class: 'hook-stats' }, [
            U.el('div', { class: 'hook-stat' }, [U.el('div', { class: 'hook-num', text: todayTodos.length }), U.el('div', { class: 'hook-lbl', text: '今日待办' })]),
            U.el('div', { class: 'hook-stat' + (dueCount ? ' hot' : '') }, [U.el('div', { class: 'hook-num', text: dueCount }), U.el('div', { class: 'hook-lbl', text: '24h 内到期' })]),
            U.el('div', { class: 'hook-stat' + (highItems.length ? ' hot' : '') }, [U.el('div', { class: 'hook-num', text: highItems.length }), U.el('div', { class: 'hook-lbl', text: '高优未处理' })]),
            U.el('div', { class: 'hook-stat' }, [U.el('div', { class: 'hook-num', text: todayKcal ? todayKcal + 'kcal' : '—' }), U.el('div', { class: 'hook-lbl', text: '今日饮食' })]),
            U.el('div', { class: 'hook-stat' }, [U.el('div', { class: 'hook-num', text: monthFitness }), U.el('div', { class: 'hook-lbl', text: '本月健身(次)' })])
        ]),
        U.el('div', { class: 'hook-actions' }, [
            U.el('a', { class: 'btn btn-primary btn-sm', href: '#/todayPlan', text: '去处理到期' }),
            U.el('a', { class: 'btn btn-ghost btn-sm', href: '#/diet', text: '记一笔饮食' }),
            U.el('a', { class: 'btn btn-ghost btn-sm', href: '#/fitness', text: '记一次训练' })
        ])
    ]);

    /* ===== ② 该管什么清单（跨模块聚合，最紧迫排前） ===== */
    const triageItems = [
        ...dueTodos.map(t => ({ store: '今日计划', icon: '📅', name: t.title, time: t.deadline, ts: toTs(t.deadline), href: '#/todayPlan', hot: true })),
        ...dueConsults.map(c => ({ store: '咨询工作', icon: '💼', name: c.title, time: c.nextFollow, ts: toTs(c.nextFollow), href: '#/consult', hot: true })),
        ...dueMedia.map(m => ({ store: '自媒体', icon: '📱', name: m.title, time: m.planPublish, ts: toTs(m.planPublish), href: '#/media', hot: true })),
        ...highItems.filter(h => !dueTodos.some(t => t.title === h.name && h.store === '今日计划') && !dueConsults.some(c => c.title === h.name && h.store === '咨询工作') && !dueMedia.some(m => m.title === h.name && h.store === '自媒体')).map(h => ({ store: h.store, icon: '🔴', name: h.name, time: '', ts: now, href: h.href, hot: false }))
    ].sort((a, b) => (a.ts - b.ts));

    const triagePanel = U.el('div', { class: 'dashboard-card' }, [
        U.el('div', { class: 'card-head' }, [
            U.el('h3', { text: '⚡ 该管什么（到期优先 · 高优标红）' }),
            U.el('a', { class: 'link', text: '去今日计划 →', href: '#/todayPlan' })
        ]),
        triageItems.length === 0 ? U.el('div', { class: 'empty', text: '暂时没有到期的，今天的安排都清楚了' }) :
        U.el('div', { class: 'triage-list' }, triageItems.slice(0, 10).map(it =>
            U.el('a', { class: 'triage-row' + (it.hot ? ' triage-hot' : ''), href: it.href }, [
                U.el('span', { class: 'triage-icon', text: it.icon }),
                U.el('span', { class: 'triage-badge', text: it.store }),
                U.el('span', { class: 'triage-text', text: it.name }),
                it.time ? U.el('span', { class: 'triage-time', text: U.fmtTime(it.ts) + ' 到期' }) : U.el('span', { class: 'triage-time', text: '高优' })
            ])
        ))
    ]);

    /* ===== ③ 高优待办摘要 ===== */
    const highSummaries = [];
    [media, develop, consult, fitness, game].flat().filter(i => i.priority === 'high' && !i.done).forEach(i => {
        highSummaries.push({ store: i._store || '?', name: i.name || i.title || i.project, item: i });
    });

    /* ===== 快速备忘 ===== */
    const noteInput = U.el('input', { class: 'form-input', placeholder: '✍️ 快速备忘，回车保存...' });
    noteInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && noteInput.value.trim()) {
            await Store.DBadd('notes', { text: noteInput.value.trim() });
            noteInput.value = '';
            UI.Toast.ok('备忘已保存');
            Router.navigate();
        }
    });

    const noteList = U.el('div', { class: 'note-list' });
    notes.slice().reverse().slice(0, 10).forEach(n => {
        noteList.appendChild(U.el('div', { class: 'note-item' }, [
            U.el('span', { class: 'note-text', text: n.text }),
            U.el('span', { class: 'note-time', text: U.fmtDateTime(n.createdAt) }),
            U.el('button', { class: 'note-del', text: '✕', onclick: () => Store.DBdelete('notes', n.id).then(() => Router.navigate()) })
        ]));
    });

    /* ===== 今日计划面板 ===== */
    const todoPanel = U.el('div', { class: 'dashboard-card' }, [
        U.el('div', { class: 'card-head' }, [U.el('h3', { text: '📅 今日计划 · ' + today }), U.el('a', { class: 'link', text: '去管理 →', href: '#/todayPlan' })]),
        todayTodos.length === 0 ? U.el('div', { class: 'empty', text: '没有待办，太棒了！' }) : null,
        ...todayTodos.slice(0, 10).map(t => U.el('div', { class: 'todo-row' }, [
            U.el('input', { type: 'checkbox', class: 'todo-check', checked: t.done, onclick: () => { t.done = !t.done; Store.DBput('todos', t).then(Router.navigate); } }),
            U.el('span', { class: 'todo-text ' + (t.done ? 'done' : '') + ' ' + (UI.PRIORITY_CLASS[t.priority] || ''), text: t.title }),
            U.el('span', { class: 'badge badge-' + (UI.PRIORITY_CLASS[t.priority] || 'prio-mid'), text: UI.PRIORITY_LABEL[t.priority] || '中' }),
            t.deadline ? U.el('span', { class: 'todo-deadline', text: U.fmtTime(toTs(t.deadline)) }) : null
        ])).filter(Boolean)
    ]);

    /* ===== 高优摘要 ===== */
    const summaryPanel = U.el('div', { class: 'dashboard-card' }, [
        U.el('div', { class: 'card-head' }, [U.el('h3', { text: '🔥 高优待办摘要' })]),
        highSummaries.length === 0 ? U.el('div', { class: 'empty', text: '没有高优事项' }) : null,
        ...highSummaries.slice(0, 8).map(s => U.el('div', { class: 'summary-row', onclick: () => Router.navigate() }, [
            U.el('span', { class: 'badge badge-prio-high', text: s.store }),
            U.el('span', { class: 'summary-text', text: s.name })
        ])).filter(Boolean)
    ]);

    /* ===== 统计卡 ===== */
    const statCard = U.el('div', { class: 'dashboard-card stat-card' }, [
        U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: allPending.length }), U.el('div', { class: 'stat-lbl', text: '待办任务' })]),
        U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: media.filter(i => !i.done).length }), U.el('div', { class: 'stat-lbl', text: '自媒体选题' })]),
        U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: game.length }), U.el('div', { class: 'stat-lbl', text: '游戏清单' })]),
        U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: notes.length }), U.el('div', { class: 'stat-lbl', text: '备忘条数' })])
    ]);

    /* ===== 模块快捷入口 ===== */
    const entries = [
        { r: 'todayPlan', i: '📅', t: '今日计划' },
        { r: 'media', i: '📱', t: '自媒体' },
        { r: 'develop', i: '💻', t: '开发工作' },
        { r: 'consult', i: '💼', t: '咨询工作' },
        { r: 'fitness', i: '💪', t: '健身计划' },
        { r: 'diet', i: '🍱', t: '饮食计划' },
        { r: 'game', i: '🎮', t: '游戏娱乐' },
        { r: 'ai', i: '🤖', t: 'AI 对话' },
        { r: 'setting', i: '⚙️', t: '数据与设置' }
    ];
    const quickGrid = U.el('div', { class: 'dashboard-card' }, [
        U.el('div', { class: 'card-head' }, [U.el('h3', { text: '🚀 模块快捷入口' })]),
        U.el('div', { class: 'quick-grid' }, entries.map(e => U.el('a', { class: 'quick-item', href: '#/' + e.r }, [
            U.el('div', { class: 'quick-icon', text: e.i }),
            U.el('div', { class: 'quick-text', text: e.t })
        ])))
    ]);

    root.appendChild(U.el('div', { class: 'dashboard-grid' }, [
        hookPanel,
        triagePanel,
        todoPanel,
        summaryPanel,
        U.el('div', { class: 'dashboard-card' }, [
            U.el('div', { class: 'card-head' }, [U.el('h3', { text: '✍️ 快速备忘' })]),
            noteInput, noteList
        ]),
        statCard,
        quickGrid
    ]));
}, '首页总览');

// 通用列表渲染工具函数（多个模块复用）
window.renderListPage = async function renderListPage(root, storeName, title, addLabel, fields, renderRow) {
    root.innerHTML = '';
    const head = U.el('div', { class: 'page-head' }, [
        U.el('h2', { text: title }),
        U.el('button', { class: 'btn btn-primary', text: '＋ ' + addLabel, onclick: () => openEditor(storeName, null, fields, renderRow) })
    ]);
    root.appendChild(head);
    const listWrap = U.el('div', { class: 'list-wrap' });
    root.appendChild(listWrap);
    await refresh();
    async function refresh() {
        listWrap.innerHTML = '';
        const items = await Store.DBgetAll(storeName);
        if (items.length === 0) { listWrap.appendChild(U.el('div', { class: 'empty-large', text: '还没有数据，点右上角 ＋ 添加' })); return; }
        const sorted = items.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        sorted.forEach(item => {
            const row = renderRow(item, () => openEditor(storeName, item, fields, renderRow));
            listWrap.appendChild(row);
        });
    }
    root._refresh = refresh;
};

window.openEditor = async function openEditor(storeName, existing, fields, renderRow) {
    const isEdit = !!existing;
    const formMap = {};
    const body = U.el('div', { class: 'form' });
    fields.forEach(def => {
        let input;
        const v = existing ? existing[def.key] : (def.default || '');
        if (def.type === 'textarea') {
            input = U.el('textarea', { class: 'form-input', rows: def.rows || 3, placeholder: def.placeholder || '' }, v || '');
        } else if (def.type === 'select') {
            input = U.el('select', { class: 'form-input' }, (def.options || []).map(o => U.el('option', { value: o.value, text: o.label, selected: o.value === v })));
        } else if (def.type === 'file') {
            input = U.el('div', { class: 'file-drop' }, [
                U.el('div', { class: 'file-drop-hint', text: '📎 点击或拖拽绑定本地文件（只存路径）' }),
                v ? U.el('div', { class: 'file-linked', text: '已绑定：' + v }) : null
            ]);
            input.addEventListener('click', () => {
                const i = document.createElement('input'); i.type = 'file'; i.onchange = () => {
                    input.querySelector('.file-linked')?.remove();
                    input.appendChild(U.el('div', { class: 'file-linked', text: '已绑定：' + (i.files[0]?.name || '') }));
                    formMap[def.key].value = i.files[0]?.name || '';
                }; i.click();
            });
            input.addEventListener('dragover', e => e.preventDefault());
            input.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) {
                input.querySelector('.file-linked')?.remove();
                input.appendChild(U.el('div', { class: 'file-linked', text: '已绑定：' + f.name }));
                formMap[def.key].value = f.name;
            }});
            formMap[def.key] = { value: v || '' };
        } else if (def.type === 'checkbox') {
            input = U.el('label', { class: 'check-wrap' }, [U.el('input', { type: 'checkbox', checked: !!v }), U.el('span', { text: def.checkLabel || '' })]);
        } else {
            input = U.el('input', { class: 'form-input', type: def.type || 'text', placeholder: def.placeholder || '', value: v || '' });
        }
        formMap[def.key] = input;
        body.appendChild(U.el('div', { class: 'form-field' }, [
            def.label ? U.el('label', { class: 'form-label', text: def.label + (def.required ? ' *' : '') }) : null,
            input
        ].filter(Boolean)));
    });
    const footer = U.el('div', { class: 'modal-footer-buttons' }, [
        U.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => UI.Modal.close() }),
        U.el('button', { class: 'btn btn-primary', text: isEdit ? '保存' : '添加', onclick: async () => {
                const data = { id: existing?.id, ...(existing || {}) };
                fields.forEach(def => {
                    const el = formMap[def.key];
                    if (def.type === 'checkbox') data[def.key] = el.firstChild.checked;
                    else if (def.key === 'deadline' && el.value) data[def.key] = el.value.length === 10 ? el.value + 'T23:59' : el.value;
                    else data[def.key] = el.value;
                });
                if (!existing) await Store.DBadd(storeName, data);
                else await Store.DBput(storeName, data);
                UI.Modal.close(); UI.Toast.ok(isEdit ? '已保存' : '已添加');
                Router.navigate();
            }})
    ]);
    UI.Modal.open((isEdit ? '编辑' : '添加') + ' - ' + Store.STORE_LABELS[storeName], body, footer);
};
