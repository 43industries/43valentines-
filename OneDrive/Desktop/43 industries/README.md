# 43 Industries

Static site for [43 Industries](https://43industries.com). Deploy with Netlify.

## Push to GitHub

Repo: **https://github.com/43industries/43_INDUSTRIES**

### Option 1: Run the script (if Git works in this folder)

In PowerShell, from this folder:

```powershell
.\push-to-github.ps1
```

If you get permission or lock errors (common with OneDrive), use Option 2.

### Option 2: Push from a folder outside OneDrive

1. Create a folder **outside** OneDrive, e.g. `C:\43industries`.
2. Copy into it: `index.html`, `netlify.toml`, `.gitignore`.
3. Open PowerShell in that folder and run:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial commit: 43 Industries website"
git remote add origin https://github.com/43industries/43_INDUSTRIES.git
git push -u origin main
```

4. When prompted, sign in to GitHub (browser or token).

After the first push, you can work from this folder and add a second remote, or keep using the copy and pull/push from here.

## Deploy on Netlify

1. Go to **[netlify.com](https://www.netlify.com)** → **Add new site** → **Import an existing project**.
2. Choose **GitHub** and authorize Netlify (grant access to **43industries** org if the repo is there).
3. Select the **43industries/43_INDUSTRIES** repository.
4. **Build settings:** Build command = `npm install`, Publish directory = `.` (or use defaults from `netlify.toml`).
5. Click **Deploy site**.

### Backend (Invest form + leads DB + admin)

- **Form** → Sends email via [Resend](https://resend.com) and stores the lead in [Supabase](https://supabase.com).
- **Admin** → Open `/admin.html`, enter your admin key to view all leads in a table.

**1. Resend (email)**  
- Sign up at [resend.com](https://resend.com), get an API key.  
- In Netlify env: `RESEND_API_KEY`, `INVEST_INBOX_EMAIL` (e.g. `invest@43industries.com`).

**2. Supabase (database)**  
- Create a project at [supabase.com](https://supabase.com).  
- In **SQL Editor**, run the contents of `supabase-schema.sql` (creates `leads` table).  
- In **Settings → API** copy the **Project URL** and **service_role** key.  
- In Netlify env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**3. Admin key**  
- In Netlify env set `ADMIN_SECRET` to a long random string (e.g. from a password generator).  
- Use that same string on `/admin.html` to view leads.

**4. Redeploy** after setting env vars.

Local: copy `.env.example` to `.env` and run `netlify dev`.

Done. Pushes to `main` will auto-deploy.

## Investor portal (accounts & tracking)

The root folder also includes a simple investor portal at `portal.html`:

- Uses **Supabase Auth** so investors can create an account and sign in.
- Stores per-user data in Supabase tables:
  - `investor_profiles` (1:1 with `auth.users`)
  - `investments` (per-investor commitments and notes)
- Row Level Security (RLS) is enabled so each investor only sees their own data.

### Setup steps

1. In Supabase, run the updated `supabase-schema.sql` (it now creates `investor_profiles` and `investments` with RLS).
2. In Supabase → **Settings → API**, copy:
   - Project URL → paste into `SUPABASE_URL` in `portal.html`.
   - `anon` public key → paste into `SUPABASE_ANON_KEY` in `portal.html`.
3. Commit and deploy `portal.html` to Netlify alongside `index.html`.
4. Optionally, add a link from `index.html` nav (e.g. “Investor Portal”) pointing to `/portal.html`.

After that, visitors can:

- Sign up / sign in on `portal.html`.
- See their own profile and a table of their recorded investments.
- Add new “commitments” which you or your team can later update or reconcile on the Supabase side.

When a new commitment is recorded, the portal also calls the Netlify function
`/.netlify/functions/notify-investment`, which uses **Resend** and your
existing `INVEST_INBOX_EMAIL` to send you an email summary of the amount,
currency, and note for that investor.
