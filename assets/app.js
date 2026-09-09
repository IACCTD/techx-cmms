/* ============================================================
   app.js — router + screens
   ============================================================ */

const FREQS = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annually'];
const WO_TYPES = ['Repair', 'Preventive', 'Improvement', 'Troubleshoot', 'Inspection'];
const WO_STATUS = ['Open', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const CAUSES = ['To be determined', 'Wear / end of life', 'Seal failure', 'Loose fastener',
  'Contamination', 'Operator damage', 'Electrical fault', 'Software / program', 'Unknown'];

let SEARCH = '';
let WO_VIEW = 'list';                 // 'list' | 'calendar'
let WO_FILTER = 'all';                // all | open | progress | done
let CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), pms: true };

/* ============================================================
   ROUTER  —  supports #/asset/3526
   ============================================================ */
const ROUTES = {
  home: renderHome,
  dashboard: renderDashboard,
  assets: renderAssets,
  asset: renderAssetDetail,
  pm: renderPM,
  parts: renderParts,
  wo: renderWO,
  import: renderImport,
  settings: renderSettings
};

function route() {
  const hash = (location.hash || '#/home').replace('#/', '');
  const parts = hash.split('/');
  const name = parts[0];
  const param = parts[1] ? decodeURIComponent(parts[1]) : null;
  const fn = ROUTES[name] || renderHome;

  document.querySelectorAll('.rail .nav').forEach(a =>
    a.classList.toggle('active', a.dataset.s === name || (name === 'asset' && a.dataset.s === 'assets')));

  document.getElementById('view').innerHTML = fn(param);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

document.getElementById('globalSearch').addEventListener('input', e => {
  SEARCH = e.target.value.toLowerCase().trim();
  const h = (location.hash || '').replace('#/', '').split('/')[0];
  if (SEARCH && !['assets', 'parts', 'wo', 'pm'].includes(h)) { location.hash = '#/assets'; return; }
  route();
});

function matches(obj, fields) {
  if (!SEARCH) return true;
  return fields.some(f => String(obj[f] ?? '').toLowerCase().includes(SEARCH));
}

function openAsset(id) { location.hash = '#/asset/' + encodeURIComponent(id); }

/* ============================================================
   HOME  — the hub
   ============================================================ */
function renderHome() {
  const assets = DB.all('assets');
  const wos = DB.all('wos');
  const pms = DB.all('pms');

  const openWos = wos.filter(DB.isOpen);
  const progWos = wos.filter(w => w.status === 'In Progress');
  const duePms = pms.filter(p => { const d = DB.daysUntil(p.nextDue); return d !== null && d <= 7; });

  const recent = (DB.raw().meta.recentAssets || [])
    .map(id => DB.get('assets', id)).filter(Boolean);

  if (!assets.length && !wos.length) {
    return `<h1 class="page">Welcome to Tech X</h1>
      <p class="sub">No data loaded yet.</p>
      <div class="placeholder">
        <div style="font-size:34px">&#128736;</div>
        <b style="display:block;margin:10px 0 6px;color:var(--ink);font-size:16px">Start here</b>
        <span>Pull the shared plant data from the repo, or import your own CSV files.</span>
        <div class="actions" style="justify-content:center">
          <button class="btn filled" onclick="pullShared('replace')">Pull shared data</button>
          <button class="btn out" onclick="seedSample()">Load sample data</button>
          <a class="btn out" href="#/import">Import CSV</a>
        </div>
      </div>`;
  }

  return `
  <h1 class="page">Home</h1>
  <p class="sub">${esc(DB.raw().meta.site || 'Maintenance')}</p>

  <div class="hub">
    <a class="tile" href="#/assets">
      <div class="ic">&#128451;</div>
      <h2>Find an Asset</h2>
      <p>Search the plant by name or asset number, then open its dashboard.</p>
      <ul>
        <li>Asset name / serial number</li>
        <li>Recent repairs and work orders</li>
        <li>Machine BOM and parts info</li>
      </ul>
    </a>

    <a class="tile" href="#/wo">
      <div class="ic">&#129534;</div>
      <h2>Work Orders</h2>
      <p>Create or complete work, in a list or on the calendar.</p>
      <ul>
        <li>${openWos.length} pending · ${progWos.length} in progress</li>
        <li>PM program, schedule and frequency</li>
        <li>Generate a WO from any PM</li>
      </ul>
    </a>

    <div class="tile soon">
      <div class="ic">&#129302;</div>
      <h2>AI Assist</h2>
      <p>Troubleshooting, fault, cause and corrective action — reserved for a later phase.</p>
      <ul>
        <li>Not connected yet</li>
      </ul>
    </div>
  </div>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat click" onclick="location.hash='#/assets'">
      <div class="n">${assets.length}</div><div class="l">Assets in plant</div></div>
    <div class="stat click" onclick="WO_FILTER='open';location.hash='#/wo'">
      <div class="n" style="color:${openWos.length ? 'var(--pri)' : 'inherit'}">${openWos.length}</div>
      <div class="l">Pending work orders</div></div>
    <div class="stat click" onclick="WO_FILTER='progress';location.hash='#/wo'">
      <div class="n" style="color:${progWos.length ? 'var(--warn)' : 'inherit'}">${progWos.length}</div>
      <div class="l">In progress</div></div>
    <div class="stat click" onclick="location.hash='#/pm'">
      <div class="n" style="color:${duePms.length ? 'var(--bad)' : 'inherit'}">${duePms.length}</div>
      <div class="l">PMs due within 7 days</div></div>
  </div>

  ${recent.length ? `<div class="card">
    <h3 class="sec">Recently viewed assets</h3>
    ${recent.map(a => `<a class="pill" href="#/asset/${encodeURIComponent(a.id)}">
      <b>${esc(a.id)}</b> <small>${esc(a.name)}</small></a>`).join('')}
  </div>` : ''}

  <div class="card">
    <h3 class="sec">Quick actions</h3>
    <div class="actions" style="margin-top:0">
      <button class="btn filled" onclick="editWO()">&#43; New work order</button>
      <button class="btn out" onclick="editAsset()">&#43; New asset</button>
      <a class="btn out" href="#/wo">Work order calendar</a>
      <a class="btn out" href="#/import">Import CSV</a>
    </div>
  </div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const assets = DB.all('assets'), pms = DB.all('pms'),
        parts = DB.all('parts'), wos = DB.all('wos');

  const openWos = wos.filter(DB.isActive);
  const duePms = pms.filter(p => { const d = DB.daysUntil(p.nextDue); return d !== null && d <= 7; })
    .sort((a, b) => (a.nextDue || '').localeCompare(b.nextDue || ''));
  const lowParts = parts.filter(p => DB.partStatus(p).label === 'Low stock');
  const uncounted = parts.filter(p => DB.num(p.qty) === null);

  const stat = (ic, bg, col, n, l, d) => `
    <div class="stat"><div class="ic" style="background:${bg};color:${col}">${ic}</div>
      <div class="n">${n}</div><div class="l">${esc(l)}</div>
      ${d ? `<div class="d">${esc(d)}</div>` : ''}</div>`;

  return `
  <h1 class="page">Dashboard</h1>
  <p class="sub">${esc(DB.raw().meta.site || 'Maintenance overview')}</p>

  <div class="grid g4" style="margin-bottom:20px">
    ${stat('&#128451;', 'var(--info-c)', 'var(--pri)', assets.length, 'Assets registered')}
    ${stat('&#129534;', 'var(--bad-c)', 'var(--bad)', openWos.length, 'Open work orders',
      openWos.filter(w => w.priority === 'High').length + ' high priority')}
    ${stat('&#128197;', 'var(--warn-c)', 'var(--warn)', duePms.length, 'PMs due within 7 days',
      pms.length + ' scheduled total')}
    ${stat('&#128230;', lowParts.length ? 'var(--bad-c)' : 'var(--ok-c)',
      lowParts.length ? 'var(--bad)' : 'var(--ok)', lowParts.length, 'Parts at or below min',
      uncounted.length + ' never counted')}
  </div>

  <div class="grid g2">
    <div class="card">
      <h3 class="sec">PMs due next</h3>
      ${renderTable([
        { label: 'PM', key: 'id' },
        { label: 'Task', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
        { label: 'Due', render: r => dueChip(r.nextDue) },
        { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${jsq(r.id)}')">Generate WO</button>` }
      ], duePms.slice(0, 6), { empty: 'Nothing due in the next 7 days.', onRow: 'editPM' })}
      <div class="actions"><a class="btn out sm" href="#/pm">Open PM plan</a></div>
    </div>

    <div class="card">
      <h3 class="sec">Open work orders</h3>
      ${renderTable([
        { label: 'WO', key: 'id' },
        { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
        { label: 'Priority', render: r => prioChip(r.priority) },
        { label: 'Status', render: r => statusChip(r.status) }
      ], openWos.slice(0, 6), { empty: 'No open work orders.', onRow: 'editWO' })}
      <div class="actions"><a class="btn out sm" href="#/wo">Open work orders</a></div>
    </div>
  </div>

  ${lowParts.length ? `<div class="card">
    <h3 class="sec">Low stock — reorder</h3>
    ${renderTable([
      { label: 'Part', key: 'id' },
      { label: 'Description', key: 'description' },
      { label: 'Location', render: r => `<span class="mono">${esc(r.location || '—')}</span>` },
      { label: 'On hand', num: true, render: r => esc(r.qty) },
      { label: 'Min', num: true, render: r => esc(r.min) },
      { label: 'Vendor', key: 'vendor' }
    ], lowParts, { onRow: 'editPart' })}
  </div>` : ''}

  ${uncounted.length ? `<div class="note">
    <b>${uncounted.length} part${uncounted.length === 1 ? '' : 's'} have no quantity on hand recorded.</b>
    Low-stock alerts stay switched off until those are counted. <a href="#/parts">Open spare parts</a>.
  </div>` : ''}`;
}

function dueChip(iso) {
  const d = DB.daysUntil(iso);
  if (d === null) return '<span class="chip c-hold">No date</span>';
  if (d < 0) return `<span class="chip c-crit">${Math.abs(d)}d overdue</span>`;
  if (d === 0) return '<span class="chip c-crit">Due today</span>';
  if (d <= 7) return `<span class="chip c-prog">In ${d}d</span>`;
  return `<span class="chip c-hold">${fmtDate(iso)}</span>`;
}
function prioChip(p) {
  const c = p === 'High' ? 'c-crit' : p === 'Medium' ? 'c-prog' : 'c-hold';
  return `<span class="chip ${c}">${esc(p || '—')}</span>`;
}
function statusChip(s) {
  const c = s === 'Completed' ? 'c-done' : s === 'In Progress' ? 'c-prog'
    : s === 'Open' ? 'c-open' : 'c-hold';
  return `<span class="chip ${c}">${esc(s || 'Open')}</span>`;
}

/* ============================================================
   ASSETS — list
   ============================================================ */
function renderAssets() {
  const rows = DB.all('assets').filter(a =>
    matches(a, ['id', 'name', 'manufacturer', 'model', 'serial', 'project', 'location']));

  return `
  <h1 class="page">Assets</h1>
  <p class="sub">${rows.length} asset${rows.length === 1 ? '' : 's'}${SEARCH ? ` matching “${esc(SEARCH)}”` : ' in the register'} — click a row to open its dashboard</p>

  <div class="chipset">
    <button class="btn filled" onclick="editAsset()">&#43; New asset</button>
    <button class="btn out" onclick="exportCSV('assets')">Export CSV</button>
    <a class="btn out" href="#/import">Import CSV</a>
  </div>

  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">Asset register</h3>
    ${renderTable([
      { label: 'Asset ID', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Equipment name', render: r => `<b>${esc(r.name || '—')}</b>${r.location ? `<br><small style="color:var(--muted)">${esc(r.location)}</small>` : ''}` },
      { label: 'Manufacturer', key: 'manufacturer' },
      { label: 'Status', render: r => `<span class="chip ${r.status === 'Down' ? 'c-crit' : r.status === 'Retired' ? 'c-hold' : 'c-done'}">${esc(r.status || 'Active')}</span>` },
      { label: 'Open WOs', num: true, render: r => {
          const n = DB.forAsset('wos', r.id).filter(DB.isActive).length;
          return n ? `<b style="color:var(--bad)">${n}</b>` : '0'; } },
      { label: 'PMs', num: true, render: r => DB.forAsset('pms', r.id).length },
      { label: 'Parts', num: true, render: r => DB.forAsset('parts', r.id).length },
      { label: '', render: r => `<button class="btn out sm" onclick="event.stopPropagation();editAsset('${jsq(r.id)}')">Edit</button>` }
    ], rows, { empty: SEARCH ? 'No assets match that search.' : 'No assets yet — add one or import a CSV.', onRow: 'openAsset' })}
  </div>`;
}

/* ============================================================
   ASSET DETAIL — the per-machine dashboard
   ============================================================ */
function renderAssetDetail(id) {
  const a = DB.get('assets', id);
  if (!a) {
    return `<h1 class="page">Asset not found</h1>
      <p class="sub">No asset with ID “${esc(id)}”.</p>
      <a class="btn filled" href="#/assets">Back to assets</a>`;
  }
  DB.touchAsset(id);

  const wos = DB.forAsset('wos', id);
  const pms = DB.forAsset('pms', id);
  const parts = DB.forAsset('parts', id);

  const pending = wos.filter(DB.isOpen);
  const prog = wos.filter(w => w.status === 'In Progress');
  const done = wos.filter(DB.isDone);
  const incoming = pms.filter(p => { const d = DB.daysUntil(p.nextDue); return d !== null && d >= 0 && d <= 30; });

  const recentRepairs = done
    .sort((x, y) => (y.dateCompleted || '').localeCompare(x.dateCompleted || ''))
    .slice(0, 5);

  const lowParts = parts.filter(p => DB.partStatus(p).label === 'Low stock').length;

  return `
  <div class="crumb"><a href="#/home">Home</a> › <a href="#/assets">Assets</a> › ${esc(a.id)}</div>

  <div class="ahead">
    <div class="big">&#9881;</div>
    <div class="who">
      <h1>${esc(a.name || a.id)}</h1>
      <div class="meta">
        Asset <b class="mono">${esc(a.id)}</b>
        ${a.serial ? ` · Serial <b class="mono">${esc(a.serial)}</b>` : ''}<br>
        ${a.manufacturer ? esc(a.manufacturer) : 'Manufacturer not set'}
        ${a.model ? ' · ' + esc(a.model) : ''}
        ${a.location ? ' · ' + esc(a.location) : ''}
        ${a.project ? ' · Project ' + esc(a.project) : ''}
      </div>
      ${a.notes ? `<div class="note" style="margin-top:12px">${esc(a.notes)}</div>` : ''}
    </div>
    <div>
      <span class="chip ${a.status === 'Down' ? 'c-crit' : a.status === 'Retired' ? 'c-hold' : 'c-done'}"
        style="font-size:13px;padding:8px 14px">${esc(a.status || 'Active')}</span>
    </div>
  </div>

  <div class="chipset">
    <button class="btn filled" onclick="newWOFor('${jsq(a.id)}')">&#43; New work order</button>
    <button class="btn tonal" onclick="newPMFor('${jsq(a.id)}')">&#43; Add PM</button>
    <button class="btn out" onclick="newPartFor('${jsq(a.id)}')">&#43; Add part</button>
    <button class="btn out" onclick="editAsset('${jsq(a.id)}')">Edit asset</button>
  </div>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="ic" style="background:var(--info-c);color:var(--pri)">&#128203;</div>
      <div class="n">${pending.length}</div><div class="l">Pending work orders</div>
      <div class="d">${pending.filter(w => w.priority === 'High').length} high priority</div></div>
    <div class="stat"><div class="ic" style="background:var(--warn-c);color:var(--warn)">&#128295;</div>
      <div class="n">${prog.length}</div><div class="l">In progress</div></div>
    <div class="stat"><div class="ic" style="background:var(--pur-c);color:var(--pur)">&#128197;</div>
      <div class="n">${incoming.length}</div><div class="l">Incoming PMs (30 days)</div>
      <div class="d">${pms.length} on the program</div></div>
    <div class="stat"><div class="ic" style="background:var(--ok-c);color:var(--ok)">&#9989;</div>
      <div class="n">${done.length}</div><div class="l">Completed</div>
      <div class="d">${done.reduce((s, w) => s + (DB.num(w.hours) || 0), 0).toFixed(1)}h logged</div></div>
  </div>

  <div class="grid g2">
    <div class="card">
      <h3 class="sec">Recent repairs — last 5 completed</h3>
      ${renderTable([
        { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
        { label: 'Work done', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(r.cause || 'No cause recorded')}</small>` },
        { label: 'Completed', render: r => fmtDate(r.dateCompleted) },
        { label: 'Hrs', num: true, render: r => r.hours ?? '—' }
      ], recentRepairs, { empty: 'No completed repairs on this asset yet.', onRow: 'editWO' })}
    </div>

    <div class="card">
      <h3 class="sec">Open work orders</h3>
      ${renderTable([
        { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
        { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b>` },
        { label: 'Priority', render: r => prioChip(r.priority) },
        { label: 'Status', render: r => statusChip(r.status) }
      ], wos.filter(DB.isActive), { empty: 'Nothing open on this asset.', onRow: 'editWO' })}
    </div>
  </div>

  <div class="card">
    <h3 class="sec">PM program — schedule and frequency</h3>
    ${renderTable([
      { label: 'PM', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Task', render: r => `<b>${esc(r.description || '—')}</b>` },
      { label: 'Frequency', render: r => `<span class="chip c-open">${esc(r.frequency || '—')}</span>` },
      { label: 'Next due', render: r => dueChip(r.nextDue) },
      { label: 'Last done', render: r => fmtDate(r.lastDone) },
      { label: 'Technician', render: r => r.tech ? esc(r.tech) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${jsq(r.id)}')">Generate WO</button>
        <button class="btn out sm" onclick="event.stopPropagation();completePM('${jsq(r.id)}')">Mark done</button>` }
    ], pms.sort((x, y) => (x.nextDue || '9999').localeCompare(y.nextDue || '9999')),
       { empty: 'No PM schedules on this asset.', onRow: 'editPM' })}
  </div>

  <div class="card">
    <h3 class="sec">Machine BOM — components and spare parts${lowParts ? ` · ${lowParts} low` : ''}</h3>
    ${renderTable([
      { label: 'Part number', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Description', key: 'description' },
      { label: 'Mfr P/N', render: r => `<span class="mono">${esc(r.mfrPn || '—')}</span>` },
      { label: 'Vendor', key: 'vendor' },
      { label: 'Bin location', render: r => `<span class="mono">${esc(r.location || '—')}</span>` },
      { label: 'On hand', num: true, render: r => r.qty ?? '—' },
      { label: 'Status', render: r => { const s = DB.partStatus(r); return `<span class="chip ${s.cls}">${s.label}</span>`; } },
      { label: 'Info', render: r => {
          const bits = [];
          if (r.imageUrl) bits.push('&#128247;');
          if (r.docUrl) bits.push('&#128196;');
          return bits.join(' ') || '<span style="color:var(--muted)">—</span>'; } }
    ], parts, { empty: 'No parts linked to this asset yet.', onRow: 'editPart' })}
  </div>`;
}

function newWOFor(assetId) { editWO(null, assetId); }
function newPMFor(assetId) { editPM(null, assetId); }
function newPartFor(assetId) { editPart(null, assetId); }

/* ============================================================
   ASSET form
   ============================================================ */
function editAsset(id) {
  const a = id ? DB.get('assets', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New asset' : 'Asset ' + a.id,
    body: `
      ${F.text('id', 'Asset ID', a.id || DB.nextId('assets', '', 4), { required: true, readonly: !isNew })}
      ${F.text('name', 'Equipment name', a.name, { required: true, placeholder: 'e.g. Top Roll Assembly' })}
      <div class="f2">
        <div>${F.text('manufacturer', 'Manufacturer', a.manufacturer)}</div>
        <div>${F.text('model', 'Model', a.model)}</div>
        <div>${F.text('serial', 'Serial number', a.serial)}</div>
        <div>${F.text('project', 'Project number', a.project)}</div>
        <div>${F.text('location', 'Location / line', a.location)}</div>
        <div>${F.select('status', 'Status', a.status || 'Active', ['Active', 'Standby', 'Down', 'Retired'])}</div>
      </div>
      ${F.area('notes', 'Notes', a.notes)}`,
    footer: `
      <button class="btn filled" onclick="saveAsset(${isNew})">Save asset</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delAsset('${jsq(a.id)}')">Delete</button>` : ''}`
  });
}

function saveAsset(isNew) {
  const d = F.read();
  if (!d.id || !d.name) { toast('Asset ID and equipment name are required'); return; }
  if (isNew && DB.get('assets', d.id)) { toast('That asset ID already exists'); return; }
  DB.upsert('assets', d);
  Modal.close();
  if (isNew) openAsset(d.id); else route();
  toast('Asset ' + d.id + ' saved');
}

function delAsset(id) {
  const pms = DB.forAsset('pms', id).length;
  const parts = DB.forAsset('parts', id).length;
  const wos = DB.forAsset('wos', id).length;
  confirmDelete(`Delete asset ${id}?\n\n${pms} PM(s), ${parts} part(s) and ${wos} work order(s) will be unlinked but not deleted.`, () => {
    DB.remove('assets', id);
    Modal.close();
    location.hash = '#/assets';
    toast('Asset deleted');
  });
}

/* ============================================================
   PM PLAN
   ============================================================ */
function renderPM() {
  let rows = DB.all('pms').filter(p => matches(p, ['id', 'description', 'assetId', 'frequency', 'tech']));
  rows.sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));

  const overdue = rows.filter(r => (DB.daysUntil(r.nextDue) ?? 99) < 0).length;
  const unassigned = rows.filter(r => !r.tech).length;

  return `
  <h1 class="page">PM Plan</h1>
  <p class="sub">${rows.length} preventive maintenance schedule${rows.length === 1 ? '' : 's'}</p>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="n">${rows.length}</div><div class="l">Scheduled PMs</div></div>
    <div class="stat"><div class="n" style="color:${overdue ? 'var(--bad)' : 'inherit'}">${overdue}</div><div class="l">Overdue</div></div>
    <div class="stat"><div class="n">${rows.filter(r => { const d = DB.daysUntil(r.nextDue); return d !== null && d >= 0 && d <= 30; }).length}</div><div class="l">Due in 30 days</div></div>
    <div class="stat"><div class="n" style="color:${unassigned ? 'var(--warn)' : 'inherit'}">${unassigned}</div><div class="l">No technician assigned</div></div>
  </div>

  <div class="chipset">
    <button class="btn filled" onclick="editPM()">&#43; New PM</button>
    <button class="btn out" onclick="exportCSV('pms')">Export CSV</button>
  </div>

  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">Schedule</h3>
    ${renderTable([
      { label: 'PM', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Task', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
      { label: 'Frequency', render: r => `<span class="chip c-open">${esc(r.frequency || '—')}</span>` },
      { label: 'Next due', render: r => dueChip(r.nextDue) },
      { label: 'Last done', render: r => fmtDate(r.lastDone) },
      { label: 'Technician', render: r => r.tech ? esc(r.tech) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${jsq(r.id)}')">Generate WO</button>
        <button class="btn out sm" onclick="event.stopPropagation();completePM('${jsq(r.id)}')">Mark done</button>` }
    ], rows, { empty: 'No PM schedules yet.', onRow: 'editPM' })}
  </div>`;
}

function editPM(id, presetAsset) {
  const p = id ? DB.get('pms', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New PM schedule' : 'PM ' + p.id,
    body: `
      ${F.text('id', 'PM number', p.id || DB.nextId('pms', 'PM-', 3), { required: true, readonly: !isNew })}
      ${F.select('assetId', 'Asset', p.assetId || presetAsset || '', assetOptions(), { required: true })}
      ${F.area('description', 'PM description', p.description, 3)}
      <div class="f2">
        <div>${F.select('frequency', 'Frequency', p.frequency || 'monthly', FREQS)}</div>
        <div>${F.date('nextDue', 'Next due', p.nextDue || today())}</div>
        <div>${F.date('lastDone', 'Last completed', p.lastDone)}</div>
        <div>${F.text('tech', 'Assigned technician', p.tech)}</div>
      </div>`,
    footer: `
      <button class="btn filled" onclick="savePM(${isNew})">Save PM</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delPM('${jsq(p.id)}')">Delete</button>` : ''}`
  });
}

function savePM(isNew) {
  const d = F.read();
  if (!d.id) { toast('PM number is required'); return; }
  if (isNew && DB.get('pms', d.id)) { toast('That PM number already exists'); return; }
  DB.upsert('pms', d);
  Modal.close(); route(); toast('PM ' + d.id + ' saved');
}

function delPM(id) {
  confirmDelete('Delete PM ' + id + '?', () => {
    DB.remove('pms', id); Modal.close(); route(); toast('PM deleted');
  });
}

function completePM(id) {
  const p = DB.get('pms', id);
  if (!p) return;
  const next = DB.bumpDue(p);
  DB.upsert('pms', { id: p.id, lastDone: today(), nextDue: next, completed: 'Yes' });
  route();
  toast('PM ' + id + ' completed — next due ' + fmtDate(next));
}

function genWO(pmId) {
  const p = DB.get('pms', pmId);
  if (!p) return;
  const wo = {
    id: DB.nextId('wos', 'WO-', 4),
    assetId: p.assetId,
    description: p.description || ('PM ' + p.id),
    type: 'Preventive',
    priority: (DB.daysUntil(p.nextDue) ?? 99) < 0 ? 'High' : 'Medium',
    assignedTo: p.tech || '',
    dateRequested: today(),
    dateDue: p.nextDue || today(),
    status: 'Open',
    pmId: p.id,
    cause: 'To be determined'
  };
  DB.upsert('wos', wo);
  route();
  toast(wo.id + ' created from ' + p.id);
}

/* ============================================================
   SPARE PARTS
   ============================================================ */
function renderParts() {
  const rows = DB.all('parts').filter(p =>
    matches(p, ['id', 'description', 'mfrPn', 'vendor', 'location', 'assetId']));

  const value = rows.reduce((s, p) => {
    const q = DB.num(p.qty), c = DB.num(p.cost);
    return s + (q !== null && c !== null ? q * c : 0);
  }, 0);
  const low = rows.filter(p => DB.partStatus(p).label === 'Low stock').length;

  return `
  <h1 class="page">Spare Parts</h1>
  <p class="sub">${rows.length} part${rows.length === 1 ? '' : 's'} in the crib</p>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="n">${rows.length}</div><div class="l">Parts tracked</div></div>
    <div class="stat"><div class="n" style="color:${low ? 'var(--bad)' : 'inherit'}">${low}</div><div class="l">At or below minimum</div></div>
    <div class="stat"><div class="n">${rows.filter(p => DB.num(p.qty) === null).length}</div><div class="l">Not yet counted</div></div>
    <div class="stat"><div class="n">${value ? '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div><div class="l">Inventory value</div></div>
  </div>

  <div class="chipset">
    <button class="btn filled" onclick="editPart()">&#43; New part</button>
    <button class="btn out" onclick="exportCSV('parts')">Export CSV</button>
  </div>

  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">Parts list</h3>
    ${renderTable([
      { label: 'Part number', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
      { label: 'Mfr P/N', render: r => `<span class="mono">${esc(r.mfrPn || '—')}</span>` },
      { label: 'Vendor', key: 'vendor' },
      { label: 'Location', render: r => `<span class="mono">${esc(r.location || '—')}</span>` },
      { label: 'On hand', num: true, render: r => r.qty ?? '—' },
      { label: 'Min', num: true, render: r => r.min ?? '—' },
      { label: 'Unit cost', num: true, render: r => money(r.cost) },
      { label: 'Status', render: r => { const s = DB.partStatus(r); return `<span class="chip ${s.cls}">${s.label}</span>`; } },
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();countPart('${jsq(r.id)}')">Count</button>` }
    ], rows, { empty: 'No parts yet.', onRow: 'editPart' })}
  </div>`;
}

function editPart(id, presetAsset) {
  const p = id ? DB.get('parts', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New part' : 'Part ' + p.id,
    body: `
      ${p.imageUrl ? `<div class="prev"><img src="${esc(p.imageUrl)}" alt="" onerror="this.parentNode.style.display='none'"/></div>` : ''}
      ${F.text('id', 'Part number', p.id || DB.nextId('parts', 'P-', 4), { required: true, readonly: !isNew })}
      ${F.text('description', 'Description', p.description, { required: true })}
      ${F.select('assetId', 'Used on asset', p.assetId || presetAsset || '', assetOptions())}
      <div class="f2">
        <div>${F.text('mfrPn', 'Manufacturer part number', p.mfrPn)}</div>
        <div>${F.text('vendor', 'Vendor', p.vendor)}</div>
        <div>${F.text('location', 'Storage location', p.location, { placeholder: 'e.g. SP1-E3-A5' })}</div>
        <div>${F.num('cost', 'Unit cost', p.cost, { step: '0.01' })}</div>
        <div>${F.num('qty', 'Quantity on hand', p.qty, { step: '1' })}</div>
        <div>${F.num('min', 'Minimum quantity', p.min, { step: '1' })}</div>
        <div>${F.num('max', 'Maximum quantity', p.max, { step: '1' })}</div>
      </div>
      ${F.text('imageUrl', 'Picture URL', p.imageUrl, { placeholder: 'https://…' })}
      ${F.text('docUrl', 'Spec sheet / manual URL', p.docUrl, { placeholder: 'https://…' })}
      ${p.docUrl ? `<div style="margin-top:10px"><a href="${esc(p.docUrl)}" target="_blank" rel="noopener">Open spec sheet &#8599;</a></div>` : ''}`,
    footer: `
      <button class="btn filled" onclick="savePart(${isNew})">Save part</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delPart('${jsq(p.id)}')">Delete</button>` : ''}`
  });
}

function savePart(isNew) {
  const d = F.read();
  if (!d.id || !d.description) { toast('Part number and description are required'); return; }
  if (isNew && DB.get('parts', d.id)) { toast('That part number already exists'); return; }
  DB.upsert('parts', d);
  Modal.close(); route(); toast('Part ' + d.id + ' saved');
}

function delPart(id) {
  confirmDelete('Delete part ' + id + '?', () => {
    DB.remove('parts', id); Modal.close(); route(); toast('Part deleted');
  });
}

function countPart(id) {
  const p = DB.get('parts', id);
  const v = prompt('Quantity on hand for ' + id + ' (' + (p.description || '') + '):', p.qty ?? '');
  if (v === null) return;
  DB.upsert('parts', { id, qty: v.trim() });
  route();
  toast(id + ' counted — ' + v + ' on hand');
}

/* ============================================================
   WORK ORDERS — list + calendar
   ============================================================ */
function setWOView(v) { WO_VIEW = v; route(); }
function setWOFilter(f) { WO_FILTER = f; route(); }

function renderWO() {
  let rows = DB.all('wos').filter(w =>
    matches(w, ['id', 'description', 'assetId', 'assignedTo', 'requestedBy', 'status']));

  const all = rows.slice();
  if (WO_FILTER === 'open') rows = rows.filter(DB.isOpen);
  else if (WO_FILTER === 'progress') rows = rows.filter(w => w.status === 'In Progress');
  else if (WO_FILTER === 'done') rows = rows.filter(DB.isDone);

  rows.sort((a, b) => (DB.woDate(b) || '').localeCompare(DB.woDate(a) || ''));

  const openN = all.filter(DB.isOpen).length;
  const progN = all.filter(w => w.status === 'In Progress').length;
  const doneN = all.filter(DB.isDone).length;
  const hours = all.filter(DB.isDone).reduce((s, w) => s + (DB.num(w.hours) || 0), 0);

  return `
  <h1 class="page">Work Orders</h1>
  <p class="sub">${all.length} work order${all.length === 1 ? '' : 's'} on record</p>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat click" onclick="setWOFilter('open')"><div class="n">${openN}</div><div class="l">Pending</div></div>
    <div class="stat click" onclick="setWOFilter('progress')"><div class="n">${progN}</div><div class="l">In progress</div></div>
    <div class="stat click" onclick="setWOFilter('done')"><div class="n">${doneN}</div><div class="l">Completed</div></div>
    <div class="stat"><div class="n">${hours.toFixed(1)}<small style="font-size:15px">h</small></div><div class="l">Labour logged</div></div>
  </div>

  <div class="chipset">
    <button class="btn filled" onclick="editWO()">&#43; New work order</button>
    <div class="vtog">
      <button class="${WO_VIEW === 'list' ? 'on' : ''}" onclick="setWOView('list')">&#9776; List</button>
      <button class="${WO_VIEW === 'calendar' ? 'on' : ''}" onclick="setWOView('calendar')">&#128197; Calendar</button>
    </div>
    ${WO_VIEW === 'list' ? `
      <button class="fchip ${WO_FILTER === 'all' ? 'on' : ''}" onclick="setWOFilter('all')">All</button>
      <button class="fchip ${WO_FILTER === 'open' ? 'on' : ''}" onclick="setWOFilter('open')">Pending</button>
      <button class="fchip ${WO_FILTER === 'progress' ? 'on' : ''}" onclick="setWOFilter('progress')">In progress</button>
      <button class="fchip ${WO_FILTER === 'done' ? 'on' : ''}" onclick="setWOFilter('done')">Completed</button>` : ''}
    <button class="btn out" onclick="exportCSV('wos')">Export CSV</button>
  </div>

  ${WO_VIEW === 'calendar' ? renderWOCalendar() : `
  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">${WO_FILTER === 'all' ? 'All work orders' : WO_FILTER === 'open' ? 'Pending' : WO_FILTER === 'progress' ? 'In progress' : 'Completed'}</h3>
    ${renderTable([
      { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}${r.pmId ? ' · from ' + esc(r.pmId) : ''}</small>` },
      { label: 'Type', render: r => `<span class="chip c-open">${esc(r.type || '—')}</span>` },
      { label: 'Priority', render: r => prioChip(r.priority) },
      { label: 'Assigned to', render: r => r.assignedTo ? esc(r.assignedTo) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: 'Scheduled', render: r => fmtDate(r.dateDue || r.dateRequested) },
      { label: 'Hours', num: true, render: r => r.hours ?? '—' },
      { label: 'Status', render: r => statusChip(r.status) }
    ], rows, { empty: 'No work orders in this view.', onRow: 'editWO' })}
  </div>`}`;
}

/* ---------- calendar ---------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function calShift(n) {
  let m = CAL.m + n, y = CAL.y;
  while (m < 0) { m += 12; y--; }
  while (m > 11) { m -= 12; y++; }
  CAL.y = y; CAL.m = m; route();
}
function calToday() { const d = new Date(); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); route(); }
function calTogglePMs() { CAL.pms = !CAL.pms; route(); }

function renderWOCalendar() {
  const first = new Date(CAL.y, CAL.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(CAL.y, CAL.m + 1, 0).getDate();
  const todayIso = today();

  /* bucket events by ISO date */
  const byDay = {};
  const push = (iso, html) => { if (!iso) return; (byDay[iso] = byDay[iso] || []).push(html); };

  DB.all('wos').filter(w => matches(w, ['id', 'description', 'assetId', 'assignedTo', 'status']))
    .forEach(w => {
      const iso = DB.woDate(w);
      const cls = DB.isDone(w) ? 'ev-done' : w.status === 'In Progress' ? 'ev-prog'
        : w.status === 'On Hold' || w.status === 'Cancelled' ? 'ev-hold' : 'ev-open';
      push(iso, `<div class="ev ${cls}" title="${esc(w.id + ' · ' + (w.description || ''))}"
        onclick="editWO('${jsq(w.id)}')">${esc(w.id)} ${esc((w.description || '').slice(0, 22))}</div>`);
    });

  if (CAL.pms) {
    DB.all('pms').forEach(p => {
      push(p.nextDue, `<div class="ev ev-pm" title="${esc(p.id + ' · ' + (p.description || ''))}"
        onclick="editPM('${jsq(p.id)}')">${esc(p.id)} ${esc((p.description || '').slice(0, 20))}</div>`);
    });
  }

  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="day pad"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${CAL.y}-${String(CAL.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = (byDay[iso] || []).join('');
    cells += `<div class="day ${iso === todayIso ? 'today' : ''}">
      <div class="dnum">${d}</div>${evs}</div>`;
  }

  const monthCount = Object.keys(byDay).filter(k => k.startsWith(`${CAL.y}-${String(CAL.m + 1).padStart(2, '0')}`))
    .reduce((s, k) => s + byDay[k].length, 0);

  return `
  <div class="card">
    <div class="calbar">
      <button class="btn out sm" onclick="calShift(-1)">&#8249; Prev</button>
      <div class="mo">${MONTHS[CAL.m]} ${CAL.y}</div>
      <button class="btn out sm" onclick="calShift(1)">Next &#8250;</button>
      <button class="btn tonal sm" onclick="calToday()">Today</button>
      <button class="fchip ${CAL.pms ? 'on' : ''}" onclick="calTogglePMs()">Show PM due dates</button>
      <span style="color:var(--muted);font-size:12.5px;margin-left:auto">${monthCount} item${monthCount === 1 ? '' : 's'} this month</span>
    </div>

    <div class="cal">
      ${DOW.map(d => `<div class="dow">${d}</div>`).join('')}
      ${cells}
    </div>

    <div class="legend">
      <span><i style="background:var(--info-c)"></i>Open</span>
      <span><i style="background:var(--warn-c)"></i>In progress</span>
      <span><i style="background:var(--ok-c)"></i>Completed</span>
      <span><i style="background:var(--surf-3)"></i>On hold / cancelled</span>
      ${CAL.pms ? '<span><i style="background:var(--pur-c)"></i>PM due</span>' : ''}
    </div>

    <div class="note">Work orders sit on their <b>scheduled date</b> when one is set, otherwise the
    completion date, otherwise the date requested. Click any item to open it.</div>
  </div>`;
}

/* ---------- WO form ---------- */
function editWO(id, presetAsset) {
  const w = id ? DB.get('wos', id) : {};
  const isNew = !id;
  const partOpts = [{ v: '', t: '— none —' }].concat(
    DB.all('parts')
      .filter(p => !w.assetId || !p.assetId || p.assetId === w.assetId || p.assetId === presetAsset)
      .map(p => ({ v: p.id, t: p.id + ' · ' + (p.description || '') })));

  Modal.open({
    title: isNew ? 'New work order' : 'Work order ' + w.id,
    body: `
      ${F.text('id', 'Work order number', w.id || DB.nextId('wos', 'WO-', 4), { required: true, readonly: !isNew })}
      ${F.select('assetId', 'Asset', w.assetId || presetAsset || '', assetOptions(), { required: true })}
      ${F.area('description', 'Description of work', w.description, 3)}
      <div class="f2">
        <div>${F.select('type', 'Work type', w.type || 'Repair', WO_TYPES)}</div>
        <div>${F.select('priority', 'Priority', w.priority || 'Medium', PRIORITIES)}</div>
        <div>${F.text('requestedBy', 'Requested by', w.requestedBy)}</div>
        <div>${F.text('assignedTo', 'Assigned to', w.assignedTo)}</div>
        <div>${F.date('dateRequested', 'Date requested', w.dateRequested || today())}</div>
        <div>${F.date('dateDue', 'Scheduled date (calendar)', w.dateDue)}</div>
        <div>${F.date('dateStarted', 'Date started', w.dateStarted)}</div>
        <div>${F.date('dateCompleted', 'Date completed', w.dateCompleted)}</div>
        <div>${F.select('status', 'Status', w.status || 'Open', WO_STATUS)}</div>
        <div>${F.num('hours', 'Labour hours', w.hours, { step: '0.5' })}</div>
        <div>${F.num('cost', 'Cost', w.cost, { step: '0.01' })}</div>
      </div>
      ${F.select('cause', 'Cause of failure', w.cause || 'To be determined', CAUSES)}
      ${F.select('partsUsed', 'Parts used', w.partsUsed, partOpts)}
      ${F.area('notes', 'Technician notes', w.notes, 3)}
      ${w.pmId ? `<div class="note">Generated from PM <b>${esc(w.pmId)}</b>. Completing this rolls that PM forward.</div>` : ''}`,
    footer: `
      <button class="btn filled" onclick="saveWO(${isNew})">Save work order</button>
      ${!isNew && w.status !== 'Completed' ? `<button class="btn ok" onclick="closeWO('${jsq(w.id)}')">Complete</button>` : ''}
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delWO('${jsq(w.id)}')">Delete</button>` : ''}`
  });
}

function saveWO(isNew) {
  const d = F.read();
  if (!d.id) { toast('Work order number is required'); return; }
  if (!d.assetId) { toast('Pick the asset this work order is for'); return; }
  if (isNew && DB.get('wos', d.id)) { toast('That work order number already exists'); return; }
  DB.upsert('wos', d);
  Modal.close(); route(); toast('Work order ' + d.id + ' saved');
}

function closeWO(id) {
  const d = F.read();
  if (!d.cause || d.cause === 'To be determined') {
    toast('Record a cause of failure before completing');
    return;
  }
  d.status = 'Completed';
  if (!d.dateCompleted) d.dateCompleted = today();
  DB.upsert('wos', d);

  const w = DB.get('wos', id);
  if (w && w.pmId) {
    const p = DB.get('pms', w.pmId);
    if (p) DB.upsert('pms', { id: p.id, lastDone: d.dateCompleted, nextDue: DB.bumpDue(p) });
  }
  Modal.close(); route();
  toast(id + ' completed');
}

function delWO(id) {
  confirmDelete('Delete work order ' + id + '?', () => {
    DB.remove('wos', id); Modal.close(); route(); toast('Work order deleted');
  });
}

/* ============================================================
   CSV IMPORT
   ============================================================ */
let IMPORT = { entity: 'assets', headers: [], records: [], map: {}, filename: '' };
const ENTITY_LABEL = { assets: 'Assets', pms: 'PM Schedule', parts: 'Spare Parts', wos: 'Work Orders' };

function renderImport() {
  const fieldList = e => Object.keys(CSV.ALIAS[e]).join(', ');
  return `
  <h1 class="page">Import CSV</h1>
  <p class="sub">Drop a spreadsheet export in and map the columns. Existing records with a matching ID are updated, new ones are added.</p>

  <div class="card">
    <h3 class="sec">1 · Choose what you are importing</h3>
    <div class="chipset">
      ${Object.keys(ENTITY_LABEL).map(e =>
        `<button class="fchip ${IMPORT.entity === e ? 'on' : ''}" onclick="setImportEntity('${e}')">${ENTITY_LABEL[e]}</button>`
      ).join('')}
    </div>
    <div class="note">Recognised fields for <b>${ENTITY_LABEL[IMPORT.entity]}</b>: <span class="mono">${fieldList(IMPORT.entity)}</span>.
      Common header spellings are matched automatically — anything unmatched can be mapped by hand in step 3.</div>
  </div>

  <div class="card">
    <h3 class="sec">2 · Load the file</h3>
    <div class="drop" id="drop"
      ondragover="event.preventDefault();this.classList.add('over')"
      ondragleave="this.classList.remove('over')"
      ondrop="dropFile(event)"
      onclick="document.getElementById('fileIn').click()">
      <span class="big">&#128193;</span>
      <b>Drop a .csv file here</b><br>
      <small style="color:var(--muted)">or click to browse${IMPORT.filename ? ' — currently loaded: <b>' + esc(IMPORT.filename) + '</b>' : ''}</small>
    </div>
    <input type="file" id="fileIn" accept=".csv,text/csv" style="display:none" onchange="pickFile(event)"/>
    <div class="actions">
      <button class="btn out sm" onclick="loadSampleCSV()">Use the bundled sample file</button>
    </div>
  </div>

  ${IMPORT.records.length ? renderMapStep() : ''}`;
}

function renderMapStep() {
  const fields = ['— ignore —'].concat(Object.keys(CSV.ALIAS[IMPORT.entity]));
  const mapped = Object.values(IMPORT.map).filter(Boolean).length;

  const rowsHtml = IMPORT.headers.map(h => `
    <tr>
      <td><b class="mono">${esc(h)}</b></td>
      <td><small style="color:var(--muted)">${esc((IMPORT.records[0] || {})[h] || '')}</small></td>
      <td>
        <select onchange="setMap('${jsq(h)}',this.value)">
          ${fields.map(f => {
            const val = f === '— ignore —' ? '' : f;
            return `<option value="${esc(val)}" ${IMPORT.map[h] === val || (!IMPORT.map[h] && !val) ? 'selected' : ''}>${esc(f)}</option>`;
          }).join('')}
        </select>
      </td>
    </tr>`).join('');

  const preview = CSV.applyMap(IMPORT.records.slice(0, 5), IMPORT.map);
  const cols = Object.keys(CSV.ALIAS[IMPORT.entity]);

  return `
  <div class="card">
    <h3 class="sec">3 · Map the columns — ${mapped} of ${IMPORT.headers.length} mapped</h3>
    <div class="tablewrap"><table>
      <thead><tr><th>Column in your file</th><th>First value</th><th>Import as</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
  </div>

  <div class="card">
    <h3 class="sec">4 · Preview — first ${preview.length} of ${IMPORT.records.length} rows</h3>
    <div class="tablewrap"><table>
      <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${preview.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    ${!Object.values(IMPORT.map).includes('id')
      ? `<div class="note bad">No column is mapped to <b>id</b>. Every row will be imported as a new record with a generated ID.</div>`
      : `<div class="note">Rows are matched on <b>id</b>. Matching records are updated in place; the rest are added.</div>`}
    <div class="actions">
      <button class="btn filled" onclick="runImport()">Import ${IMPORT.records.length} rows</button>
      <button class="btn out" onclick="cancelImport()">Cancel</button>
    </div>
  </div>`;
}

function setImportEntity(e) {
  IMPORT.entity = e;
  if (IMPORT.headers.length) IMPORT.map = CSV.mapHeaders(e, IMPORT.headers);
  route();
}
function setMap(header, field) { IMPORT.map[header] = field || null; route(); }
function cancelImport() { IMPORT = { entity: IMPORT.entity, headers: [], records: [], map: {}, filename: '' }; route(); }
function pickFile(ev) { const f = ev.target.files[0]; if (f) readCSVFile(f); }
function dropFile(ev) {
  ev.preventDefault();
  const el = document.getElementById('drop'); if (el) el.classList.remove('over');
  const f = ev.dataTransfer.files[0];
  if (f) readCSVFile(f);
}

function readCSVFile(file) {
  const r = new FileReader();
  r.onload = () => {
    const { headers, records } = CSV.toObjects(r.result);
    if (!records.length) { toast('That file has no data rows'); return; }
    IMPORT.filename = file.name;
    IMPORT.headers = headers;
    IMPORT.records = records;
    IMPORT.map = CSV.mapHeaders(IMPORT.entity, headers);
    route();
    toast(records.length + ' rows read from ' + file.name);
  };
  r.readAsText(file);
}

function loadSampleCSV() {
  const file = { assets: 'assets.csv', pms: 'pm_schedule.csv', parts: 'spare_parts.csv', wos: 'work_orders.csv' }[IMPORT.entity];
  fetch('data/' + file)
    .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
    .then(text => {
      const { headers, records } = CSV.toObjects(text);
      IMPORT.filename = file; IMPORT.headers = headers; IMPORT.records = records;
      IMPORT.map = CSV.mapHeaders(IMPORT.entity, headers);
      route(); toast(records.length + ' sample rows loaded');
    })
    .catch(() => toast('Sample file not reachable — open the app over http, not file://'));
}

function runImport() {
  const clean = CSV.applyMap(IMPORT.records, IMPORT.map);
  const prefix = { assets: '', pms: 'PM-', parts: 'P-', wos: 'WO-' }[IMPORT.entity];
  clean.forEach(r => { if (!r.id) r.id = DB.nextId(IMPORT.entity, prefix, 4); });
  const { added, updated } = DB.bulkUpsert(IMPORT.entity, clean);
  const ent = IMPORT.entity;
  cancelImport();
  toast(`Imported — ${added} added, ${updated} updated`);
  location.hash = '#/' + ({ assets: 'assets', pms: 'pm', parts: 'parts', wos: 'wo' }[ent]);
}

function exportCSV(entity) {
  const fields = Object.keys(CSV.ALIAS[entity]);
  const rows = DB.all(entity);
  if (!rows.length) { toast('Nothing to export'); return; }
  CSV.download(entity + '-' + today() + '.csv', CSV.build(fields, rows));
  toast(rows.length + ' rows exported');
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const db = DB.raw();
  const counts = { Assets: db.assets.length, PMs: db.pms.length, Parts: db.parts.length, 'Work orders': db.wos.length };
  const bytes = new Blob([JSON.stringify(db)]).size;

  return `
  <h1 class="page">Settings</h1>
  <p class="sub">Data lives in this browser only. Back it up before switching machines or clearing site data.</p>

  <div class="card">
    <h3 class="sec">Site</h3>
    <label for="siteName">Site name</label>
    <input id="siteName" value="${esc(db.meta.site || '')}" onchange="saveSite(this.value)"/>
  </div>

  <div class="card">
    <h3 class="sec">Stored data</h3>
    ${renderTable([
      { label: 'Collection', key: 'k' },
      { label: 'Records', num: true, key: 'v' }
    ], Object.entries(counts).map(([k, v]) => ({ id: k, k, v })))}
    <div class="note">Approximately ${(bytes / 1024).toFixed(1)} KB used of the roughly 5 MB a browser allows.</div>
  </div>

  <div class="card">
    <h3 class="sec">Shared data (Git repo)</h3>
    <p style="color:var(--muted);margin:0 0 4px">
      The repo file <span class="mono">data/shared/db.json</span> is the master copy everyone pulls from.
      Publishing is a git commit — the app can read that file but cannot write back to GitHub.
    </p>
    <div class="f2" style="margin-bottom:4px">
      <div><label for="f_publisher">Your name (stamped on publish)</label>
        <input id="f_publisher" value="${esc(db.meta.publishedBy || '')}"/></div>
      <div><label>Last pulled</label>
        <input readonly value="${db.meta.lastPull ? fmtDate(db.meta.lastPull.slice(0, 10)) : 'never'}"/></div>
    </div>
    <div id="syncStatus"></div>
    <div class="actions">
      <button class="btn filled" onclick="publishShared()">Publish — download db.json</button>
      <button class="btn out" onclick="checkShared()">Check for updates</button>
    </div>
    <div class="actions" style="margin-top:4px">
      <button class="btn tonal sm" onclick="pullShared('replace')">Pull — replace mine</button>
      <button class="btn out sm" onclick="pullShared('repo')">Pull — repo wins</button>
      <button class="btn out sm" onclick="pullShared('mine')">Pull — keep my edits</button>
    </div>
    <div class="note">
      <b>To publish:</b> click Publish, then drop the downloaded <span class="mono">db.json</span> into
      <span class="mono">data/shared/</span> in your repo and commit it:<br>
      <span class="mono">git add data/shared/db.json &amp;&amp; git commit -m "Update plant data" &amp;&amp; git push</span><br>
      Vercel redeploys automatically, and everyone else gets it on their next Pull.
    </div>
  </div>

  <div class="card">
    <h3 class="sec">Backup and restore</h3>
    <p style="color:var(--muted);margin:0 0 4px">A backup is a single JSON file containing everything. Restoring replaces all current data.</p>
    <div class="actions">
      <button class="btn filled" onclick="Backup.export()">Download backup</button>
      <button class="btn out" onclick="document.getElementById('restoreIn').click()">Restore from backup</button>
      <input type="file" id="restoreIn" accept=".json" style="display:none" onchange="doRestore(event)"/>
    </div>
  </div>

  <div class="card">
    <h3 class="sec">Sample data</h3>
    <p style="color:var(--muted);margin:0 0 4px">Loads asset 3526 Top Roll Assembly with its PM program, spares and work orders.</p>
    <div class="actions">
      <button class="btn out" onclick="seedSample()">Load sample data</button>
      <button class="btn bad" style="margin-left:auto" onclick="wipeAll()">Erase everything</button>
    </div>
  </div>`;
}

function saveSite(v) { const db = DB.raw(); db.meta.site = v; DB.save(); toast('Site name saved'); }

function publishShared() {
  const el = document.getElementById('f_publisher');
  const who = el ? el.value.trim() : '';
  if (!who) { toast('Enter your name first — it gets stamped on the file'); return; }
  const db = DB.raw(); db.meta.publishedBy = who; DB.save();
  const at = Repo.publish(who);
  toast('db.json downloaded — commit it to data/shared/ to publish');
  const s = document.getElementById('syncStatus');
  if (s) s.innerHTML = `<div class="note">Stamped <b>${esc(who)}</b> at ${esc(at.slice(0, 16).replace('T', ' '))}. Now commit the file.</div>`;
}

function checkShared() {
  const s = document.getElementById('syncStatus');
  if (s) s.innerHTML = '<div class="note">Checking…</div>';
  Repo.checkForUpdates().then(info => {
    if (!s) return;
    const c = info.counts;
    const line = `${c.assets} assets · ${c.pms} PMs · ${c.parts} parts · ${c.wos} work orders`;
    s.innerHTML = info.behind
      ? `<div class="note bad"><b>A newer shared copy is available.</b><br>
         Published ${esc((info.publishedAt || '').slice(0, 16).replace('T', ' '))}
         by ${esc(info.publishedBy || 'unknown')} — ${line}.<br>Pull it below.</div>`
      : `<div class="note"><b>You are up to date.</b><br>Shared copy: ${line}.</div>`;
  }).catch(e => {
    if (s) s.innerHTML = `<div class="note bad">Could not read the shared file — ${esc(e.message)}.
      This needs the app served over http (Vercel or <span class="mono">npm run dev</span>), not opened as a file.</div>`;
  });
}

function pullShared(mode) {
  const msg = {
    replace: 'Replace ALL local data with the shared copy?\n\nAnything you entered that is not in the repo will be lost. Download a backup first if unsure.',
    repo: 'Merge the shared copy in, letting the repo win where records clash?',
    mine: 'Merge the shared copy in, keeping your own edits where records clash?'
  }[mode];
  if (!confirm(msg)) return;
  Repo.pull(mode).then(st => {
    route();
    toast(`Pulled — ${st.added} added, ${st.updated} updated, ${st.kept} of mine kept`);
  }).catch(e => toast('Pull failed — ' + e.message));
}

function doRestore(ev) {
  const f = ev.target.files[0]; if (!f) return;
  Backup.import(f, err => {
    if (err) { toast('That file could not be read'); return; }
    route(); toast('Backup restored');
  });
}

function wipeAll() {
  confirmDelete('Erase all assets, PMs, parts and work orders?\n\nThis cannot be undone. Download a backup first if you need one.', () => {
    DB.reset(); route(); toast('All data erased');
  });
}

/* ============================================================
   SAMPLE DATA
   ============================================================ */
function seedSample() {
  const d = today();
  const plus = n => DB.addDays(d, n);

  DB.bulkUpsert('assets', [
    { id: '3526', name: 'Top Roll Assembly', manufacturer: '3Con', project: '3527', location: 'Ultrasonic weld cell', status: 'Active', notes: 'Ultrasonic sonotrode weld cell' },
    { id: '3527', name: 'Air Compressor #1', manufacturer: 'Atlas Copco', location: 'Utilities room', status: 'Active' }
  ]);

  DB.bulkUpsert('pms', [
    { id: 'PM-003', assetId: '3526', description: 'Inspect and clean sonotrodes/anvils; check ultrasonic weld quality and tighten stack hardware', frequency: 'weekly', nextDue: plus(2) },
    { id: 'PM-004', assetId: '3526', description: 'Clean/replace main air supply filters and moisture separators', frequency: 'monthly', nextDue: plus(9) },
    { id: 'PM-005', assetId: '3526', description: 'Lubricate sliding and rotating components; check air-line lubricator drip', frequency: 'monthly', nextDue: plus(14) },
    { id: 'PM-006', assetId: '3526', description: 'Clean photo-eyes/sensors and air blow-off nozzles; verify nest cleaning', frequency: 'monthly', nextDue: plus(22) },
    { id: 'PM-007', assetId: '3526', description: 'Inspect ultrasonic generators and tightening controller', frequency: 'quarterly', nextDue: plus(86) },
    { id: 'PM-008', assetId: '3526', description: 'Inspect guarding, safety interlocks, E-stops and light curtains', frequency: 'quarterly', nextDue: plus(86) },
    { id: 'PM-009', assetId: '3526', description: 'Back up PLC/servo programs; review hour-meter counters', frequency: 'annually', nextDue: plus(360) }
  ]);

  DB.bulkUpsert('parts', [
    { id: 'CT_12672', description: 'Sonotrode', assetId: '3526', mfrPn: '6821000797', vendor: '3CON', location: 'SP1-I2-B5' },
    { id: 'CT_12673', description: 'Sonotrode', assetId: '3526', mfrPn: '6841000758', vendor: '3CON', location: 'SP1-I2-B4' },
    { id: 'CT_1710', description: 'Ultrasonic generator', assetId: '3526', mfrPn: '88194', vendor: 'HERRMANN', location: 'SP1-E3-B22' },
    { id: 'CT_13166', description: 'Power Focus 6000 tightening controller', assetId: '3526', mfrPn: '8436095010', vendor: 'ATLAS COPCO', location: 'SP1-H2-B3' },
    { id: 'CT_10591', description: 'SIMATIC ET 200SP analog input module', assetId: '3526', mfrPn: '6ES7134-6GF00-0AA1', vendor: 'SIEMENS', location: 'SP1-E3-A11' },
    { id: 'CT_1707', description: 'SIMATIC ET 200SP digital input module', assetId: '3526', mfrPn: '6ES7131-6BF01-0BA0', vendor: 'SIEMENS', location: 'SP1-E3-A5' },
    { id: 'CT_1708', description: 'SIMATIC ET 200SP digital output module', assetId: '3526', mfrPn: '6ES7132-6BH01-0BA0', vendor: 'SIEMENS', location: 'SP1-E3-A4' },
    { id: 'CT_1709', description: 'SIMATIC ET 200SP digital output module', assetId: '3526', mfrPn: '6ES7132-6BF01-0BA0', vendor: 'SIEMENS', location: 'SP1-E3-A6' },
    { id: 'CT_1711', description: 'SIMATIC ET 200SP BaseUnit BU15-P16+A10+2D', assetId: '3526', mfrPn: '6ES7193-6BP20-0DA0', vendor: 'SIEMENS', location: 'SP1-E3-A3' },
    { id: 'P-1001', description: 'Compressor oil filter', assetId: '3527', mfrPn: 'GRA-4471', vendor: 'Grainger', location: 'SP1-A1-B2', qty: '12', min: '5', max: '20', cost: '38.50' }
  ]);

  DB.bulkUpsert('wos', [
    { id: 'WO-1001', assetId: '3527', description: 'Oil leak at compressor head', type: 'Repair',
      priority: 'High', requestedBy: 'Chris Myers', assignedTo: 'John Davis',
      dateRequested: DB.addDays(d, -7), dateStarted: DB.addDays(d, -6), dateDue: DB.addDays(d, 1),
      hours: '4.0', cost: '450', status: 'In Progress', cause: 'To be determined' },
    { id: 'WO-1002', assetId: '3526', description: 'Replace worn sonotrode on station 2', type: 'Repair',
      priority: 'Medium', requestedBy: 'Marcelo Frazzato', assignedTo: 'John Davis',
      dateRequested: DB.addDays(d, -21), dateStarted: DB.addDays(d, -20), dateCompleted: DB.addDays(d, -20),
      hours: '2.5', cost: '1250', status: 'Completed', cause: 'Wear / end of life', partsUsed: 'CT_12672' },
    { id: 'WO-1003', assetId: '3526', description: 'Weld quality drift — investigate generator output', type: 'Troubleshoot',
      priority: 'High', requestedBy: 'Quality', assignedTo: '',
      dateRequested: DB.addDays(d, -2), dateDue: DB.addDays(d, 3),
      status: 'Open', cause: 'To be determined' },
    { id: 'WO-1004', assetId: '3526', description: 'Air leak at main regulator', type: 'Repair',
      priority: 'Low', requestedBy: 'Night shift', assignedTo: '',
      dateRequested: DB.addDays(d, -1), dateDue: DB.addDays(d, 6),
      status: 'On Hold', cause: 'To be determined' }
  ]);

  route();
  toast('Sample data loaded — 2 assets, 7 PMs, 10 parts, 4 work orders');
}

/* ============================================================
   BOOT
   ============================================================ */
(function boot() {
  if (!location.hash) location.hash = '#/home';
  route();
  if (typeof Repo !== 'undefined') {
    Repo.seedIfEmpty().then(loaded => {
      if (loaded) { route(); toast('Loaded the shared plant data from the repo'); }
    }).catch(() => { /* offline or no shared file — app still works locally */ });
  }
})();
