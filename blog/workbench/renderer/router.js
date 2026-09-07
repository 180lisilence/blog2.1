// renderer/router.js
'use strict';
const ROUTES = {};

function registerRoute(name, handler, title) {
    ROUTES[name] = { handler, title };
}

function navigate() {
    const hash = location.hash.replace(/^#\//, '') || 'home';
    const [route, ...rest] = hash.split('/');
    const info = ROUTES[route];
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
    document.getElementById('page-title').textContent = info ? info.title : '个人工作台';
    const content = document.getElementById('content');
    content.innerHTML = '';
    if (info) {
        Promise.resolve(info.handler(content, rest)).catch(e => {
            console.error(e);
            window.UI.Toast.err('渲染出错：' + e.message);
        });
    }
}
window.addEventListener('hashchange', navigate);

window.Router = {
    ROUTES,
    registerRoute,
    navigate
};
window.Router = Router;