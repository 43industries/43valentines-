# Supabase keys for Netlify

## Where to get them

1. Open **Supabase Dashboard** → your project.
2. Go to **Settings** (gear) → **API**.
3. Use these two values:

| Netlify env var | Where in Supabase | What it looks like |
|-----------------|-------------------|--------------------|
| **SUPABASE_URL** | "Project URL" | `https://zxsboumaklevbgxzumwb.supabase.co` |
| **SUPABASE_SERVICE_ROLE_KEY** | "Project API keys" → **service_role** (click Reveal, then copy) | Long string starting with `eyJ...` (JWT) |

**Important:** You must use the **service_role** key, not the **anon** (public) key.  
The anon key is blocked by RLS for the `leads` table. Only the service_role key works.

---

## Set in Netlify

1. **Site** → **Site configuration** → **Environment variables**.
2. **Add a variable** (or Edit):
   - **Key:** `SUPABASE_URL`  
     **Value:** `https://zxsboumaklevbgxzumwb.supabase.co` (no space, no quotes)
   - **Key:** `SUPABASE_SERVICE_ROLE_KEY`  
     **Value:** paste the full service_role key (starts with `eyJ`), no quotes, no line break
3. **Save**.
4. **Deploy** → **Trigger deploy** → **Deploy site** (so the new vars are used).

---

## If it still doesn’t work

- **No quotes** in the Netlify value fields.
- **No space** at the start or end of the key.
- **Scopes:** for the deploy that runs the functions, the vars must be available (e.g. set for “All” or “Production”).
- After changing env vars, trigger a **new deploy**; in-place changes don’t apply to already-built functions.
