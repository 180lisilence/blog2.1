// renderer/modules/consult.js
'use strict';


const CONSULT_FIELDS = [
    { key: 'title', label: '工单/客户', required: true },
    { key: 'content', label: '咨询内容', type: 'textarea' },
    { key: 'followUp', label: '待跟进事项', type: 'textarea' },
    { key: 'nextFollow', label: '下次跟进时间', type: 'datetime-local' },
    { key: 'status', label: '跟进状态', type: 'select', defaultValue: 'open', options: [
            { value: 'open', label: '🟡 待跟进' }, { value: 'doing', label: '🔵 跟进中' }, { value: 'done', label: '🟢 已完成' }, { value: 'block', label: '🔴 阻塞' }
        ]},
    { key: 'priority', label: '优先级', type: 'select', defaultValue: 'mid', options: [
            { value: 'high', label: '🔴 高' }, { value: 'mid', label: '🟡 中' }, { value: 'low', label: '🟢 低' }
        ]},
    { key: 'filePath', label: '关联文件', type: 'file' }
];
const CONSULT_STATUS_LABEL = { open:'待跟进', doing:'跟进中', done:'已完成', block:'阻塞' };
const CONSULT_STATUS_CLASS = { open:'prio-mid', doing:'status-doing', done:'status-done', block:'prio-high' };

Router.registerRoute('consult', async (root) => {
    await window.renderListPage(root, 'consult', '咨询工作', '新工单', CONSULT_FIELDS, (item, edit) => {
        return U.el('div', { class: 'list-item ' + (item.status === 'done' ? 'done' : '') }, [
            U.el('div', { class: 'item-body', onclick: edit }, [
                U.el('div', { class: 'item-title', text: item.title }),
                item.content ? U.el('div', { class: 'item-sub', text: item.content.slice(0, 100) }) : null,
                item.followUp ? U.el('div', { class: 'item-sub', text: '🖊 ' + item.followUp.slice(0, 100) }) : null,
                U.el('div', { class: 'item-meta' }, [
                    U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: UI.PRIORITY_LABEL[item.priority]||'中' }),
                    U.el('span', { class: 'badge badge-' + (CONSULT_STATUS_CLASS[item.status]||''), text: CONSULT_STATUS_LABEL[item.status]||'待跟进' }),
                    item.nextFollow ? U.el('span', { class: 'deadline-chip', text: '🗓 ' + item.nextFollow.replace('T',' ') }) : null
                ])
            ]),
            U.el('button', { class: 'btn-icon', title: '删除', onclick: () => UI.Modal.confirm('删除工单', '移入回收站', () => Store.DBdelete('consult', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
        ]);
    });
}, '咨询工作');