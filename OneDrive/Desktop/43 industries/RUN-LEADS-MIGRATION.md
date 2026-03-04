# Run the leads migration

**Open:** https://supabase.com/dashboard/project/zxsboumaklevbgxzumwb/sql/new

---

## Option A — One paste (try this first)

Paste this whole block and click **Run**:

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  role text,
  message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON public.leads;
CREATE POLICY "Service role only" ON public.leads
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
COMMIT;
```

---

## Option B — If Option A doesn’t run: 2 steps

**Step 1** — Paste and Run (creates the table):

```sql
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  role text,
  message text,
  created_at timestamptz DEFAULT now()
);
```

**Step 2** — Paste and Run (RLS + policy + index):

```sql
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON public.leads;
CREATE POLICY "Service role only" ON public.leads FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
```

---

## Option C — From your computer (no dashboard)

In PowerShell, from the project folder (replace `YOUR_PASSWORD` with your DB password):

```powershell
cd "c:\Users\itsma\OneDrive\Desktop\43 industries"
$env:DATABASE_URL = "postgresql://postgres.zxsboumaklevbgxzumwb:YOUR_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"
node scripts/apply-leads-schema.js
```

---

After the table exists, set **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** in Netlify and redeploy.
