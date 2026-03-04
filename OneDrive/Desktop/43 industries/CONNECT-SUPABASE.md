# Connect Supabase (3 steps)

## 1. Copy your service_role key

Open this link (your Supabase API settings):

**https://supabase.com/dashboard/project/zxsboumaklevbgxzumwb/settings/api**

Under **Project API keys**, find **service_role** → click **Reveal** → **Copy**.

---

## 2. Add two variables in Netlify

Open your site on Netlify → **Site configuration** → **Environment variables** → **Add a variable** / **Add multiple**.

Add these **two** (one by one):

| Variable name | Value |
|---------------|--------|
| `SUPABASE_URL` | `https://zxsboumaklevbgxzumwb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(paste the key you copied in step 1)* |

Save.

---

## 3. Redeploy

**Deploys** → **Trigger deploy** → **Deploy site**.

Done. The form will save to Supabase and `/admin.html` will show leads (set `ADMIN_SECRET` in env if you haven’t).
