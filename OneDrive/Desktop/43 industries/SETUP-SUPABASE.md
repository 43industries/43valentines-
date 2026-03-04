# Supabase setup for 43 Industries

The `leads` table stores invest-form submissions. Apply the schema once.

## Option A: Run from your machine (one command)

1. In Supabase: **Settings → Database** → copy the **Connection string** (URI, Transaction pooler).
2. In this folder, set the URL and run the script (PowerShell):

```powershell
cd "c:\Users\itsma\OneDrive\Desktop\43 industries"
$env:DATABASE_URL = "postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:5432/postgres"
npm install
node scripts/apply-leads-schema.js
```

Replace the URI with your real connection string (including password). The script creates the `leads` table and RLS policy.

## Option B: Supabase Dashboard

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** → **New query**.
3. Copy and paste the contents of **`supabase-schema.sql`** (project root).
4. Click **Run**.

## Option C: Supabase CLI

If you use [Supabase CLI](https://supabase.com/docs/guides/cli) and have the project linked:

```bash
supabase db push
```

---

Then in Netlify, set:

- `SUPABASE_URL` = your project URL (Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key (Settings → API)
- `ADMIN_SECRET` = a secret of your choice (for `/admin.html`)

Redeploy the site.
