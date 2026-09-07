'use strict';


// ============ 主题模块 ============

const Theme = {
    init(){
        // 页面加载读取本地存储的主题，无记录默认 dark
        const saved = localStorage.getItem('theme') || 'dark';
        this.set(saved);
    },
    set(mode) {
        localStorage.setItem('theme', mode);
        document.documentElement.setAttribute('data-theme', mode);
    },
    toggle() {
        const cur = document.documentElement.getAttribute('data-theme');
        this.set(cur === 'dark' ? 'light' : 'dark');
    }
};
window.Theme = Theme;
// ============ 侧边栏折叠 ============
const SidebarToggle = (() => {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const STORAGE_KEY = 'sidebar_collapsed';
    let touchStartX = 0, touchStartY = 0, isTouching = false, touchMoved = false;

    function apply(force) {
        const collapsed = force !== undefined ? force : localStorage.getItem(STORAGE_KEY) === '1';
        sidebar.classList.toggle('collapsed', collapsed);
        collapseBtn.title = collapsed ? '展开侧边栏' : '收起侧边栏';
        collapseBtn.querySelector('.collapse-icon').textContent = collapsed ? '▶' : '◀';
        if (toggleBtn) {
            toggleBtn.title = collapsed ? '展开导航栏' : '收起导航栏';
            toggleBtn.querySelector('.toggle-icon').textContent = collapsed ? '☰' : '☰';
        }
        try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch {}
        return collapsed;
    }
    function toggle() { apply(!sidebar.classList.contains('collapsed')); }

    function initGestures() {
        document.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            touchStartX = touch.clientX; touchStartY = touch.clientY;
            isTouching = true; touchMoved = false;
        }, { passive:true });
        document.addEventListener('touchmove', (e) => {
            if (!isTouching) return;
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;
            if(Math.abs(deltaX) > Math.abs(deltaY) && touchStartX <30 && sidebar.classList.contains('collapsed') && deltaX>40){
                e.preventDefault(); toggle(); isTouching=false; touchMoved=true;
            }
            if(Math.abs(deltaX) > Math.abs(deltaY) && !sidebar.classList.contains('collapsed') && deltaX < -40){
                const rect = sidebar.getBoundingClientRect();
                if(touchStartX >= rect.left && touchStartX <= rect.right){
                    e.preventDefault(); toggle(); isTouching=false; touchMoved=true;
                }
            }
        }, { passive:false });
        document.addEventListener('touchend', ()=>{isTouching=false;},{passive:true});
    }

    function init() {
        collapseBtn.addEventListener('click', toggle);
        if(toggleBtn) toggleBtn.addEventListener('click', toggle);
        initGestures();
        const stored = localStorage.getItem(STORAGE_KEY);
        apply(stored === null ? false : stored === '1');
    }
    return { init, toggle, apply };
})();
// ============ 新增下面这一行 ============
window.SidebarToggle = SidebarToggle;


// ============ AI悬浮快捷对话 ============
(function setupFloatingAI() {
    const fab = document.getElementById('ai-fab');
    const panel = document.getElementById('ai-quick-panel');
    const closeBtn = document.getElementById('ai-quick-close');
    const body = document.getElementById('ai-quick-body');
    const input = document.getElementById('ai-quick-input');
    const sendBtn = document.getElementById('ai-quick-send');
    let quickHistory = [];
    let loading = false;
    let isDragging = false;

    function restoreFabPosition() {
        if(!fab) return;
        try{
            const pos = JSON.parse(localStorage.getItem('ai_fab_pos')||'null');
            if(pos && typeof pos.x === 'number' && typeof pos.y === 'number'){
                fab.style.right='auto'; fab.style.bottom='auto';
                fab.style.left = pos.x+'px'; fab.style.top = pos.y+'px';
            }
        }catch{}
    }
    restoreFabPosition();

    function clamp(val,min,max){return Math.max(min,Math.min(max,val));}
    fab?.addEventListener('pointerdown',(e)=>{
        if(e.button!==0) return;
        isDragging=false;
        fab.setPointerCapture(e.pointerId);
        const startX = e.clientX, startY = e.clientY;
        const rect = fab.getBoundingClientRect();
        const offsetX = startX - rect.left;
        const offsetY = startY - rect.top;
        const move = (ev)=>{
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if(Math.abs(dx)+Math.abs(dy)>4) isDragging=true;
            if(!isDragging) return;
            const vw = window.innerWidth, vh=window.innerHeight;
            const size = rect.width;
            const x = clamp(ev.clientX-offsetX,0,vw-size);
            const y = clamp(ev.clientY-offsetY,0,vh-size);
            fab.style.right='auto'; fab.style.bottom='auto';
            fab.style.left=x+'px'; fab.style.top=y+'px';
            ev.preventDefault();
        };
        const up = ()=>{
            fab.removeEventListener('pointermove',move);
            fab.removeEventListener('pointerup',up);
            fab.removeEventListener('pointercancel',up);
            if(isDragging){
                const r = fab.getBoundingClientRect();
                localStorage.setItem('ai_fab_pos',JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)}));
            }
        };
        fab.addEventListener('pointermove',move);
        fab.addEventListener('pointerup',up);
        fab.addEventListener('pointercancel',up);
    });

    fab?.addEventListener('click',(e)=>{
        if(isDragging){isDragging=false;return;}
        togglePanel();
    });

    function togglePanel(){
        const hidden = panel.style.display === 'none';
        panel.style.display = hidden ? 'flex' : 'none';
        if(hidden && body.children.length===0) renderQuickWelcome();
        if(hidden) setTimeout(()=>input.focus(),100);
    }
    function renderQuickWelcome(){
        body.appendChild(U.el('div',{class:'ai-welcome'},[
            U.el('h3',{text:'🤖 AI 快捷对话'}),
            U.el('p',{text:'问什么都行，Enter 发送'})
        ]));
    }
    function renderQuickMsg(msg){
        body.appendChild(AIMod.renderChatMsg(msg));
        body.scrollTop = body.scrollHeight;
    }
    closeBtn?.addEventListener('click',()=>panel.style.display='none');
    input?.addEventListener('keydown',(e)=>{
        if(e.key==='Enter' && !e.shiftKey){e.preventDefault();sendQuick();}
    });
    sendBtn?.addEventListener('click',sendQuick);

    async function sendQuick(){
        if(loading) return;
        const text = input.value.trim();
        if(!text) return;
        const aiCfg = Store.Config.get('ai',Store.Config.defaults.ai);
        if(!aiCfg.apiKey){UI.Toast.err('请先到 AI 设置里填 API Key');return;}
        input.value='';
        quickHistory.push({role:'user',content:text});
        renderQuickMsg({role:'user',content:text});
        const typingEl = AIMod.renderTyping();
        body.appendChild(typingEl);
        body.scrollTop = body.scrollHeight;
        loading=true;
        try{
            const messages = AIMod.AI.buildMessages(aiCfg.systemPrompt, quickHistory.slice(-20).slice(0,-1), text);
            const reply = await AIMod.AI.chat(messages);
            quickHistory.push({role:'assistant',content:reply});
            typingEl.remove();
            renderQuickMsg({role:'assistant',content:reply});
        }catch(err){
            typingEl.remove();
            renderQuickMsg({role:'error',content:'⚠️ '+err.message});
        }
        loading=false;
    }
})();

