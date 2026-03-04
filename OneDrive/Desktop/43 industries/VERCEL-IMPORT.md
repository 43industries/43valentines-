# Import 43_INDUSTRIES from GitHub into Vercel

The repo is **https://github.com/43industries/43_INDUSTRIES** (under the **43industries** organization).  
Vercel can’t see it until it has access to that org.

## Step 1: Grant Vercel access to the 43industries org

1. Go to **https://vercel.com/new** (Add New Project).
2. Under **Import Git Repository**, click **Continue with GitHub** (or sign in with GitHub).
3. On the **GitHub authorization** screen, make sure you **grant access to the 43industries organization** (not only your personal account). Approve so Vercel can see org repos.
4. If you **don’t see** `43industries/43_INDUSTRIES` in the repo list:
   - Click **“Adjust GitHub App permissions”** or **“Configure GitHub App”** on the import screen.
   - Or go to **GitHub** → **Settings** → **Applications** → **Authorized OAuth Apps** (or **Integrations**) → **Vercel**.
   - Under **Repository access**, add **43industries/43_INDUSTRIES** (or allow all repos). Ensure **organization access** for **43industries** is granted (org owner may need to approve).
5. Go back to **https://vercel.com/new** and refresh; **43industries/43_INDUSTRIES** should appear.

## Step 2: Import the project

1. Click **Import** next to **43industries/43_INDUSTRIES**.
2. **Project Name:** leave as `43_INDUSTRIES` or set one you prefer.
3. **Framework Preset:** choose **Other**.
4. **Build Command:** leave empty.
5. **Output Directory:** leave empty.
6. Click **Deploy**.

## If the repo still doesn’t show

- Confirm you’re logged into the **same GitHub account** that has access to the 43industries org and the repo.
- Try in an **incognito/private** window: **https://vercel.com/new** and sign in with GitHub again.
- **Alternative (no import):** From your machine, in the project folder run:
  ```bash
  npx vercel
  ```
  and follow the prompts (link to existing project or create new one). This uses the Vercel CLI and doesn’t require the repo to show in the Vercel UI.
