// renderer/modules/diet.js
'use strict';


const DIET_MEALS = [{ value: 'breakfast', label: '🌅 早餐' }, { value: 'lunch', label: '☀️ 午餐' }, { value: 'dinner', label: '🌙 晚餐' }, { value: 'snack', label: '🍪 加餐' }];
const DIET_FIELDS = [
    { key: 'date', label: '日期', type: 'date', value: U.todayStr() },
    { key: 'meal', label: '餐次', type: 'select', defaultValue: 'breakfast', options: DIET_MEALS },
    { key: 'ingredients', label: '食材清单', type: 'textarea', placeholder: '如：鸡蛋2个 + 牛奶250ml + 全麦面包1片' },
    { key: 'calories', label: '估算热量 (kcal)', type: 'number', value: 0 },
    { key: 'notes', label: '备注', type: 'textarea' },
    { key: 'filePath', label: '关联文件', type: 'file' }
];
const MEAL_LABEL = { breakfast:'🌅 早餐', lunch:'☀️ 午餐', dinner:'🌙 晚餐', snack:'🍪 加餐' };

Router.registerRoute('diet', async (root) => {
    root.innerHTML = '';
    const head = U.el('div', { class: 'page-head' }, [
        U.el('h2', { text: '饮食计划' }),
        U.el('button', { class: 'btn btn-primary', text: '＋ 新饮食记录', onclick: () => window.openEditor('diet', null, DIET_FIELDS, null) })
    ]);
    root.appendChild(head);
    root.appendChild(U.el('div', { id: 'diet-stats', class: 'diet-stats' }));
    const listWrap = U.el('div', { class: 'list-wrap' });
    root.appendChild(listWrap);

    async function refresh() {
        listWrap.innerHTML = '';
        const items = (await Store.DBgetAll('diet')).sort((a,b) => (b.date||'').localeCompare(a.date||''));
        if (items.length === 0) { listWrap.appendChild(U.el('div', { class: 'empty-large', text: '还没有饮食记录' })); return; }
        const groups = {};
        items.forEach(i => { (groups[i.date] = groups[i.date] || []).push(i); });
        Object.entries(groups).forEach(([date, meals]) => {
            const dayKcal = meals.reduce((s, m) => s + Number(m.calories||0), 0);
            listWrap.appendChild(U.el('div', { class: 'diet-day' }, [
                U.el('div', { class: 'diet-day-head' }, [
                    U.el('span', { class: 'diet-date', text: date }),
                    U.el('span', { class: 'diet-day-kcal', text: '🔥 ' + dayKcal + ' kcal' })
                ]),
                ...meals.map(m => U.el('div', { class: 'list-item' }, [
                    U.el('div', { class: 'item-body', onclick: () => window.openEditor('diet', m, DIET_FIELDS, null) }, [
                        U.el('div', { class: 'item-title', text: MEAL_LABEL[m.meal] || m.meal }),
                        U.el('div', { class: 'item-sub', text: m.ingredients || '(未填食材)' }),
                        m.notes ? U.el('div', { class: 'item-sub', text: m.notes }) : null
                    ]),
                    U.el('div', { class: 'diet-item-kcal', text: (m.calories||0) + ' kcal' }),
                    U.el('button', { class: 'btn-icon', title: '删除', onclick: () => UI.Modal.confirm('删除', '', () => Store.DBdelete('diet', m.id).then(refresh), '删除', '取消', true) }, '🗑️')
                ]))
            ]));
        });
    }
    root._refresh = refresh; refresh();
}, '饮食计划');