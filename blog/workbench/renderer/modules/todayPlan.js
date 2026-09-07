// renderer/modules/todayPlan.js
'use strict';


const TODO_FIELDS = [
    { key: 'title', label: '任务标题', required: true, placeholder: '要做什么？' },
    { key: 'desc', label: '详细备注', type: 'textarea', placeholder: '补充说明、链接等' },
    { key: 'priority', label: '优先级', type: 'select', defaultValue: 'mid', options: [
            { value: 'high', label: '🔴 高' }, { value: 'mid', label: '🟡 中' }, { value: 'low', label: '🟢 低' }
        ]},
    { key: 'deadline', label: '截止时间', type: 'datetime-local' },
    { key: 'filePath', label: '关联文件', type: 'file' }
];

Router.registerRoute('todayPlan', async (root) => {
    await window.renderListPage(root, 'todos', '今日计划', '新任务', TODO_FIELDS, (item, edit) => {
        return U.el('div', { class: 'list-item ' + (item.done ? 'done' : ''), draggable: 'true' }, [
            U.el('input', { type: 'checkbox', class: 'todo-check', checked: !!item.done, onclick: () => { item.done = !item.done; Store.DBput('todos', item).then(() => root._refresh()); } }),
            U.el('div', { class: 'item-body', onclick: edit }, [
                U.el('div', { class: 'item-title', text: item.title || '未命名' }),
                item.desc ? U.el('div', { class: 'item-sub', text: item.desc }) : null,
                item.deadline ? U.el('div', { class: 'item-meta' }, [
                    U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: UI.PRIORITY_LABEL[item.priority] || '中' }),
                    U.el('span', { class: 'deadline-chip', text: '⏰ ' + U.fmtDateTime(item.deadline.startsWith('20') && item.deadline.length <= 16 ? item.deadline.replace('T',' ') : item.deadline) })
                ]) : U.el('div', { class: 'item-meta' }, [
                    U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: UI.PRIORITY_LABEL[item.priority] || '中' })
                ]),
                item.filePath ? U.el('div', { class: 'file-linked', text: '📎 ' + item.filePath }) : null
            ]),
            U.el('button', { class: 'btn-icon', title: '删除', onclick: () => UI.Modal.confirm('删除任务', '将移入回收站', () => Store.DBdelete('todos', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
        ]);
    });
}, '今日计划');