/**
 * OPTIONAL demonstration results: runs candidates through the REAL examination
 * engine (startAttempt → answers → submitAttempt) so dashboards and analytics
 * have meaningful data. Scores are produced by the actual grading code.
 * Idempotent (skips if the demo exams already exist). Run: pnpm db:seed-demo
 */
import { prisma } from '../src/db';
import { rng, type GenerationConfig } from '@solar/shared';
import { startAttempt, submitAttempt } from '../src/modules/attempts/attempts.service';
import { runGeneration } from '../src/modules/exams/exams.service';
import type { QuestionSnapshot } from '../src/modules/results/scoring';

const DEMO_TAG = '[Dữ liệu mẫu]';

/** Skill profile: probability of answering correctly per category code. */
const PROFILES: Record<string, { base: number; strong: string[]; weak: string[]; growth: number }> = {
  'ts.nguyenvan': { base: 0.72, strong: ['C', 'D', 'E'], weak: ['H', 'I'], growth: 0.06 },
  'ts.phamthi': { base: 0.8, strong: ['E', 'G', 'I'], weak: ['F'], growth: 0.03 },
  'ts.hoang': { base: 0.58, strong: ['F', 'J'], weak: ['C', 'I'], growth: 0.08 },
  'ts.vu': { base: 0.5, strong: ['J', 'A'], weak: ['C', 'D', 'H'], growth: 0.07 },
  'ts.dang': { base: 0.64, strong: ['F', 'G'], weak: ['B', 'E'], growth: 0.05 },
};

async function main() {
  if (await prisma.examination.findFirst({ where: { description: { contains: DEMO_TAG } } })) {
    console.log('Dữ liệu kết quả mẫu đã tồn tại – bỏ qua.');
    return;
  }
  const manager = await prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } });
  const bp = await prisma.examBlueprint.findFirstOrThrow({ where: { isDefault: true } });
  const groups = await prisma.userGroup.findMany();
  const fakeReq = (userId: string) => ({ user: { id: userId }, ip: '127.0.0.1', headers: { 'user-agent': 'demo-seed' } }) as never;

  const exams = [
    { name: 'Sát hạch định kỳ kỹ sư PV – Quý 3/2026', seed: 301, monthsAgo: [5, 4] },
    { name: 'Sát hạch định kỳ kỹ sư PV – Quý 4/2026', seed: 402, monthsAgo: [2, 1, 0] },
  ];
  let attempts = 0;
  for (const ex of exams) {
    const gen = await runGeneration({ ...(bp.config as GenerationConfig), seed: ex.seed });
    const exam = await prisma.examination.create({
      data: {
        code: `DT-DEMO-${ex.seed}`,
        name: ex.name,
        description: `${DEMO_TAG} Đề 30 câu theo ma trận chuẩn, dùng để minh họa phân tích năng lực.`,
        targetAudience: 'Kỹ sư thiết kế, giám sát kỹ thuật',
        examCategory: 'Định kỳ',
        durationMinutes: bp.durationMinutes,
        passingScore: bp.passingScore,
        maxAttempts: ex.monthsAgo.length,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdById: manager.id,
        blueprintId: bp.id,
        generationConfig: { ...(bp.config as object), seed: ex.seed },
        questions: { create: gen.questionIds.map((questionId, i) => ({ questionId, sortOrder: i })) },
        assignments: { create: groups.map((g) => ({ groupId: g.id, assignedById: manager.id })) },
      },
    });
    for (const [username, prof] of Object.entries(PROFILES)) {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) continue;
      for (const [k, monthsAgo] of ex.monthsAgo.entries()) {
        const rand = rng(ex.seed * 1000 + k * 97 + username.length * 13 + username.charCodeAt(3));
        const a = await startAttempt(fakeReq(user.id), exam.id);
        const aqs = await prisma.attemptQuestion.findMany({ where: { attemptId: a.id } });
        const skill = prof.base + prof.growth * (exams.indexOf(ex) * 2 + k);
        for (const aq of aqs) {
          const s = aq.snapshot as unknown as QuestionSnapshot;
          let p = skill + (prof.strong.includes(aq.categoryCode) ? 0.15 : 0) - (prof.weak.includes(aq.categoryCode) ? 0.3 : 0) - (aq.difficulty - 2.5) * 0.06;
          p = Math.max(0.05, Math.min(0.98, p));
          const r = rand();
          if (r > 0.97) continue; // occasionally unanswered
          const correct = r < p;
          let selected: string[] = [];
          let numeric: number | null = null;
          if (s.type === 'NUMERIC') numeric = correct ? s.numeric!.answer : s.numeric!.answer * (1.15 + rand() * 0.3);
          else if (correct) selected = s.options.filter((o) => o.isCorrect).map((o) => o.id);
          else {
            const wrong = s.options.filter((o) => !o.isCorrect);
            selected = [wrong[Math.floor(rand() * wrong.length)]!.id];
          }
          await prisma.candidateAnswer.create({ data: { attemptQuestionId: aq.id, selectedOptionIds: selected, numericValue: numeric, answeredAt: new Date() } });
        }
        await submitAttempt(null, a.id);
        // Spread the history over past months (only timestamps are adjusted).
        const start = new Date();
        start.setMonth(start.getMonth() - monthsAgo, 8 + Math.floor(rand() * 18));
        start.setHours(8 + Math.floor(rand() * 8), Math.floor(rand() * 60), 0, 0);
        const result = await prisma.examinationResult.findUniqueOrThrow({ where: { attemptId: a.id } });
        const usedSec = Math.round(bp.durationMinutes * 60 * (0.55 + rand() * 0.4));
        const end = new Date(start.getTime() + usedSec * 1000);
        await prisma.examinationAttempt.update({ where: { id: a.id }, data: { startedAt: start, deadlineAt: new Date(start.getTime() + bp.durationMinutes * 60_000), submittedAt: end } });
        await prisma.examinationResult.update({ where: { id: result.id }, data: { createdAt: end, durationSeconds: usedSec } });
        attempts++;
      }
    }
    if (exams.indexOf(ex) === 0) await prisma.examination.update({ where: { id: exam.id }, data: { status: 'CLOSED' } });
  }
  console.log(`Đã tạo ${exams.length} đề thi mẫu và ${attempts} lượt thi mô phỏng qua engine chấm điểm thật.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
