/**
 * Recreate examinations exported by `pnpm db:export-exams` (prisma/seed/exams.json).
 * Idempotent: an exam whose code already exists is left untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma, type PrismaClient } from '@prisma/client';
import { USABLE_QUESTION_STATUSES } from '@solar/shared';

interface ExportedExam {
  code: string; name: string; description: string | null; targetAudience: string | null; examCategory: string | null;
  status: 'PUBLISHED' | 'DRAFT'; durationMinutes: number; passingScore: number; randomizeQuestions: boolean; randomizeOptions: boolean;
  maxAttempts: number; publicAccess: boolean; startAt: string | null; endAt: string | null;
  resultVisibility: 'HIDDEN' | 'SCORE_ONLY' | 'DETAILED'; explanationVisibility: 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_CLOSE';
  blueprint: string | null; createdBy: string;
  generationConfig: (Record<string, unknown> & { categoryDistribution?: Array<{ categoryCode: string | null; count: number }> }) | null;
  questions: Array<{ code: string; points: number }>;
  assignments: Array<{ group?: string; username?: string; dueAt: string | null }>;
}

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exams.json');

export async function importExams(prisma: PrismaClient) {
  if (!fs.existsSync(FILE)) return { created: 0, skipped: 0 };
  const { exams } = JSON.parse(fs.readFileSync(FILE, 'utf8')) as { exams: ExportedExam[] };
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  let created = 0;
  let skipped = 0;
  for (const e of exams) {
    if (await prisma.examination.findUnique({ where: { code: e.code } })) {
      skipped++;
      continue;
    }
    const qs = await prisma.question.findMany({ where: { code: { in: e.questions.map((q) => q.code) } }, select: { id: true, code: true, status: true } });
    const byCode = new Map(qs.map((q) => [q.code, q]));
    const missing = e.questions.filter((q) => !byCode.has(q.code)).map((q) => q.code);
    if (missing.length) throw new Error(`Đề ${e.code}: thiếu câu hỏi ${missing.join(', ')} – chạy seed câu hỏi trước`);
    const unusable = qs.filter((q) => !USABLE_QUESTION_STATUSES.includes(q.status));
    if (e.status === 'PUBLISHED' && unusable.length)
      throw new Error(`Đề ${e.code}: câu hỏi chưa được duyệt ${unusable.map((q) => q.code).join(', ')}`);

    const creator = (await prisma.user.findUnique({ where: { username: e.createdBy } })) ?? admin;
    const blueprint = e.blueprint ? await prisma.examBlueprint.findFirst({ where: { name: e.blueprint } }) : null;
    let generationConfig: Prisma.InputJsonValue | undefined;
    if (e.generationConfig) {
      const cats = await prisma.questionCategory.findMany({ select: { id: true, code: true } });
      const catId = new Map(cats.map((c) => [c.code, c.id]));
      const { categoryDistribution, ...rest } = e.generationConfig;
      generationConfig = { ...rest, categoryDistribution: (categoryDistribution ?? []).filter((c) => c.categoryCode && catId.has(c.categoryCode)).map((c) => ({ categoryId: catId.get(c.categoryCode!)!, count: c.count })) } as Prisma.InputJsonValue;
    }
    const assignments: Prisma.ExaminationAssignmentCreateWithoutExaminationInput[] = [];
    for (const a of e.assignments) {
      if (a.group) {
        const g = await prisma.userGroup.findUnique({ where: { name: a.group } });
        if (g) assignments.push({ group: { connect: { id: g.id } }, assignedBy: { connect: { id: creator.id } }, dueAt: a.dueAt ? new Date(a.dueAt) : null });
      } else if (a.username) {
        const u = await prisma.user.findUnique({ where: { username: a.username } });
        if (u) assignments.push({ user: { connect: { id: u.id } }, assignedBy: { connect: { id: creator.id } }, dueAt: a.dueAt ? new Date(a.dueAt) : null });
      }
    }
    await prisma.examination.create({
      data: {
        code: e.code,
        name: e.name,
        description: e.description,
        targetAudience: e.targetAudience,
        examCategory: e.examCategory,
        status: e.status,
        publishedAt: e.status === 'PUBLISHED' ? new Date() : null,
        durationMinutes: e.durationMinutes,
        passingScore: e.passingScore,
        randomizeQuestions: true,
        randomizeOptions: e.randomizeOptions,
        maxAttempts: e.maxAttempts,
        publicAccess: e.publicAccess,
        startAt: e.startAt ? new Date(e.startAt) : null,
        endAt: e.endAt ? new Date(e.endAt) : null,
        resultVisibility: e.resultVisibility,
        explanationVisibility: e.explanationVisibility,
        generationConfig,
        createdBy: { connect: { id: creator.id } },
        ...(blueprint ? { blueprint: { connect: { id: blueprint.id } } } : {}),
        questions: { create: e.questions.map((q, i) => ({ question: { connect: { id: byCode.get(q.code)!.id } }, sortOrder: i, points: q.points })) },
        assignments: { create: assignments },
      },
    });
    created++;
  }
  return { created, skipped };
}
