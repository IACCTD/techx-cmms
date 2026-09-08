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

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {
  dashboard: renderDashboard,
  assets: renderAssets,
  pm: renderPM,
  parts: renderParts,
  wo: renderWO,
  import: renderImport,
  settings: renderSettings
};

function route() {
  const hash = (location.hash || '#/dashboard').replace('#/', '');
  const [name] = hash.split('/');
  const fn = ROUTES[name] || renderDashboard;
  document.querySelectorAll('.rail .nav').forEach(a =>
    a.classList.toggle('active', a.dataset.s === name));
  document.getElementById('view').innerHTML = fn();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

document.getElementById('globalSearch').addEventListener('input', e => {
  SEARCH = e.target.value.toLowerCase().trim();
  route();
});

function matches(obj, fields) {
  if (!SEARCH) return true;
  return fields.some(f => String(obj[f] ?? '').toLowerCase().includes(SEARCH));
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const assets = DB.all('assets');
  const pms = DB.all('pms');
  const parts = DB.all('parts');
  const wos = DB.all('wos');

  const openWos = wos.filter(w => !['Completed', 'Cancelled'].includes(w.status));
  const duePms = pms.filter(p => {
    const d = DB.daysUntil(p.nextDue);
    return d !== null && d <= 7;
  }).sort((a, b) => (a.nextDue || '').localeCompare(b.nextDue || ''));
  const lowParts = parts.filter(p => DB.partStatus(p).label === 'Low stock');
  const uncounted = parts.filter(p => DB.num(p.qty) === null);

  if (!assets.length && !pms.length && !parts.length && !wos.length) {
    return `<h1 class="page">Welcome to Tech X</h1>
      <p class="sub">No data yet. Load the sample plant data to see how everything fits together, or start from an empty register.</p>
      <div class="placeholder">
        <div style="font-size:34px">&#128736;</div>
        <b style="display:block;margin:10px 0 6px;color:var(--ink);font-size:16px">Start here</b>
        <span>Load sample data (asset 3526 Top Roll Assembly with its PM plan, spares and work order), or import your own CSV files.</span>
        <div class="actions" style="justify-content:center">
          <button class="btn filled" onclick="pullShared('replace')">Pull shared data from repo</button>
          <button class="btn out" onclick="seedSample()">Load sample data</button>
          <a class="btn out" href="#/import">Import CSV</a>
          <a class="btn out" href="#/assets">Add first asset</a>
        </div>
      </div>`;
  }

  const stat = (ic, bg, col, n, l, d, dcls) => `
    <div class="stat">
      <div class="ic" style="background:${bg};color:${col}">${ic}</div>
      <div class="n">${n}</div><div class="l">${esc(l)}</div>
      ${d ? `<div class="d ${dcls || ''}">${esc(d)}</div>` : ''}
    </div>`;

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
        { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${esc(r.id)}')">Generate WO</button>` }
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
    Low-stock alerts and reorder suggestions stay switched off until those are counted.
    <a href="#/parts">Open spare parts</a>.
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
   ASSETS
   ============================================================ */
function renderAssets() {
  const rows = DB.all('assets').filter(a =>
    matches(a, ['id', 'name', 'manufacturer', 'project', 'location']));

  return `
  <h1 class="page">Assets</h1>
  <p class="sub">${rows.length} asset${rows.length === 1 ? '' : 's'} in the register</p>

  <div class="chipset">
    <button class="btn filled" onclick="editAsset()">&#43; New asset</button>
    <button class="btn out" onclick="exportCSV('assets')">Export CSV</button>
    <a class="btn out" href="#/import">Import CSV</a>
  </div>

  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">Asset register</h3>
    ${renderTable([
      { label: 'Asset ID', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Equipment name', render: r => `<b>${esc(r.name || '—')}</b>${r.notes ? `<br><small style="color:var(--muted)">${esc(r.notes.slice(0, 60))}</small>` : ''}` },
      { label: 'Manufacturer', key: 'manufacturer' },
      { label: 'Project #', render: r => `<span class="mono">${esc(r.project || '—')}</span>` },
      { label: 'Location', key: 'location' },
      { label: 'PMs', num: true, render: r => DB.all('pms').filter(p => p.assetId === r.id).length },
      { label: 'Parts', num: true, render: r => DB.all('parts').filter(p => p.assetId === r.id).length },
      { label: 'Open WOs', num: true, render: r => DB.all('wos').filter(w => w.assetId === r.id && !['Completed', 'Cancelled'].includes(w.status)).length },
      { label: '', render: r => `<button class="btn out sm" onclick="event.stopPropagation();editAsset('${esc(r.id)}')">Edit</button>` }
    ], rows, { empty: 'No assets yet — add one or import a CSV.' })}
  </div>`;
}

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
        <div>${F.text('project', 'Project number', a.project)}</div>
        <div>${F.text('location', 'Location / line', a.location)}</div>
        <div>${F.select('status', 'Status', a.status || 'Active', ['Active', 'Standby', 'Down', 'Retired'])}</div>
      </div>
      ${F.area('notes', 'Notes', a.notes)}`,
    footer: `
      <button class="btn filled" onclick="saveAsset(${isNew})">Save asset</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delAsset('${esc(a.id)}')">Delete</button>` : ''}`
  });
}

