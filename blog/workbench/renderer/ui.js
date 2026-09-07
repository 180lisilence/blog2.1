// renderer/ui.js
'use strict';
const U = {
    el(tag, attrs = {}, children = []) {
        const e = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'class') e.className = v;
            else if (k === 'text') e.textContent = v;
            else if (k === 'html') e.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
            else if (v !== null && v !== undefined) e.setAttribute(k, v);
        });
        (Array.isArray(children) ? children : [children]).forEach(c => {
            if (c == null) return;
            if (typeof c === 'string') e.appendChild(document.createTextNode(c));
            else e.appendChild(c);
        });
        return e;
    },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    now() { return Date.now(); },
    fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
    fmtTime(ts) { if (!ts) return ''; const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; },
    fmtDateTime(ts) { return this.fmtDate(ts) + ' ' + this.fmtTime(ts); },
    todayStr() { return this.fmtDate(Date.now()); },
    fmtDuration(ms) { const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return (h ? h+'h ' : '') + m + 'm'; },
    escape(s) { if (!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
    download(filename, content, type='application/json') {
        const blob = new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    readFile() {
        return new Promise(res => {
            const i = document.createElement('input'); i.type='file';
            i.onchange = () => res(i.files[0]); i.click();
        });
    }
};

const Modal = {
    open(title, bodyEl, footerEl, onClose) {
        document.getElementById('modal-title').textContent = title;
        const body = document.getElementById('modal-body'); body.innerHTML = '';
        body.appendChild(typeof bodyEl === 'string' ? document.createTextNode(bodyEl) : bodyEl);
        const footer = document.getElementById('modal-footer'); footer.innerHTML = '';
        if (footerEl) footer.appendChild(footerEl);
        document.getElementById('modal-backdrop').style.display = 'flex';
        this._onClose = onClose;
    },
    close() {
        document.getElementById('modal-backdrop').style.display = 'none';
        const cb = this._onClose; this._onClose = null;
        if (cb) cb();
    },
    confirm(title, msg, onOk, okText='确认', cancelText='取消', danger=false) {
        const footer = U.el('div', { class: 'modal-footer-buttons' }, [
            U.el('button', { class: 'btn btn-ghost', text: cancelText, onclick: () => { Modal.close(); } }),
            U.el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: okText, onclick: () => { Modal.close(); onOk(); } })
        ]);
        this.open(title, U.el('div', { class: 'confirm-msg', text: msg }), footer);
    }
};
document.getElementById('modal-close').addEventListener('click', () => Modal.close());
document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') Modal.close(); });

const Toast = {
    show(msg, type='info') {
        const c = document.getElementById('toast-container');
        const t = U.el('div', { class: 'toast toast-'+type, text: msg });
        c.appendChild(t);
        setTimeout(() => t.classList.add('toast-in'), 10);
        setTimeout(() => { t.classList.remove('toast-in'); setTimeout(() => t.remove(), 300); }, 2500);
    },
    ok(m) { this.show(m, 'ok'); },
    warn(m) { this.show(m, 'warn'); },
    err(m) { this.show(m, 'err'); }
};

function field(label, input) {
    return U.el('div', { class: 'form-field' }, [
        U.el('label', { class: 'form-label', text: label }),
        typeof input === 'string' ? U.el('input', { type: input }) : input
    ]);
}
function inputGroup(fieldDefs, initial = {}) {
    const map = {};
    const wrap = U.el('div', { class: 'form' }, fieldDefs.map(def => {
        const attrs = { class: 'form-input', placeholder: def.placeholder || '' };
        if (def.type) attrs.type = def.type;
        if (def.value !== undefined) attrs.value = initial[def.key] ?? def.value;
        if (def.required) attrs.required = true;
        let input;
        if (def.type === 'textarea') {
            input = U.el('textarea', { class: 'form-input', rows: def.rows || 3, placeholder: def.placeholder || '', text: initial[def.key] || '' });
        } else if (def.type === 'select') {
            input = U.el('select', { class: 'form-input' },
                (def.options || []).map(o => U.el('option', { value: o.value, text: o.label, selected: (initial[def.key] ?? def.defaultValue) === o.value ? true : undefined }))
            );
        } else {
            input = U.el('input', attrs);
        }
        map[def.key] = input;
        return U.el('div', { class: 'form-field' }, [
            def.label ? U.el('label', { class: 'form-label', text: def.label + (def.required ? ' *' : '') }) : null,
            input
        ].filter(Boolean));
    }));
    wrap.getData = () => {
        const out = {};
        Object.entries(map).forEach(([k, el]) => {
            if (el.type === 'checkbox') out[k] = el.checked;
            else if (el.tagName === 'SELECT') out[k] = el.value;
            else out[k] = el.value;
        });
        return out;
    };
    return wrap;
}

const PRIORITY_LABEL = { high: '高', mid: '中', low: '低' };
const PRIORITY_CLASS = { high: 'prio-high', mid: 'prio-mid', low: 'prio-low' };

window.UI = {
    U,
    Modal,
    Toast,
    inputGroup,
    field,
    PRIORITY_LABEL,
    PRIORITY_CLASS
};
window.UI = UI;
window.U = UI.U;