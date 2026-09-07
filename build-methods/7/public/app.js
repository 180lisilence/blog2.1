// PWA 前端逻辑
let todos = JSON.parse(localStorage.getItem('pwa_todos')) || [
  { id: 1, text: '学习 PWA 渐进式应用', done: false },
  { id: 2, text: '对比 10 种构建方式', done: true }
];

function save() { localStorage.setItem('pwa_todos', JSON.stringify(todos)); }

function render() {
  const remaining = todos.filter(t => !t.done).length;
  document.getElementById('count').textContent = `还剩 ${remaining} 项未完成（断网也能用）`;
  document.getElementById('list').innerHTML = todos.map(t => `
    <div class="todo-item">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTodo(${t.id})">
      <span class="${t.done ? 'done' : ''}">${t.text}</span>
      <button class="btn-del" style="margin-left:auto" onclick="deleteTodo(${t.id})">删除</button>
    </div>
  `).join('');
}

function addTodo() {
  const input = document.getElementById('input');
  if (!input.value.trim()) return;
  todos.push({ id: Date.now(), text: input.value.trim(), done: false });
  input.value = '';
  save(); render();
}

function toggleTodo(id) {
  const t = todos.find(x => x.id === id);
  if (t) { t.done = !t.done; save(); render(); }
}

function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  save(); render();
}

document.getElementById('input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTodo();
});

// 注册 Service Worker（实现离线缓存）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => {
    console.log('Service Worker 已注册，离线可用');
  });
}

// 安装到桌面（PWA 核心体验）
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBtn').style.display = 'block';
});

document.getElementById('installBtn').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBtn').style.display = 'none';
  }
});

render();