function saveAsset(isNew) {
  const d = F.read();
  if (!d.id || !d.name) { toast('Asset ID and equipment name are required'); return; }
  if (isNew && DB.get('assets', d.id)) { toast('That asset ID already exists'); return; }
  DB.upsert('assets', d);
  Modal.close(); route();
  toast('Asset ' + d.id + ' saved');
}

function delAsset(id) {
  const pms = DB.all('pms').filter(p => p.assetId === id).length;
  const parts = DB.all('parts').filter(p => p.assetId === id).length;
  const wos = DB.all('wos').filter(w => w.assetId === id).length;
  confirmDelete(`Delete asset ${id}?\n\n${pms} PM(s), ${parts} part(s) and ${wos} work order(s) will be unlinked but not deleted.`, () => {
    DB.remove('assets', id);
    Modal.close(); route(); toast('Asset deleted');
  });
}

/* ============================================================
   PM PLAN
   ============================================================ */
function renderPM() {
  let rows = DB.all('pms').filter(p =>
    matches(p, ['id', 'description', 'assetId', 'frequency', 'tech']));
  rows.sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));

  const overdue = rows.filter(r => (DB.daysUntil(r.nextDue) ?? 99) < 0).length;
  const unassigned = rows.filter(r => !r.tech).length;

  return `
  <h1 class="page">PM Plan</h1>
  <p class="sub">${rows.length} preventive maintenance schedule${rows.length === 1 ? '' : 's'}</p>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="n">${rows.length}</div><div class="l">Scheduled PMs</div></div>
    <div class="stat"><div class="n" style="color:${overdue ? 'var(--bad)' : 'inherit'}">${overdue}</div><div class="l">Overdue</div></div>
    <div class="stat"><div class="n">${rows.filter(r => (DB.daysUntil(r.nextDue) ?? 99) >= 0 && (DB.daysUntil(r.nextDue) ?? 99) <= 30).length}</div><div class="l">Due in 30 days</div></div>
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
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${esc(r.id)}')">Generate WO</button>
        <button class="btn out sm" onclick="event.stopPropagation();completePM('${esc(r.id)}')">Mark done</button>` }
    ], rows, { empty: 'No PM schedules yet.', onRow: 'editPM' })}
  </div>`;
}

function editPM(id) {
  const p = id ? DB.get('pms', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New PM schedule' : 'PM ' + p.id,
    body: `
      ${F.text('id', 'PM number', p.id || DB.nextId('pms', 'PM-', 3), { required: true, readonly: !isNew })}
      ${F.select('assetId', 'Asset', p.assetId, assetOptions(), { required: true })}
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
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delPM('${esc(p.id)}')">Delete</button>` : ''}`
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

