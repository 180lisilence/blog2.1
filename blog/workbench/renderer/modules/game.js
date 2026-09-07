// renderer/modules/game.js
'use strict';


const GAME_FIELDS = [
    { key: 'name', label: '游戏名', required: true },
    { key: 'status', label: '状态', type: 'select', defaultValue: 'todo', options: [
            { value: 'todo', label: '📋 待玩' }, { value: 'playing', label: '🎮 进行中' }, { value: 'done', label: '🏆 已通关' }
        ]},
    { key: 'progress', label: '通关进度 %', type: 'number', value: 0 },
    { key: 'totalHours', label: '累计时长 (小时)', type: 'number', value: 0 },
    { key: 'notes', label: '备注', type: 'textarea' },
    { key: 'filePath', label: '关联文件', type: 'file' }
];

Router.registerRoute('game', async (root) => {
    await window.renderListPage(root, 'game', '游戏娱乐', '＋ 新游戏', GAME_FIELDS, (item, edit) => {
        const statusLabel = { todo:'📋 待玩', playing:'🎮 进行中', done:'🏆 已通关' };
        const pct = item.progress || 0;
        return U.el('div', { class: 'list-item ' + (item.status==='done'?'done':'') }, [
            U.el('div', { class: 'item-body', onclick: edit }, [
                U.el('div', { class: 'item-title', text: '🎮 ' + item.name }),
                U.el('div', { class: 'item-meta' }, [
                    U.el('span', { class: 'badge', text: statusLabel[item.status] || '待玩' }),
                    U.el('span', { class: 'badge', text: '🕐 ' + (item.totalHours||0) + 'h' }),
                    U.el('span', { class: 'badge', text: '进度 ' + pct + '%' })
                ]),
                U.el('div', { class: 'progress-bar', style: 'height:6px;background:#eee;border-radius:3px;overflow:hidden;margin-top:6px;' }, [
                    U.el('div', { class: 'progress-fill', style: 'width:' + pct + '%;height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:3px;' })
                ])
            ]),
            U.el('button', { class: 'btn-icon', title: '删除', onclick: () => UI.Modal.confirm('删除游戏', '', () => Store.DBdelete('game', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
        ]);
    });
}, '游戏娱乐');