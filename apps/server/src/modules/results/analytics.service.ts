import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { aggregateCategoryScores, round2, type Bucket } from './scoring';

export interface ResultFilter {
  examId?: string;
  userId?: string;
  groupId?: string;
  passed?: boolean;
  from?: Date;
  to?: Date;
  q?: string;
}

export function resultWhere(f: ResultFilter): Prisma.ExaminationResultWhereInput {
  return {
    ...(f.examId ? { examinationId: f.examId } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.groupId ? { user: { groups: { some: { groupId: f.groupId } } } } : {}),
    ...(f.passed !== undefined ? { passed: f.passed } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q ? { OR: [{ user: { fullName: { contains: f.q, mode: 'insensitive' } } }, { user: { username: { contains: f.q, mode: 'insensitive' } } }, { user: { phone: { contains: f.q } } }, { user: { department: { contains: f.q, mode: 'insensitive' } } }, { examination: { name: { contains: f.q, mode: 'insensitive' } } }] } : {}),
  };
}

export const resultRowInclude = {
  user: { select: { id: true, fullName: true, username: true, phone: true, isGuest: true, department: true, position: true } },
  examination: { select: { id: true, code: true, name: true } },
  attempt: { select: { attemptNo: true, status: true, startedAt: true, submittedAt: true } },
} satisfies Prisma.ExaminationResultInclude;

export function serializeResultRow(r: Prisma.ExaminationResultGetPayload<{ include: typeof resultRowInclude }>) {
  return {
    id: r.id,
    attemptId: r.attemptId,
    user: r.user,
    exam: r.examination,
    attemptNo: r.attempt.attemptNo,
    status: r.attempt.status,
    submittedAt: r.attempt.submittedAt,
    scorePercent: Number(r.scorePercent),
    pointsEarned: Number(r.pointsEarned),
    pointsTotal: Number(r.pointsTotal),
    correctCount: r.correctCount,
    incorrectCount: r.incorrectCount,
    unansweredCount: r.unansweredCount,
    durationSeconds: r.durationSeconds,
    passed: r.passed,
    byCategory: r.byCategory as unknown as Bucket[],
  };
}

/** Correct-rate per question across all graded answers (hardest first). */
async function questionDifficultyStats(examId?: string, limit = 10) {
  const rows = await prisma.$queryRaw<Array<{ question_id: string; code: string; title: string; category_code: string; n: bigint; correct: bigint }>>(Prisma.sql`
    SELECT aq.question_id, aq.snapshot->>'code' AS code, aq.snapshot->>'title' AS title, aq.category_code,
           COUNT(*) AS n, SUM(CASE WHEN ca.is_correct THEN 1 ELSE 0 END) AS correct
    FROM attempt_questions aq
    JOIN examination_attempts a ON a.id = aq.attempt_id AND a.status <> 'IN_PROGRESS'
    LEFT JOIN candidate_answers ca ON ca.attempt_question_id = aq.id
    ${examId ? Prisma.sql`WHERE a.examination_id = ${examId}` : Prisma.empty}
    GROUP BY aq.question_id, aq.snapshot->>'code', aq.snapshot->>'title', aq.category_code
    HAVING COUNT(*) >= 1
    ORDER BY (SUM(CASE WHEN ca.is_correct THEN 1 ELSE 0 END)::float / COUNT(*)) ASC, COUNT(*) DESC
    LIMIT ${limit}`);
  return rows.map((r) => ({ questionId: r.question_id, code: r.code, title: r.title, categoryCode: r.category_code, attempts: Number(r.n), correctRate: Number(r.n) ? round2((Number(r.correct) / Number(r.n)) * 100) : 0 }));
}

function histogram(scores: number[]) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  for (const s of scores) bins[Math.min(9, Math.floor(s / 10))]!.count++;
  return bins;
}

