// js/common.js
// 餐厅学生管理系统 - 公共函数与数据初始化
'use strict';

// ============ 常量 ============
const ADMIN_ACCOUNT = 'admin';
const ADMIN_PWD = 'admin123';

// ============ 数据初始化（首次运行时写入默认数据） ============
(function initData() {
    if (!BS.get('users')) {
        BS.set('users', JSON.stringify([
            { username: 'student', password: '123456', avatar: '' }
        ]));
    }
    if (!BS.get('loginLogs')) {
        BS.set('loginLogs', JSON.stringify([]));
    }
    if (!BS.get('foods')) {
        BS.set('foods', JSON.stringify([
            { id: 1, name: '红烧肉', price: 12, img: '' },
            { id: 2, name: '宫保鸡丁', price: 10, img: '' },
            { id: 3, name: '鱼香肉丝', price: 10, img: '' },
            { id: 4, name: '番茄炒蛋', price: 8, img: '' },
            { id: 5, name: '麻婆豆腐', price: 8, img: '' },
            { id: 6, name: '清炒时蔬', price: 6, img: '' }
        ]));
    }
    if (!BS.get('orders')) {
        BS.set('orders', JSON.stringify([]));
    }
    if (!BS.get('suggests')) {
        BS.set('suggests', JSON.stringify([]));
    }
    if (!BS.get('cart')) {
        BS.set('cart', JSON.stringify([]));
    }
    if (!BS.get('carts')) {
        BS.set('carts', JSON.stringify({}));
    }
})();

// ============ 用户管理 ============
function getUserList() {
    try {
        return JSON.parse(BS.get('users')) || [];
    } catch (e) {
        return [];
    }
}

function saveUserList(users) {
    BS.set('users', JSON.stringify(users));
}

function updateUserInfo(username, updates) {
    const users = getUserList();
    const idx = users.findIndex(u => u.username === username);
    if (idx >= 0) {
        users[idx] = { ...users[idx], ...updates };
        saveUserList(users);
    }
}

function getCurrentUser() {
    return localStorage.getItem('currentUser') || '';
}

// ============ 登录日志 ============
function addLoginLog(username) {
    try {
        const logs = JSON.parse(BS.get('loginLogs')) || [];
        const now = new Date();
        const time = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
        logs.push({ username, time });
        BS.set('loginLogs', JSON.stringify(logs));
    } catch (e) {
        console.warn('登录日志写入失败', e);
    }
}

// ============ 主题切换 ============
function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
}

// 页面加载时应用保存的主题
(function applyTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
    }
})();

// ============ 退出登录 ============
function logout() {
    localStorage.removeItem('currentUser');
    location.href = 'index.html';
}

// ============ 头像上传（转 base64） ============
function uploadAvatar(input, callback) {
    if (!input || !input.files || !input.files[0]) {
        if (callback) callback('');
        return;
    }
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        if (callback) callback(e.target.result);
    };
    reader.readAsDataURL(file);
}
