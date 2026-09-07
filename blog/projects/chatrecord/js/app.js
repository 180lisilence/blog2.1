/* ChatRecord 主逻辑：会话管理 + 自动保存 + 数据加载 + 统计 + 图表渲染 */
(function () {
  'use strict';

  /* ================= 状态 ================= */
  let currentSession = null;   // {id, name, messages, stats, createdAt, updatedAt, shareId}
  let sessionList = [];         // 会话元数据列表
  let saveTimer = null;
  let isSaving = false;

  const API = '/api/chatrecord';

  /* ================= 工具 ================= */
  function $(id) { return document.getElementById(id); }

  // CSRF token 获取
  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
  // 带 CSRF token 的 fetch
  function apiFetch(url, options) {
    options = options || {};
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      options.headers = options.headers || {};
      options.headers['X-CSRF-Token'] = getCsrfToken();
    }
    return apiFetch(url, options);
  }
  function setSaveStatus(text, cls) {
    const el = $('saveStatus');
    el.textContent = text;
    el.className = 'save-status' + (cls ? ' ' + cls : '');
  }

  /* ================= 统计 ================= */
  function computeStats(msgs) {
    const total = msgs.length;
    const senders = new Set(msgs.map(m => m.sender));
    const days = new Set(msgs.map(m => {
      const d = new Date(m.ts);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }));
    const hourCount = new Array(24).fill(0);
    msgs.forEach(m => hourCount[new Date(m.ts).getHours()]++);
    let peakHour = 0;
    hourCount.forEach((c, h) => { if (c > hourCount[peakHour]) peakHour = h; });
    const avgPerDay = days.size ? Math.round(total / days.size * 10) / 10 : 0;
    const span = msgs.length > 1 ? (msgs[msgs.length - 1].ts - msgs[0].ts) : 0;
    const spanDays = Math.max(1, Math.round(span / 86400000 * 10) / 10);
    return { total, people: senders.size, days: days.size, avgPerDay, peakHour: String(peakHour).padStart(2, '0') + ':00', spanDays };
  }

  function renderStats(s) {
    const el = $('stats');
    const cards = [
      { k: '总消息数', v: s.total, s: '条消息' },
      { k: '参与人数', v: s.people, s: '位发言者' },
      { k: '活跃天数', v: s.days, s: '天有记录' },
      { k: '日均消息', v: s.avgPerDay, s: '条/天' },
      { k: '最活跃时段', v: s.peakHour, s: '消息量峰值' }
    ];
    el.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="k">${c.k}</div>
        <div class="v">${c.v}</div>
        <div class="s">${c.s}</div>
      </div>`).join('');
  }

  /* ================= 渲染图表 ================= */
  function render() {
    if (!currentSession || !currentSession.messages.length) {
      $('stats').innerHTML = '<div class="stat-card placeholder">加载数据后显示统计</div>';
      return;
    }
    const msgs = currentSession.messages;
    // 统计缓存：有缓存用缓存，否则重新计算并更新
    if (!currentSession.stats) currentSession.stats = computeStats(msgs);
    renderStats(currentSession.stats);
    Charts.wave('chartWave', msgs);
    Charts.hour('chartHour', msgs);
    Charts.lengthByDay('chartLen', msgs);
    Charts.heatCalendar('chartCal', msgs);
    Charts.senderBar('chartSender', msgs);
    Charts.repeatRank('chartRepeat', msgs);
    Charts.weekHourHeat('chartWH', msgs);
  }

  /* ================= 数据加载（更新当前会话） ================= */
  function loadMessages(msgs, opts) {
    opts = opts || {};
    if (!currentSession) return;
    currentSession.messages = msgs || [];
    currentSession.stats = computeStats(currentSession.messages); // 数据变了，重算统计
    render();
    if (opts.autoSave !== false) markDirty();
  }

  /* ================= 自动保存（debounce 1.5s） ================= */
  function markDirty() {
    setSaveStatus('未保存', '');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSession, 1500);
  }

  async function saveSession() {
    if (!currentSession || isSaving) return;
    isSaving = true;
    setSaveStatus('保存中...', 'saving');
    try {
      const r = await apiFetch(API + '/sessions/' + currentSession.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentSession.name,
          messages: currentSession.messages,
          stats: currentSession.stats
        })
      });
      const d = await r.json();
      if (d.ok) {
        currentSession.updatedAt = d.session.updatedAt;
        setSaveStatus('已保存 ' + new Date().toLocaleTimeString(), 'saved');
        refreshSessionList(); // 刷新列表中的元数据
      } else {
        setSaveStatus('保存失败: ' + (d.msg || '未知错误'), 'error');
      }
    } catch (e) {
      setSaveStatus('保存失败: ' + e.message, 'error');
    } finally {
      isSaving = false;
    }
  }

  /* ================= 会话列表管理 ================= */
  async function loadSessionList() {
    try {
      const r = await apiFetch(API + '/sessions');
      const d = await r.json();
      sessionList = d.ok ? (d.sessions || []) : [];
    } catch (e) {
      sessionList = [];
    }
    renderSessionSelect();
  }

  function renderSessionSelect() {
    const sel = $('sessionSelect');
    sel.innerHTML = sessionList.map(s =>
      `<option value="${s.id}" ${currentSession && s.id === currentSession.id ? 'selected' : ''}>${escapeHtml(s.name)} (${s.messageCount}条)</option>`
    ).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function refreshSessionList() {
    await loadSessionList();
    renderSessionSelect();
  }

  /* ================= 会话切换/新建/重命名/删除 ================= */
  async function switchSession(id) {
    if (currentSession && currentSession.id === id) return;
    // 切换前先保存当前
    if (saveTimer) { clearTimeout(saveTimer); await saveSession(); }
    try {
      const r = await apiFetch(API + '/sessions/' + id);
      const d = await r.json();
      if (d.ok) {
        currentSession = d.session;
        if (!currentSession.messages) currentSession.messages = [];
        renderSessionSelect();
        render();
        setSaveStatus('已加载', 'saved');
      }
    } catch (e) {
      setSaveStatus('加载失败: ' + e.message, 'error');
    }
  }

  async function newSession() {
    const name = prompt('新会话名称：', '未命名会话 ' + new Date().toLocaleDateString());
    if (!name) return;
    try {
      const r = await apiFetch(API + '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), messages: [], stats: null })
      });
      const d = await r.json();
      if (d.ok) {
        currentSession = d.session;
        currentSession.messages = [];
        await refreshSessionList();
        render();
        setSaveStatus('已创建', 'saved');
      } else {
        alert('创建失败: ' + (d.msg || ''));
      }
    } catch (e) {
      alert('创建失败: ' + e.message);
    }
  }

  async function renameSession() {
    if (!currentSession) return;
    const name = prompt('重命名会话：', currentSession.name);
    if (!name || name === currentSession.name) return;
    currentSession.name = name.trim();
    renderSessionSelect();
    markDirty();
  }

  async function deleteSession() {
    if (!currentSession) return;
    if (!confirm('确定删除会话「' + currentSession.name + '」？此操作不可恢复。')) return;
    try {
      const r = await apiFetch(API + '/sessions/' + currentSession.id, { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) {
        currentSession = null;
        await refreshSessionList();
        // 切换到第一个会话或创建新的
        if (sessionList.length) {
          await switchSession(sessionList[0].id);
        } else {
          await newSessionWithName('默认会话');
        }
      } else {
        alert('删除失败: ' + (d.msg || ''));
      }
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  }

  async function newSessionWithName(name) {
    const r = await apiFetch(API + '/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, messages: [], stats: null })
    });
    const d = await r.json();
    if (d.ok) {
      currentSession = d.session;
      currentSession.messages = [];
      await refreshSessionList();
      render();
    }
  }

  /* ================= 分享功能 ================= */
  const shareModal = $('shareModal');
  function showShareModal() {
    if (!currentSession) return;
    $('shareLinkBox').style.display = currentSession.shareId ? 'block' : 'none';
    $('shareNoLink').style.display = currentSession.shareId ? 'none' : 'block';
    if (currentSession.shareId) {
      $('shareLink').value = location.origin + '/chatrecord-share.html?sid=' + currentSession.shareId;
    }
    shareModal.style.display = 'flex';
  }
  function hideShareModal() { shareModal.style.display = 'none'; }

  async function createShare() {
    if (!currentSession) return;
    try {
      const r = await apiFetch(API + '/sessions/' + currentSession.id + '/share', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        currentSession.shareId = d.shareId;
        $('shareLink').value = d.shareUrl;
        $('shareLinkBox').style.display = 'block';
        $('shareNoLink').style.display = 'none';
        refreshSessionList();
      } else {
        alert('生成失败: ' + (d.msg || ''));
      }
    } catch (e) { alert('生成失败: ' + e.message); }
  }

  async function cancelShare() {
    if (!currentSession || !currentSession.shareId) return;
    if (!confirm('确定取消分享？链接将立即失效。')) return;
    try {
      const r = await apiFetch(API + '/sessions/' + currentSession.id + '/share', { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) {
        currentSession.shareId = null;
        $('shareLinkBox').style.display = 'none';
        $('shareNoLink').style.display = 'block';
        refreshSessionList();
      }
    } catch (e) { alert('取消失败: ' + e.message); }
  }

  /* ================= 导入弹窗 ================= */
  const modal = $('importModal');
  let activeTab = 'txt';
  function showModal() { modal.style.display = 'flex'; }
  function hideModal() { modal.style.display = 'none'; }

  $('btnImport').onclick = showModal;
  $('modalClose').onclick = hideModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });

  document.querySelectorAll('#importModal .tab').forEach(tab => {
    tab.onclick = () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#importModal .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $('pane-txt').style.display = activeTab === 'txt' ? '' : 'none';
      $('pane-json').style.display = activeTab === 'json' ? '' : 'none';
      $('importMsg').textContent = '';
      $('importMsg').className = 'import-msg';
    };
  });

  $('btnConfirmImport').onclick = () => {
    const msgEl = $('importMsg');
    msgEl.className = 'import-msg';
    try {
      let msgs;
      if (activeTab === 'txt') {
        const text = $('txtInput').value;
        if (!text.trim()) throw new Error('请先粘贴聊天文本');
        msgs = ChatData.parseText(text);
      } else {
        const json = $('jsonInput').value;
        if (!json.trim()) throw new Error('请先填写 JSON');
        msgs = ChatData.parseJSON(json);
      }
      if (!msgs.length) throw new Error('没有解析到有效消息，请检查格式');
      loadMessages(msgs);
      hideModal();
      $('txtInput').value = '';
      $('jsonInput').value = '';
    } catch (e) {
      msgEl.textContent = '❌ ' + e.message;
    }
  };

  /* ================= 示例数据 ================= */
  $('btnSample').onclick = () => {
    loadMessages(ChatData.generateSampleData());
  };

  /* ================= OCR 截图识别 ================= */
  const ocrModal = $('ocrModal');
  const ocrStatus = $('ocrStatus');
  const ocrResult = $('ocrResult');
  const ocrMsg = $('ocrMsg');
  let ocrRunning = false;

  function showOCRModal() {
    ocrStatus.textContent = '';
    ocrMsg.textContent = '';
    ocrMsg.className = 'import-msg';
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    $('ocrBaseDate').value = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    ocrModal.style.display = 'flex';
    // 探测后端 OCR 服务（后端会自动拉起 Python）
    ChatOCR.rapidHealth().then(ok => {
      if (ocrModal.style.display === 'flex') {
        ocrStatus.textContent = ok
          ? '✅ 已连接后端 OCR 服务（RapidOCR，识别更准）'
          : 'ℹ️ 后端 OCR 服务未就绪，将使用内置基础识别（Tesseract.js）。确保 Python 环境可用可获得更准效果。';
        ocrStatus.className = ok ? 'ocr-status ok' : 'ocr-status warn';
      }
    });
  }
  function hideOCRModal() { ocrModal.style.display = 'none'; }

  $('btnOCR').onclick = showOCRModal;
  $('ocrClose').onclick = hideOCRModal;
  ocrModal.addEventListener('click', (e) => { if (e.target === ocrModal) hideOCRModal(); });

  $('btnRunOCR').onclick = async () => {
    if (ocrRunning) return;
    const files = $('ocrFiles').files;
    if (!files.length) { ocrMsg.textContent = '请先选择截图'; ocrMsg.className = 'import-msg err'; return; }
    ocrRunning = true;
    ocrResult.value = '';
    ocrStatus.textContent = '准备识别...';
    ocrStatus.className = 'ocr-status run';
    ocrMsg.textContent = '';
    ocrMsg.className = 'import-msg';
    try {
      const opts = {
        otherName: $('ocrOtherName').value.trim() || '对方',
        baseDate: $('ocrBaseDate').value || undefined
      };
      const msgs = await ChatOCR.batchRecognize(files, opts, (s) => { ocrStatus.textContent = s; });
      if (!msgs.length) {
        ocrStatus.textContent = '未识别到有效消息，请换更清晰的截图，或手动在下方修正。';
        ocrStatus.className = 'ocr-status warn';
        return;
      }
      ocrResult.value = ChatOCR.toTextLines(msgs);
      ocrStatus.textContent = '✅ 识别完成：共 ' + msgs.length + ' 条消息。可编辑修正后点击「应用并分析」。';
      ocrStatus.className = 'ocr-status ok';
    } catch (e) {
      ocrStatus.textContent = '❌ 识别失败：' + e.message;
      ocrStatus.className = 'ocr-status warn';
    } finally {
      ocrRunning = false;
    }
  };

  $('btnOCRApply').onclick = () => {
    const text = ocrResult.value.trim();
    if (!text) { ocrMsg.textContent = '没有可应用的内容，请先识别或手动填写'; ocrMsg.className = 'import-msg err'; return; }
    try {
      const msgs = ChatData.parseText(text);
      if (!msgs.length) throw new Error('没有解析到有效消息，请检查格式');
      loadMessages(msgs);
      hideOCRModal();
    } catch (e) {
      ocrMsg.textContent = '❌ ' + e.message;
      ocrMsg.className = 'import-msg err';
    }
  };

  $('btnOCRExport').onclick = () => {
    const text = ocrResult.value.trim();
    if (!text) { ocrMsg.textContent = '没有可导出的内容'; ocrMsg.className = 'import-msg err'; return; }
    try {
      const msgs = ChatData.parseText(text);
      const blob = new Blob([JSON.stringify(msgs, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chatrecord_ocr_' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      ocrMsg.textContent = '✅ 已导出 JSON';
      ocrMsg.className = 'import-msg ok';
    } catch (e) {
      ocrMsg.textContent = '❌ ' + e.message;
      ocrMsg.className = 'import-msg err';
    }
  };

  /* ================= 会话栏事件绑定 ================= */
  $('sessionSelect').onchange = (e) => { if (e.target.value) switchSession(e.target.value); };
  $('btnNewSession').onclick = newSession;
  $('btnRenameSession').onclick = renameSession;
  $('btnDeleteSession').onclick = deleteSession;
  $('btnShareSession').onclick = showShareModal;

  $('shareClose').onclick = hideShareModal;
  shareModal.addEventListener('click', (e) => { if (e.target === shareModal) hideShareModal(); });
  $('btnCreateShare').onclick = createShare;
  $('btnCopyShare').onclick = () => {
    const inp = $('shareLink');
    inp.select();
    document.execCommand('copy');
    $('btnCopyShare').textContent = '✅ 已复制';
    setTimeout(() => { $('btnCopyShare').textContent = '复制链接'; }, 2000);
  };
  $('btnOpenShare').onclick = () => { window.open($('shareLink').value, '_blank'); };
  $('btnCancelShare').onclick = cancelShare;

  /* ================= 启动 ================= */
  (async function init() {
    setSaveStatus('加载中...', '');
    await loadSessionList();
    if (sessionList.length > 0) {
      await switchSession(sessionList[0].id); // 最近更新的排第一
    } else {
      await newSessionWithName('默认会话');
    }
    setSaveStatus('就绪', 'saved');
  })();

  /* ================= 窗口 resize ================= */
  window.addEventListener('resize', () => {
    ['chartWave', 'chartHour', 'chartLen', 'chartCal', 'chartSender', 'chartRepeat', 'chartWH'].forEach(id => {
      const el = $(id);
      const c = el && echarts.getInstanceByDom(el);
      if (c) c.resize();
    });
  });

  /* ================= 页面前卸载时保存 ================= */
  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); saveSession(); }
  });
})();
