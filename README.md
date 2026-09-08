# Tech X — CMMS Starter

A small, working maintenance app: **assets, PM schedules, spare parts, work orders**, with CSV import/export.

No build step. No database. No dependencies. Drop it on Vercel and it runs.

---

## What it does today

| Screen | What you can do |
|---|---|
| **Dashboard** | PMs due in the next 7 days, open work orders, low-stock parts, uncounted parts |
| **Assets** | Add/edit/delete assets; see PM, part and open-WO counts per asset |
| **PM Plan** | Schedule PMs by frequency, assign a technician, mark done (next due rolls forward automatically), generate a work order from a PM |
| **Spare Parts** | Track part number, manufacturer P/N, vendor, bin location, qty / min / max / unit cost. Quick **Count** button for cycle counts. Low-stock flags once a minimum is set |
| **Work Orders** | Full record: type, priority, requester, assignee, dates, hours, cost, cause of failure, parts used. **A work order cannot be completed until a cause of failure is recorded** |
| **Import CSV** | Drop a spreadsheet export, columns are auto-matched, fix any by hand, preview, import. Matching IDs update in place |
| **Settings** | Site name, JSON backup/restore, load sample data, erase everything |

### Rules built in

- Marking a PM done stamps *last completed* and rolls *next due* forward by its frequency.
- Completing a PM-generated work order rolls that PM forward too.
- A part with no quantity is *Not counted*, not *In stock* — no false confidence.
- Closing a work order requires a cause of failure, so failure history is usable later.

---

## Sharing data through the repo (before there's a database)

The file **`data/shared/db.json`** in this repo is the master copy. The app reads it; publishing an update is a git commit.

**Anyone opening the site for the first time gets that data automatically.** Your boss clicks the link and sees the real asset list, not an empty app.

### To publish your changes

1. **Settings → Shared data → Publish** — downloads `db.json`
2. Drop it into `data/shared/` in your repo, replacing the old one
3. Commit and push:

```bash
git add data/shared/db.json
git commit -m "Update plant data"
git push
```

Vercel redeploys in about 30 seconds. Everyone else gets it on their next Pull.

### To get someone else's changes

**Settings → Shared data**, then pick one:

| Button | What it does |
|---|---|
| **Check for updates** | Tells you whether the repo copy is newer than what you have |
| **Pull — replace mine** | Repo copy wins outright. Anything local not in the repo is **gone** |
| **Pull — repo wins** | Merges. On a clash the repo value wins; your local-only records survive |
| **Pull — keep my edits** | Merges. Your values win on a clash; new repo records get added |

### The rule that keeps this from going wrong

**One person owns the file at a time.** This is a shared *file*, not a database — there's no locking. If you and your boss both publish from your own copies, whoever commits second overwrites the first. Decide who does data entry, or agree on who publishes and when.

Realistically: you own it. Your boss pulls to look. That works fine.

### Two cautions

**Make the repo private.** Your asset list, vendors and bin locations end up in `db.json`, readable by anyone who can see the repo.

**No token in the browser, ever.** Writing to GitHub from a web page needs a personal access token embedded in the page, where anyone can read it from view-source — and that token grants write access to your whole repo. That's why publishing is a commit you make, not a button that pushes.

---

## Where the data lives

**In your browser's localStorage**, on the machine you're using. That is a deliberate first step: it means zero backend, zero cost, zero setup, and it works offline.

What that means in practice:

- Data does **not** sync between people or devices.
- Clearing site data erases it.
- Use **Settings → Download backup** regularly. The backup is one JSON file that restores everything.

When you outgrow this, only `assets/db.js` needs replacing (see *Going multi-user* below).

---

## Run it locally

Open `index.html` directly and everything works **except** the "use bundled sample file" button, which needs a real server. To get the full thing:

```bash
npm run dev
# then open http://localhost:3000
```

Or with Python:

```bash
python3 -m http.server 3000
```

---

## Put it on GitHub

```bash
cd techx-cmms
git init
git add .
git commit -m "Tech X CMMS — initial working version"
git branch -M main
git remote add origin https://github.com/<your-username>/techx-cmms.git
git push -u origin main
```

---

## Deploy to Vercel

### Option A — from the dashboard (easiest)

1. Go to **vercel.com → Add New → Project**
2. Import the `techx-cmms` repository
3. Framework preset: **Other**
4. Build command: *leave empty*
5. Output directory: *leave empty*
6. **Deploy**

### Option B — from the terminal

```bash
npm i -g vercel
cd techx-cmms
vercel        # preview URL
vercel --prod # production URL
```

Every push to `main` redeploys automatically.

---

## Importing your own spreadsheets

Export each sheet as CSV, then **Import CSV** and pick what you're importing.

Headers are matched automatically. All of these land on the right field:

- `Asset ID`, `ASSET NO.`, `Equipment ID`, `asset_number` → **id**
- `Equipment Name`, `Description`, `Asset Name` → **name**
- `Manufacturer Part Number`, `Mfr P/N`, `OEM Part Number` → **mfrPn**
- `Quantity On Hand`, `Qty`, `On Hand`, `Stock` → **qty**
- `Next Due Date`, `Due`, `Next Date` → **nextDue**

Anything it can't place is left for you to map by hand in step 3, and you see a live preview before committing. Rows are matched on **id** — matches update, the rest are added.

Sample files are in `data/` and match the exact structure the importer expects.

---

## Project structure

```
techx-cmms/
├── index.html              # app shell
├── assets/
│   ├── styles.css          # all styling
│   ├── db.js               # storage layer — swap this to add a backend
│   ├── sync.js             # pull/publish the shared repo copy
│   ├── csv.js              # CSV parse/build + header aliasing
│   ├── ui.js               # rendering helpers (tables, forms, drawer, toast)
│   └── app.js              # router + every screen
├── data/
│   ├── shared/
│   │   └── db.json         # MASTER COPY — commit this to share data
│   ├── assets.csv          # sample CSVs matching the import format
│   ├── pm_schedule.csv
│   ├── spare_parts.csv
│   └── work_orders.csv
├── package.json
├── vercel.json
└── README.md
```

---

## Going multi-user later

`db.js` exposes a deliberately small surface: `all`, `get`, `upsert`, `remove`, `bulkUpsert`. Nothing else in the app touches storage.

To move to a shared database, rewrite those five functions against an API and leave every other file alone. A practical path on Vercel:

1. Create a **Vercel Postgres** database (free tier available)
2. Add `/api/[entity].js` serverless routes for GET / POST / DELETE
3. Point the five functions in `db.js` at those routes and make them `async`
4. Add auth (Vercel handles this well with Auth.js) so each technician signs in

The screens, forms, CSV importer and business rules carry over untouched.

---

## Suggested next steps

1. **Import your real asset list** and get one line fully populated.
2. **Count the spare parts** — this is one walk through the crib and it switches on every low-stock alert.
3. **Assign an owner to each PM.** An unassigned schedule doesn't get done.
4. **Record cause of failure on every closed work order.** After three or four, repeat-failure patterns start showing up.
5. Then add QR codes on the machines linking to `#/assets`, and a mobile-friendly PM checklist.

---

MIT licensed. Built for IAC Cottondale.
