# Database migrations

The schema lives in `apps/server/prisma/schema.prisma`. Migrations are in `apps/server/prisma/migrations/` and are applied with **`prisma migrate deploy`**, which only applies pending migrations and never resets data.

## Applying

```bash
pnpm db:deploy          # = prisma migrate deploy (dev, CI, production)
```

## Creating a new migration (development)

```bash
cd apps/server
npx prisma migrate dev --create-only --name <change>   # generates SQL without applying it
# review/edit the SQL (hand-written parts are allowed, see below)
npx prisma migrate deploy
npx prisma generate
```

Never run `prisma migrate reset` against a database that contains real data.

## Migration log

| Migration | Content |
|---|---|
| `…_init` | All 26 tables (RBAC, sessions, groups, taxonomy, questions/options/media/references/revisions/review logs, blueprints, examinations, assignments, attempts, attempt question snapshots, answers, results, audit logs, AI jobs, settings). **Hand-written additions:** `pg_trgm` extension; GIN trigram indexes on `questions.content`/`title` (keyword search + duplicate detection); GIN index on `questions.tags`; CHECK constraints for difficulty (1–4) and calculation complexity (0–3); CHECK that an assignment targets exactly one of user/group; partial unique index `attempt_one_in_progress_idx` (one IN_PROGRESS attempt per candidate and exam, which makes "start" race-safe). |
| `20261112100000_guest_exam_access` | `examinations.public_access` (default true); `users.phone` (unique) + `users.is_guest`; `sessions.is_guest`; `examination_attempts.access_session_id` (+ index). Written from `prisma migrate diff`; the diff's DROP statements for the hand-written trigram/GIN indexes were removed on purpose. |

## Data-preservation rules built into the schema

- `attempt_questions.snapshot` stores the full question, options and answer key as delivered. Results never depend on the live question.
- Foreign keys use `RESTRICT` from attempts and results to examinations and users, so history cannot be deleted by accident. Users with history are deactivated instead of deleted.
- Questions used in an exam or attempt cannot be deleted, only archived.
- Every question edit creates a `question_revisions` row (full snapshot) and increments `version`.
