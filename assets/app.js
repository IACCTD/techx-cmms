/* ============================================================
   app.js — router + screens
   ============================================================ */

const FREQS = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annually'];
const WO_TYPES = ['Repair', 'Preventive', 'Improvement', 'Troubleshoot', 'Inspection'];
const WO_STATUS = ['Open', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const CAUSES = ['To be determined', 'Wear / end of life', 'Seal failure', 'Loose fastener',
  'Contamination', 'Operator damage', 'Electrical fault', 'Software / program', 'Unknown'];
const ROLE_LABEL = { admin: 'Admin', maintenance: 'Maintenance' };

let SEARCH = '';
let WO_VIEW = 'list';
let WO_FILTER = 'all';
let CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), pms: true };
let USERS = [];

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {
  home: renderHome, dashboard: renderDashboard, assets: renderAssets, asset: renderAssetDetail,
  pm: renderPM, parts: renderParts, wo: renderWO, qr: renderQR,
  import: renderImport, users: renderUsers, settings: renderSettings, login: renderLogin
};

/* Screens only an admin may open. */
const ADMIN_ROUTES = ['import', 'users'];

function route() {
  const hash = (location.hash || '#/home').replace('#/', '');
  const parts = hash.split('/');
  const name = parts[0];
  const param = parts[1] ? decodeURIComponent(parts[1]) : null;
  const st = DB.status();

  if (!st.signedIn && name !== 'login') {
    document.getElementById('view').innerHTML = renderLogin();
    updateChrome();
    return;
  }

  if (ADMIN_ROUTES.includes(name) && !DB.isAdmin()) {
    document.getElementById('view').innerHTML = renderNoAccess(name);
    updateChrome();
    return;
  }

  const fn = ROUTES[name] || renderHome;
  document.querySelectorAll('.rail .nav').forEach(a =>
    a.classList.toggle('active', a.dataset.s === name || (name === 'asset' && a.dataset.s === 'assets')));
  document.getElementById('view').innerHTML = fn(param);
  updateChrome();
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

function renderNoAccess(name) {
  return `<h1 class="page">Not available</h1>
    <p class="sub">The <b>${esc(name === 'users' ? 'Users' : 'Import CSV')}</b> screen is for admins.</p>
    <div class="placeholder">
      <div style="font-size:30px">&#128274;</div>
      <b style="display:block;margin:10px 0 6px;color:var(--ink);font-size:16px">Admins only</b>
      <span>You are signed in as <b>${esc(DB.getWho())}</b> (Maintenance).
      Ask an admin if you need this.</span>
      <div class="actions" style="justify-content:center"><a class="btn filled" href="#/home">Back to home</a></div>
    </div>`;
}

/* Hide admin-only nav items and update the connection badge. */
function updateChrome() {
  const admin = DB.isAdmin();
  document.querySelectorAll('.rail .adminonly').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });

  const el = document.getElementById('connBadge');
  if (!el) return;
  const s = DB.status();
  if (!s.signedIn) { el.className = 'connchip off'; el.textContent = 'Signed out'; return; }
  const tag = s.role === 'admin' ? ' · Admin' : '';
  if (s.mode === 'cloud') {
    el.className = 'connchip on';
    el.textContent = '● ' + (s.who || 'Live') + tag;
  } else {
    el.className = 'connchip warn';
    el.textContent = s.pending ? '⚠ Offline · ' + s.pending + ' queued' : '⚠ Offline';
  }
}

/* ============================================================
   LOGIN
   ============================================================ */
function renderLogin() {
  return `
  <div class="loginwrap">
    <div class="card loginbox">
      <div class="mark big">TX</div>
      <h1>Tech X Maintenance</h1>
      <p class="sub">Sign in with your own account.</p>
      <label for="loginUser">Username</label>
      <input id="loginUser" autocomplete="username" placeholder="e.g. jdavis"
        onkeydown="if(event.key==='Enter')document.getElementById('loginPass').focus()"/>
      <label for="loginPass">Password</label>
      <input id="loginPass" type="password" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')doLogin()"/>
      <div id="loginMsg"></div>
      <div class="actions">
        <button class="btn filled" onclick="doLogin()">Sign in</button>
      </div>
      <div class="note">Every change you make is recorded under your name.
      If you have forgotten your password, an admin can reset it for you.</div>
    </div>
  </div>`;
}

function doLogin() {
  const u = (document.getElementById('loginUser') || {}).value || '';
  const p = (document.getElementById('loginPass') || {}).value || '';
  const msg = document.getElementById('loginMsg');
  if (!u.trim() || !p) {
    if (msg) msg.innerHTML = '<div class="note bad">Enter your username and password.</div>';
    return;
  }
  if (msg) msg.innerHTML = '<div class="note">Signing in…</div>';

  DB.login(u.trim(), p).then(user => {
    return DB.connect().then(r => {
      if (r.mode === 'cloud') DB.startPolling(15);
      location.hash = '#/home';
      route();
      toast('Signed in as ' + user.name);
      if (user.mustChange) {
        setTimeout(() => {
          openChangePassword(true);
        }, 400);
      }
    });
  }).catch(e => {
    if (msg) msg.innerHTML = `<div class="note bad">${esc(e.message || 'Could not sign in')}</div>`;
  });
}

function signOut() {
  confirmDelete('Sign out?', () => {
    DB.logout().then(() => { location.hash = '#/login'; route(); toast('Signed out'); });
  });
}

function openChangePassword(forced) {
  Modal.open({
    title: forced ? 'Set your own password' : 'Change password',
    body: `${forced ? '<div class="note">Your account was created with a temporary password. Choose your own now.</div>' : ''}
      ${F.text('current', 'Current password', '', { type: 'password', autocomplete: 'current-password' })}
      ${F.text('next', 'New password', '', { type: 'password', autocomplete: 'new-password' })}
      ${F.text('confirm', 'Repeat new password', '', { type: 'password', autocomplete: 'new-password' })}
      <div id="pwMsg"></div>
      <div class="note">At least 6 characters. Changing this signs you out on any other device.</div>`,
    footer: `<button class="btn filled" onclick="doChangePassword()">Save password</button>
      <button class="btn out" onclick="Modal.close()">${forced ? 'Later' : 'Cancel'}</button>`
  });
}

function doChangePassword() {
  const d = F.read();
  const msg = document.getElementById('pwMsg');
  const show = t => { if (msg) msg.innerHTML = `<div class="note bad">${esc(t)}</div>`; };
  if (!d.current) return show('Enter your current password.');
  if ((d.next || '').length < 6) return show('New password must be at least 6 characters.');
  if (d.next !== d.confirm) return show('The two new passwords do not match.');

  DB.changePassword(d.current, d.next)
    .then(() => { Modal.close(); toast('Password changed'); })
    .catch(e => show(e.message || 'Could not change password'));
}

/* ============================================================
   USERS (admin)
   ============================================================ */
function renderUsers() {
  /* Loaded asynchronously; refreshUsers() re-renders when it lands. */
  if (!USERS.length) refreshUsers();
  const meU = DB.status().username;

  return `
  <h1 class="page">Users</h1>
  <p class="sub">${USERS.length ? USERS.length + ' account' + (USERS.length === 1 ? '' : 's') : 'Loading…'}</p>

  <div class="chipset">
    <button class="btn filled" onclick="openAddUser()">&#43; Add person</button>
    <button class="btn out" onclick="refreshUsers()">Refresh</button>
  </div>

  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">Accounts</h3>
    ${renderTable([
      { label: 'Name', render: r => `<b>${esc(r.full_name)}</b>${r.username === meU ? ' <span class="chip c-open">you</span>' : ''}` },
      { label: 'Username', render: r => `<span class="mono">${esc(r.username)}</span>` },
      { label: 'Role', render: r => `<span class="chip ${r.role === 'admin' ? 'c-pur' : 'c-open'}">${esc(ROLE_LABEL[r.role] || r.role)}</span>` },
      { label: 'Status', render: r => r.active
          ? '<span class="chip c-done">Active</span>'
          : '<span class="chip c-hold">Disabled</span>' },
      { label: 'Last signed in', hideSm: true, render: r => r.last_login ? fmtDateTime(r.last_login) : '<span style="color:var(--muted)">never</span>' },
      { label: '', render: r => `<button class="btn out sm" onclick="event.stopPropagation();openEditUser('${jsq(r.username)}')">Manage</button>` }
    ], USERS, { empty: 'No accounts loaded yet.' })}
  </div>

  <div class="card">
    <h3 class="sec">What each role can do</h3>
    <div class="tablewrap"><table>
      <thead><tr><th>Action</th><th>Maintenance</th><th>Admin</th></tr></thead>
      <tbody>
        <tr><td>View everything</td><td>&#10003;</td><td>&#10003;</td></tr>
        <tr><td>Create and edit work orders</td><td>&#10003;</td><td>&#10003;</td></tr>
        <tr><td>Complete work orders and PMs</td><td>&#10003;</td><td>&#10003;</td></tr>
        <tr><td>Add and edit assets, PMs, parts</td><td>&#10003;</td><td>&#10003;</td></tr>
        <tr><td>Count spare parts</td><td>&#10003;</td><td>&#10003;</td></tr>
        <tr><td><b>Delete</b> anything</td><td style="color:var(--muted)">—</td><td>&#10003;</td></tr>
        <tr><td><b>Import CSV</b></td><td style="color:var(--muted)">—</td><td>&#10003;</td></tr>
        <tr><td><b>Manage users</b></td><td style="color:var(--muted)">—</td><td>&#10003;</td></tr>
        <tr><td><b>Change site settings</b></td><td style="color:var(--muted)">—</td><td>&#10003;</td></tr>
      </tbody>
    </table></div>
    <div class="note">Deleting is admin-only on purpose: it is the one action that can quietly
    destroy a machine's history. Everything a technician needs day to day is available to both roles.</div>
  </div>`;
}

