# Nexus — Where Souls Connect

A romantic social feed that connects people. Full-stack app with Node.js, Express, and SQLite (or Netlify Blobs when deployed).

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Sign up / Log in

- **Email or phone** – Enter email or phone number (phone needs a password)
- **Magic link** – Email-only, one-click sign-in (needs Resend)
- **Google** – Sign in with Google (needs `GOOGLE_CLIENT_ID`)

## Production setup

### 1. Generate JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the output — you’ll use it as `JWT_SECRET`.

### 2. Environment variables

**Local dev:** Install `dotenv` and copy `.env.example` to `.env`:

```bash
npm install dotenv
cp .env.example .env
```

Then edit `.env` with your values. **Netlify:** Add the same variables in Site settings → Environment variables.

| Variable | Required | How to get |
|----------|----------|------------|
| `JWT_SECRET` | **Yes** (production) | Run the command above |
| `RESEND_API_KEY` | For magic link emails | [resend.com](https://resend.com) → API Keys |
| `GOOGLE_CLIENT_ID` | For Google sign-in | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web app) |

For Resend: verify your domain (or use `onboarding@resend.dev` for testing). Add `http://localhost:3000` and your production URL to the Google OAuth client’s authorized redirect URIs if needed.

### 3. Deploy or update on Netlify

**First time**
1. Push the repo to GitHub
2. [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**
3. Connect GitHub and select the repo
4. Build settings: **Publish directory** `public`, **Functions directory** `netlify/functions`
5. In **Site settings → Environment variables**, add at least `JWT_SECRET` (and optionally `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `ADMIN_USER_IDS`)
6. **Deploy site**

**Update an existing site**
1. Push your latest code to the connected GitHub repo
2. Netlify will auto-deploy (or go to **Deploys** → **Trigger deploy**)
3. Ensure **Site settings → Environment variables** has `JWT_SECRET` set for production

## Features

- **Auth** – Email, phone, magic link, Google
- **Feed** – Posts, likes, comments (For You / Following)
- **Discover** – Swipe-style discovery
- **Matches** – Mutual likes
