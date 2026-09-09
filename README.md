# Tech X — CMMS

Maintenance management for the plant: **assets, PM schedules, spare parts, work orders**, with CSV import, a shared data file, and **QR tags for phone access**.

No build step. No database. No dependencies. Push to GitHub and Vercel serves it.

---

## QR tags — scan a machine, get its history

Go to **QR Tags**, hit **Print these tags**, cut them out, stick one on each machine. A tech points any phone camera at the tag and the asset dashboard opens — no app to install, nothing to type.

The codes are generated from **the address the app is running on**, worked out at page load. Nothing to configure, and they stay correct on localhost, a preview deploy, or production.

> If your production URL ever changes, reprint the tags — the old ones point at the old address.

Where to find them:
- **QR Tags** screen — full printable sheet, three per row
- **Asset dashboard** — a small code top-right, plus a **Tag** button for the large version
- **Download SVG** — vector file for a label printer, scales to any size without blurring

Tested to scan reliably down to **20 mm** printed at 300 dpi, and still readable with camera blur, faded toner, sensor noise, and at any rotation. Laminate or cover with clear tape; a code scans through tape but not through oil and dust.

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

### Asset dashboard
| Panel | Shows |
|---|---|
| **Header** | Name, ID, serial, manufacturer, model, location, project, status, QR code |
| **Summary** | Pending · In progress · Incoming PMs (30 days) · Completed with hours |
| **Recent repairs** | Last 5 completed WOs with cause of failure |
| **PM program** | Frequency, next due, technician — *Generate WO* and *Mark done* inline |
| **Machine BOM** | Parts with Mfr P/N, vendor, bin location, stock status, 📷/📄 links |

### Work orders
**List** with filter chips, or **Calendar** colour-coded by status with PM due dates overlaid. Work orders sit on their *scheduled date*, falling back to completion date, then date requested.

---

## Rules built in

- Marking a PM done stamps *last completed* and rolls *next due* forward by frequency.
- Completing a PM-generated work order rolls that PM forward too.
- A work order **cannot be completed until a cause of failure is recorded**.
- A work order must be linked to an asset before it saves.
- A part with no quantity reads *Not counted*, not *In stock*.

---

## Phone use

The layout adapts on a phone: nav becomes a scrolling strip, tables drop secondary columns, inputs are sized to avoid iOS zoom-on-focus. Add it to the home screen from the browser's share menu for an app-like icon.

Remember data is per-device. A phone and a desktop each hold their own copy until you use the shared file below.

---

## Sharing data through the repo

`data/shared/db.json` is the master copy. First-time visitors get it automatically.

**To publish:** Settings → **Publish** downloads `db.json`. Drop it in `data/shared/` and commit:

```bash
git add data/shared/db.json
git commit -m "Update plant data"
git push
```

**To receive:** Settings → **Pull** — *replace mine*, *repo wins*, or *keep my edits*.

**One person owns the file at a time.** No locking; whoever commits second wins. Keep the repo **private** — asset lists, vendors and bin locations are in that file.

No GitHub token ever goes in the browser: it would be readable via view-source and grant write access to the whole repo. That's why publishing is a commit.

---

## Where the data lives

Browser **localStorage**, per device, per browser, per domain. Close and reopen — it's there. Different browser or phone — separate copy. Clearing site data erases it, so use **Backup** regularly.

---

## Run locally

```bash
npm run dev     # http://localhost:3000
```

Opening `index.html` directly works except the shared pull and QR codes, both of which need a real address.

---

## Deploy

Push to GitHub → vercel.com → **Add New → Project** → Import → Framework **Other**, build command and output directory **empty** → Deploy.

> Folder names are case-sensitive on Vercel. It must be `assets`, lowercase.

---

## Structure

```
techx-cmms/
├── index.html
├── assets/
│   ├── styles.css
│   ├── qr.js               # self-contained QR generator (no CDN)
│   ├── db.js               # storage layer — swap this to add a backend
│   ├── sync.js             # pull/publish the shared repo copy
│   ├── csv.js              # CSV parse/build + header aliasing
│   ├── ui.js               # tables, forms, drawer, toast, escaping
│   └── app.js              # router + every screen
├── data/
│   ├── shared/db.json      # MASTER COPY — commit this to share data
│   └── *.csv               # import samples
├── package.json
├── vercel.json
└── README.md
```

`qr.js` is written in-house rather than pulled from a CDN so tags still print if the plant network blocks outside scripts, and nothing breaks when a third-party CDN moves.

---

## Going multi-user later

`db.js` exposes five functions: `all`, `get`, `upsert`, `remove`, `bulkUpsert`. Nothing else touches storage. Rewrite those against an API — Vercel Postgres, `/api/[entity].js` routes, auth — and every screen carries over untouched.

That's the step to take when two people need to enter work orders in the same shift.

---

MIT licensed. Built for IAC Cottondale.
