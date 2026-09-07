// renderer/modules/media.js
'use strict';

const MEDIA_FIELDS = [
    { key: 'title', label: '选题标题', required: true },
    { key: 'desc', label: '选题备注', type: 'textarea' },
    { key: 'draft', label: '文案草稿', type: 'textarea', rows: 5 },
    { key: 'planPublish', label: '计划发布', type: 'datetime-local' },
    { key: 'published', label: '已发布', type: 'checkbox', checkLabel: '已完成发布' },
    { key: 'priority', label: '优先级', type: 'select', defaultValue: 'mid', options: [
            { value: 'high', label: '🔴 高' }, { value: 'mid', label: '🟡 中' }, { value: 'low', label: '🟢 低' }
        ]},
    { key: 'review', label: '复盘笔记', type: 'textarea' },
    { key: 'filePath', label: '关联文件', type: 'file' }
];

Router.registerRoute('media', async (root) => {
    await window.renderListPage(root, 'media', '自媒体', '新选题', MEDIA_FIELDS, (item, edit) => {
        return U.el('div', { class: 'list-item ' + (item.published ? 'done' : '') }, [
            U.el('div', { class: 'item-body', onclick: edit }, [
                U.el('div', { class: 'item-title', text: item.title || '未命名' }),
                item.desc ? U.el('div', { class: 'item-sub', text: item.desc }) : null,
                item.draft ? U.el('div', { class: 'item-draft', text: item.draft.slice(0, 120) }) : null,
                U.el('div', { class: 'item-meta' }, [
                    U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: UI.PRIORITY_LABEL[item.priority] || '中' }),
                    item.published ? U.el('span', { class: 'badge badge-ok', text: '✓ 已发布' }) : (item.planPublish ? U.el('span', { class: 'deadline-chip', text: '📅 ' + (item.planPublish.replace('T',' ')) }) : U.el('span', { class: 'badge', text: '待发布' }))
                ])
            ]),
            U.el('button', { class: 'btn-icon', title: '删除', onclick: () => UI.Modal.confirm('删除选题', '将移入回收站', () => Store.DBdelete('media', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
        ]);
    });
}, '自媒体');