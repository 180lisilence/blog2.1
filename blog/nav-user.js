(function(){
  function abbrev(name){
    var n = String(name || '');
    return n.length > 6 ? n.slice(0, 6) + '…' : n;
  }
  function apply(){
    var link = document.querySelector('.nav-links a[href="/login"]') ||
               document.querySelector('.nav-links a[href="/login.html"]');
    if (!link) return;
    fetch('/api/me', { credentials: 'same-origin' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if (d && d.ok && d.username) {
          link.textContent = abbrev(d.username);
          link.href = '/projects.html';
          link.title = '已登录：' + d.username + '（点击进入项目中心）';
        }
      })
      .catch(function(){});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
