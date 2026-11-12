// renderer/modules/profile.js
'use strict';


Router.registerRoute('profile', async (root) => {
    root.innerHTML = '';
    const profile = getProfile();
    const stats = await getStats();

    const avatarEl = U.el('div', { class: 'profile-avatar-large' });
    // 支持 emoji 头像和图片头像（base64）
    if (profile.avatar && profile.avatar.startsWith('data:image/')) {
        avatarEl.innerHTML = '<img src="' + profile.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="头像">';
    } else {
        avatarEl.textContent = profile.avatar || '👤';
    }
    const nameEl = U.el('div', { class: 'profile-name' }, profile.nickname);
    const bioEl = U.el('div', { class: 'profile-bio' }, profile.bio || '这个人很懒，什么都没留下');
    const metaEl = U.el('div', { class: 'profile-meta' }, [
        U.el('span', {}, '📅 加入于 ' + profile.createdAt),
        U.el('span', {}, '🆔 ' + profile.id)
    ]);
    const editBtn = U.el('button', { class: 'btn btn-primary btn-sm profile-edit-btn', onclick: () => showEditDialog() }, '✏️ 编辑资料');

    const profileCard = U.el('div', { class: 'dashboard-card profile-card' }, [
        U.el('div', { class: 'profile-avatar-wrap' }, [avatarEl]),
        nameEl, bioEl, metaEl, editBtn
    ]);

    const statGrid = U.el('div', { class: 'stat-grid' }, [
        statItem('📋', stats.totalTasks, '任务总数'),
        statItem('✅', stats.doneTasks, '已完成'),
        statItem('🔥', stats.urgentTasks, '紧急任务'),
        statItem('📆', stats.streakDays, '连续打卡'),
        statItem('🤖', stats.aiConvs, 'AI 对话'),
        statItem('📝', stats.notes, '笔记数')
    ]);

    const statsCard = U.el('div', { class: 'dashboard-card profile-stats' }, [
        U.el('div', { class: 'card-head' }, [U.el('h3', {}, '📊 数据统计')]),
        statGrid
    ]);

    const actions = U.el('div', { class: 'dashboard-card profile-actions' }, [
        U.el('div', { class: 'card-head' }, [U.el('h3', {}, '⚡ 快捷操作')]),
        U.el('div', { class: 'profile-action-grid' }, [
            actionItem('📤', '导出数据', () => exportData()),
            actionItem('📥', '导入数据', () => importData()),
            actionItem('💾', '备份数据', () => exportData()),
            actionItem('🗑️', '重置应用', () => {
                if (confirm('确定要重置应用吗？\n这将清除所有任务/笔记/AI对话数据，个人资料会保留，操作不可恢复！')) {
                    Store.STORES.forEach(s => { Store.appStore[s] = []; });
                    Store.appStore.config = Store.Config._clone(Store.Config.defaults);
                    Store.persistStore().then(() => {
                        location.reload();
                    });
                }
            })
        ])
    ]);

    root.appendChild(U.el('div', { class: 'profile-layout' }, [profileCard, statsCard, actions]));
    function statItem(icon, num, label) {
        return U.el('div', { class: 'stat-item' }, [
            U.el('div', { class: 'stat-num' }, String(num)),
            U.el('div', { class: 'stat-lbl' }, icon + ' ' + label)
        ]);
    }
    function actionItem(icon, label, onclick) {
        return U.el('div', { class: 'profile-action-item', onclick }, [
            U.el('div', { class: 'action-icon' }, icon),
            U.el('div', { class: 'action-label' }, label)
        ]);
    }
}, '个人中心');

// Profile辅助函数
function getProfile() {
    let profile = BS.get('personal_profile');
    if (!profile) {
        try { const raw = localStorage.getItem('personal_profile'); if (raw) profile = JSON.parse(raw); } catch {}
    }
    if (profile) return profile;
    profile = {
        id: 'u_' + Date.now().toString(36),
        nickname: '用户' + new Date().getDate(),
        avatar: '👤',
        bio: '',
        createdAt: U.fmtDate(new Date())
    };
    BS.set('personal_profile', profile);
    return profile;
}
function saveProfile(p) { BS.set('personal_profile', p); }

async function getStats() {
    try {
        const [todos, notes, aiConvs] = await Promise.all([
            Store.DBgetAll('todos').catch(() => []),
            Store.DBgetAll('notes').catch(() => []),
            Store.DBgetAll('aiConvs').catch(() => [])
        ]);
        const totalTasks = todos.length;
        const doneTasks = todos.filter(t => t.done).length;
        const urgentTasks = todos.filter(t => t.priority === 'high' && !t.done).length;
        let streakDays = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            const dateStr = U.fmtDate(d);
            if (todos.some(t => t.createdAt && U.fmtDate(new Date(t.createdAt)) === dateStr)) streakDays++;
            else if (i > 0) break;
        }
        return { totalTasks, doneTasks, urgentTasks, streakDays, aiConvs: aiConvs.length, notes: notes.length };
    } catch {
        return { totalTasks:0, doneTasks:0, urgentTasks:0, streakDays:0, aiConvs:0, notes:0 };
    }
}

