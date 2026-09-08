/* ============================================================
   csv.js — CSV parse / build + column mapping for imports
   Handles quoted fields, embedded commas, CRLF, BOM.
   ============================================================ */

const CSV = (() => {

  function parse(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', q = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (q) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  /* rows -> array of objects keyed by normalised header */
  function toObjects(text) {
    const rows = parse(text);
    if (!rows.length) return { headers: [], records: [] };
    const headers = rows[0].map(h => h.trim());
    const records = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
    return { headers, records };
  }

  function esc(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function build(headers, rows) {
    const head = headers.map(h => esc(h.label || h)).join(',');
    const body = rows.map(r =>
      headers.map(h => esc(typeof h === 'string' ? r[h] : r[h.key])).join(',')
    ).join('\n');
    return head + '\n' + body;
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- header aliasing ----------
     Accepts messy real-world headers and maps to our field names. */
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  const ALIAS = {
    assets: {
      id: ['assetid', 'asset', 'assetnumber', 'assetno', 'id', 'equipmentid'],
      name: ['equipmentname', 'assetname', 'name', 'description', 'equipment'],
      manufacturer: ['manufacturer', 'mfr', 'make', 'oem'],
      project: ['projectnumber', 'project', 'projectno', 'projno', 'proj', 'projectnum'],
      location: ['location', 'area', 'line', 'cell', 'plant'],
      status: ['status', 'state'],
      notes: ['notes', 'comment', 'comments', 'remarks']
    },
    pms: {
      id: ['pmnumber', 'pmid', 'pmno', 'id', 'pm'],
      assetId: ['assetid', 'asset', 'assetnumber', 'equipmentid'],
      description: ['pmdescription', 'description', 'task', 'work', 'details'],
      frequency: ['frequency', 'freq', 'interval', 'cadence'],
      nextDue: ['nextdue', 'nextduedate', 'duedate', 'due', 'nextdate'],
      lastDone: ['lastcompleted', 'lastdone', 'lastcompleteddate', 'lastdate'],
      tech: ['assignedtechnician', 'technician', 'assignedto', 'owner', 'tech'],
      completed: ['completed', 'done', 'iscompleted']
    },
    parts: {
      id: ['partnumber', 'partno', 'partid', 'id', 'part'],
      description: ['description', 'partdescription', 'name'],
      assetId: ['assetid', 'asset', 'assetnumber', 'equipmentid', 'usedon'],
      mfrPn: ['manufacturerpartnumber', 'mfrpn', 'mfgpartnumber', 'oempartnumber', 'mfrpartnumber'],
      vendor: ['vendor', 'supplier', 'manufacturer', 'mfr'],
      location: ['storagelocation', 'location', 'bin', 'binlocation', 'shelf'],
      qty: ['quantityonhand', 'qtyonhand', 'qty', 'quantity', 'onhand', 'stock'],
      min: ['minimumquantity', 'min', 'minqty', 'reorderpoint', 'minimum'],
      max: ['maximumquantity', 'max', 'maxqty', 'maximum'],
      cost: ['unitcost', 'cost', 'price', 'unitprice']
    },
    wos: {
      id: ['workordernumber', 'wonumber', 'workorder', 'wono', 'id', 'wo'],
      assetId: ['assetid', 'asset', 'assetnumber', 'equipmentid'],
      description: ['description', 'problem', 'issue', 'workdescription', 'task'],
      type: ['worktype', 'type', 'category'],
      priority: ['priority', 'urgency'],
      requestedBy: ['requestedby', 'requester', 'reportedby'],
      assignedTo: ['assignedto', 'technician', 'assignee', 'tech'],
      dateRequested: ['requestdate', 'daterequested', 'datereported', 'created'],
      dateStarted: ['datestarted', 'startdate', 'started'],
      dateCompleted: ['datecompleted', 'completiondate', 'completed', 'dateclosed'],
      hours: ['laborhours', 'hours', 'timeofrepair', 'downtimehours'],
      cost: ['cost', 'totalcost', 'repaircost'],
      cause: ['causeoffailure', 'cause', 'rootcause', 'failurecause'],
      partsUsed: ['partsneeded', 'partsused', 'parts'],
      status: ['status', 'state']
    }
  };

  /* Build header -> field map for a given entity */
  function mapHeaders(entity, headers) {
    const alias = ALIAS[entity];
    const map = {};
    headers.forEach(h => {
      const n = norm(h);
      for (const field in alias) {
        if (alias[field].includes(n)) { map[h] = field; return; }
      }
      map[h] = null; // unmapped, ignored
    });
    return map;
  }

  /* Apply map -> clean records */
  function applyMap(records, map) {
    return records.map(rec => {
      const out = {};
      for (const h in map) {
        if (map[h] && rec[h] !== undefined && rec[h] !== '') out[map[h]] = rec[h];
      }
      return out;
    }).filter(o => Object.keys(o).length);
  }

  return { parse, toObjects, build, download, mapHeaders, applyMap, ALIAS, norm };
})();
