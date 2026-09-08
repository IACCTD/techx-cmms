/* ============================================================
   sync.js — shared data via the Git repo
   ------------------------------------------------------------
   The repo holds one file, data/shared/db.json, which is the
   agreed master copy. The app can PULL it (read) but cannot
   PUSH to GitHub from the browser — publishing is a deliberate
   commit made by whoever owns the data.

   Why no direct push: writing to GitHub from a web page needs a
   personal access token shipped in the page, which anyone can
   read from view-source. That token would grant write access to
   the whole repo. Not worth it. Publishing stays a git commit.
   ============================================================ */

const Repo = {
  URL: 'data/shared/db.json',

  /* ---------- read the shared copy ---------- */
  async fetchShared() {
    const res = await fetch(this.URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Shared file not found (HTTP ' + res.status + ')');
    const json = await res.json();
    if (!json || typeof json !== 'object') throw new Error('Shared file is not valid JSON');
    return json;
  },

  /* ---------- pull into local storage ----------
     mode: 'replace'  repo copy wins outright, local extras dropped
           'repo'     merge, repo fields win on conflict
           'mine'     merge, local edits kept, new repo records added */
  async pull(mode = 'replace') {
    const shared = await this.fetchShared();
    const local = DB.raw();
    const cols = ['assets', 'pms', 'parts', 'wos'];
    const stats = { added: 0, updated: 0, kept: 0 };

    if (mode === 'replace') {
      cols.forEach(c => { stats.added += (shared[c] || []).length; });
      shared.meta = Object.assign({}, shared.meta, {
        lastPull: new Date().toISOString(),
        sharedVersion: shared.meta && shared.meta.publishedAt
      });
      DB.replaceAll(shared);
      return stats;
    }

    const out = { meta: Object.assign({}, local.meta) };
    cols.forEach(c => {
      const mine = local[c] || [];
      const theirs = shared[c] || [];
      const byId = new Map(mine.map(r => [r.id, r]));

      theirs.forEach(r => {
        if (!byId.has(r.id)) { byId.set(r.id, r); stats.added++; }
        else if (mode === 'repo') {
          byId.set(r.id, Object.assign({}, byId.get(r.id), r));
          stats.updated++;
        } else {
          byId.set(r.id, Object.assign({}, r, byId.get(r.id)));
          stats.kept++;
        }
      });
      out[c] = Array.from(byId.values());
    });

    out.meta.lastPull = new Date().toISOString();
    out.meta.sharedVersion = shared.meta && shared.meta.publishedAt;
    DB.replaceAll(out);
    return stats;
  },

  /* ---------- produce the file to commit ---------- */
  publish(publishedBy) {
    const db = DB.raw();
    const payload = {
      meta: Object.assign({}, db.meta, {
        publishedAt: new Date().toISOString(),
        publishedBy: publishedBy || 'unknown',
        note: 'Master copy. Edit through the app, then commit this file.'
      }),
      assets: db.assets,
      pms: db.pms,
      parts: db.parts,
      wos: db.wos
    };
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'db.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return payload.meta.publishedAt;
  },

  /* ---------- is the shared copy newer than our last pull? ---------- */
  async checkForUpdates() {
    const shared = await this.fetchShared();
    const pubs = shared.meta && shared.meta.publishedAt;
    const seen = DB.raw().meta.sharedVersion;
    const counts = {
      assets: (shared.assets || []).length,
      pms: (shared.pms || []).length,
      parts: (shared.parts || []).length,
      wos: (shared.wos || []).length
    };
    return { publishedAt: pubs, publishedBy: shared.meta && shared.meta.publishedBy,
             behind: !!pubs && pubs !== seen, counts };
  },

  /* ---------- first-run bootstrap ---------- */
  async seedIfEmpty() {
    const db = DB.raw();
    const empty = !db.assets.length && !db.pms.length && !db.parts.length && !db.wos.length;
    if (!empty) return false;
    try {
      await this.pull('replace');
      return true;
    } catch (e) {
      return false; // no shared file yet, or opened via file:// — fine
    }
  }
};
