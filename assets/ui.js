/* ============================================================
   ui.js — small rendering helpers (no framework)
   ============================================================ */

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* Safe for use inside a single-quoted JS string that itself sits inside a
   double-quoted HTML attribute, e.g. onclick="fn('<here>')".
   Escapes for JS first, then for HTML — without the HTML pass a quote or
   angle bracket in an ID would break out of the attribute. */
function jsq(s) {
  return esc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

let _toastT;
function toast(msg) {
  const e = document.getElementById('toast');
  if (!e) return;
  e.textContent = msg;
  e.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => e.classList.remove('show'), 2800);
}

const Modal = {
  open({ title, body, footer }) {
    document.getElementById('drawerTitle').textContent = title;
    document.getElementById('drawerBody').innerHTML = body;
    document.getElementById('drawerFoot').innerHTML = footer || '';
    document.getElementById('drawer').classList.add('show');
    document.getElementById('scrim').classList.add('show');
    const first = document.querySelector('#drawerBody input:not([readonly]),#drawerBody select,#drawerBody textarea');
    if (first) setTimeout(() => first.focus(), 180);
  },
  close() {
    document.getElementById('drawer').classList.remove('show');
    document.getElementById('scrim').classList.remove('show');
  }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') Modal.close(); });

/* ---------- form field builders ---------- */
const F = {
  text(name, label, val, opts = {}) {
    return `<label class="${opts.required ? 'req' : ''}" for="f_${name}">${esc(label)}</label>
      <input id="f_${name}" name="${name}" value="${esc(val ?? '')}"
        ${opts.readonly ? 'readonly' : ''} ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}/>`;
  },
  num(name, label, val, opts = {}) {
    return `<label for="f_${name}">${esc(label)}</label>
      <input id="f_${name}" name="${name}" type="number" step="${opts.step || 'any'}"
        value="${esc(val ?? '')}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}/>`;
  },
  date(name, label, val) {
    return `<label for="f_${name}">${esc(label)}</label>
      <input id="f_${name}" name="${name}" type="date" value="${esc(val ?? '')}"/>`;
  },
  select(name, label, val, options, opts = {}) {
    const o = options.map(x => {
      const v = typeof x === 'string' ? x : x.v;
      const t = typeof x === 'string' ? x : x.t;
      return `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('');
    return `<label class="${opts.required ? 'req' : ''}" for="f_${name}">${esc(label)}</label>
      <select id="f_${name}" name="${name}">${o}</select>`;
  },
  area(name, label, val, rows = 3) {
    return `<label for="f_${name}">${esc(label)}</label>
      <textarea id="f_${name}" name="${name}" rows="${rows}">${esc(val ?? '')}</textarea>`;
  },
  read() {
    const out = {};
    document.querySelectorAll('#drawerBody [name]').forEach(el => { out[el.name] = el.value.trim(); });
    return out;
  }
};

function assetOptions() {
  return [{ v: '', t: '— none —' }].concat(
    DB.all('assets').map(a => ({ v: a.id, t: a.id + ' · ' + a.name }))
  );
}

/* ---------- table renderer ---------- */
function renderTable(cols, rows, opts = {}) {
  if (!rows.length) return `<div class="empty">${esc(opts.empty || 'Nothing here yet.')}</div>`;
  const head = cols.map(c => `<th${c.num ? ' style="text-align:right"' : ''}>${esc(c.label)}</th>`).join('');
  const body = rows.map((r, i) => {
    const tds = cols.map(c => {
      const v = c.render ? c.render(r, i) : esc(r[c.key] ?? '');
      return `<td class="${c.num ? 'num' : ''}">${v}</td>`;
    }).join('');
    const click = opts.onRow ? ` class="clk" onclick="${opts.onRow}('${jsq(r.id)}')"` : '';
    return `<tr${click}>${tds}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ---------- misc ---------- */
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function money(v) {
  const n = DB.num(v);
  return n === null ? '—' : '$' + n.toFixed(2);
}
function today() { return new Date().toISOString().slice(0, 10); }
function confirmDelete(msg, fn) { if (confirm(msg)) fn(); }