// ============ 到期提醒检查 ============
async function checkDeadlines() {
    // 如果 Notification 不可用，直接返回
    if (typeof Notification === 'undefined') return;
    if (!Store.Config.get('notifyEnabled', Store.Config.defaults.notifyEnabled)) return;
    if (Notification.permission !== 'granted') return;
   
    const now = Date.now();
    const all = [
        ...(await Store.DBgetAll('todos')).filter(t=>t.deadline && !t.done),
        ...(await Store.DBgetAll('consult')).filter(c=>c.nextFollow && c.status!=='done'),
        ...(await Store.DBgetAll('media')).filter(m=>m.planPublish && !m.published)
    ];
    const NOTIFIED_KEY = 'notified_deadlines';
    const notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY)||'{}');
    all.forEach(item=>{
        const dl = new Date(item.deadline || item.nextFollow || item.planPublish).getTime();
        const key = item.id;
        if(!notified[key] && dl-now <= 30*60*1000 && dl>now){
            const store = item._store ? (Store.STORE_LABELS[item._store]||item._store) : (item.nextFollow?'咨询工作':(item.planPublish?'自媒体':'今日计划'));
            new Notification('⏰ 即将到期 · '+store,{body:item.title||item.name});
            notified[key]=true;
        }
    });
    localStorage.setItem(NOTIFIED_KEY,JSON.stringify(notified));
}
// ============ 全局错误捕获 ============
function showFatalError(title,detail){
    let panel = document.getElementById('__fatal_error__');
    if(!panel){
        panel = document.createElement('div');
        panel.id='__fatal_error__';
        panel.style.cssText='position:fixed;z-index:99999;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);color:#fff;padding:24px;font-family:monospace;overflow:auto;white-space:pre-wrap;font-size:13px;';
        document.body.appendChild(panel);
    }
    panel.innerHTML = '<h2 style="color:#ff6b6b;margin-bottom:12px;">❌ '+title+'</h2><div>'+String(detail).slice(0,3000)+'</div><p style="margin-top:16px;color:#aaa;">请截图发我</p>';
}
window.addEventListener('error',(e)=>{ showFatalError('全局错误',e.error?.stack||e.message); });
window.addEventListener('unhandledrejection',(e)=>{ showFatalError('未处理 Promise',e.reason?.stack||String(e.reason)); });

// ============ 启动入口 boot ============
async function boot(){
    await window.Store.initStore();
    window.Store.Config.sanitizeAi(window.AIMod.AI_PROVIDERS);
    Theme.init();
    window.SidebarToggle.init();
    window.Router.navigate();
    const tick = ()=>{
        const d = new Date();
        document.getElementById('clock').textContent =
            d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+
            String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
    };
    tick();
    setInterval(tick,1000);
    checkDeadlines();
    setInterval(checkDeadlines,60000);
}

boot().catch(e=>{
    console.error('boot 崩溃:',e);
    showFatalError('boot() 崩溃',e.stack||String(e));
});