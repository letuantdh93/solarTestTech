# Architecture

```
apps/web (React SPA) ──fetch /api (cookie session + CSRF header)──▶ apps/server (Fastify)
                                                                     ├─ lib/        auth (sessions, CSRF, RBAC), audit, validation, errors
                                                                     ├─ modules/    route + service per domain (business logic, Prisma access)
                                                                     │   auth · users · categories · questions (CRUD, workflow, Excel, media, similarity)
                                                                     │   exams (builder, max-flow generator) · attempts (engine) · results (scoring, analytics, reports)
                                                                     │   ai (provider interface, Anthropic adapter, mock, prompts) · dashboard · settings
                                                                     └─ Prisma ──▶ PostgreSQL 16 (+ pg_trgm)
packages/shared ── Zod schemas, enums/permissions, safe expression evaluator, calc templates,
                   question quality checks, text similarity, seeded shuffle (used by server AND web)
```

## Layering rules

- **Routes** only parse, authorize and delegate. **Services** hold business rules and DB access. Pure logic (scoring, generator, quality, calculation) has no DB dependency and is unit-tested.
- The **UI** has no hardcoded categories or exam configurations. Everything comes from the API. All UI text comes from `apps/web/src/i18n/vi.ts`.

## Security model

| Concern | Mechanism |
|---|---|
| Authentication | argon2id hashes; random 256-bit session token in an httpOnly, SameSite=Strict cookie; only the SHA-256 hash is stored; sliding expiry; account lockout after 5 failures; login rate limit |
| CSRF | per-session token, required in `x-csrf-token` on every state-changing request (constant-time compare) |
| Authorization | permission-based RBAC checked on every route; ownership checks for attempts/results/questions |
| Input | Zod validation everywhere (Vietnamese messages); Prisma parameterised queries; 2 MB body limit |
| XSS | strict CSP (`script-src 'self'`); Markdown rendered without raw HTML |
| Uploads | magic-byte sniffing (PNG/JPEG/WebP/GIF only, SVG rejected), random file names, 5 MB limit, authorised download with `nosniff` |
| Exam integrity | answer keys stripped from candidate payloads; server-side grading; row-locked idempotent submit; server-authoritative deadline with auto-submit |
| Audit | `audit_logs` for administrative operations, logins, exports, AI jobs |

## AI integration

`modules/ai/providers/types.ts` defines `AiProvider.generateStructured(schema)`. The Anthropic adapter uses structured outputs (schema-validated JSON), adaptive thinking with an `effort` setting, and server-side refusal fallbacks. Every AI result is untrusted: questions are saved as DRAFT and flagged, and calculation keys are recomputed by the server. An AI calculation question without a verifiable `calcSpec` cannot be submitted for review. Adding another provider means implementing the interface and registering it in `providers/index.ts`.