function refreshUsers() {
  DB.listUsers().then(r => {
    USERS = r.users || [];
    if ((location.hash || '').startsWith('#/users')) route();
  }).catch(e => toast(e.message || 'Could not load users'));
}

function openAddUser() {
  Modal.open({
    title: 'Add person',
    body: `${F.text('name', 'Full name', '', { required: true, placeholder: 'e.g. John Davis' })}
      ${F.text('username', 'Username', '', { required: true, placeholder: 'e.g. jdavis', autocomplete: 'off' })}
      ${F.select('role', 'Role', 'maintenance', [
        { v: 'maintenance', t: 'Maintenance — everyday work' },
        { v: 'admin', t: 'Admin — everything, including users' }])}
      ${F.text('password', 'Temporary password', '', { required: true, type: 'text', autocomplete: 'off' })}
      <div id="userMsg"></div>
      <div class="note">Give them the temporary password in person. They will be asked to
      choose their own the first time they sign in.</div>`,
    footer: `<button class="btn filled" onclick="doAddUser()">Create account</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>`
  });
}

function doAddUser() {
  const d = F.read();
  const msg = document.getElementById('userMsg');
  const show = t => { if (msg) msg.innerHTML = `<div class="note bad">${esc(t)}</div>`; };
  if (!d.name) return show('Enter their full name.');
  if (!/^[a-z0-9._-]{3,32}$/.test((d.username || '').toLowerCase())) {
    return show('Username must be 3–32 characters: letters, numbers, dot, dash or underscore.');
  }
  if ((d.password || '').length < 6) return show('Temporary password must be at least 6 characters.');

  DB.addUser({ name: d.name, username: d.username.toLowerCase(), role: d.role, password: d.password })
    .then(() => { Modal.close(); refreshUsers(); toast(d.name + ' can now sign in'); })
    .catch(e => show(e.message || 'Could not create the account'));
}

function openEditUser(username) {
  const u = USERS.find(x => x.username === username);
  if (!u) return;
  const isMe = DB.status().username === username;

  Modal.open({
    title: 'Manage ' + u.full_name,
    body: `${F.text('name', 'Full name', u.full_name)}
      ${F.text('username', 'Username', u.username, { readonly: true })}
      ${F.select('role', 'Role', u.role, [
        { v: 'maintenance', t: 'Maintenance — everyday work' },
        { v: 'admin', t: 'Admin — everything, including users' }])}
      ${isMe ? '<div class="note">This is your own account. You cannot lock yourself out.</div>' : ''}
      <div id="userMsg"></div>
      <h3 class="sec" style="margin-top:22px">Reset password</h3>
      ${F.text('password', 'New temporary password', '', { type: 'text', autocomplete: 'off', placeholder: 'leave blank to keep current' })}
      <div class="note">Resetting signs them out everywhere and asks them to pick a new
      password next time they sign in.</div>`,
    footer: `<button class="btn filled" onclick="doUpdateUser('${jsq(username)}')">Save changes</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isMe ? (u.active
        ? `<button class="btn bad" style="margin-left:auto" onclick="setUserActive('${jsq(username)}',false)">Disable</button>`
        : `<button class="btn ok" style="margin-left:auto" onclick="setUserActive('${jsq(username)}',true)">Re-enable</button>`) : ''}`
  });
}

function doUpdateUser(username) {
  const d = F.read();
  const msg = document.getElementById('userMsg');
  const show = t => { if (msg) msg.innerHTML = `<div class="note bad">${esc(t)}</div>`; };
  const payload = { username, name: d.name, role: d.role };
  if (d.password) {
    if (d.password.length < 6) return show('Password must be at least 6 characters.');
    payload.password = d.password;
  }
  DB.updateUser(payload)
    .then(() => { Modal.close(); refreshUsers(); toast('Account updated'); })
    .catch(e => show(e.message || 'Could not update the account'));
}