export async function analytics(f: ResultFilter) {
  const where = resultWhere(f);
  const results = await prisma.examinationResult.findMany({ where, include: resultRowInclude, orderBy: { createdAt: 'asc' } });
  const rows = results.map(serializeResultRow);
  const n = rows.length;
  const avg = n ? round2(rows.reduce((a, r) => a + r.scorePercent, 0) / n) : 0;
  const passRate = n ? round2((rows.filter((r) => r.passed).length / n) * 100) : 0;
  const categories = aggregateCategoryScores(rows.map((r) => r.byCategory));
  const difficulty = aggregateCategoryScores(results.map((r) => r.byDifficulty as unknown as Bucket[]));

  // Monthly trend
  const months = new Map<string, { sum: number; n: number; pass: number }>();
  for (const r of rows) {
    const d = new Date(r.submittedAt ?? Date.now());
    const k = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const m = months.get(k) ?? { sum: 0, n: 0, pass: 0 };
    m.sum += r.scorePercent;
    m.n++;
    if (r.passed) m.pass++;
    months.set(k, m);
  }
  // Per exam
  const exams = new Map<string, { id: string; code: string; name: string; n: number; sum: number; pass: number }>();
  for (const r of rows) {
    const e = exams.get(r.exam.id) ?? { ...r.exam, n: 0, sum: 0, pass: 0 };
    e.n++;
    e.sum += r.scorePercent;
    if (r.passed) e.pass++;
    exams.set(r.exam.id, e);
  }
  // Ranking: best score per candidate
  const best = new Map<string, (typeof rows)[number] & { attempts: number }>();
  for (const r of rows) {
    const cur = best.get(r.user.id);
    if (!cur || r.scorePercent > cur.scorePercent || (r.scorePercent === cur.scorePercent && r.durationSeconds < cur.durationSeconds)) best.set(r.user.id, { ...r, attempts: (cur?.attempts ?? 0) + 1 });
    else cur.attempts++;
  }
  const ranking = [...best.values()]
    .sort((a, b) => b.scorePercent - a.scorePercent || a.durationSeconds - b.durationSeconds)
    .map((r, i) => ({ rank: i + 1, user: r.user, bestScore: r.scorePercent, passed: r.passed, attempts: r.attempts, durationSeconds: r.durationSeconds, attemptId: r.attemptId }));
  // Group performance
  const groups = await prisma.userGroup.findMany({ include: { members: { select: { userId: true } } } });
  const groupPerf = groups
    .map((g) => {
      const ids = new Set(g.members.map((m) => m.userId));
      const gr = rows.filter((r) => ids.has(r.user.id));
      return {
        id: g.id,
        name: g.name,
        members: ids.size,
        results: gr.length,
        avgScore: gr.length ? round2(gr.reduce((a, r) => a + r.scorePercent, 0) / gr.length) : null,
        passRate: gr.length ? round2((gr.filter((r) => r.passed).length / gr.length) * 100) : null,
        categories: aggregateCategoryScores(gr.map((r) => r.byCategory)),
      };
    })
    .filter((g) => g.results > 0);

  return {
    count: n,
    candidates: best.size,
    avgScore: avg,
    passRate,
    avgDurationSeconds: n ? Math.round(rows.reduce((a, r) => a + r.durationSeconds, 0) / n) : 0,
    categories,
    difficulty,
    trend: [...months.entries()].map(([month, m]) => ({ month, avg: round2(m.sum / m.n), count: m.n, passRate: round2((m.pass / m.n) * 100) })),
    byExam: [...exams.values()].map((e) => ({ id: e.id, code: e.code, name: e.name, count: e.n, avgScore: round2(e.sum / e.n), passRate: round2((e.pass / e.n) * 100) })),
    distribution: histogram(rows.map((r) => r.scorePercent)),
    hardestQuestions: await questionDifficultyStats(f.examId),
    ranking,
    groups: groupPerf,
  };
}

/** Personal history: scores over time and aggregated competency (visible results only). */
export async function personalHistory(userId: string) {
  const results = await prisma.examinationResult.findMany({
    where: { userId, attempt: { examSnapshot: { path: ['resultVisibility'], not: 'HIDDEN' } } },
    include: { ...resultRowInclude, attempt: { select: { attemptNo: true, status: true, startedAt: true, submittedAt: true, examSnapshot: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const rows = results.map((r) => {
    const detailed = (r.attempt.examSnapshot as { resultVisibility?: string }).resultVisibility === 'DETAILED';
    return {
      attemptId: r.attemptId,
      exam: r.examination,
      attemptNo: r.attempt.attemptNo,
      submittedAt: r.attempt.submittedAt,
      scorePercent: Number(r.scorePercent),
      passed: r.passed,
      durationSeconds: r.durationSeconds,
      correctCount: r.correctCount,
      totalQuestions: r.correctCount + r.incorrectCount + r.unansweredCount,
      byCategory: detailed ? (r.byCategory as unknown as Bucket[]) : null,
    };
  });
  return {
    results: [...rows].reverse(),
    trend: rows.map((r, i) => ({ name: `#${i + 1}`, value: r.scorePercent, exam: r.exam.name })),
    competency: aggregateCategoryScores(rows.filter((r) => r.byCategory).map((r) => r.byCategory!)),
  };
}
