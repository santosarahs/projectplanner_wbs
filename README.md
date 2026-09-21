# Project Master

Weekly project status dashboard for the team, originally sourced from
`projectmaster.xlsx`. Built with Next.js, deployed on Vercel, with:

- **Storage** — every `.xlsx` upload is parsed and saved to Postgres, so the
  history of weekly reports persists independently of the spreadsheet file.
- **Email sign-in** — passwordless magic-link login, gated by an allowlist of
  email addresses. No passwords stored anywhere.
- **Upload in the app** — signed-in users can upload a new `projectmaster.xlsx`
  directly from the dashboard; it replaces the stored weekly reports.

## One-time setup

You'll need three free accounts, all under your own control:

### 1. Neon Postgres (via Vercel)

In your Vercel project: **Storage → Create Database → Neon → Create**. Vercel
injects `POSTGRES_URL` (and related vars) into your project automatically —
no manual copy/paste needed. The app creates its own table on first use.

### 2. Resend (sends the sign-in emails)

1. Create a free account at [resend.com](https://resend.com).
2. Create an API key and set it as `RESEND_API_KEY` in Vercel (**Settings →
   Environment Variables**).
3. Until you verify your own sending domain in Resend, leave `EMAIL_FROM` as
   the default `Project Master <onboarding@resend.dev>` — Resend only lets
   that test address send to *your own* Resend account email until a domain
   is verified. Verify a domain (Resend → Domains) to send to your whole team.

### 3. Vercel (hosting)

1. Import this GitHub repo into Vercel ([vercel.com/new](https://vercel.com/new)).
2. Add the environment variables below (**Settings → Environment Variables**).
3. Deploy.

### Environment variables

See `.env.example` for the full list. The two you must set by hand:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | From your Resend account |
| `ALLOWED_EMAILS` | Comma-separated list of emails allowed to sign in |
| `AUTH_SECRET` | Random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `BASE_URL` | Your deployed URL, e.g. `https://projectplanner-wbs.vercel.app` (set this after your first deploy, then redeploy) |

`POSTGRES_URL` is set automatically once you attach the Neon database above.

## Getting your data in

After the first deploy, sign in and use the **Upload new report** button to
upload `projectmaster.xlsx`. Each upload replaces the stored weekly reports
with whatever sheets are in that file, so re-uploading after you add a new
week's sheet is the normal weekly workflow.

## WBS module

`/wbs` holds a work breakdown structure per project, for the projects that need one.
Upload a sheet laid out like the team template (one file per project):

- A title block (`Project Title`, `Project Description`, `Unit`).
- Two header rows: `Task Title` / `Category` / `Minutes` / `OWNER` / `%`, then one column per
  unit (rooms, floors, sites), with optional group labels above them.
- Phase rows (1, 2, 3) and task rows (1.1, 1.2...), one status code per unit:
  `C` = Complete, `NR` = Not required, blank = Pending.

Progress is calculated by the app, not read from the sheet: completed units out of the units
where the task applies (`NR` excluded), weighted by minutes per unit. The `QTY`, `BDGT` and `%`
columns are ignored. The estimate is planned hours plus 15% contingency.

Anyone signed in can click a unit square to cycle Pending → Complete → Not required; changes
save immediately. Re-uploading a sheet with the same project title replaces its tasks and
statuses (including in-app edits) but keeps its link to the Project Master row. Link a WBS to a
Project Master project from the WBS page and that project shows a WBS progress link on the
dashboard.

## Local development

```
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Project structure

- `app/page.tsx` — the dashboard (client component; fetches `/api/data`)
- `app/login/page.tsx` — email sign-in form
- `app/api/data` — returns all stored weekly reports from Postgres
- `app/api/upload` — parses an uploaded `.xlsx` and replaces stored reports
- `app/api/auth/*` — magic-link request/verify/logout/me endpoints
- `lib/parseWorkbook.ts` — turns a `projectmaster.xlsx`-shaped workbook into
  structured JSON (teams, projects, critical issues, escalations per week)
- `lib/db.ts` — Postgres access (`@vercel/postgres`)
- `lib/auth.ts` / `lib/allowlist.ts` — signed magic-link/session tokens and
  the email allowlist
- `middleware.ts` — redirects unauthenticated requests to `/login`
- `app/wbs/*`, `app/api/wbs/*` — WBS list, detail page and API
- `lib/parseWbs.ts`, `lib/wbs.ts`, `lib/dbWbs.ts` — WBS parsing, shared calculations, storage
