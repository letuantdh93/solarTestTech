/**
 * Export the PUBLISHED and DRAFT examinations of this database to prisma/seed/exams.json,
 * so `pnpm db:seed` recreates them on another environment (e.g. production).
 *
 * Portable format: questions are referenced by question CODE, categories by category CODE,
 * groups by NAME, users by USERNAME, blueprints by NAME – never by database id.
 * Excluded: automated-test exams ("E2E – …") and demo-results exams (DT-DEMO-*).
 * Attempts/results are never exported.
 *
 * Run: pnpm db:export-exams
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed', 'exams.json');

async function main() {
  const cats = await prisma.questionCategory.findMany({ select: { id: true, code: true } });
  const catCode = new Map(cats.map((c) => [c.id, c.code]));
  const exams = await prisma.examination.findMany({
    where: { status: { in: ['PUBLISHED', 'DRAFT'] }, NOT: [{ name: { startsWith: 'E2E' } }, { code: { startsWith: 'DT-DEMO' } }] },
    orderBy: { code: 'asc' },
    include: {
      createdBy: { select: { username: true } },
      blueprint: { select: { name: true } },
      questions: { orderBy: { sortOrder: 'asc' }, include: { question: { select: { code: true, status: true } } } },
      assignments: { include: { group: { select: { name: true } }, user: { select: { username: true, isGuest: true } } } },
    },
  });
  const out = exams.map((e) => {
    const cfg = e.generationConfig as { categoryDistribution?: Array<{ categoryId: string; count: number }> } | null;
    return {
      code: e.code,
      name: e.name,
      description: e.description,
      targetAudience: e.targetAudience,
      examCategory: e.examCategory,
      status: e.status,
      durationMinutes: e.durationMinutes,
      passingScore: Number(e.passingScore),
      randomizeQuestions: e.randomizeQuestions,
      randomizeOptions: e.randomizeOptions,
      maxAttempts: e.maxAttempts,
      publicAccess: e.publicAccess,
      startAt: e.startAt,
      endAt: e.endAt,
      resultVisibility: e.resultVisibility,
      explanationVisibility: e.explanationVisibility,
      blueprint: e.blueprint?.name ?? null,
      createdBy: e.createdBy.username,
      generationConfig: cfg
        ? { ...cfg, categoryDistribution: (cfg.categoryDistribution ?? []).map((c) => ({ categoryCode: catCode.get(c.categoryId) ?? null, count: c.count })) }
        : null,
      questions: e.questions.map((q) => ({ code: q.question.code, points: Number(q.points) })),
      assignments: e.assignments
        .filter((a) => a.group || (a.user && !a.user.isGuest))
        .map((a) => (a.group ? { group: a.group.name, dueAt: a.dueAt } : { username: a.user!.username, dueAt: a.dueAt })),
    };
  });
  fs.writeFileSync(OUT, JSON.stringify({ exportedAt: new Date().toISOString(), exams: out }, null, 2) + '\n');
  console.log(`Đã xuất ${out.length} đề thi → ${path.relative(process.cwd(), OUT)}`);
  for (const e of out) console.log(`  ${e.code}  ${e.status.padEnd(9)} ${e.questions.length} câu  ${e.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