function setUserActive(username, active) {
  const u = USERS.find(x => x.username === username);
  const msg = active ? `Re-enable ${u ? u.full_name : username}?`
    : `Disable ${u ? u.full_name : username}?\n\nThey will be signed out immediately and cannot sign back in. Their work history stays.`;
  confirmDelete(msg, () => {
    DB.updateUser({ username, active })
      .then(() => { Modal.close(); refreshUsers(); toast(active ? 'Account re-enabled' : 'Account disabled'); })
      .catch(e => toast(e.message || 'Could not change the account'));
  });
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  const assets = DB.all('assets'), wos = DB.all('wos'), pms = DB.all('pms');
  const openWos = wos.filter(DB.isOpen);
  const progWos = wos.filter(w => w.status === 'In Progress');
  const duePms = pms.filter(p => { const d = DB.daysUntil(p.nextDue); return d !== null && d <= 7; });
  const recent = (DB.raw().meta.recentAssets || []).map(id => DB.get('assets', id)).filter(Boolean);
  const mine = wos.filter(w => DB.isActive(w) && (w.assignedTo || '') === DB.getWho());

  if (!assets.length && !wos.length) {
    return `<h1 class="page">Welcome, ${esc(DB.getWho())}</h1>
      <p class="sub">The database is empty.</p>
      <div class="placeholder">
        <div style="font-size:34px">&#128736;</div>
        <b style="display:block;margin:10px 0 6px;color:var(--ink);font-size:16px">Start here</b>
        <span>${DB.isAdmin() ? 'Import your asset list, or load sample data to look around.' : 'Ask an admin to import the asset list.'}</span>
        <div class="actions" style="justify-content:center">
          ${DB.isAdmin() ? `<a class="btn filled" href="#/import">Import CSV</a>
          <button class="btn out" onclick="seedSample()">Load sample data</button>` : ''}
          <button class="btn out" onclick="editAsset()">Add first asset</button>
        </div>
      </div>`;
  }

  return `
  <h1 class="page">Home</h1>
  <p class="sub">${esc(DB.raw().meta.site || 'Maintenance')} · signed in as <b>${esc(DB.getWho())}</b> (${esc(ROLE_LABEL[DB.role()] || DB.role())})</p>

  <div class="hub">
    <a class="tile" href="#/assets">
      <div class="ic">&#128451;</div><h2>Find an Asset</h2>
      <p>Search the plant by name or asset number, or scan the QR tag on the machine.</p>
      <ul><li>Asset name / serial number</li><li>Recent repairs and work orders</li><li>Machine BOM and parts info</li></ul>
    </a>
    <a class="tile" href="#/wo">
      <div class="ic">&#129534;</div><h2>Work Orders</h2>
      <p>Create or complete work, in a list or on the calendar.</p>
      <ul><li>${openWos.length} pending · ${progWos.length} in progress</li>
      <li>PM program, schedule and frequency</li><li>Generate a WO from any PM</li></ul>
    </a>
    <div class="tile soon">
      <div class="ic">&#129302;</div><h2>AI Assist</h2>
      <p>Troubleshooting, fault, cause and corrective action — reserved for a later phase.</p>
      <ul><li>Not connected yet</li></ul>
    </div>
  </div>

  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat click" onclick="location.hash='#/assets'"><div class="n">${assets.length}</div><div class="l">Assets in plant</div></div>
    <div class="stat click" onclick="WO_FILTER='open';location.hash='#/wo'">
      <div class="n" style="color:${openWos.length ? 'var(--pri)' : 'inherit'}">${openWos.length}</div><div class="l">Pending work orders</div></div>
    <div class="stat click" onclick="WO_FILTER='progress';location.hash='#/wo'">
      <div class="n" style="color:${progWos.length ? 'var(--warn)' : 'inherit'}">${progWos.length}</div><div class="l">In progress</div></div>
    <div class="stat click" onclick="location.hash='#/pm'">
      <div class="n" style="color:${duePms.length ? 'var(--bad)' : 'inherit'}">${duePms.length}</div><div class="l">PMs due within 7 days</div></div>
  </div>

  ${mine.length ? `<div class="card">
    <h3 class="sec">Assigned to you</h3>
    ${renderTable([
      { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Work', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
      { label: 'Priority', render: r => prioChip(r.priority) },
      { label: 'Status', render: r => statusChip(r.status) }
    ], mine, { onRow: 'editWO' })}
  </div>` : ''}

  ${recent.length ? `<div class="card"><h3 class="sec">Recently viewed assets</h3>
    ${recent.map(a => `<a class="pill" href="#/asset/${encodeURIComponent(a.id)}"><b>${esc(a.id)}</b> <small>${esc(a.name)}</small></a>`).join('')}
  </div>` : ''}

  <div class="card">
    <h3 class="sec">Quick actions</h3>
    <div class="actions" style="margin-top:0">
      <button class="btn filled" onclick="editWO()">&#43; New work order</button>
      <button class="btn out" onclick="editAsset()">&#43; New asset</button>
      <a class="btn out" href="#/wo">Work order calendar</a>
      <a class="btn out" href="#/qr">Print QR tags</a>
    </div>
  </div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const assets = DB.all('assets'), pms = DB.all('pms'), parts = DB.all('parts'), wos = DB.all('wos');
  const openWos = wos.filter(DB.isActive);
  const duePms = pms.filter(p => { const d = DB.daysUntil(p.nextDue); return d !== null && d <= 7; })
    .sort((a, b) => (a.nextDue || '').localeCompare(b.nextDue || ''));
  const lowParts = parts.filter(p => DB.partStatus(p).label === 'Low stock');
  const uncounted = parts.filter(p => DB.num(p.qty) === null);

  const stat = (ic, bg, col, n, l, d) => `
    <div class="stat"><div class="ic" style="background:${bg};color:${col}">${ic}</div>
      <div class="n">${n}</div><div class="l">${esc(l)}</div>${d ? `<div class="d">${esc(d)}</div>` : ''}</div>`;

  return `
  <h1 class="page">Dashboard</h1>
  <p class="sub">${esc(DB.raw().meta.site || 'Maintenance overview')}</p>
  <div class="grid g4" style="margin-bottom:20px">
    ${stat('&#128451;','var(--info-c)','var(--pri)',assets.length,'Assets registered')}
    ${stat('&#129534;','var(--bad-c)','var(--bad)',openWos.length,'Open work orders',
      openWos.filter(w=>w.priority==='High').length+' high priority')}
    ${stat('&#128197;','var(--warn-c)','var(--warn)',duePms.length,'PMs due within 7 days',pms.length+' scheduled total')}
    ${stat('&#128230;',lowParts.length?'var(--bad-c)':'var(--ok-c)',lowParts.length?'var(--bad)':'var(--ok)',
      lowParts.length,'Parts at or below min',uncounted.length+' never counted')}
  </div>
  <div class="grid g2">
    <div class="card"><h3 class="sec">PMs due next</h3>
      ${renderTable([
        { label: 'PM', key: 'id' },
        { label: 'Task', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
        { label: 'Due', render: r => dueChip(r.nextDue) },
        { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${jsq(r.id)}')">Generate WO</button>` }
      ], duePms.slice(0, 6), { empty: 'Nothing due in the next 7 days.', onRow: 'editPM' })}
      <div class="actions"><a class="btn out sm" href="#/pm">Open PM plan</a></div>
    </div>
    <div class="card"><h3 class="sec">Open work orders</h3>
      ${renderTable([
        { label: 'WO', key: 'id' },
        { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}</small>` },
        { label: 'Priority', render: r => prioChip(r.priority) },
        { label: 'Status', render: r => statusChip(r.status) }
      ], openWos.slice(0, 6), { empty: 'No open work orders.', onRow: 'editWO' })}
      <div class="actions"><a class="btn out sm" href="#/wo">Open work orders</a></div>
    </div>
  </div>
  ${lowParts.length ? `<div class="card"><h3 class="sec">Low stock — reorder</h3>
    ${renderTable([
      { label: 'Part', key: 'id' }, { label: 'Description', key: 'description' },
      { label: 'Location', render: r => `<span class="mono">${esc(r.location || '—')}</span>` },
      { label: 'On hand', num: true, render: r => esc(r.qty) },
      { label: 'Min', num: true, render: r => esc(r.min) },
      { label: 'Vendor', key: 'vendor', hideSm: true }
    ], lowParts, { onRow: 'editPart' })}</div>` : ''}
  ${uncounted.length ? `<div class="note"><b>${uncounted.length} part${uncounted.length===1?'':'s'} have no quantity on hand recorded.</b>
    Low-stock alerts stay switched off until those are counted. <a href="#/parts">Open spare parts</a>.</div>` : ''}`;
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
  const c = s === 'Completed' ? 'c-done' : s === 'In Progress' ? 'c-prog' : s === 'Open' ? 'c-open' : 'c-hold';
  return `<span class="chip ${c}">${esc(s || 'Open')}</span>`;
}

/* ============================================================
   ASSETS
   ============================================================ */
function renderAssets() {
  const rows = DB.all('assets').filter(a =>
    matches(a, ['id', 'name', 'manufacturer', 'model', 'serial', 'project', 'location']));
  return `
  <h1 class="page">Assets</h1>
  <p class="sub">${rows.length} asset${rows.length===1?'':'s'}${SEARCH?` matching “${esc(SEARCH)}”`:' in the register'} — tap a row to open its dashboard</p>
  <div class="chipset">
    <button class="btn filled" onclick="editAsset()">&#43; New asset</button>
    <a class="btn out" href="#/qr">QR tags</a>
    <button class="btn out" onclick="exportCSV('assets')">Export CSV</button>
    ${DB.isAdmin() ? '<a class="btn out" href="#/import">Import CSV</a>' : ''}
  </div>
  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">Asset register</h3>
    ${renderTable([
      { label: 'Asset ID', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Equipment name', render: r => `<b>${esc(r.name || '—')}</b>${r.location ? `<br><small style="color:var(--muted)">${esc(r.location)}</small>` : ''}` },
      { label: 'Manufacturer', key: 'manufacturer', hideSm: true },
      { label: 'Status', render: r => `<span class="chip ${r.status==='Down'?'c-crit':r.status==='Retired'?'c-hold':'c-done'}">${esc(r.status || 'Active')}</span>` },
      { label: 'Open WOs', num: true, render: r => {
          const n = DB.forAsset('wos', r.id).filter(DB.isActive).length;
          return n ? `<b style="color:var(--bad)">${n}</b>` : '0'; } },
      { label: 'PMs', num: true, hideSm: true, render: r => DB.forAsset('pms', r.id).length },
      { label: 'Parts', num: true, hideSm: true, render: r => DB.forAsset('parts', r.id).length },
      { label: '', hideSm: true, render: r => `<button class="btn out sm" onclick="event.stopPropagation();editAsset('${jsq(r.id)}')">Edit</button>` }
    ], rows, { empty: SEARCH ? 'No assets match that search.' : 'No assets yet.', onRow: 'openAsset' })}
  </div>`;
}

/* ============================================================
   ASSET DETAIL
   ============================================================ */
function renderAssetDetail(id) {
  const a = DB.get('assets', id);
  if (!a) {
    return `<h1 class="page">Asset not found</h1>
      <p class="sub">No asset with ID “${esc(id)}”.</p>
      <a class="btn filled" href="#/assets">Back to assets</a>`;
  }
  DB.touchAsset(id);

  const wos = DB.forAsset('wos', id), pms = DB.forAsset('pms', id), parts = DB.forAsset('parts', id);
  const pending = wos.filter(DB.isOpen);
  const prog = wos.filter(w => w.status === 'In Progress');
  const done = wos.filter(DB.isDone);
  const incoming = pms.filter(p => { const d = DB.daysUntil(p.nextDue); return d !== null && d >= 0 && d <= 30; });
  const recentRepairs = done.sort((x, y) => (y.dateCompleted || '').localeCompare(x.dateCompleted || '')).slice(0, 5);
  const lowParts = parts.filter(p => DB.partStatus(p).label === 'Low stock').length;

  return `
  <div class="crumb"><a href="#/home">Home</a> › <a href="#/assets">Assets</a> › ${esc(a.id)}</div>
  <div class="ahead">
    <div class="big">&#9881;</div>
    <div class="who">
      <h1>${esc(a.name || a.id)}</h1>
      <div class="meta">
        Asset <b class="mono">${esc(a.id)}</b>${a.serial ? ` · Serial <b class="mono">${esc(a.serial)}</b>` : ''}<br>
        ${a.manufacturer ? esc(a.manufacturer) : 'Manufacturer not set'}${a.model ? ' · ' + esc(a.model) : ''}${a.location ? ' · ' + esc(a.location) : ''}${a.project ? ' · Project ' + esc(a.project) : ''}
      </div>
      ${a.notes ? `<div class="note" style="margin-top:12px">${esc(a.notes)}</div>` : ''}
      <div style="margin-top:12px"><span class="chip ${a.status==='Down'?'c-crit':a.status==='Retired'?'c-hold':'c-done'}" style="font-size:13px;padding:8px 14px">${esc(a.status || 'Active')}</span></div>
    </div>
    <div class="qrbox hide-print">
      ${qrSvg(assetUrl(a.id), 116)}<small>Scan to open</small>
      <button class="btn out sm" style="margin-top:8px" onclick="showQR('${jsq(a.id)}')">Tag</button>
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
      <div class="d">${pending.filter(w=>w.priority==='High').length} high priority</div></div>
    <div class="stat"><div class="ic" style="background:var(--warn-c);color:var(--warn)">&#128295;</div>
      <div class="n">${prog.length}</div><div class="l">In progress</div></div>
    <div class="stat"><div class="ic" style="background:var(--pur-c);color:var(--pur)">&#128197;</div>
      <div class="n">${incoming.length}</div><div class="l">Incoming PMs (30 days)</div>
      <div class="d">${pms.length} on the program</div></div>
    <div class="stat"><div class="ic" style="background:var(--ok-c);color:var(--ok)">&#9989;</div>
      <div class="n">${done.length}</div><div class="l">Completed</div>
      <div class="d">${done.reduce((s,w)=>s+(DB.num(w.hours)||0),0).toFixed(1)}h logged</div></div>
  </div>

  <div class="grid g2">
    <div class="card"><h3 class="sec">Recent repairs — last 5 completed</h3>
      ${renderTable([
        { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
        { label: 'Work done', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(r.cause || 'No cause recorded')}${r.updatedBy ? ' · ' + esc(r.updatedBy) : ''}</small>` },
        { label: 'Completed', render: r => fmtDate(r.dateCompleted) },
        { label: 'Hrs', num: true, hideSm: true, render: r => r.hours ?? '—' }
      ], recentRepairs, { empty: 'No completed repairs on this asset yet.', onRow: 'editWO' })}
    </div>
    <div class="card"><h3 class="sec">Open work orders</h3>
      ${renderTable([
        { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
        { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b>` },
        { label: 'Priority', render: r => prioChip(r.priority) },
        { label: 'Status', render: r => statusChip(r.status) }
      ], wos.filter(DB.isActive), { empty: 'Nothing open on this asset.', onRow: 'editWO' })}
    </div>
  </div>

  <div class="card"><h3 class="sec">PM program — schedule and frequency</h3>
    ${renderTable([
      { label: 'PM', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Task', render: r => `<b>${esc(r.description || '—')}</b>` },
      { label: 'Frequency', render: r => `<span class="chip c-open">${esc(r.frequency || '—')}</span>` },
      { label: 'Next due', render: r => dueChip(r.nextDue) },
      { label: 'Last done', hideSm: true, render: r => fmtDate(r.lastDone) },
      { label: 'Technician', hideSm: true, render: r => r.tech ? esc(r.tech) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${jsq(r.id)}')">Generate WO</button>
        <button class="btn out sm" onclick="event.stopPropagation();completePM('${jsq(r.id)}')">Mark done</button>` }
    ], pms.sort((x, y) => (x.nextDue || '9999').localeCompare(y.nextDue || '9999')),
       { empty: 'No PM schedules on this asset.', onRow: 'editPM' })}
  </div>

  <div class="card"><h3 class="sec">Machine BOM — components and spare parts${lowParts ? ` · ${lowParts} low` : ''}</h3>
    ${renderTable([
      { label: 'Part number', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Description', key: 'description' },
      { label: 'Mfr P/N', hideSm: true, render: r => `<span class="mono">${esc(r.mfrPn || '—')}</span>` },
      { label: 'Vendor', key: 'vendor', hideSm: true },
      { label: 'Bin location', render: r => `<span class="mono">${esc(r.location || '—')}</span>` },
      { label: 'On hand', num: true, render: r => r.qty ?? '—' },
      { label: 'Status', render: r => { const s = DB.partStatus(r); return `<span class="chip ${s.cls}">${s.label}</span>`; } },
      { label: 'Info', hideSm: true, render: r => {
          const b = []; if (r.imageUrl) b.push('&#128247;'); if (r.docUrl) b.push('&#128196;');
          return b.join(' ') || '<span style="color:var(--muted)">—</span>'; } }
    ], parts, { empty: 'No parts linked to this asset yet.', onRow: 'editPart' })}
  </div>`;
}

function newWOFor(a) { editWO(null, a); }
function newPMFor(a) { editPM(null, a); }
function newPartFor(a) { editPart(null, a); }

/* ============================================================
   QR TAGS
   ============================================================ */
function renderQR() {
  const assets = DB.all('assets').filter(a => matches(a, ['id', 'name', 'location', 'manufacturer']));
  const base = appBaseUrl();
  const test = qrSelfTest();

  if (!base) {
    return `<h1 class="page">QR Tags</h1>
      <div class="note bad">This page is open as a local file, so there is no web address to encode.
      Open the app from its Vercel URL and the codes will generate.</div>`;
  }
  if (!test.ok) {
    return `<h1 class="page">QR Tags</h1>
      <div class="note bad"><b>The QR engine is not running — ${esc(test.msg)}.</b><br><br>
      Almost always this means <span class="mono">assets/qr.js</span> is missing from the deployed site.
      Open <span class="mono">${esc(base)}assets/qr.js</span> in a new tab:
      <ul style="margin:8px 0 0 18px;line-height:1.9">
        <li>A <b>404</b> means the file never made it into the repo — upload it and commit.</li>
        <li>Code showing means it loaded but errored — hard-refresh with <b>Ctrl+Shift+R</b>.</li>
      </ul></div>
      <div class="actions"><a class="btn out" href="#/assets">Back to assets</a></div>`;
  }
  if (!assets.length) {
    return `<h1 class="page">QR Tags</h1><p class="sub">No assets to tag yet.</p>
      <div class="placeholder">Add an asset first, then come back to print its tag.
      <div class="actions" style="justify-content:center"><button class="btn filled" onclick="editAsset()">&#43; New asset</button></div></div>`;
  }

  const site = DB.raw().meta.site || '';
  return `
  <h1 class="page">QR Tags</h1>
  <p class="sub">${assets.length} tag${assets.length===1?'':'s'} — print, cut, and stick one on each machine.</p>
  <div class="chipset hide-print">
    <button class="btn filled" onclick="window.print()">&#128424; Print these tags</button>
    <a class="btn out" href="#/assets">Back to assets</a>
    <span class="chip c-done">&#10003; ${esc(test.msg)}</span>
  </div>
  <div class="note hide-print" style="margin-top:0">
    Codes point at <span class="mono">${esc(base)}</span> —
    <b>scan one on screen with your phone before printing</b> to confirm it opens the right asset.
    Print at 100% scale, not "fit to page".
  </div>
  <div class="card">
    <div class="tagsheet">
      ${assets.map(a => `<div class="tag">
        ${qrSvg(assetUrl(a.id), 132)}
        <div class="aid">${esc(a.id)}</div>
        <div class="anm">${esc(a.name || '')}</div>
        ${a.location ? `<div class="aloc">${esc(a.location)}</div>` : ''}
        <div class="brand">Tech X${site ? ' · ' + esc(site) : ''}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function showQR(id) {
  const a = DB.get('assets', id);
  if (!a) return;
  const url = assetUrl(id);
  Modal.open({
    title: 'QR tag — ' + a.id,
    body: `<div class="qrbig">${qrSvg(url, 240)}</div>
      <div style="text-align:center">
        <div style="font-size:20px;font-weight:700;font-family:'Roboto Mono',monospace">${esc(a.id)}</div>
        <div style="color:var(--muted);margin-top:4px">${esc(a.name || '')}</div></div>
      <div class="qrurl">${esc(url)}</div>
      <div class="note">Point any phone camera at this to open the asset.</div>`,
    footer: `<button class="btn filled" onclick="downloadTag('${jsq(id)}')">Download SVG</button>
      <a class="btn out" href="#/qr" onclick="Modal.close()">Print sheet</a>
      <button class="btn out" onclick="Modal.close()">Close</button>`
  });
}

function downloadTag(id) {
  if (!qrEngineReady()) { toast('QR engine not loaded'); return; }
  const svg = QR.toSVG(assetUrl(id), { size: 600 });
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob);
  el.download = 'qr-' + String(id).replace(/[^a-z0-9_-]/gi, '_') + '.svg';
  el.click();
  URL.revokeObjectURL(el.href);
  toast('QR downloaded');
}

/* ============================================================
   ASSET form
   ============================================================ */
function editAsset(id) {
  /* The record can be gone — a stale QR link, or someone else deleted it
     while this page was open. Say so instead of throwing. */
  if (id && !DB.get('assets', id)) { toast('That asset no longer exists'); route(); return; }
  const a = id ? DB.get('assets', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New asset' : 'Asset ' + a.id,
    body: `
      ${F.text('id','Asset ID',a.id || DB.nextId('assets','',4),{required:true,readonly:!isNew})}
      ${F.text('name','Equipment name',a.name,{required:true,placeholder:'e.g. Top Roll Assembly'})}
      <div class="f2">
        <div>${F.text('manufacturer','Manufacturer',a.manufacturer)}</div>
        <div>${F.text('model','Model',a.model)}</div>
        <div>${F.text('serial','Serial number',a.serial)}</div>
        <div>${F.text('project','Project number',a.project)}</div>
        <div>${F.text('location','Location / line',a.location)}</div>
        <div>${F.select('status','Status',a.status||'Active',['Active','Standby','Down','Retired'])}</div>
      </div>
      ${F.area('notes','Notes',a.notes)}
      ${!isNew && a.updatedBy ? `<div class="note">Last changed by <b>${esc(a.updatedBy)}</b></div>` : ''}`,
    footer: `<button class="btn filled" onclick="saveAsset(${isNew})">Save asset</button>
      ${!isNew ? `<button class="btn out" onclick="showQR('${jsq(a.id)}')">QR tag</button>` : ''}
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew && DB.can('delete') ? `<button class="btn bad" style="margin-left:auto" onclick="delAsset('${jsq(a.id)}')">Delete</button>` : ''}`
  });
}

function saveAsset(isNew) {
  const d = F.read();
  if (!d.id || !d.name) { toast('Asset ID and equipment name are required'); return; }
  if (isNew && DB.get('assets', d.id)) { toast('That asset ID already exists'); return; }
  d.updatedBy = DB.getWho();
  DB.upsert('assets', d);
  Modal.close();
  if (isNew) openAsset(d.id); else route();
  toast('Asset ' + d.id + ' saved');
}

function delAsset(id) {
  const pms = DB.forAsset('pms', id).length, parts = DB.forAsset('parts', id).length, wos = DB.forAsset('wos', id).length;
  confirmDelete(`Delete asset ${id}?\n\n${pms} PM(s), ${parts} part(s) and ${wos} work order(s) will be unlinked but not deleted.`, () => {
    DB.remove('assets', id); Modal.close(); location.hash = '#/assets'; toast('Asset deleted');
  });
}

/* ============================================================
   PM PLAN
   ============================================================ */
function renderPM() {
  let rows = DB.all('pms').filter(p => matches(p, ['id','description','assetId','frequency','tech']));
  rows.sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));
  const overdue = rows.filter(r => (DB.daysUntil(r.nextDue) ?? 99) < 0).length;
  const unassigned = rows.filter(r => !r.tech).length;

  return `
  <h1 class="page">PM Plan</h1>
  <p class="sub">${rows.length} preventive maintenance schedule${rows.length===1?'':'s'}</p>
  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="n">${rows.length}</div><div class="l">Scheduled PMs</div></div>
    <div class="stat"><div class="n" style="color:${overdue?'var(--bad)':'inherit'}">${overdue}</div><div class="l">Overdue</div></div>
    <div class="stat"><div class="n">${rows.filter(r=>{const d=DB.daysUntil(r.nextDue);return d!==null&&d>=0&&d<=30;}).length}</div><div class="l">Due in 30 days</div></div>
    <div class="stat"><div class="n" style="color:${unassigned?'var(--warn)':'inherit'}">${unassigned}</div><div class="l">No technician assigned</div></div>
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
      { label: 'Frequency', hideSm: true, render: r => `<span class="chip c-open">${esc(r.frequency || '—')}</span>` },
      { label: 'Next due', render: r => dueChip(r.nextDue) },
      { label: 'Last done', hideSm: true, render: r => fmtDate(r.lastDone) },
      { label: 'Technician', hideSm: true, render: r => r.tech ? esc(r.tech) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();genWO('${jsq(r.id)}')">Generate WO</button>
        <button class="btn out sm" onclick="event.stopPropagation();completePM('${jsq(r.id)}')">Mark done</button>` }
    ], rows, { empty: 'No PM schedules yet.', onRow: 'editPM' })}
  </div>`;
}

function editPM(id, presetAsset) {
  if (id && !DB.get('pms', id)) { toast('That PM no longer exists'); route(); return; }
  const p = id ? DB.get('pms', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New PM schedule' : 'PM ' + p.id,
    body: `${F.text('id','PM number',p.id || DB.nextId('pms','PM-',3),{required:true,readonly:!isNew})}
      ${F.select('assetId','Asset',p.assetId||presetAsset||'',assetOptions(),{required:true})}
      ${F.area('description','PM description',p.description,3)}
      <div class="f2">
        <div>${F.select('frequency','Frequency',p.frequency||'monthly',FREQS)}</div>
        <div>${F.date('nextDue','Next due',p.nextDue||today())}</div>
        <div>${F.date('lastDone','Last completed',p.lastDone)}</div>
        <div>${F.text('tech','Assigned technician',p.tech)}</div>
      </div>`,
    footer: `<button class="btn filled" onclick="savePM(${isNew})">Save PM</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew && DB.can('delete') ? `<button class="btn bad" style="margin-left:auto" onclick="delPM('${jsq(p.id)}')">Delete</button>` : ''}`
  });
}

function savePM(isNew) {
  const d = F.read();
  if (!d.id) { toast('PM number is required'); return; }
  if (isNew && DB.get('pms', d.id)) { toast('That PM number already exists'); return; }
  d.updatedBy = DB.getWho();
  DB.upsert('pms', d); Modal.close(); route(); toast('PM ' + d.id + ' saved');
}
function delPM(id) {
  confirmDelete('Delete PM ' + id + '?', () => { DB.remove('pms', id); Modal.close(); route(); toast('PM deleted'); });
}
function completePM(id) {
  const p = DB.get('pms', id);
  if (!p) { toast('That PM no longer exists'); route(); return; }
  const next = DB.bumpDue(p);
  DB.upsert('pms', { id: p.id, lastDone: today(), nextDue: next, completed: 'Yes', updatedBy: DB.getWho() });
  route();
  toast('PM ' + id + ' completed — next due ' + fmtDate(next));
}
function genWO(pmId) {
  const p = DB.get('pms', pmId);
  if (!p) { toast('That PM no longer exists'); route(); return; }
  const wo = {
    id: DB.nextId('wos', 'WO-', 4), assetId: p.assetId,
    description: p.description || ('PM ' + p.id), type: 'Preventive',
    priority: (DB.daysUntil(p.nextDue) ?? 99) < 0 ? 'High' : 'Medium',
    assignedTo: p.tech || '', dateRequested: today(), dateDue: p.nextDue || today(),
    status: 'Open', pmId: p.id, cause: 'To be determined', updatedBy: DB.getWho()
  };
  DB.upsert('wos', wo); route(); toast(wo.id + ' created from ' + p.id);
}

/* ============================================================
   SPARE PARTS
   ============================================================ */
function renderParts() {
  const rows = DB.all('parts').filter(p => matches(p, ['id','description','mfrPn','vendor','location','assetId']));
  const value = rows.reduce((s, p) => {
    const q = DB.num(p.qty), c = DB.num(p.cost);
    return s + (q !== null && c !== null ? q * c : 0);
  }, 0);
  const low = rows.filter(p => DB.partStatus(p).label === 'Low stock').length;

  return `
  <h1 class="page">Spare Parts</h1>
  <p class="sub">${rows.length} part${rows.length===1?'':'s'} in the crib</p>
  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat"><div class="n">${rows.length}</div><div class="l">Parts tracked</div></div>
    <div class="stat"><div class="n" style="color:${low?'var(--bad)':'inherit'}">${low}</div><div class="l">At or below minimum</div></div>
    <div class="stat"><div class="n">${rows.filter(p=>DB.num(p.qty)===null).length}</div><div class="l">Not yet counted</div></div>
    <div class="stat"><div class="n">${value?'$'+value.toLocaleString(undefined,{maximumFractionDigits:0}):'—'}</div><div class="l">Inventory value</div></div>
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
      { label: 'Mfr P/N', hideSm: true, render: r => `<span class="mono">${esc(r.mfrPn || '—')}</span>` },
      { label: 'Vendor', key: 'vendor', hideSm: true },
      { label: 'Location', render: r => `<span class="mono">${esc(r.location || '—')}</span>` },
      { label: 'On hand', num: true, render: r => r.qty ?? '—' },
      { label: 'Min', num: true, hideSm: true, render: r => r.min ?? '—' },
      { label: 'Unit cost', num: true, hideSm: true, render: r => money(r.cost) },
      { label: 'Status', render: r => { const s = DB.partStatus(r); return `<span class="chip ${s.cls}">${s.label}</span>`; } },
      { label: '', render: r => `<button class="btn tonal sm" onclick="event.stopPropagation();countPart('${jsq(r.id)}')">Count</button>` }
    ], rows, { empty: 'No parts yet.', onRow: 'editPart' })}
  </div>`;
}

function editPart(id, presetAsset) {
  if (id && !DB.get('parts', id)) { toast('That part no longer exists'); route(); return; }
  const p = id ? DB.get('parts', id) : {};
  const isNew = !id;
  Modal.open({
    title: isNew ? 'New part' : 'Part ' + p.id,
    body: `${p.imageUrl ? `<div class="prev"><img src="${esc(p.imageUrl)}" alt="" onerror="this.parentNode.style.display='none'"/></div>` : ''}
      ${F.text('id','Part number',p.id || DB.nextId('parts','P-',4),{required:true,readonly:!isNew})}
      ${F.text('description','Description',p.description,{required:true})}
      ${F.select('assetId','Used on asset',p.assetId||presetAsset||'',assetOptions())}
      <div class="f2">
        <div>${F.text('mfrPn','Manufacturer part number',p.mfrPn)}</div>
        <div>${F.text('vendor','Vendor',p.vendor)}</div>
        <div>${F.text('location','Storage location',p.location,{placeholder:'e.g. SP1-E3-A5'})}</div>
        <div>${F.num('cost','Unit cost',p.cost,{step:'0.01'})}</div>
        <div>${F.num('qty','Quantity on hand',p.qty,{step:'1'})}</div>
        <div>${F.num('min','Minimum quantity',p.min,{step:'1'})}</div>
        <div>${F.num('max','Maximum quantity',p.max,{step:'1'})}</div>
      </div>
      ${F.text('imageUrl','Picture URL',p.imageUrl,{placeholder:'https://…'})}
      ${F.text('docUrl','Spec sheet / manual URL',p.docUrl,{placeholder:'https://…'})}
      ${p.docUrl ? `<div style="margin-top:10px"><a href="${esc(p.docUrl)}" target="_blank" rel="noopener">Open spec sheet &#8599;</a></div>` : ''}`,
    footer: `<button class="btn filled" onclick="savePart(${isNew})">Save part</button>
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew && DB.can('delete') ? `<button class="btn bad" style="margin-left:auto" onclick="delPart('${jsq(p.id)}')">Delete</button>` : ''}`
  });
}

function savePart(isNew) {
  const d = F.read();
  if (!d.id || !d.description) { toast('Part number and description are required'); return; }
  if (isNew && DB.get('parts', d.id)) { toast('That part number already exists'); return; }
  d.updatedBy = DB.getWho();
  DB.upsert('parts', d); Modal.close(); route(); toast('Part ' + d.id + ' saved');
}
function delPart(id) {
  confirmDelete('Delete part ' + id + '?', () => { DB.remove('parts', id); Modal.close(); route(); toast('Part deleted'); });
}
function countPart(id) {
  const p = DB.get('parts', id);
  if (!p) { toast('That part no longer exists'); route(); return; }
  const v = prompt('Quantity on hand for ' + id + ' (' + (p.description || '') + '):', p.qty ?? '');
  if (v === null) return;
  DB.upsert('parts', { id, qty: v.trim(), updatedBy: DB.getWho() });
  route(); toast(id + ' counted — ' + v + ' on hand');
}

/* ============================================================
   WORK ORDERS
   ============================================================ */
function setWOView(v) { WO_VIEW = v; route(); }
function setWOFilter(f) { WO_FILTER = f; route(); }

function renderWO() {
  let rows = DB.all('wos').filter(w => matches(w, ['id','description','assetId','assignedTo','requestedBy','status']));
  const all = rows.slice();
  if (WO_FILTER === 'open') rows = rows.filter(DB.isOpen);
  else if (WO_FILTER === 'progress') rows = rows.filter(w => w.status === 'In Progress');
  else if (WO_FILTER === 'done') rows = rows.filter(DB.isDone);
  else if (WO_FILTER === 'mine') rows = rows.filter(w => DB.isActive(w) && (w.assignedTo || '') === DB.getWho());
  rows.sort((a, b) => (DB.woDate(b) || '').localeCompare(DB.woDate(a) || ''));

  const openN = all.filter(DB.isOpen).length;
  const progN = all.filter(w => w.status === 'In Progress').length;
  const doneN = all.filter(DB.isDone).length;
  const hours = all.filter(DB.isDone).reduce((s, w) => s + (DB.num(w.hours) || 0), 0);

  return `
  <h1 class="page">Work Orders</h1>
  <p class="sub">${all.length} work order${all.length===1?'':'s'} on record</p>
  <div class="grid g4" style="margin-bottom:20px">
    <div class="stat click" onclick="setWOFilter('open')"><div class="n">${openN}</div><div class="l">Pending</div></div>
    <div class="stat click" onclick="setWOFilter('progress')"><div class="n">${progN}</div><div class="l">In progress</div></div>
    <div class="stat click" onclick="setWOFilter('done')"><div class="n">${doneN}</div><div class="l">Completed</div></div>
    <div class="stat"><div class="n">${hours.toFixed(1)}<small style="font-size:15px">h</small></div><div class="l">Labour logged</div></div>
  </div>
  <div class="chipset">
    <button class="btn filled" onclick="editWO()">&#43; New work order</button>
    <div class="vtog">
      <button class="${WO_VIEW==='list'?'on':''}" onclick="setWOView('list')">&#9776; List</button>
      <button class="${WO_VIEW==='calendar'?'on':''}" onclick="setWOView('calendar')">&#128197; Calendar</button>
    </div>
    ${WO_VIEW === 'list' ? `
      <button class="fchip ${WO_FILTER==='all'?'on':''}" onclick="setWOFilter('all')">All</button>
      <button class="fchip ${WO_FILTER==='mine'?'on':''}" onclick="setWOFilter('mine')">Mine</button>
      <button class="fchip ${WO_FILTER==='open'?'on':''}" onclick="setWOFilter('open')">Pending</button>
      <button class="fchip ${WO_FILTER==='progress'?'on':''}" onclick="setWOFilter('progress')">In progress</button>
      <button class="fchip ${WO_FILTER==='done'?'on':''}" onclick="setWOFilter('done')">Completed</button>` : ''}
    <button class="btn out" onclick="exportCSV('wos')">Export CSV</button>
  </div>
  ${WO_VIEW === 'calendar' ? renderWOCalendar() : `
  <div class="card" style="padding:6px 20px 20px">
    <h3 class="sec" style="margin-top:16px">${WO_FILTER==='all'?'All work orders':WO_FILTER==='mine'?'Assigned to you':WO_FILTER==='open'?'Pending':WO_FILTER==='progress'?'In progress':'Completed'}</h3>
    ${renderTable([
      { label: 'WO', render: r => `<b class="mono">${esc(r.id)}</b>` },
      { label: 'Description', render: r => `<b>${esc(r.description || '—')}</b><br><small style="color:var(--muted)">${esc(DB.assetName(r.assetId))}${r.pmId?' · from '+esc(r.pmId):''}</small>` },
      { label: 'Type', hideSm: true, render: r => `<span class="chip c-open">${esc(r.type || '—')}</span>` },
      { label: 'Priority', render: r => prioChip(r.priority) },
      { label: 'Assigned to', hideSm: true, render: r => r.assignedTo ? esc(r.assignedTo) : '<span style="color:var(--muted)">Unassigned</span>' },
      { label: 'Scheduled', hideSm: true, render: r => fmtDate(r.dateDue || r.dateRequested) },
      { label: 'Hours', num: true, hideSm: true, render: r => r.hours ?? '—' },
      { label: 'Status', render: r => statusChip(r.status) }
    ], rows, { empty: 'No work orders in this view.', onRow: 'editWO' })}
  </div>`}`;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function calShift(n) {
  let m = CAL.m + n, y = CAL.y;
  while (m < 0) { m += 12; y--; }
  while (m > 11) { m -= 12; y++; }
  CAL.y = y; CAL.m = m; route();
}
function calToday() { const d = new Date(); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); route(); }
function calTogglePMs() { CAL.pms = !CAL.pms; route(); }

function renderWOCalendar() {
  const startPad = new Date(CAL.y, CAL.m, 1).getDay();
  const daysInMonth = new Date(CAL.y, CAL.m + 1, 0).getDate();
  const todayIso = today();
  const byDay = {};
  const push = (iso, html) => { if (!iso) return; (byDay[iso] = byDay[iso] || []).push(html); };

  DB.all('wos').filter(w => matches(w, ['id','description','assetId','assignedTo','status'])).forEach(w => {
    const cls = DB.isDone(w) ? 'ev-done' : w.status === 'In Progress' ? 'ev-prog'
      : (w.status === 'On Hold' || w.status === 'Cancelled') ? 'ev-hold' : 'ev-open';
    push(DB.woDate(w), `<div class="ev ${cls}" title="${esc(w.id+' · '+(w.description||''))}"
      onclick="editWO('${jsq(w.id)}')">${esc(w.id)} ${esc((w.description||'').slice(0,22))}</div>`);
  });
  if (CAL.pms) {
    DB.all('pms').forEach(p => {
      push(p.nextDue, `<div class="ev ev-pm" title="${esc(p.id+' · '+(p.description||''))}"
        onclick="editPM('${jsq(p.id)}')">${esc(p.id)} ${esc((p.description||'').slice(0,20))}</div>`);
    });
  }

  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="day pad"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${CAL.y}-${String(CAL.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells += `<div class="day ${iso===todayIso?'today':''}"><div class="dnum">${d}</div>${(byDay[iso]||[]).join('')}</div>`;
  }
  const prefix = `${CAL.y}-${String(CAL.m+1).padStart(2,'0')}`;
  const monthCount = Object.keys(byDay).filter(k => k.startsWith(prefix)).reduce((s,k)=>s+byDay[k].length,0);

  return `<div class="card">
    <div class="calbar">
      <button class="btn out sm" onclick="calShift(-1)">&#8249; Prev</button>
      <div class="mo">${MONTHS[CAL.m]} ${CAL.y}</div>
      <button class="btn out sm" onclick="calShift(1)">Next &#8250;</button>
      <button class="btn tonal sm" onclick="calToday()">Today</button>
      <button class="fchip ${CAL.pms?'on':''}" onclick="calTogglePMs()">Show PM due dates</button>
      <span style="color:var(--muted);font-size:12.5px;margin-left:auto">${monthCount} item${monthCount===1?'':'s'} this month</span>
    </div>
    <div class="cal">${DOW.map(d=>`<div class="dow">${d}</div>`).join('')}${cells}</div>
    <div class="legend">
      <span><i style="background:var(--info-c)"></i>Open</span>
      <span><i style="background:var(--warn-c)"></i>In progress</span>
      <span><i style="background:var(--ok-c)"></i>Completed</span>
      <span><i style="background:var(--surf-3)"></i>On hold / cancelled</span>
      ${CAL.pms?'<span><i style="background:var(--pur-c)"></i>PM due</span>':''}
    </div>
    <div class="note">Work orders sit on their <b>scheduled date</b> when set, otherwise the
    completion date, otherwise the date requested.</div>
  </div>`;
}

function editWO(id, presetAsset) {
  if (id && !DB.get('wos', id)) { toast('That work order no longer exists'); route(); return; }
  const w = id ? DB.get('wos', id) : {};
  const isNew = !id;
  const partOpts = [{ v: '', t: '— none —' }].concat(
    DB.all('parts').filter(p => !w.assetId || !p.assetId || p.assetId === w.assetId || p.assetId === presetAsset)
      .map(p => ({ v: p.id, t: p.id + ' · ' + (p.description || '') })));

  Modal.open({
    title: isNew ? 'New work order' : 'Work order ' + w.id,
    body: `${F.text('id','Work order number',w.id || DB.nextId('wos','WO-',4),{required:true,readonly:!isNew})}
      ${F.select('assetId','Asset',w.assetId||presetAsset||'',assetOptions(),{required:true})}
      ${F.area('description','Description of work',w.description,3)}
      <div class="f2">
        <div>${F.select('type','Work type',w.type||'Repair',WO_TYPES)}</div>
        <div>${F.select('priority','Priority',w.priority||'Medium',PRIORITIES)}</div>
        <div>${F.text('requestedBy','Requested by',w.requestedBy||(isNew?DB.getWho():''))}</div>
        <div>${F.text('assignedTo','Assigned to',w.assignedTo)}</div>
        <div>${F.date('dateRequested','Date requested',w.dateRequested||today())}</div>
        <div>${F.date('dateDue','Scheduled date (calendar)',w.dateDue)}</div>
        <div>${F.date('dateStarted','Date started',w.dateStarted)}</div>
        <div>${F.date('dateCompleted','Date completed',w.dateCompleted)}</div>
        <div>${F.select('status','Status',w.status||'Open',WO_STATUS)}</div>
        <div>${F.num('hours','Labour hours',w.hours,{step:'0.5'})}</div>
        <div>${F.num('cost','Cost',w.cost,{step:'0.01'})}</div>
      </div>
      ${F.select('cause','Cause of failure',w.cause||'To be determined',CAUSES)}
      ${F.select('partsUsed','Parts used',w.partsUsed,partOpts)}
      ${F.area('notes','Technician notes',w.notes,3)}
      ${w.pmId ? `<div class="note">Generated from PM <b>${esc(w.pmId)}</b>. Completing this rolls that PM forward.</div>` : ''}
      ${!isNew && w.updatedBy ? `<div class="note">Last changed by <b>${esc(w.updatedBy)}</b></div>` : ''}`,
    footer: `<button class="btn filled" onclick="saveWO(${isNew})">Save work order</button>
      ${!isNew && w.status !== 'Completed' ? `<button class="btn ok" onclick="closeWO('${jsq(w.id)}')">Complete</button>` : ''}
      <button class="btn out" onclick="Modal.close()">Cancel</button>
      ${!isNew && DB.can('delete') ? `<button class="btn bad" style="margin-left:auto" onclick="delWO('${jsq(w.id)}')">Delete</button>` : ''}`
  });
}

function saveWO(isNew) {
  const d = F.read();
  if (!d.id) { toast('Work order number is required'); return; }
  if (!d.assetId) { toast('Pick the asset this work order is for'); return; }
  if (isNew && DB.get('wos', d.id)) { toast('That work order number already exists'); return; }
  d.updatedBy = DB.getWho();
  DB.upsert('wos', d); Modal.close(); route(); toast('Work order ' + d.id + ' saved');
}

function closeWO(id) {
  const d = F.read();
  if (!d.cause || d.cause === 'To be determined') { toast('Record a cause of failure before completing'); return; }
  d.status = 'Completed';
  if (!d.dateCompleted) d.dateCompleted = today();
  d.updatedBy = DB.getWho();
  DB.upsert('wos', d);
  const w = DB.get('wos', id);
  if (w && w.pmId) {
    const p = DB.get('pms', w.pmId);
    if (p) DB.upsert('pms', { id: p.id, lastDone: d.dateCompleted, nextDue: DB.bumpDue(p), updatedBy: DB.getWho() });
  }
  Modal.close(); route(); toast(id + ' completed');
}

function delWO(id) {
  confirmDelete('Delete work order ' + id + '?', () => { DB.remove('wos', id); Modal.close(); route(); toast('Work order deleted'); });
}

/* ============================================================
   CSV IMPORT (admin)
   ============================================================ */
let IMPORT = { entity: 'assets', headers: [], records: [], map: {}, filename: '' };
const ENTITY_LABEL = { assets: 'Assets', pms: 'PM Schedule', parts: 'Spare Parts', wos: 'Work Orders' };

function renderImport() {
  const fieldList = e => Object.keys(CSV.ALIAS[e]).join(', ');
  return `
  <h1 class="page">Import CSV</h1>
  <p class="sub">Drop a spreadsheet export in and map the columns. Imported rows go straight into the shared database.</p>
  <div class="card">
    <h3 class="sec">1 · Choose what you are importing</h3>
    <div class="chipset">${Object.keys(ENTITY_LABEL).map(e =>
      `<button class="fchip ${IMPORT.entity===e?'on':''}" onclick="setImportEntity('${e}')">${ENTITY_LABEL[e]}</button>`).join('')}</div>
    <div class="note">Recognised fields for <b>${ENTITY_LABEL[IMPORT.entity]}</b>: <span class="mono">${fieldList(IMPORT.entity)}</span>.</div>
  </div>
  <div class="card">
    <h3 class="sec">2 · Load the file</h3>
    <div class="drop" id="drop" ondragover="event.preventDefault();this.classList.add('over')"
      ondragleave="this.classList.remove('over')" ondrop="dropFile(event)"
      onclick="document.getElementById('fileIn').click()">
      <span class="big">&#128193;</span><b>Drop a .csv file here</b><br>
      <small style="color:var(--muted)">or tap to browse${IMPORT.filename?' — loaded: <b>'+esc(IMPORT.filename)+'</b>':''}</small>
    </div>
    <input type="file" id="fileIn" accept=".csv,text/csv" style="display:none" onchange="pickFile(event)"/>
  </div>
  ${IMPORT.records.length ? renderMapStep() : ''}`;
}

function renderMapStep() {
  const fields = ['— ignore —'].concat(Object.keys(CSV.ALIAS[IMPORT.entity]));
  const mapped = Object.values(IMPORT.map).filter(Boolean).length;
  const rowsHtml = IMPORT.headers.map(h => `<tr>
      <td><b class="mono">${esc(h)}</b></td>
      <td><small style="color:var(--muted)">${esc((IMPORT.records[0]||{})[h]||'')}</small></td>
      <td><select onchange="setMap('${jsq(h)}',this.value)">
        ${fields.map(f => {
          const val = f === '— ignore —' ? '' : f;
          return `<option value="${esc(val)}" ${IMPORT.map[h]===val||(!IMPORT.map[h]&&!val)?'selected':''}>${esc(f)}</option>`;
        }).join('')}
      </select></td></tr>`).join('');
  const preview = CSV.applyMap(IMPORT.records.slice(0, 5), IMPORT.map);
  const cols = Object.keys(CSV.ALIAS[IMPORT.entity]);

  return `<div class="card">
    <h3 class="sec">3 · Map the columns — ${mapped} of ${IMPORT.headers.length} mapped</h3>
    <div class="tablewrap"><table><thead><tr><th>Column in your file</th><th>First value</th><th>Import as</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table></div>
  </div>
  <div class="card">
    <h3 class="sec">4 · Preview — first ${preview.length} of ${IMPORT.records.length} rows</h3>
    <div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${!Object.values(IMPORT.map).includes('id')
      ? `<div class="note bad">No column is mapped to <b>id</b>. Every row will be imported as a new record.</div>`
      : `<div class="note">Rows are matched on <b>id</b>. Matching records are updated; the rest are added.</div>`}
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
function setMap(h, f) { IMPORT.map[h] = f || null; route(); }
function cancelImport() { IMPORT = { entity: IMPORT.entity, headers: [], records: [], map: {}, filename: '' }; route(); }
function pickFile(ev) { const f = ev.target.files[0]; if (f) readCSVFile(f); }
function dropFile(ev) {
  ev.preventDefault();
  const el = document.getElementById('drop'); if (el) el.classList.remove('over');
  const f = ev.dataTransfer.files[0]; if (f) readCSVFile(f);
}
function readCSVFile(file) {
  const r = new FileReader();
  r.onload = () => {
    const { headers, records } = CSV.toObjects(r.result);
    if (!records.length) { toast('That file has no data rows'); return; }
    IMPORT.filename = file.name; IMPORT.headers = headers; IMPORT.records = records;
    IMPORT.map = CSV.mapHeaders(IMPORT.entity, headers);
    route(); toast(records.length + ' rows read from ' + file.name);
  };
  r.readAsText(file);
}
function runImport() {
  const clean = CSV.applyMap(IMPORT.records, IMPORT.map);
  const prefix = { assets: '', pms: 'PM-', parts: 'P-', wos: 'WO-' }[IMPORT.entity];
  const who = DB.getWho();
  clean.forEach(r => { if (!r.id) r.id = DB.nextId(IMPORT.entity, prefix, 4); r.updatedBy = who; });
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
  const s = DB.status();
  const counts = { Assets: db.assets.length, PMs: db.pms.length, Parts: db.parts.length, 'Work orders': db.wos.length };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const admin = DB.isAdmin();

  return `
  <h1 class="page">Settings</h1>
  <p class="sub">Signed in as <b>${esc(s.who)}</b> · ${esc(ROLE_LABEL[s.role] || s.role)}</p>

  <div class="card">
    <h3 class="sec">Your account</h3>
    <div class="tablewrap"><table><tbody>
      <tr><td style="color:var(--muted)">Name</td><td><b>${esc(s.who)}</b></td></tr>
      <tr><td style="color:var(--muted)">Username</td><td><span class="mono">${esc(s.username)}</span></td></tr>
      <tr><td style="color:var(--muted)">Role</td><td><span class="chip ${s.role==='admin'?'c-pur':'c-open'}">${esc(ROLE_LABEL[s.role] || s.role)}</span></td></tr>
    </tbody></table></div>
    <div class="actions">
      <button class="btn filled" onclick="openChangePassword(false)">Change my password</button>
      <button class="btn out" onclick="signOut()">Sign out</button>
    </div>
  </div>

  <div class="card">
    <h3 class="sec">Connection</h3>
    ${s.mode === 'cloud'
      ? `<div class="note"><b>Live — connected to the shared database.</b><br>
         Everything you save is visible to everyone else within about 15 seconds.</div>`
      : `<div class="note bad"><b>Offline — working on this device only.</b><br>
         ${esc(s.error || 'No connection to the database.')}<br>
         ${s.pending ? `<b>${s.pending} change${s.pending===1?'':'s'} waiting to be sent.</b><br>` : ''}
         Your work is saved here and sent automatically when the connection returns.</div>`}
    <div class="actions">
      <button class="btn filled" onclick="reconnect()">${s.mode === 'cloud' ? 'Refresh now' : 'Try to reconnect'}</button>
    </div>
  </div>

  <div class="card">
    <h3 class="sec">Site</h3>
    <label for="siteName">Site name</label>
    <input id="siteName" value="${esc(db.meta.site || '')}" ${admin ? 'onchange="saveSite(this.value)"' : 'readonly'}/>
    ${admin ? '' : '<div class="note">Only an admin can change this.</div>'}
  </div>

  <div class="card">
    <h3 class="sec">Data in the database</h3>
    ${renderTable([{ label: 'Collection', key: 'k' }, { label: 'Records', num: true, key: 'v' }],
      Object.entries(counts).map(([k, v]) => ({ id: k, k, v })))}
    <div class="note">${total} record${total===1?'':'s'} total.</div>
  </div>

  ${admin ? `<div class="card">
    <h3 class="sec">Move existing data into the database</h3>
    <p style="color:var(--muted);margin:0 0 4px">
      One-time migration: uploads everything currently in this browser to the shared database.
      Records with the same ID are merged, so running it twice is safe.</p>
    <div class="actions">
      <button class="btn filled" onclick="migrateUp()" ${s.mode==='cloud'?'':'disabled'}>Upload this device's data</button>
      <button class="btn out" onclick="Backup.export()">Download backup first</button>
    </div>
    ${s.mode !== 'cloud' ? '<div class="note bad">Connect to the database before migrating.</div>' : ''}
  </div>

  <div class="card">
    <h3 class="sec">Backup</h3>
    <div class="actions">
      <button class="btn filled" onclick="Backup.export()">Download backup</button>
      <button class="btn out" onclick="seedSample()">Load sample data</button>
      <a class="btn out" href="#/users">Manage users</a>
    </div>
  </div>` : `<div class="card">
    <h3 class="sec">Backup</h3>
    <div class="actions"><button class="btn filled" onclick="Backup.export()">Download backup</button></div>
  </div>`}`;
}