/* Mark a PM complete: stamp last done, roll next due forward by frequency */
function completePM(id) {
  const p = DB.get('pms', id);
  if (!p) return;
  const next = DB.bumpDue(p);
  DB.upsert('pms', { id: p.id, lastDone: today(), nextDue: next, completed: 'Yes' });
  route();
  toast('PM ' + id + ' completed — next due ' + fmtDate(next));
}

/* Generate a work order from a PM */
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
    status: 'Open',
    pmId: p.id
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
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();countPart('${esc(r.id)}')">Count</button>` }
    ], rows, { empty: 'No parts yet.', onRow: 'editPart' })}
  </div>`;
}

function editPart(id) {
  const p = id ? DB.get('parts', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New part' : 'Part ' + p.id,
    body: `
      ${F.text('id', 'Part number', p.id || DB.nextId('parts', 'P-', 4), { required: true, readonly: !isNew })}
      ${F.text('description', 'Description', p.description, { required: true })}
      ${F.select('assetId', 'Used on asset', p.assetId, assetOptions())}
      <div class="f2">
        <div>${F.text('mfrPn', 'Manufacturer part number', p.mfrPn)}</div>
        <div>${F.text('vendor', 'Vendor', p.vendor)}</div>
        <div>${F.text('location', 'Storage location', p.location, { placeholder: 'e.g. SP1-E3-A5' })}</div>
        <div>${F.num('cost', 'Unit cost', p.cost, { step: '0.01' })}</div>
        <div>${F.num('qty', 'Quantity on hand', p.qty, { step: '1' })}</div>
        <div>${F.num('min', 'Minimum quantity', p.min, { step: '1' })}</div>
        <div>${F.num('max', 'Maximum quantity', p.max, { step: '1' })}</div>
      </div>`,
    footer: `
      <button class="btn filled" onclick="savePart(${isNew})">Save part</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delPart('${esc(p.id)}')">Delete</button>` : ''}`
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

/* Quick cycle-count entry */
function countPart(id) {
  const p = DB.get('parts', id);
  const v = prompt('Quantity on hand for ' + id + ' (' + (p.description || '') + '):', p.qty ?? '');
  if (v === null) return;
  DB.upsert('parts', { id, qty: v.trim() });
  route();
  toast(id + ' counted — ' + v + ' on hand');
}

/* ============================================================
   WORK ORDERS
   ============================================================ */
