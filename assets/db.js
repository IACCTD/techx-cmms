/* ============================================================
   db.js — storage layer
   All data lives in browser localStorage under one key.
   Swap this file for a real API later; the rest of the app
   only talks to DB.* and never touches storage directly.
   ============================================================ */

const DB = (() => {
  const KEY = 'techx.cmms.v1';

  const EMPTY = {
    assets: [], pms: [], parts: [], wos: [],
    meta: { site: 'IAC Cottondale, AL', recentAssets: [] }
  };

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? Object.assign({}, structuredClone(EMPTY), JSON.parse(raw)) : structuredClone(EMPTY);
      if (!cache.meta) cache.meta = structuredClone(EMPTY.meta);
      if (!Array.isArray(cache.meta.recentAssets)) cache.meta.recentAssets = [];
    } catch (e) {
      console.error('Storage read failed', e);
      cache = structuredClone(EMPTY);
    }
    return cache;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { alert('Could not save — browser storage may be full.'); }
  }

  function nextId(collection, prefix, pad = 4) {
    const nums = load()[collection]
      .map(r => String(r.id || ''))
      .map(s => parseInt(String(s).replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    const n = (nums.length ? Math.max(...nums) : 1000) + 1;
    return prefix + String(n).padStart(pad, '0');
  }

  function all(c) { return load()[c].slice(); }
  function get(c, id) { return load()[c].find(r => r.id === id) || null; }

  function upsert(c, rec) {
    const db = load();
    const i = db[c].findIndex(r => r.id === rec.id);
    rec.updatedAt = new Date().toISOString();
    if (i >= 0) db[c][i] = Object.assign({}, db[c][i], rec);
    else { rec.createdAt = rec.updatedAt; db[c].push(rec); }
    save();
    return rec;
  }

  function remove(c, id) {
    const db = load();
    db[c] = db[c].filter(r => r.id !== id);
    save();
  }

  function bulkUpsert(c, rows, keyField = 'id') {
    const db = load();
    let added = 0, updated = 0;
    rows.forEach(r => {
      const i = db[c].findIndex(x => x[keyField] && x[keyField] === r[keyField]);
      if (i >= 0) { db[c][i] = Object.assign({}, db[c][i], r); updated++; }
      else { db[c].push(r); added++; }
    });
    save();
    return { added, updated };
  }

  function replaceAll(obj) {
    cache = Object.assign(structuredClone(EMPTY), obj);
    if (!Array.isArray(cache.meta.recentAssets)) cache.meta.recentAssets = [];
    save();
  }

  function reset() { cache = structuredClone(EMPTY); save(); }
  function raw() { return load(); }

  function touchAsset(id) {
    const db = load();
    db.meta.recentAssets = [id].concat((db.meta.recentAssets || []).filter(x => x !== id)).slice(0, 6);
    save();
  }

  const FREQ_DAYS = {
    daily: 1, weekly: 7, biweekly: 14, monthly: 30,
    quarterly: 91, semiannual: 182, annually: 365
  };

  function addDays(iso, days) {
    const d = iso ? new Date(iso + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function bumpDue(pm) {
    const days = FREQ_DAYS[(pm.frequency || '').toLowerCase()] || 30;
    return addDays(pm.nextDue, days);
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }

  function assetName(id) {
    const a = get('assets', id);
    return a ? a.name : (id || '—');
  }

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function partStatus(p) {
    const qty = num(p.qty), min = num(p.min);
    if (qty === null) return { label: 'Not counted', cls: 'c-prog' };
    if (min !== null && qty <= min) return { label: 'Low stock', cls: 'c-crit' };
    return { label: 'In stock', cls: 'c-done' };
  }

  const OPEN_STATES = ['Open', 'On Hold'];
  const isOpen = w => OPEN_STATES.includes(w.status || 'Open');
  const isActive = w => !['Completed', 'Cancelled'].includes(w.status || 'Open');
  const isDone = w => (w.status || '') === 'Completed';
  const woDate = w => w.dateDue || w.dateCompleted || w.dateRequested || '';
  const forAsset = (c, assetId) => all(c).filter(r => r.assetId === assetId);

  return {
    all, get, upsert, remove, bulkUpsert, replaceAll, reset, raw, save,
    nextId, bumpDue, daysUntil, assetName, partStatus, num, addDays,
    touchAsset, forAsset, isOpen, isActive, isDone, woDate, FREQ_DAYS
  };
})();

const Backup = {
  export() {
    const blob = new Blob([JSON.stringify(DB.raw(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'techx-cmms-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof toast === 'function') toast('Backup downloaded');
  },
  import(file, done) {
    const r = new FileReader();
    r.onload = () => {
      try { DB.replaceAll(JSON.parse(r.result)); done(null); }
      catch (e) { done(e); }
    };
    r.readAsText(file);
  }
};
