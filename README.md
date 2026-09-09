# Tech X — CMMS

Maintenance management for the plant: **assets, PM schedules, spare parts, work orders**, with CSV import and a shared data file.

No build step. No database. No dependencies. Push to GitHub and Vercel serves it.

---

## Navigation

Built to match the plant workflow map:

```
HOME
├── Find an Asset ──→ Asset list ──→ ASSET DASHBOARD
│                                     ├── Recent repairs (last 5 completed)
│                                     ├── Open work orders
│                                     ├── PM program (schedule + frequency)
│                                     └── Machine BOM (parts, bin, qty, docs)
├── Work Orders ────→ List view  ⇄  Calendar view
│                     PM program · Schedule · Frequency · Generate WO
└── AI Assist ──────→ reserved, not connected yet
```

### Home
Three tiles plus live counts — assets in plant, pending work orders, in progress, PMs due within 7 days. Every count is clickable and drops you into the filtered view. Recently viewed assets appear as quick-jump pills.

### Asset dashboard
Click any asset row to open its own dashboard:

| Panel | What it shows |
|---|---|
| **Header** | Name, asset ID, serial, manufacturer, model, location, project, status |
| **Summary** | Pending · In progress · Incoming PMs (30 days) · Completed with hours logged |
| **Recent repairs** | Last 5 completed WOs with cause of failure and hours |
| **Open work orders** | Everything not closed on this machine |
| **PM program** | Schedule, frequency, next due, last done, technician — *Generate WO* and *Mark done* inline |
| **Machine BOM** | Parts for this asset: Mfr P/N, vendor, bin location, on-hand, stock status, and 📷 / 📄 markers when a picture or spec sheet is attached |

Buttons at the top create a work order, PM, or part **already linked to that asset**.

### Work orders — list and calendar
Toggle between the two. Both respect the global search box.

- **List** — filter chips for All / Pending / In progress / Completed
- **Calendar** — month grid, colour-coded by status, with PM due dates overlaid (toggleable). Click any item to open it. Prev / Next / Today navigation.

Work orders sit on their **scheduled date** when set, otherwise the completion date, otherwise the date requested. The WO form now has a *Scheduled date* field feeding the calendar.

---

## Rules built in

- Marking a PM done stamps *last completed* and rolls *next due* forward by its frequency.
- Completing a PM-generated work order rolls that PM forward too.
- A work order **cannot be completed until a cause of failure is recorded** — so failure history stays usable.
- A work order must be linked to an asset before it saves.
- A part with no quantity reads *Not counted*, not *In stock*.

---

## Sharing data through the repo

`data/shared/db.json` is the master copy. Anyone opening the site for the first time gets it automatically — no upload, no clicks.

**To publish:** Settings → Shared data → **Publish** downloads `db.json`. Drop it in `data/shared/` and commit:

```bash
git add data/shared/db.json
git commit -m "Update plant data"
git push
```

Vercel redeploys in ~30 seconds.

**To receive:** Settings → **Pull**. Three modes — *replace mine*, *repo wins*, or *keep my edits*. **Check for updates** compares timestamps and tells you who published last.

Anyone who has opened the app before must click Pull; it will not silently overwrite local data someone is mid-way through entering.

### The rule that keeps this safe
**One person owns the file at a time.** This is a shared *file*, not a database — no locking. If two people publish from their own copies, whoever commits second wins. Decide who does data entry.

### Two cautions
- **Keep the repo private.** Asset lists, vendors and bin locations live in `db.json`.
- **No GitHub token in the browser, ever.** Pushing from a web page would require embedding a token readable via view-source, granting write access to the whole repo. That's why publishing is a commit.

---

## Where the data lives

Browser **localStorage**, per device, per browser, per domain. Zero backend, zero cost, works offline.

- Close the tab and reopen — data is there.
- Different browser, phone, or preview URL — separate data.
- Clearing site data erases it. Use **Backup** (top bar) regularly.

---

## Run locally

```bash
npm run dev          # http://localhost:3000
# or
python3 -m http.server 3000
```

Opening `index.html` directly works, except the shared-data pull, which needs http.

---

## Deploy

Push to GitHub → vercel.com → **Add New → Project** → Import → Framework **Other**, build command and output directory **empty** → Deploy. Every push to `main` redeploys automatically.

> Folder names are case-sensitive on Vercel. The folder must be `assets`, lowercase.

---

## Importing spreadsheets

**Import CSV**, pick the type, drop the file. Headers are auto-matched:

- `Asset ID`, `ASSET NO.`, `Equipment ID` → **id**
- `Manufacturer Part Number`, `Mfr P/N`, `OEM Part Number` → **mfrPn**
- `Quantity On Hand`, `Qty`, `On Hand` → **qty**
- `Scheduled Date`, `Due Date`, `Target Date` → **dateDue**
- `Image URL`, `Picture`, `Photo` → **imageUrl**
- `Spec Sheet`, `Manual`, `Datasheet` → **docUrl**

Anything unmatched you map by hand, with a live preview before committing. Rows match on **id** — matches update, the rest are added. Samples in `data/`.

---

## Structure

```
techx-cmms/
├── index.html
├── assets/
│   ├── styles.css
│   ├── db.js               # storage layer — swap this to add a backend
│   ├── sync.js             # pull/publish the shared repo copy
│   ├── csv.js              # CSV parse/build + header aliasing
│   ├── ui.js               # tables, forms, drawer, toast, escaping
│   └── app.js              # router + every screen
├── data/
│   ├── shared/db.json      # MASTER COPY — commit this to share data
│   ├── assets.csv
│   ├── pm_schedule.csv
│   ├── spare_parts.csv
│   └── work_orders.csv
├── package.json
├── vercel.json
└── README.md
```

---

## Going multi-user later

`db.js` exposes five functions: `all`, `get`, `upsert`, `remove`, `bulkUpsert`. Nothing else touches storage.

To move to a real database, rewrite those against an API and leave every other file alone:

1. Create a **Vercel Postgres** database
2. Add `/api/[entity].js` routes for GET / POST / DELETE
3. Point the five functions at them, make them `async`
4. Add auth so each technician signs in

Screens, forms, importer and business rules carry over untouched. That's the step to take when two people need to enter work orders in the same shift — the shared-file approach can't handle that.

---

## Next steps worth taking

1. **Import your real asset list**, then publish once to set the baseline.
2. **Count the spare parts** — one walk through the crib switches on every low-stock alert.
3. **Assign an owner to each PM.** Unassigned schedules don't get done.
4. **Record cause of failure on every close.** After a handful, repeat-failure patterns surface.
5. Then: QR codes on machines linking straight to `#/asset/<id>`, and a mobile PM checklist.

---

MIT licensed. Built for IAC Cottondale.
