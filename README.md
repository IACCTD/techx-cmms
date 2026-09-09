# Tech X — CMMS

Maintenance management for the plant: **assets, PM schedules, spare parts, work orders**, with QR tags for phone access, a shared Postgres database, and **per-user accounts with roles**.

**Setting up? → [SETUP.md](SETUP.md)**

---

## Accounts and roles

Everyone signs in with their own username and password. Two roles:

| | Maintenance | Admin |
|---|---|---|
| View everything | ✓ | ✓ |
| Create and edit work orders | ✓ | ✓ |
| Complete work orders and PMs | ✓ | ✓ |
| Add and edit assets, PMs, parts | ✓ | ✓ |
| Count spare parts | ✓ | ✓ |
| **Delete** anything | — | ✓ |
| **Import CSV** | — | ✓ |
| **Manage users** | — | ✓ |
| **Change site settings** | — | ✓ |

Deleting is admin-only on purpose: it's the one action that quietly destroys a machine's history.

Admins manage people in **Users**. New accounts get a temporary password and are asked to choose their own on first sign-in. Leaving? **Disable** the account — they lose access immediately, but their history stays, which is what keeps "closed by John Davis" meaningful.

The app refuses to demote or disable the last remaining admin, so nobody can lock everyone out.

### Security

- Passwords stored as **PBKDF2-SHA256**, 210,000 rounds, random salt per user. Never stored, logged, or returned in plain text.
- Sign-in returns a **session token** (30 days). Only the token is kept in the browser.
- Changing your password signs you out everywhere else.
- **Every permission is enforced server-side.** Hidden buttons are a convenience; the server refuses the action regardless of what the browser sends.

---

## How the sync works

Reads come from an in-memory cache, so screens render instantly. Writes hit the cache immediately, then go to the server in the background. A poll every 15 seconds checks a cheap revision string and pulls the full dataset only when it actually changed.

If the connection drops, the app keeps working, queues writes on the device, and flushes on reconnect. The badge in the header shows which mode you're in.

**Conflicts** merge field by field. If you edit the description while someone else sets the status, both survive. Same field edited twice, later write wins — no locking, which is the right trade for a maintenance team.

---

## Navigation

```
HOME
├── Find an Asset ──→ Asset list ──→ ASSET DASHBOARD ←── QR scan lands here
│                                     ├── Recent repairs (last 5 completed)
│                                     ├── Open work orders
│                                     ├── PM program (schedule + frequency)
│                                     └── Machine BOM (parts, bin, qty, docs)
├── Work Orders ────→ List view  ⇄  Calendar view
└── AI Assist ──────→ reserved, not connected yet
```

---

## QR tags

**QR Tags → Print these tags**, cut, stick one on each machine. A phone camera opens that asset — no app, nothing typed.

Codes are built from the address the app is running on, worked out at page load, so they're right on production and preview alike. Verified to scan at 20 mm printed at 300 dpi, and through blur, faded toner and any rotation.

Print at 100% scale. Laminate or cover with clear tape.

> If your production URL changes, reprint — old tags point at the old address.

---

## Rules built in

- Marking a PM done stamps *last completed* and rolls *next due* forward by frequency.
- Completing a PM-generated work order rolls that PM forward too.
- A work order **cannot be completed until a cause of failure is recorded**.
- A work order must be linked to an asset before it saves.
- A part with no quantity reads *Not counted*, not *In stock*.
- Every record carries who last changed it, stamped from the session — not from anything the browser sends.

---

## Structure

```
techx-cmms/
├── api/
│   ├── data.js             # the whole backend: data, auth, users, roles
│   └── package.json        # marks the folder as ES modules
├── assets/
│   ├── styles.css
│   ├── qr.js               # self-contained QR generator (no CDN)
│   ├── db.js               # cache + write-through + offline queue + session
│   ├── csv.js              # CSV parse/build + header aliasing
│   ├── ui.js               # tables, forms, drawer, toast, escaping
│   └── app.js              # router + every screen
├── index.html
├── package.json
├── vercel.json
├── .env.example
├── SETUP.md
└── README.md
```

### Database schema

```sql
records(collection, id, data JSONB, updated_at, updated_by, deleted)
settings(key, value JSONB)
users(username, full_name, role, salt, hash, active, must_change, created_at, last_login)
sessions(token, username, created_at, expires_at)
```

One generic `records` table means adding a field never needs a migration. Deletes are soft — the row stays, flagged — so a mistaken tap is recoverable in SQL.

All queries are parameterised; IDs and usernames are never concatenated into SQL.

---

## Local development

```bash
npm install
npx vercel env pull .env.local
npx vercel dev                    # http://localhost:3000
```

---

## Notes on choices

**Why Neon.** Vercel's Postgres product is now Neon, and `@vercel/postgres` is no longer maintained, so this uses `@neondatabase/serverless`.

**Why the cache.** Making reads async would have meant rewriting every screen. The cache keeps the whole UI layer unchanged while the data is genuinely shared.

**Why server-side attribution.** `updated_by` is taken from the session, not from the request body, so the audit trail can't be spoofed by editing what the browser sends.

**What this still isn't.** Sessions never expire early on the server side beyond their 30-day window, there's no rate limiting on sign-in attempts, and there's no audit log of *who deleted what*. All worth adding if this expands beyond the maintenance team — none of it blocking for a plant-floor tool behind a private URL.

---

MIT licensed. Built for IAC Cottondale.
