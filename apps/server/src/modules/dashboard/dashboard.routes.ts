import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { requireAuth, hasPerm } from '../../lib/auth';
import { aggregateCategoryScores } from '../results/scoring';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: requireAuth() }, async (req) => {
    const u = req.user!;
    const out: Record<string, unknown> = {};

    if (hasPerm(req, 'questions.view_all') || hasPerm(req, 'exams.manage') || hasPerm(req, 'results.view_all')) {
      const [byStatus, byCat, byDiff, cats, activeExams, totalExams, candidates, attempts, agg] = await Promise.all([
        prisma.question.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.question.groupBy({ by: ['categoryId'], _count: { _all: true }, where: { status: { in: ['APPROVED', 'PUBLISHED'] } } }),
        prisma.question.groupBy({ by: ['difficulty'], _count: { _all: true }, where: { status: { in: ['APPROVED', 'PUBLISHED'] } } }),
        prisma.questionCategory.findMany({ where: { parentId: null }, orderBy: { sortOrder: 'asc' } }),
        prisma.examination.count({ where: { status: 'PUBLISHED' } }),
        prisma.examination.count(),
        prisma.user.count({ where: { role: { code: 'CANDIDATE' }, isActive: true } }),
        prisma.examinationResult.count(),
        prisma.examinationResult.aggregate({ _avg: { scorePercent: true } }),
      ]);
      const passed = await prisma.examinationResult.count({ where: { passed: true } });
      const status = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
      const catMap = new Map(byCat.map((c) => [c.categoryId, c._count._all]));
      const recent = await prisma.examinationResult.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } }, examination: { select: { name: true } } },
      });
      // Monthly average score, last 6 months
      const trend = await prisma.$queryRaw<Array<{ month: string; avg: number; n: bigint; pass: bigint }>>(Prisma.sql`
        SELECT to_char(date_trunc('month', created_at), 'MM/YYYY') AS month,
               AVG(score_percent)::float AS avg, COUNT(*) AS n, SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS pass
        FROM examination_results
        WHERE created_at > now() - interval '6 months'
        GROUP BY date_trunc('month', created_at)
        ORDER BY date_trunc('month', created_at)`);
      out.admin = {
        questions: {
          total: Object.values(status).reduce((a, b) => a + b, 0),
          byStatus: status,
          usable: (status.APPROVED ?? 0) + (status.PUBLISHED ?? 0),
          byCategory: cats.map((c) => ({ code: c.code, name: c.name, count: catMap.get(c.id) ?? 0 })),
          byDifficulty: [1, 2, 3, 4].map((d) => ({ difficulty: d, count: byDiff.find((x) => x.difficulty === d)?._count._all ?? 0 })),
        },
        exams: { active: activeExams, total: totalExams },
        candidates,
        attempts,
        avgScore: agg._avg.scorePercent ? Number(agg._avg.scorePercent) : 0,
        passRate: attempts ? (passed / attempts) * 100 : 0,
        recent: recent.map((r) => ({
          attemptId: r.attemptId,
          user: r.user.fullName,
          exam: r.examination.name,
          score: Number(r.scorePercent),
          passed: r.passed,
          at: r.createdAt,
        })),
        trend: trend.map((t) => ({ month: t.month, avg: Math.round(t.avg * 10) / 10, count: Number(t.n), passRate: Number(t.n) ? (Number(t.pass) / Number(t.n)) * 100 : 0 })),
      };
    }

    if (hasPerm(req, 'questions.create') && !hasPerm(req, 'questions.view_all')) {
      const mine = await prisma.question.groupBy({ by: ['status'], _count: { _all: true }, where: { authorId: u.id } });
      out.author = { byStatus: Object.fromEntries(mine.map((s) => [s.status, s._count._all])) };
    }

    if (hasPerm(req, 'exams.take') && !u.isGuest) {
      const results = await prisma.examinationResult.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: 'asc' },
        include: { examination: { select: { name: true, resultVisibility: true } } },
      });
      const visible = results.filter((r) => r.examination.resultVisibility !== 'HIDDEN');
      out.candidate = {
        completed: results.length,
        avgScore: visible.length ? visible.reduce((a, r) => a + Number(r.scorePercent), 0) / visible.length : 0,
        bestScore: visible.reduce((m, r) => Math.max(m, Number(r.scorePercent)), 0),
        passed: visible.filter((r) => r.passed).length,
        history: visible.map((r) => ({ attemptId: r.attemptId, exam: r.examination.name, score: Number(r.scorePercent), passed: r.passed, at: r.createdAt })),
        competency: aggregateCategoryScores(
          visible.filter((r) => r.examination.resultVisibility === 'DETAILED').map((r) => r.byCategory as never),
        ),
      };
    }
    return out;
  });
}
