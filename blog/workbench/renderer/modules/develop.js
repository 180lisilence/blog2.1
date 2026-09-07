// renderer/modules/develop.js
'use strict';


Router.registerRoute('develop', async (root) => {
    root.innerHTML = '';
    const head = U.el('div', { class: 'page-head' }, [
        U.el('h2', { text: '开发工作' }),
        U.el('div', { class: 'head-actions' }, [
            U.el('button', { class: 'btn btn-ghost', text: '＋ 项目', onclick: () => {
                    const nameInput = U.el('input', { class: 'form-input', placeholder: '项目名' });
                    const descInput = U.el('textarea', { class: 'form-input', rows: 2, placeholder: '描述（可选）' });
                    UI.Modal.open('新建项目', U.el('div', { class: 'form' }, [
                        U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '项目名 *' }), nameInput]),
                        U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '描述' }), descInput])
                    ]), U.el('div', { class: 'modal-footer-buttons' }, [
                        U.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => UI.Modal.close() }),
                        U.el('button', { class: 'btn btn-primary', text: '创建', onclick: async () => {
                                if (!nameInput.value.trim()) return UI.Toast.warn('请填写项目名');
                                await Store.DBadd('develop', { type: 'project', name: nameInput.value.trim(), desc: descInput.value });
                                UI.Modal.close(); refresh();
                            }})
                    ]));
                }}),
            U.el('button', { class: 'btn btn-primary', text: '＋ 任务', onclick: () => openDevTask() })
        ])
    ]);
    root.appendChild(head);

    const listWrap = U.el('div', { class: 'dev-wrap' });
    root.appendChild(listWrap);

    function openDevTask(existing) {
        Store.DBgetAll('develop').then(all => {
            const projects = all.filter(x => x.type === 'project');
            const projectOptions = [{ value: '', label: '未分类' }, ...projects.map(p => ({ value: p.id, label: p.name }))];
            const form = [
                { key: 'title', label: '任务标题', required: true, value: existing?.title },
                { key: 'projectId', label: '所属项目', type: 'select', value: existing?.projectId, defaultValue: '', options: projectOptions },
                { key: 'desc', label: '需求备注', type: 'textarea', value: existing?.desc },
                { key: 'progress', label: '进度 %', type: 'number', value: existing?.progress || 0 },
                { key: 'deadline', label: '截止', type: 'datetime-local', value: existing?.deadline },
                { key: 'priority', label: '优先级', type: 'select', value: existing?.priority, defaultValue: 'mid', options: [{value:'high',label:'🔴 高'},{value:'mid',label:'🟡 中'},{value:'low',label:'🟢 低'}] },
                { key: 'done', label: '已完成', type: 'checkbox', value: existing?.done, checkLabel: '标记完成' },
                { key: 'filePath', label: '关联文件', type: 'file', value: existing?.filePath }
            ];
            window.openEditor('develop', existing, form, null);
        });
    }

    async function refresh() {
        listWrap.innerHTML = '';
        const items = await Store.DBgetAll('develop');
        if (items.length === 0) { listWrap.appendChild(U.el('div', { class: 'empty-large', text: '先创建一个项目吧' })); return; }
        const projects = items.filter(x => x.type === 'project');
        const tasks = items.filter(x => !x.type || x.type === 'task');
        projects.forEach(p => {
            const ptasks = tasks.filter(t => t.projectId === p.id);
            const card = U.el('div', { class: 'project-card' }, [
                U.el('div', { class: 'project-head' }, [
                    U.el('div', { class: 'project-name', text: p.name }, [
                        U.el('button', { class: 'btn-icon', title: '删除项目', onclick: () => UI.Modal.confirm('删除项目', '项目和任务会入回收站', async () => {
                                for (const t of ptasks) await Store.DBdelete('develop', t.id);
                                await Store.DBdelete('develop', p.id); refresh();
                            }, '删除', '取消', true) }, '🗑️')
                    ]),
                    U.el('span', { class: 'badge', text: ptasks.length + ' 任务' })
                ]),
                p.desc ? U.el('div', { class: 'project-desc', text: p.desc }) : null,
                U.el('div', { class: 'task-list' }, ptasks.length === 0 ? U.el('div', { class: 'empty', text: '暂无任务' }) : null),
                ...ptasks.map(t => U.el('div', { class: 'task-item ' + (t.done?'done':''), onclick: () => openDevTask(t) }, [
                    U.el('input', { type: 'checkbox', checked: !!t.done, onclick: (e) => { e.stopPropagation(); t.done = !t.done; Store.DBput('develop', t).then(refresh); } }),
                    U.el('div', { class: 'task-body' }, [
                        U.el('div', { class: 'task-title', text: t.title }),
                        U.el('div', { class: 'task-meta' }, [
                            U.el('span', { class: 'badge badge-prio-' + (t.priority||'mid'), text: UI.PRIORITY_LABEL[t.priority]||'中' }),
                            U.el('div', { class: 'progress-bar', style: 'width:80px;height:6px;background:#eee;border-radius:3px;overflow:hidden;display:inline-block;margin-left:8px;vertical-align:middle;' }, [
                                U.el('div', { class: 'progress-fill', style: 'width:' + (t.progress||0) + '%;height:100%;background:linear-gradient(90deg,#3498db,#2ecc71);border-radius:3px;' })
                            ]),
                            U.el('span', { class: 'progress-num', text: (t.progress||0) + '%', style: 'margin-left:4px;font-size:12px;color:#666;' })
                        ])
                    ]),
                    U.el('button', { class: 'btn-icon', title: '删除', onclick: (e) => { e.stopPropagation(); UI.Modal.confirm('删除任务', '', () => Store.DBdelete('develop', t.id).then(refresh), '删除', '取消', true); } }, '🗑️')
                ]))
            ]);
            listWrap.appendChild(card);
        });
        // 渲染未分类任务（不属于任何项目的任务）
        const uncatTasks = tasks.filter(t => !t.projectId);
        if (uncatTasks.length > 0) {
            const uncatTaskEls = uncatTasks.map(t => U.el('div', { class: 'task-item ' + (t.done ? 'done' : ''), onclick: () => openDevTask(t) }, [
                U.el('input', { type: 'checkbox', checked: !!t.done, onclick: (e) => { e.stopPropagation(); t.done = !t.done; Store.DBput('develop', t).then(refresh); } }),
                U.el('div', { class: 'task-body' }, [
                    U.el('div', { class: 'task-title', text: t.title }),
                    U.el('div', { class: 'task-meta' }, [
                        U.el('span', { class: 'badge badge-prio-' + (t.priority || 'mid'), text: UI.PRIORITY_LABEL[t.priority] || '中' }),
                        U.el('div', { class: 'progress-bar', style: 'width:80px;height:6px;background:#eee;border-radius:3px;overflow:hidden;display:inline-block;margin-left:8px;vertical-align:middle;' }, [
                            U.el('div', { class: 'progress-fill', style: 'width:' + (t.progress || 0) + '%;height:100%;background:linear-gradient(90deg,#3498db,#2ecc71);border-radius:3px;' })
                        ]),
                        U.el('span', { class: 'progress-num', text: (t.progress || 0) + '%', style: 'margin-left:4px;font-size:12px;color:#666;' })
                    ])
                ]),
                U.el('button', { class: 'btn-icon', title: '删除', onclick: (e) => { e.stopPropagation(); UI.Modal.confirm('删除任务', '', () => Store.DBdelete('develop', t.id).then(refresh), '删除', '取消', true); } }, '🗑️')
            ]));
            const uncatCard = U.el('div', { class: 'project-card' }, [
                U.el('div', { class: 'project-head' }, [
                    U.el('div', { class: 'project-name', text: '未分类任务' }),
                    U.el('span', { class: 'badge', text: uncatTasks.length + ' 任务' })
                ]),
                U.el('div', { class: 'task-list' }, uncatTaskEls)
            ]);
            listWrap.appendChild(uncatCard);
        }
    }

    root._refresh = refresh;
    refresh();
}, '开发工作');