# Deployment Guide — Production (Vercel)

This app is a **two-part system**:

| Part | Tech | Where it runs |
|---|---|---|
| `client/` | Next.js 16 (React 19) | **Vercel** |
| `server/` | Express + Prisma + Socket.IO | **Always-on host** (Render / Railway / Fly.io / VPS) — see "Why not Vercel?" below |

The Next.js app proxies every `/api/v1/*` call to the API host via `next.config.ts`
rewrites, so session cookies stay first-party on the app's domain and login works
on Vercel.

---

## 0. Why the API can't live on Vercel

The server is a **long-running Express process** with:

- **Socket.IO** realtime (chat, OPD queue, notifications) — needs persistent
  WebSocket connections, which Vercel serverless/edge functions don't support.
- **Long-lived DB/Redis connections** and a fixed port.

Keep it on any host that runs a Node process 24/7. Render, Railway, and Fly.io all
work; Render's free tier is a fine starting point.

---

## 1. Deploy the API (server) first

Choose a host (instructions below use **Render**, but any Node host works).

### Build & start commands

| | |
|---|---|
| Root directory | `server` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` (runs `node --import tsx dist/server.js`) |
| Health check | `GET /api/health` → `{"success":true,...}` |

> `npm install` runs `postinstall: prisma generate`, which generates the Prisma
> client (it's gitignored). Don't remove that script.

### Required environment variables

From `server/.env.example`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL (Prisma driver adapter) — e.g. Neon, Supabase, RDS |
| `DIRECT_URL` | ⚠️ | Needed for `prisma db push`/`migrate` when the main URL is a pooler |
| `BETTER_AUTH_SECRET` | ✅ | ≥ 32 chars random string |
| `BETTER_AUTH_URL` | ✅ | Public https URL of the API host (e.g. `https://hms-api.onrender.com`) |
| `CLIENT_URL` | ✅ | Comma-separated browser origins — **must include the Vercel app URL** |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ✅ for real file uploads | Without them, uploads fall back to a local stub |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | Hosts usually inject this themselves; keep `5000` otherwise |
| `MONGO_URI` | Optional | Chat / patient-chat features (Mongoose) |
| `REDIS_URL` | Optional | Caching / rate limiting (best-effort without it) |
| `HUGGINGFACE_API_KEY` | Optional | Hospital Assistant chatbot (falls back to canned replies) |

### First deploy: push the schema

The first time you deploy (or after any schema change), run the migrations
against your production Postgres. This needs `DIRECT_URL` set:

```bash
cd server
npx prisma db push
```

> ⚠️ **Known issue:** `schema.prisma` was previously out of sync with the local
> database (drift). If `db push` complains about drift on your production DB,
> reconcile the schema first — never run `db push` with drift if it would drop
> real data.

### Seed an admin (optional)

```bash
npx tsx prisma/seed-role-users.ts   # or the seed you use locally
```

---

## 2. Deploy the frontend (client) to Vercel

### Project setup

1. **Vercel → New Project → import your repo.**
2. **Root Directory: `client`** (critical — the Next app is in the subfolder).
3. Framework preset: **Next.js** (auto-detected).

### Environment variables

From `client/.env.example` — **set these BEFORE the first build** because
`next.config.ts` reads `NEXT_PUBLIC_API_URL` at build time:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<your-api-host>/api/v1` (no trailing slash) |
| `NEXT_PUBLIC_SOCKET_URL` | `https://<your-api-host>` (same host, no `/api/v1`) |

### What Vercel runs

- Build: `npm run build` → `next build` (lint + typecheck + production build).
- Runtime: static/SSR pages + the `Proxy` middleware (`src/proxy.ts`) which
  re-validates sessions against the API on every navigation.

---

## 3. Post-deploy checklist

1. **API** — open `https://<api-host>/api/health` → expect `success: true`.
2. **Login** — open the Vercel app → sign in as an admin → lands on `/dashboard`.
3. **Realtime** — open Chat; messages should appear live (Socket.IO over
   `NEXT_PUBLIC_SOCKET_URL` with the session token).
4. **Uploads** — Patients → upload a document; it should reach Cloudinary
   (check your Cloudinary Media Library), download should return a file.
5. **CORS** — if login fails with "Invalid origin", add the Vercel domain to
   `CLIENT_URL` on the API host and redeploy the API.

---

## 4. Keeping both in sync

- The API is **stateless between processes** except Socket.IO — if you run
  multiple API instances, add `REDIS_URL` (Upstash/Redis) for cache and put a
  sticky-session/WebSocket-compatible load balancer in front.
- `NEXT_PUBLIC_*` vars are baked into the client build — changing the API host
  URL requires a Vercel redeploy.
- Database schema changes: update `server/src/db/prisma/schema.prisma`, run
  `npx prisma db push` against production, then deploy both halves.
