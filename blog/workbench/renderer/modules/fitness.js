// renderer/modules/fitness.js
'use strict';


const FITNESS_PLANS = ['全身训练', '胸背肩腿', '上下肢分化', '推/拉/腿'];
const FITNESS_FIELDS = [
    { key: 'planName', label: '训练方案', required: true, type: 'select', defaultValue: FITNESS_PLANS[0], options: FITNESS_PLANS.map(p => ({ value: p, label: p })) },
    { key: 'exercise', label: '训练项目', required: true, placeholder: '如：硬拉 5×5' },
    { key: 'date', label: '训练日期', type: 'date', value: U.todayStr() },
    { key: 'duration', label: '时长（分钟）', type: 'number', value: 60 },
    { key: 'done', label: '已完成', type: 'checkbox', checkLabel: '标记训练完成' },
    { key: 'notes', label: '备注', type: 'textarea' },
    { key: 'filePath', label: '关联文件', type: 'file' }
];

Router.registerRoute('fitness', async (root) => {
    await window.renderListPage(root, 'fitness', '健身计划', '新训练记录', FITNESS_FIELDS, (item, edit) => {
        return U.el('div', { class: 'list-item ' + (item.done ? 'done' : '') }, [
            U.el('input', { type: 'checkbox', class: 'todo-check', checked: !!item.done, onclick: () => { item.done = !item.done; Store.DBput('fitness', item).then(() => root._refresh()); } }),
            U.el('div', { class: 'item-body', onclick: edit }, [
                U.el('div', { class: 'item-title', text: item.planName + ' · ' + item.exercise }),
                U.el('div', { class: 'item-meta' }, [
                    item.date ? U.el('span', { class: 'deadline-chip', text: '📅 ' + item.date }) : null,
                    U.el('span', { class: 'badge', text: (item.duration||0) + ' 分钟' })
                ]),
                item.notes ? U.el('div', { class: 'item-sub', text: item.notes }) : null
            ]),
            U.el('button', { class: 'btn-icon', title: '删除', onclick: () => UI.Modal.confirm('删除记录', '移入回收站', () => Store.DBdelete('fitness', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
        ]);
    });
}, '健身计划');