function renderWO() {
  let rows = DB.all('wos').filter(w =>
    matches(w, ['id', 'description', 'assetId', 'assignedTo', 'requestedBy', 'status']));
  rows.sort((a, b) => (b.dateRequested || '').localeCompare(a.dateRequested || ''));

  const open = rows.filter(w => !['Completed', 'Cancelled'].includes(w.status));
  const done = rows.filter(w => w.status === 'Completed');
  const hours = done.reduce((s, w) => s + (DB.num(w.hours) || 0), 0);
  const cost = rows.reduce((s, w) => s + (DB.num(w.cost) || 0), 0);

  return `
  <h1 class="page">Work Orders</h1>
  <p class="sub">${rows.length} work order${rows.length === 1 ? '' : 's'} on record</p>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="n">${open.length}</div><div class="l">Open</div></div>
    <div class="stat"><div class="n">${done.length}</div><div class="l">Completed</div></div>
    <div class="stat"><div class="n">${hours.toFixed(1)}<small style="font-size:15px">h</small></div><div class="l">Labour logged</div></div>
    <div class="stat"><div class="n">${cost ? '$' + cost.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div><div class="l">Recorded cost</div></div>
  </div>

  <div class="chipset">
    <button class="btn filled" onclick="editWO()">&#43; New work order</button>
    <button class="btn out" onclick="exportCSV('wos')">Export CSV</button>
  </div>

  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">All work orders</h3>
    ${renderTable([
      { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}${r.pmId ? ' · from ' + esc(r.pmId) : ''}</small>` },
      { label: 'Type', render: r => `<span class="chip c-open">${esc(r.type || '—')}</span>` },
      { label: 'Priority', render: r => prioChip(r.priority) },
      { label: 'Assigned to', render: r => r.assignedTo ? esc(r.assignedTo) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: 'Requested', render: r => fmtDate(r.dateRequested) },
      { label: 'Hours', num: true, render: r => r.hours ?? '—' },
      { label: 'Status', render: r => statusChip(r.status) }
    ], rows, { empty: 'No work orders yet.', onRow: 'editWO' })}
  </div>`;
}

function editWO(id) {
  const w = id ? DB.get('wos', id) : {};
  const isNew = !id;
  const partOpts = [{ v: '', t: '— none —' }].concat(
    DB.all('parts').map(p => ({ v: p.id, t: p.id + ' · ' + (p.description || '') })));
  Modal.open({
    title: isNew ? 'New work order' : 'Work order ' + w.id,
    body: `
      ${F.text('id', 'Work order number', w.id || DB.nextId('wos', 'WO-', 4), { required: true, readonly: !isNew })}
      ${F.select('assetId', 'Asset', w.assetId, assetOptions(), { required: true })}
      ${F.area('description', 'Description of work', w.description, 3)}
      <div class="f2">
        <div>${F.select('type', 'Work type', w.type || 'Repair', WO_TYPES)}</div>
        <div>${F.select('priority', 'Priority', w.priority || 'Medium', PRIORITIES)}</div>
        <div>${F.text('requestedBy', 'Requested by', w.requestedBy)}</div>
        <div>${F.text('assignedTo', 'Assigned to', w.assignedTo)}</div>
        <div>${F.date('dateRequested', 'Date requested', w.dateRequested || today())}</div>
        <div>${F.date('dateStarted', 'Date started', w.dateStarted)}</div>
        <div>${F.date('dateCompleted', 'Date completed', w.dateCompleted)}</div>
        <div>${F.select('status', 'Status', w.status || 'Open', WO_STATUS)}</div>
        <div>${F.num('hours', 'Labour hours', w.hours, { step: '0.5' })}</div>
        <div>${F.num('cost', 'Cost', w.cost, { step: '0.01' })}</div>
      </div>
      ${F.select('cause', 'Cause of failure', w.cause || 'To be determined', CAUSES)}
      ${F.select('partsUsed', 'Parts used', w.partsUsed, partOpts)}
      ${F.area('notes', 'Technician notes', w.notes, 3)}`,
    footer: `
      <button class="btn filled" onclick="saveWO(${isNew})">Save work order</button>
      ${!isNew && w.status !== 'Completed' ? `<button class="btn ok" onclick="closeWO('${esc(w.id)}')">Complete</button>` : ''}
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew ? `<button class="btn bad" style="margin-left:auto" onclick="delWO('${esc(w.id)}')">Delete</button>` : ''}`
  });
}

function saveWO(isNew) {
  const d = F.read();
  if (!d.id) { toast('Work order number is required'); return; }
  if (isNew && DB.get('wos', d.id)) { toast('That work order number already exists'); return; }
  DB.upsert('wos', d);
  Modal.close(); route(); toast('Work order ' + d.id + ' saved');
}

/* Completion gate: cause of failure must be recorded before closing */
function closeWO(id) {
  const d = F.read();
  if (!d.cause || d.cause === 'To be determined') {
    toast('Record a cause of failure before completing');
    return;
  }
  d.status = 'Completed';
  if (!d.dateCompleted) d.dateCompleted = today();
  DB.upsert('wos', d);

  /* If this WO came from a PM, roll that PM forward too */
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
        <select onchange="setMap('${esc(h).replace(/'/g, "\\'")}',this.value)">
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
  document.getElementById('drop').classList.remove('over');
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
  cancelImport();
  toast(`Imported — ${added} added, ${updated} updated`);
  location.hash = '#/' + ({ assets: 'assets', pms: 'pm', parts: 'parts', wos: 'wo' }[IMPORT.entity]);
}

/* ---------- export ---------- */
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
      <div>${F.text('publisher', 'Your name (stamped on publish)', db.meta.publishedBy || '')}</div>
      <div>
        <label>Last pulled</label>
        <input readonly value="${db.meta.lastPull ? fmtDate(db.meta.lastPull.slice(0, 10)) : 'never'}"/>
      </div>
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
    <p style="color:var(--muted);margin:0 0 4px">Loads asset 3526 Top Roll Assembly with seven PM schedules, nine spare parts and one open work order.</p>
    <div class="actions">
      <button class="btn out" onclick="seedSample()">Load sample data</button>
      <button class="btn bad" style="margin-left:auto" onclick="wipeAll()">Erase everything</button>
    </div>
  </div>`;
}