function saveSite(v) { const db = DB.raw(); db.meta.site = v; DB.save(); toast('Site name saved'); }

function reconnect() {
  toast('Connecting…');
  DB.connect().then(r => {
    route();
    if (r.mode === 'cloud') {
      DB.startPolling(15);
      toast(r.flushed ? `Connected — sent ${r.flushed} queued change${r.flushed===1?'':'s'}` : 'Connected — up to date');
    } else if (r.auth) {
      location.hash = '#/login'; route(); toast('Please sign in again');
    } else {
      toast('Still offline — ' + (r.reason || 'no connection'));
    }
  });
}

function migrateUp() {
  const db = DB.raw();
  const n = db.assets.length + db.pms.length + db.parts.length + db.wos.length;
  if (!n) { toast('Nothing on this device to upload'); return; }
  confirmDelete(`Upload ${n} records from this device into the shared database?\n\nRecords with the same ID are merged, not duplicated.`, () => {
    toast('Uploading…');
    DB.seedServer().then(r => { route(); toast(`Uploaded ${r.count} records to the database`); })
      .catch(e => toast('Upload failed — ' + e.message));
  });
}

/* ============================================================
   SAMPLE DATA
   ============================================================ */
function seedSample() {
  if (!DB.isAdmin()) { toast('Only an admin can load sample data'); return; }
  const d = today();
  const plus = n => DB.addDays(d, n);
  const who = DB.getWho();

  DB.bulkUpsert('assets', [
    { id: '3526', name: 'Top Roll Assembly', manufacturer: '3Con', model: 'TR-900', project: '3527', location: 'Ultrasonic weld cell', status: 'Active', notes: 'Ultrasonic sonotrode weld cell', updatedBy: who },
    { id: '3527', name: 'Air Compressor #1', manufacturer: 'Atlas Copco', model: 'GA22', location: 'Utilities room', status: 'Active', updatedBy: who }
  ]);
  DB.bulkUpsert('pms', [
    { id: 'PM-003', assetId: '3526', description: 'Inspect and clean sonotrodes/anvils; check ultrasonic weld quality', frequency: 'weekly', nextDue: plus(2) },
    { id: 'PM-004', assetId: '3526', description: 'Clean/replace main air supply filters and moisture separators', frequency: 'monthly', nextDue: plus(9) },
    { id: 'PM-005', assetId: '3526', description: 'Lubricate sliding and rotating components', frequency: 'monthly', nextDue: plus(14) },
    { id: 'PM-006', assetId: '3526', description: 'Clean photo-eyes/sensors and air blow-off nozzles', frequency: 'monthly', nextDue: plus(22) },
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
    { id: 'WO-1001', assetId: '3527', description: 'Oil leak at compressor head', type: 'Repair', priority: 'High',
      requestedBy: 'Chris Myers', assignedTo: 'John Davis', dateRequested: DB.addDays(d,-7),
      dateStarted: DB.addDays(d,-6), dateDue: DB.addDays(d,1), hours: '4.0', cost: '450',
      status: 'In Progress', cause: 'To be determined' },
    { id: 'WO-1002', assetId: '3526', description: 'Replace worn sonotrode on station 2', type: 'Repair', priority: 'Medium',
      requestedBy: 'Marcelo Frazzato', assignedTo: 'John Davis', dateRequested: DB.addDays(d,-21),
      dateStarted: DB.addDays(d,-20), dateCompleted: DB.addDays(d,-20), hours: '2.5', cost: '1250',
      status: 'Completed', cause: 'Wear / end of life', partsUsed: 'CT_12672' },
    { id: 'WO-1003', assetId: '3526', description: 'Weld quality drift — investigate generator output', type: 'Troubleshoot',
      priority: 'High', requestedBy: 'Quality', dateRequested: DB.addDays(d,-2), dateDue: DB.addDays(d,3),
      status: 'Open', cause: 'To be determined' },
    { id: 'WO-1004', assetId: '3526', description: 'Air leak at main regulator', type: 'Repair', priority: 'Low',
      requestedBy: 'Night shift', dateRequested: DB.addDays(d,-1), dateDue: DB.addDays(d,6),
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
  DB.loadQueue();

  DB.setOnChange(fromPoll => {
    route();
    if (fromPoll) toast('Updated — someone else made a change');
  });

  DB.connect().then(r => {
    route();
    if (r.mode === 'cloud') {
      DB.startPolling(15);
      if (r.flushed) toast(`Connected — sent ${r.flushed} queued change${r.flushed===1?'':'s'}`);
    }
  }).catch(() => route());

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && DB.status().mode === 'cloud') {
      DB.refresh().then(() => route()).catch(() => {});
    }
  });
  window.addEventListener('online', () => {
    if (DB.status().mode !== 'cloud') reconnect();
  });
})();
