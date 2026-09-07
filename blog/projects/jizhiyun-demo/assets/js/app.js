/* ===== 最简单的测试版本 ===== */
document.write('<div style="position:fixed;top:10px;left:10px;background:pink;color:#000;padding:5px 10px;font-size:12px;z-index:99999;">APP.JS LOADED</div>');

// 测试事件循环
setTimeout(() => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:35px;left:10px;background:yellow;color:#000;padding:5px 10px;font-size:12px;z-index:99999;';
  div.textContent = 'SETTIMEOUT OK';
  document.body.appendChild(div);
  
  // 隐藏加载动画
  const loader = document.getElementById('globalLoader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s ease';
    setTimeout(() => loader.remove(), 300);
  }
}, 500);

// 兜底保护
setTimeout(() => {
  const loader = document.getElementById('globalLoader');
  if (loader) loader.remove();
}, 3000);
