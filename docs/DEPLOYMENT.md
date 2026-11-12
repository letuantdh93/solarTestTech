# Deployment

The application is a single Node.js process. It serves the REST API under `/api` and the built SPA on **port 2112**, and it needs PostgreSQL 16 with the `pg_trgm` extension, which the first migration creates.

## Environment variables (`.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/solar_exam?schema=public` |
| `PORT` / `HOST` | no | default `2112` / `0.0.0.0` |
| `SESSION_TTL_HOURS` | no | sliding session lifetime (default 12) |
| `COOKIE_SECURE` | prod: yes | set `true` behind HTTPS (also enables HSTS) |
| `UPLOAD_DIR` | no | image storage directory (default `./uploads`), must be writable |
| `SEED_ADMIN_PASSWORD` | seed only | initial `admin` password |
| `LOGIN_RATE_LIMIT` | no | login attempts per minute per IP (default 10) |
| `ANTHROPIC_API_KEY` | no | enables the AI assistant |
| `AI_MODEL` | no | default `claude-opus-5-5` (can also be changed in Cấu hình hệ thống) |
| `AI_PROVIDER` | no | `anthropic` (default) or `mock` (tests/demos) |

## Option A: Docker Compose (recommended)

```bash
cp .env.example .env && edit .env       # set POSTGRES_PASSWORD, SEED_ADMIN_PASSWORD, COOKIE_SECURE …
docker compose --profile app up -d --build
docker compose exec app npx tsx prisma/seed.ts   # first run only (if tsx is unavailable, seed from a dev checkout against the same DB)
```

The `app` container runs `prisma migrate deploy` on start, runs as a non-root user, and stores uploads in the `solar_exam_uploads` volume.

## Option B: Linux server with systemd

```bash
# on the server (Node 22+, pnpm via corepack, PostgreSQL 16)
git clone … /opt/solar-exam && cd /opt/solar-exam
cp .env.example .env && edit .env
pnpm install --frozen-lockfile
pnpm --filter @solar/server exec prisma generate
pnpm build
pnpm db:deploy && pnpm db:seed
sudo cp deploy/solar-exam.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now solar-exam
```

For TLS, put a reverse proxy in front (see `deploy/nginx.conf.example`) and set `COOKIE_SECURE=true`.

## Operations

- **Health:** `GET /api/health`
- **Logs:** structured JSON (pino) on stdout
- **Backups:** `pg_dump` the database and archive `UPLOAD_DIR`. Results reference immutable attempt snapshots, so restoring only the database keeps historical results intact.
- **Background jobs:** in-process, every 30 s: purge expired sessions and auto-submit attempts past their deadline.
- **Scaling:** sessions and attempts live in PostgreSQL, so several instances can run behind a load balancer. The rate-limit store is in memory per instance.

## Security checklist before go-live

1. Change `SEED_ADMIN_PASSWORD` and deactivate or delete the demo accounts.
2. Set `COOKIE_SECURE=true` behind HTTPS.
3. Restrict database access to the application host. Compose binds Postgres to `127.0.0.1` only.
4. Review role permissions (Người dùng & phân quyền → Vai trò & quyền).
5. Leave `ANTHROPIC_API_KEY` empty if AI must not be used, or turn AI off in Cấu hình hệ thống.
