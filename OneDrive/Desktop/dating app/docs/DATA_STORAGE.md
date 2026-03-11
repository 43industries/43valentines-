# Data storage & multiple accounts

Nexus is built so **every row/record is tied to a user**. Multiple accounts are supported by design.

---

## How it works

### 1. Single shared store, user-scoped data

- **Local:** One SQLite file (`nexus.db`) with tables: `users`, `posts`, `likes`, `comments`, `follows`, `swipes`, `magic_tokens`, `reset_tokens`.
- **Production (Netlify):** One Blob store (`nexus-data`) with a single JSON object that has the same logical structure: `users`, `posts`, `likes`, `comments`, `follows`, `swipes`, `nextUserId`, `nextPostId`, `nextCommentId`, `magicTokens`, `resetTokens`.

There is **one** store for the whole app, not one per account. Accounts are separated by **user IDs**, not by separate databases or blobs.

### 2. Every record is tied to a user

| Data        | How it’s tied to users |
|------------|-------------------------|
| **Users**  | One row per account: `id`, `username` (unique), `email`, `phone`, etc. |
| **Posts**  | `user_id` = who wrote the post. |
| **Likes**  | `user_id` + `post_id` = who liked which post. |
| **Comments** | `user_id` + `post_id` = who wrote which comment. |
| **Follows** | `follower_id` + `following_id` = who follows whom. |
| **Swipes** | `user_id` + `target_id` + `direction` = who swiped on whom (like/pass). |

So:

- One user can have many posts, likes, comments, follows, and swipes.
- “Multiple accounts” = many rows in `users`, each with a unique `id`, and all other tables referencing those IDs.

### 3. Identity and access

- **Sign up / login** create or authenticate a **user** and issue a JWT whose payload is `{ userId }`.
- **Every API request** that needs a current user uses that JWT and resolves to a single `userId` (e.g. `req.userId` or `getAuthUserId(event)`).
- **Only that user** can perform actions as themselves (post, like, comment, follow, swipe). There is no “acting as” another user.

So:

- **Multiple accounts** = many different `userId` values, each with their own posts, likes, follows, swipes, etc.
- **Handling multiple accounts** = making sure every write uses the authenticated `userId` and every read only exposes data the product is designed to show (e.g. discovery, feed, matches).

---

## ID generation (no collisions)

- **Local (SQLite):** `users.id` is `INTEGER PRIMARY KEY AUTOINCREMENT`. New users get the next free ID.
- **Netlify (Blob):** A single `nextUserId` is incremented each time a new user is created (`data.nextUserId++`). Same idea for `nextPostId` and `nextCommentId`.

So:

- Each new account gets a **unique** `id`.
- Posts, likes, comments, follows, and swipes use these IDs, so multiple accounts don’t overwrite or mix each other’s data.

---

## What you should do

1. **Backups**
   - **Local:** Copy `nexus.db` regularly (e.g. cron or script). Keep a few versions.
   - **Netlify:** Blobs are durable, but for disaster recovery you can periodically read the `db` blob and store it elsewhere (e.g. S3, your own backup script).

2. **Keep one source of truth**
   - Local dev uses SQLite; production uses Netlify Blobs. Don’t mix the two in the same environment. Each environment has one store and many accounts inside it.

3. **When you grow**
   - The current Blob design (one big JSON file) is fine for a moderate number of users. For very large scale you’d move to a real database (e.g. Postgres, Supabase, PlanetScale) and keep the same model: one DB, many users, every row keyed by `user_id` (or equivalent). The app already thinks in “user id”; you’d just swap the storage backend.

---

## Summary

- **One store** (one SQLite file or one Blob store), **many users**.
- **Multiple accounts** are handled by unique user IDs and by tying every piece of data (posts, likes, follows, swipes, etc.) to those IDs.
- **Access control** is enforced by using the JWT’s `userId` for all mutations and for any reads that are “per user.” No separate “per-account” database or blob is required.
