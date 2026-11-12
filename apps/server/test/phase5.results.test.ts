import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { Client, loginAs } from './helpers';
import { prisma } from '../src/db';

describe('Phase 5 – results, analytics and reports', () => {
  let manager: Client, admin: Client, c1: Client, c3: Client, author: Client;
  let examId = '';
  let attemptId = '';
  beforeAll(async () => {
    manager = await loginAs('quanly');
    admin = await loginAs('admin');
    c1 = await loginAs('ts.vu');
    c3 = await loginAs('ts.dang');
    author = await loginAs('bientap');
    const bp = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    const qids = (await manager.post('/api/exam-builder/generate', { ...bp.config, seed: 11 })).json().questionIds;
    const e = (await manager.post('/api/exams', { name: 'Đề phân tích năng lực', durationMinutes: 60, passingScore: 50, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_CLOSE', questionIds: qids })).json();
    examId = e.id;
    await manager.post(`/api/exams/${examId}/status`, { status: 'PUBLISHED' });
    const groups = (await manager.get('/api/groups')).json();
    await manager.post(`/api/exams/${examId}/assignments`, { groupIds: groups.map((g: { id: string }) => g.id), userIds: [] });
    // c1 answers everything correctly, c3 answers half
    for (const [c, ratio] of [[c1, 1], [c3, 0.5]] as const) {
      const s = (await c.post(`/api/my/exams/${examId}/start`)).json();
      const aqs = await prisma.attemptQuestion.findMany({ where: { attemptId: s.attemptId }, orderBy: { sortOrder: 'asc' } });
      for (const aq of aqs.slice(0, Math.round(aqs.length * ratio))) {
        const snap = aq.snapshot as { type: string; options: Array<{ id: string; isCorrect: boolean }>; numeric: { answer: number } | null };
        await c.put(`/api/attempts/${s.attemptId}/answers`, snap.type === 'NUMERIC' ? { attemptQuestionId: aq.id, numericValue: snap.numeric!.answer } : { attemptQuestionId: aq.id, selectedOptionIds: snap.options.filter((o) => o.isCorrect).map((o) => o.id) });
      }
      await c.post(`/api/attempts/${s.attemptId}/submit`);
      if (c === c1) attemptId = s.attemptId;
    }
  });

  it('explanations follow AFTER_CLOSE visibility', async () => {
    const before = (await c1.get(`/api/results/attempts/${attemptId}`)).json();
    expect(before.showExplanation).toBe(false);
    expect(before.questions[0].explanation).toBeUndefined();
    expect(before.questions.find((q: { options: unknown[] }) => q.options.length).options[0].rationale).toBeUndefined();
    await manager.post(`/api/exams/${examId}/status`, { status: 'CLOSED' });
    const after = (await c1.get(`/api/results/attempts/${attemptId}`)).json();
    expect(after.showExplanation).toBe(true);
    expect(after.questions.some((q: { explanation?: string }) => q.explanation)).toBe(true);
  });

  it('exam analytics: counts, averages, ranking, category competency, hardest questions', async () => {
    const a = (await manager.get(`/api/analytics?examId=${examId}`)).json();
    expect(a.count).toBe(2);
    expect(a.ranking[0].bestScore).toBe(100);
    expect(a.ranking[0].rank).toBe(1);
    expect(a.ranking[1].bestScore).toBeCloseTo(50, 0);
    expect(a.avgScore).toBeCloseTo(75, 0);
    expect(a.passRate).toBe(100);
    expect(a.categories).toHaveLength(10);
    expect(a.difficulty.map((d: { key: string }) => d.key)).toEqual(['1', '2', '3', '4']);
    expect(a.hardestQuestions.length).toBeGreaterThan(0);
    expect(a.hardestQuestions[0].correctRate).toBeLessThanOrEqual(a.hardestQuestions.at(-1).correctRate);
    expect(a.groups.length).toBeGreaterThan(0);
    expect(a.distribution).toHaveLength(10);
  });

  it('results list with filters; candidates and authors are forbidden', async () => {
    const r = (await manager.get(`/api/results?examId=${examId}&passed=true`)).json();
    expect(r.total).toBe(2);
    expect(r.items[0].user.fullName).toBeTruthy();
    expect((await c1.get('/api/results')).statusCode).toBe(403);
    expect((await c1.get('/api/analytics')).statusCode).toBe(403);
    expect((await author.get('/api/results')).statusCode).toBe(403);
  });

  it('personal history returns only own visible results with competency', async () => {
    const h = (await c1.get('/api/my/results')).json();
    expect(h.results.length).toBeGreaterThanOrEqual(1);
    expect(h.results.every((r: { exam: { id: string } }) => r.exam)).toBe(true);
    expect(h.competency.length).toBeGreaterThan(0);
    const ids = new Set(h.results.map((r: { attemptId: string }) => r.attemptId));
    const others = await prisma.examinationResult.findMany({ where: { NOT: { user: { username: 'ts.vu' } } }, select: { attemptId: true } });
    expect(others.some((o) => ids.has(o.attemptId))).toBe(false);
  });

  it('Excel export contains Vietnamese headers and rows', async () => {
    const res = await manager.get(`/api/results/export.xlsx?examId=${examId}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('ket-qua-thi');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as never);
    const ws = wb.getWorksheet('Kết quả thi')!;
    expect(ws.getRow(1).getCell(3).value).toBe('Thí sinh');
    expect(ws.rowCount).toBe(3);
    expect(['Đạt', 'Chưa đạt']).toContain(ws.getRow(2).getCell(13).value);
    expect(wb.getWorksheet('Năng lực theo lĩnh vực')).toBeTruthy();
    expect((await c1.get('/api/results/export.xlsx')).statusCode).toBe(403);
  });

  it('PDF reports render (individual + analytics) with embedded font', async () => {
    const p1 = await c1.get(`/api/results/attempts/${attemptId}/pdf`);
    expect(p1.statusCode).toBe(200);
    expect(p1.headers['content-type']).toBe('application/pdf');
    expect(p1.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(p1.rawPayload.toString('latin1')).toContain('Roboto');
    const p2 = await manager.get(`/api/analytics/report.pdf?examId=${examId}`);
    expect(p2.statusCode).toBe(200);
    expect(p2.rawPayload.length).toBeGreaterThan(5000);
    // other candidate cannot download someone else's PDF
    expect((await c3.get(`/api/results/attempts/${attemptId}/pdf`)).statusCode).toBe(403);
  });

  it('dashboard reflects results', async () => {
    const d = (await admin.get('/api/dashboard')).json();
    expect(d.admin.attempts).toBeGreaterThan(0);
    const cd = (await c1.get('/api/dashboard')).json();
    expect(cd.candidate.completed).toBeGreaterThanOrEqual(1);
    expect(cd.candidate.competency.length).toBeGreaterThan(0);
  });
});
