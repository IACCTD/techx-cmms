# Setup — accounts and database

Two paths below. Pick the one that matches where you are.

---

## A · Already running the database version

You only need to upload the new code and set two environment variables.

1. **Upload the new files** — replace `api/` and `assets/`, plus `index.html`, `package.json`, `.env.example`.
2. Vercel → **Settings → Environment Variables**, add:
   - `ADMIN_USERNAME` → e.g. `marcelo`
   - `ADMIN_PASSWORD` → your own password (change it after first sign-in)
   - `ADMIN_NAME` → e.g. `Marcelo Frazzato`
   You can delete the old `APP_PASSWORD` afterwards.
3. Vercel → **Deployments** → top one → **⋯ → Redeploy**.
4. Open the app, sign in with that username and password.
5. Go to **Users** and add your people.

Your existing data is untouched — this only adds accounts.

---

## B · Starting from the browser-only version

**Click Backup on your live app first.** That's your safety net.

### 1 · Upload the code
Delete `assets/` in GitHub, then upload: the **`api`** folder, the **`assets`** folder, `index.html`, `package.json`, `vercel.json`, `.env.example`, `README.md`, `SETUP.md`. Commit.

Deploys will show errors until steps 2–3 are done. That's expected.

> Keep `api` and `assets` lowercase — Vercel is case-sensitive.

### 2 · Create the database
Vercel → your project → **Storage** → **Create Database** → **Neon** → region **us-east-1** → **Free** plan → name it `techx-cmms-db` → **Create**.

Then **Connect Project** → select `techx-cmms` → tick all three environments → **Connect**. That injects `DATABASE_URL` automatically; you never copy it.

> Vercel's own Postgres product is Neon now — that's why the option says Neon.

### 3 · Create your admin account
Vercel → **Settings → Environment Variables**, add all three, ticking every environment:

| Key | Value |
|---|---|
| `ADMIN_USERNAME` | `marcelo` |
| `ADMIN_PASSWORD` | a password you choose |
| `ADMIN_NAME` | `Marcelo Frazzato` |

### 4 · Redeploy
**Deployments** → top one → **⋯ → Redeploy**. Environment variables only apply to builds made after they're set, so this is required.

### 5 · Sign in and load your data
Open the app, sign in. The badge top-right should read **● Marcelo Frazzato · Admin**.

Then **Settings → Move existing data into the database → Upload this device's data**.

---

## Adding your team

**Users** in the sidebar (admins only) → **Add person**.

Give them a temporary password in person. The first time they sign in, the app asks them to choose their own. You never see it afterwards — if they forget it, use **Manage → Reset password**.

### Which role?

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

Most people should be **Maintenance**. Deleting is admin-only because it's the one action that quietly destroys a machine's history — everything a technician needs day to day is available to both.

Keep **at least two admins** so nobody is locked out if you're away. The app refuses to demote or disable the last remaining admin.

### When someone leaves
**Users → Manage → Disable.** They're signed out immediately and can't sign back in, but their work history stays intact. Don't delete the account — that's what keeps "closed by John Davis" meaningful.

---

## How security works here

- Passwords are stored as **PBKDF2-SHA256 hashes**, 210,000 rounds, with a random salt per user. Plain text is never stored, logged, or sent back to the browser.
- Sign-in returns a **session token** valid for 30 days. Only the token lives in the browser.
- Changing your password signs you out on every other device.
- Every role check is enforced **on the server**. Hiding a button in the browser is a convenience; the server refuses the action regardless.

---

## Troubleshooting

**"Could not reach the database"**
Open `your-app.vercel.app/api/data`. A **401** means the API is alive and just wants a session — healthy. A **404** means the `api` folder didn't upload. A **500** means `DATABASE_URL` is missing or you skipped the redeploy.

**Can't sign in as admin**
Check `ADMIN_USERNAME` and `ADMIN_PASSWORD` in Vercel for trailing spaces, and confirm you redeployed after setting them. The founding admin is only created when the users table is empty — if you already made accounts, use one of those instead.

**Someone forgot their password**
Users → Manage → set a new temporary password. They'll be asked to change it on next sign-in.

---

## Cost

Neon's free tier covers a plant this size comfortably. Vercel hosting stays free on Hobby.

Free Neon databases pause after inactivity, so the first request after a quiet spell takes a second or two to wake. Not an issue for this use.