function saveSite(v) { const db = DB.raw(); db.meta.site = v; DB.save(); toast('Site name saved'); }

/* ---------- shared repo data ---------- */
function publishShared() {
  const who = (document.getElementById('f_publisher') || {}).value || '';
  if (!who.trim()) { toast('Enter your name first — it gets stamped on the file'); return; }
  const db = DB.raw(); db.meta.publishedBy = who.trim(); DB.save();
  const at = Repo.publish(who.trim());
  toast('db.json downloaded — commit it to data/shared/ to publish');
  const s = document.getElementById('syncStatus');
  if (s) s.innerHTML = `<div class="note">Stamped <b>${esc(who)}</b> at ${esc(at.slice(0, 16).replace('T', ' '))}. Now commit the file.</div>`;
}

function checkShared() {
  const s = document.getElementById('syncStatus');
  if (s) s.innerHTML = '<div class="note">Checking…</div>';
  Repo.checkForUpdates().then(info => {
    const c = info.counts;
    const line = `${c.assets} assets · ${c.pms} PMs · ${c.parts} parts · ${c.wos} work orders`;
    if (!s) return;
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
    { id: '3527', name: 'Air Compressor #1', manufacturer: 'Atlas Copco', project: '', location: 'Utilities room', status: 'Active' }
  ]);

  DB.bulkUpsert('pms', [
    { id: 'PM-003', assetId: '3526', description: 'Inspect and clean sonotrodes/anvils; check ultrasonic weld quality and tighten stack hardware', frequency: 'weekly', nextDue: plus(2) },
    { id: 'PM-004', assetId: '3526', description: 'Clean/replace main air supply filters and moisture separators; verify regulator settings', frequency: 'monthly', nextDue: plus(25) },
    { id: 'PM-005', assetId: '3526', description: 'Lubricate sliding and rotating components; check air-line lubricator drip', frequency: 'monthly', nextDue: plus(25) },
    { id: 'PM-006', assetId: '3526', description: 'Clean photo-eyes/sensors and air blow-off nozzles; verify nest cleaning function', frequency: 'monthly', nextDue: plus(25) },
    { id: 'PM-007', assetId: '3526', description: 'Inspect ultrasonic generators and tightening controller; verify fault-free operation', frequency: 'quarterly', nextDue: plus(86) },
    { id: 'PM-008', assetId: '3526', description: 'Inspect guarding, safety interlocks, E-stops and light curtains; confirm no air leaks', frequency: 'quarterly', nextDue: plus(86) },
    { id: 'PM-009', assetId: '3526', description: 'Back up PLC/servo programs; review hour-meter counters and inspect servo drives', frequency: 'annually', nextDue: plus(360) }
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
    {
      id: 'WO-1001', assetId: '3526', description: 'Oil leak at compressor head', type: 'Repair',
      priority: 'High', requestedBy: 'Chris Myers', assignedTo: 'John Davis',
      dateRequested: DB.addDays(d, -7), dateStarted: DB.addDays(d, -6),
      hours: '4.0', cost: '450', status: 'In Progress', cause: 'To be determined'
    }
  ]);

  route();
  toast('Sample data loaded — 2 assets, 7 PMs, 10 parts, 1 work order');
}

/* ============================================================
   BOOT
   ============================================================ */
(function boot() {
  if (!location.hash) location.hash = '#/dashboard';
  route();
  /* First run on a new machine: load the shared repo copy automatically,
     so a colleague opening the link sees the plant data, not an empty app. */
  if (typeof Repo !== 'undefined') {
    Repo.seedIfEmpty().then(loaded => {
      if (loaded) {
        route();
        toast('Loaded the shared plant data from the repo');
      }
    }).catch(() => { /* offline or no shared file — app still works locally */ });
  }
})();
