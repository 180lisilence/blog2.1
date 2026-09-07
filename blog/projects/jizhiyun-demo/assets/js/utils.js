/* ===================================================================
 * utils.js - 通用工具函数
 * 包含：Toast消息、DOM操作、表单验证、格式化、复制、懒加载、防抖节流
 * =================================================================== */
window.App = window.App || {};

App.Utils = {
  /* ===== Toast 消息提示 ===== */
  toast(msg, type = 'info', duration = 2500) {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(120%)'; setTimeout(() => el.remove(), 300); }, duration);
  },

  /* ===== 通用模态弹窗 ===== */
  modal({ title, content, onConfirm, confirmText = '确定', cancelText = '取消', showCancel = true }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-bold text-lg">${title || '提示'}</h3>
          <button class="icon-btn" onclick="this.closest('.modal-overlay').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="mb-5 text-slate-600 dark:text-slate-300">${content}</div>
        <div class="flex justify-end gap-2">
          ${showCancel ? `<button class="btn-ghost" onclick="this.closest('.modal-overlay').remove()">${cancelText}</button>` : ''}
          <button class="btn-primary" id="modalConfirmBtn">${confirmText}</button>
        </div>
      </div>`;
    document.getElementById('modalContainer').appendChild(overlay);
    overlay.addEventListener('click', () => overlay.remove());
    if (onConfirm) document.getElementById('modalConfirmBtn').onclick = () => { onConfirm(() => overlay.remove()); };
    else document.getElementById('modalConfirmBtn').onclick = () => overlay.remove();
    return overlay;
  },

  /* ===== 确认弹窗（Promise 风格） ===== */
  confirm(msg, title = '确认操作') {
    return new Promise(resolve => {
      App.Utils.modal({
        title, content: msg, confirmText: '确定', cancelText: '取消',
        onConfirm: (close) => { close(); resolve(true); }
      });
      // 取消时 resolve(false)
      document.getElementById('modalContainer').lastChild.addEventListener('click', e => {
        if (e.target === e.currentTarget) resolve(false);
      });
    });
  },

  /* ===== 表单验证 ===== */
  validate: {
    required(val, name) { return (!val || !val.trim()) ? `${name}不能为空` : ''; },
    email(val) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? '' : '邮箱格式不正确'; },
    phone(val) { return /^1[3-9]\d{9}$/.test(val) ? '' : '手机号格式不正确'; },
    password(val) { return val.length >= 6 ? '' : '密码至少6位'; },
    minLen(val, n, name) { return val.length >= n ? '' : `${name}至少${n}个字符`; }
  },

  /* ===== 格式化 ===== */
  formatDate(str) {
    if (!str) return '';
    return str.replace('T', ' ').substring(0, 16);
  },
  formatMoney(num) {
    return '¥' + Number(num || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  /* 数字滚动动画 */
  animateNumber(el, target, duration = 1500) {
    const start = 0, startTime = performance.now();
    function update(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(start + (target - start) * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  },

  /* ===== 复制文本 ===== */
  copyText(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    App.Utils.toast('已复制到剪贴板', 'success');
  },

  /* ===== 图片懒加载 ===== */
  lazyLoadImages(container = document) {
    const imgs = container.querySelectorAll('img.lazy[data-src]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.onload = () => img.classList.add('loaded');
          observer.unobserve(img);
        }
      });
    });
    imgs.forEach(img => observer.observe(img));
  },

  /* ===== 防抖 / 节流 ===== */
  debounce(fn, delay = 300) {
    let timer;
    return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
  },
  throttle(fn, delay = 200) {
    let last = 0;
    return function (...args) { const now = Date.now(); if (now - last >= delay) { last = now; fn.apply(this, args); } };
  },

  /* ===== 转义 HTML（防 XSS） ===== */
  escape(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  },

  /* ===== 生成唯一 ID ===== */
  uid(prefix = 'id') {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  /* ===== 加载状态骨架屏 ===== */
  skeleton(count = 3) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `<div class="glass-card p-5 animate-pulse">
        <div class="h-40 bg-slate-200 dark:bg-slate-700 rounded-lg mb-4"></div>
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 w-3/4"></div>
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
      </div>`;
    }
    return html;
  }
};

/* ===================================================================
 * 全局设置方法（挂载到 App 顶层，供 index.html 初始化和内联 onclick 调用）
 * =================================================================== */

/* 设置主题色（CSS 变量） */
App.setThemeColor = function(color) {
  const root = document.documentElement;
  root.style.setProperty('--brand-color', color);
  // 兼容 Tailwind brand 色阶（简化处理，主色直接覆盖）
  root.style.setProperty('--brand-500', color);
  App.Store.set('themeColor', color);
};

/* 设置全局字体大小 */
App.setFontSize = function(size) {
  document.documentElement.style.fontSize = size + 'px';
  App.Store.set('fontSize', size);
};

/* 切换明暗主题 */
App.toggleTheme = function() {
  const isDark = document.documentElement.classList.toggle('dark');
  App.Store.set('darkMode', isDark ? 'true' : 'false');
};

/* 切换移动端菜单 */
App.toggleMobileMenu = function() {
  const menu = document.getElementById('mobileMenu');
  if (menu) menu.classList.toggle('hidden');
};

/* 打开设置面板（动态创建） */
App.openSettings = function() {
  // 已存在则直接显示
  let panel = document.getElementById('settingsPanel');
  if (panel) {
    panel.style.display = 'flex';
    return;
  }
  // 动态创建设置面板
  panel = document.createElement('div');
  panel.id = 'settingsPanel';
  panel.className = 'fixed inset-0 z-[100] items-center justify-center bg-black/50';
  panel.style.display = 'flex';
  panel.innerHTML = `
    <div class="glass-card w-full max-w-md p-6 m-4" onclick="event.stopPropagation()">
      <div class="flex justify-between items-center mb-5">
        <h3 class="font-bold text-lg">系统设置</h3>
        <button class="icon-btn" onclick="App.closeSettings()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium mb-2">主题色</label>
          <div class="flex gap-2">
            ${['#3373ff','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'].map(c=>`
              <button onclick="App.setThemeColor('${c}');App.Utils.toast('主题色已更新','success')"
                class="w-8 h-8 rounded-full border-2 border-white shadow" style="background:${c}"></button>
            `).join('')}
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">字体大小: <span id="fontSizeVal">16</span>px</label>
          <input type="range" id="fontRange" min="12" max="22" value="16" class="w-full"
            oninput="App.setFontSize(this.value);document.getElementById('fontSizeVal').textContent=this.value">
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">深色模式</span>
          <button onclick="App.toggleTheme()" class="btn-ghost btn-sm">切换</button>
        </div>
      </div>
      <div class="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
        极智云 · 演示项目 · 设置保存在本地浏览器
      </div>
    </div>`;
  panel.addEventListener('click', () => App.closeSettings());
  document.body.appendChild(panel);
  // 同步当前设置值
  const curSize = App.Store.get('fontSize') || 16;
  const fr = document.getElementById('fontRange');
  if (fr) { fr.value = curSize; document.getElementById('fontSizeVal').textContent = curSize; }
};

/* 关闭设置面板 */
App.closeSettings = function() {
  const panel = document.getElementById('settingsPanel');
  if (panel) panel.style.display = 'none';
};
