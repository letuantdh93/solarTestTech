# Solar PV Examination Platform – Nền tảng Sát hạch Kỹ thuật Điện mặt trời

Web platform for building, managing and running technical multiple-choice examinations for solar PV engineers, supervisors and QC staff. The UI is entirely in Vietnamese. It runs on **port 2112**.

| | |
|---|---|
| Stack | pnpm monorepo · Fastify 5 + Prisma 6 (PostgreSQL 16) · React 18 + Vite + Tailwind + Framer Motion + Recharts + KaTeX · i18next (vi) |
| Packages | `apps/server` (API + serves the SPA), `apps/web` (UI), `packages/shared` (Zod schemas, enums, calculation engine, quality checks) |
| AI | Provider-agnostic interface; Anthropic Claude adapter (`claude-opus-5-5` by default). Optional: the app works fully without an API key |

## Quick start (local)

```bash
cp .env.example .env            # then set SESSION_SECRET, SEED_ADMIN_PASSWORD (and ANTHROPIC_API_KEY if you want AI)
pnpm install
pnpm db:up                      # PostgreSQL 16 in Docker on 127.0.0.1:5544
pnpm db:deploy                  # apply migrations
pnpm db:seed                    # roles, permissions, taxonomy A–K, demo users, 61 verified questions, default 30-question blueprint
pnpm db:seed-demo               # OPTIONAL: demo exams + simulated attempts (graded by the real engine) for the analytics screens
pnpm build && pnpm start        # http://localhost:2112
```

Development with hot reload: `pnpm dev` (API on :2112, UI on http://localhost:5173 proxied to the API).

### Demo accounts

| Username | Role | Password |
|---|---|---|
| `admin` | System administrator | value of `SEED_ADMIN_PASSWORD` |
| `quanly` | Examination manager | `Demo@123456` |
| `bientap` | Question author (categories A–K) | `Demo@123456` |
| `ts.nguyenvan`, `ts.phamthi`, `ts.hoang`, `ts.vu`, `ts.dang` | Candidates | `Demo@123456` |

Change or deactivate the demo accounts before production use (Người dùng & phân quyền).

## Testing

```bash
pnpm test                       # shared unit tests, web unit tests, server API/integration tests
scripts/e2e.sh                  # Playwright E2E (needs Docker; start the server with LOGIN_RATE_LIMIT=500 for E2E)
```

Server tests create an **ephemeral database** per run (`solar_exam_test_run_*`), apply migrations with `migrate deploy`, seed it, and drop it afterwards. Existing databases are never reset. AI tests use a deterministic mock provider (`AI_PROVIDER=mock`), so no API calls or costs are involved.

## Key behaviours

- **Exam entry without login:** candidates open `/vao-thi`, enter full name, phone number and department, and the system **picks one of the open public exams at random**. It only picks exams where that phone still has attempts left, and resumes an unfinished attempt first. `/vao-thi/<exam code>` links straight to a specific exam. The phone number identifies the candidate. A no-login session can only access the attempts started in that session, so typing someone else's number does not reveal their results. Staff still log in at `/dang-nhap`. Each exam has a "Cho phép thi không cần đăng nhập" switch.
- **Question order is always randomised** on every attempt with a fresh random seed. Option order follows the exam setting.

- **Answer-key verification:** calculation questions carry a `calcSpec` (safe expression + variables). The server recomputes it and blocks submission/approval when the stored key does not match. All 61 demo questions are verified in CI (`test/seed-questions.test.ts`).
- **Question workflow:** DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED → ARCHIVED. Only APPROVED/PUBLISHED questions can be used in exams. Editing an approved question returns it to DRAFT. Authors cannot approve their own questions.
- **Exam generation:** category × difficulty allocation is solved as a max-flow problem. Categories are never substituted, and shortfalls and difficulty deviations are reported explicitly.
- **Exam integrity:** every attempt stores immutable snapshots of its questions and options. Answer keys never leave the server before submission. Grading is server-side only. Submission is idempotent under a row lock, and attempts auto-submit when time expires (on access and from a background job).
- **Standards policy:** demo data cites only standard and edition, never clause numbers. AI prompts forbid fabricated requirements and clauses.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/MIGRATIONS.md](docs/MIGRATIONS.md).