function showEditDialog() {
    const profile = getProfile();
    const avatars = ['👤','😀','😎','🤖','🐱','🐶','🦊','🐼','🦁','🐸','🦄','🐙','🦋','🌟','🔥','💎','🎯','🚀','🎨','🎭'];
    const isImageAvatar = profile.avatar && profile.avatar.startsWith('data:image/');
    const avHtml = avatars.map(a =>
        `<div class="avatar-option ${!isImageAvatar && a===profile.avatar?'selected':''}" data-avatar="${a}">${a}</div>`
    ).join('');

    const uploadBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, '📤 上传自定义头像');
    const uploadPreview = U.el('div', { style: 'margin-top:10px;text-align:center;' });
    if (isImageAvatar) {
        uploadPreview.innerHTML = '<img src="' + profile.avatar + '" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--accent);" alt="头像预览">';
    }
    const fileInput = U.el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 500 * 1024) {
            UI.Toast.show('图片不能超过 500KB', 'err');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            // 压缩到合适尺寸
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 128;
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                // 居中裁剪为正方形
                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
                const compressed = canvas.toDataURL('image/jpeg', 0.8);
                chosenAvatar = compressed;
                uploadPreview.innerHTML = '<img src="' + compressed + '" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--accent);" alt="头像预览">';
                // 取消 emoji 选中状态
                modal.querySelectorAll('.avatar-option').forEach(x => x.classList.remove('selected'));
                UI.Toast.show('头像已选择，记得点保存', 'ok');
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });

    const modal = U.el('div', { class: 'modal-backdrop', style: 'display:flex' }, [
        U.el('div', { class: 'modal' }, [
            U.el('div', { class: 'modal-header' }, [
                U.el('div', { class: 'modal-title' }, '编辑个人资料'),
                U.el('button', { class: 'modal-close', onclick: () => modal.remove() }, '✕')
            ]),
            U.el('div', { class: 'modal-body' }, [
                U.el('div', { class: 'form-field' }, [
                    U.el('div', { class: 'form-label' }, '昵称'),
                    Object.assign(U.el('input', { class: 'form-input', maxlength: '20', id: 'edit-nickname' }), { value: profile.nickname })
                ]),
                U.el('div', { class: 'form-field' }, [
                    U.el('div', { class: 'form-label' }, '头像（选择 emoji 或上传图片）'),
                    U.el('div', { class: 'avatar-picker', html: avHtml }),
                    U.el('div', { style: 'margin-top:12px;display:flex;flex-direction:column;align-items:center;gap:8px;' }, [
                        uploadBtn,
                        uploadPreview
                    ]),
                    fileInput
                ]),
                U.el('div', { class: 'form-field' }, [
                    U.el('div', { class: 'form-label' }, '个人简介'),
                    Object.assign(U.el('textarea', { class: 'form-input', maxlength: '100', style: 'min-height:60px', id: 'edit-bio' }), { value: profile.bio || '' })
                ])
            ]),
            U.el('div', { class: 'modal-footer' }, [
                U.el('div', { class: 'modal-footer-buttons' }, [
                    U.el('button', { class: 'btn btn-ghost', onclick: () => modal.remove() }, '取消'),
                    U.el('button', {
                        class: 'btn btn-primary',
                        onclick: () => {
                            const nickInput = modal.querySelector('#edit-nickname');
                            const bioInput = modal.querySelector('#edit-bio');
                            const chosen = modal.querySelector('.avatar-option.selected');

                            if (!nickInput || !bioInput) {
                                UI.Toast.show('读取表单失败', 'error');
                                return;
                            }

                            let avatar = profile.avatar;
                            if (chosenAvatar) {
                                avatar = chosenAvatar;
                            } else if (chosen) {
                                avatar = chosen.dataset.avatar;
                            }

                            const updated = {
                                ...profile,
                                nickname: nickInput.value.trim() || profile.nickname,
                                avatar: avatar,
                                bio: bioInput.value.trim()
                            };
                            saveProfile(updated);
                            modal.remove();
                            UI.Toast.show('资料已更新', 'ok');
                            Router.navigate();
                        }
                    }, '保存')
                ])
            ])
        ])
    ]);
    document.body.appendChild(modal);
    let chosenAvatar = isImageAvatar ? profile.avatar : null;
    modal.querySelectorAll('.avatar-option').forEach(el => {
        el.addEventListener('click', () => {
            chosenAvatar = null; // 选了 emoji 就清空图片头像
            modal.querySelectorAll('.avatar-option').forEach(x => x.classList.toggle('selected', x === el));
        });
    });
}

function exportData() {
    const data = {
        version: 1,
        exportedAt: U.now(),
        appStore: Store.appStore,
        profile: BS.get('personal_profile') || null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '云客_备份_' + U.todayStr() + '.json';
    a.click(); URL.revokeObjectURL(url);
    UI.Toast.show('数据已导出', 'ok');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object') throw new Error('文件格式无效');
            const src = data.appStore && typeof data.appStore === 'object' ? data.appStore : data;
            Store.STORES.forEach(s => {
                if (Array.isArray(src[s])) Store.appStore[s] = src[s].slice();
            });
            if (src.config && typeof src.config === 'object') Store.appStore.config = Store.Config._clone(src.config);
            Store.migrateConfig();
            if (data.profile && typeof data.profile === 'object') {
                BS.set('personal_profile', data.profile);
            }
            await Store.persistStore();
            UI.Toast.show('数据已导入', 'ok');
            Router.navigate();
        } catch (err) { UI.Toast.show('导入失败：' + err.message, 'err'); }
    };
    input.click();
}