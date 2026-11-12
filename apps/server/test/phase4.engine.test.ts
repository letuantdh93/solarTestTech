import { describe, it, expect, beforeAll } from 'vitest';
import { Client, loginAs } from './helpers';
import { prisma } from '../src/db';
import { autoSubmitExpired } from '../src/modules/attempts/attempts.service';

type AttemptView = { id: string; questions: Array<{ id: string; type: string; options: Array<{ id: string; label: string }>; answer: { flagged: boolean; selectedOptionIds: string[] } }>; deadlineAt: string; serverNow: string };

async function correctAnswerFor(attemptQuestionId: string) {
  const q = await prisma.attemptQuestion.findUniqueOrThrow({ where: { id: attemptQuestionId } });
  const s = q.snapshot as { type: string; options: Array<{ id: string; isCorrect: boolean }>; numeric: { answer: number } | null };
  return s.type === 'NUMERIC' ? { numericValue: s.numeric!.answer } : { selectedOptionIds: s.options.filter((o) => o.isCorrect).map((o) => o.id) };
}

describe('Phase 4 – examination engine', () => {
  let manager: Client, admin: Client, c1: Client, c2: Client, outsider: Client;
  let examId = '';
  let questionIds: string[] = [];

  async function makeExam(extra: Record<string, unknown> = {}, ids = questionIds) {
    const e = (await manager.post('/api/exams', {
      name: 'Bài thi engine', durationMinutes: 30, passingScore: 70, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 2,
      resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', questionIds: ids, ...extra,
    })).json();
    await manager.post(`/api/exams/${e.id}/status`, { status: 'PUBLISHED' });
    const users = (await manager.get('/api/users?role=CANDIDATE&pageSize=100')).json().items as Array<{ id: string; username: string }>;
    const ids2 = users.filter((u) => ['ts.nguyenvan', 'ts.phamthi'].includes(u.username)).map((u) => u.id);
    await manager.post(`/api/exams/${e.id}/assignments`, { userIds: ids2, groupIds: [] });
    return e.id as string;
  }

  beforeAll(async () => {
    manager = await loginAs('quanly');
    admin = await loginAs('admin');
    c1 = await loginAs('ts.nguyenvan');
    c2 = await loginAs('ts.phamthi');
    outsider = await loginAs('ts.hoang');
    const bp = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
    questionIds = (await manager.post('/api/exam-builder/generate', { ...bp.config, seed: 5 })).json().questionIds;
    examId = await makeExam();
  });

  it('lists assigned exams for the candidate only', async () => {
    const mine = (await c1.get('/api/my/exams')).json();
    expect(mine.some((e: { id: string; availability: string }) => e.id === examId && e.availability === 'AVAILABLE')).toBe(true);
    expect((await outsider.get('/api/my/exams')).json().some((e: { id: string }) => e.id === examId)).toBe(false);
    expect((await outsider.post(`/api/my/exams/${examId}/start`)).statusCode).toBe(404);
    expect((await manager.get('/api/my/exams')).statusCode).toBe(403);
  });

  let attempt: AttemptView;
  it('start is idempotent and race-safe (single in-progress attempt)', async () => {
    const [a, b, c] = await Promise.all([c1.post(`/api/my/exams/${examId}/start`), c1.post(`/api/my/exams/${examId}/start`), c1.post(`/api/my/exams/${examId}/start`)]);
    const ids = new Set([a.json().attemptId, b.json().attemptId, c.json().attemptId]);
    expect(ids.size).toBe(1);
    attempt = (await c1.get(`/api/attempts/${a.json().attemptId}`)).json();
    expect(attempt.questions).toHaveLength(30);
    expect(new Date(attempt.deadlineAt).getTime() - new Date(attempt.serverNow).getTime()).toBeGreaterThan(29 * 60_000);
  });

  it('never exposes answer keys, rationales or explanations before submission', async () => {
    const raw = (await c1.get(`/api/attempts/${attempt.id}`)).body;
    for (const forbidden of ['isCorrect', 'rationale', 'explanation', 'calcMethod', 'numericAnswer', '"numeric"', 'tolerance']) expect(raw).not.toContain(forbidden);
    // result endpoint before submission returns pending only
    const r = (await c1.get(`/api/results/attempts/${attempt.id}`)).json();
    expect(r.pending).toBe(true);
    expect(JSON.stringify(r)).not.toContain('isCorrect');
  });

  it('randomises question and option order per attempt', async () => {
    const s2 = (await c2.post(`/api/my/exams/${examId}/start`)).json();
    const a2: AttemptView = (await c2.get(`/api/attempts/${s2.attemptId}`)).json();
    const order1 = attempt.questions.map((q) => q.options.map((o) => o.id).join()).join('|');
    const order2 = a2.questions.map((q) => q.options.map((o) => o.id).join()).join('|');
    expect(order1).not.toBe(order2);
    // same set of questions
    const snapIds = async (id: string) => (await prisma.attemptQuestion.findMany({ where: { attemptId: id }, orderBy: { sortOrder: 'asc' } })).map((q) => q.questionId);
    const q1 = await snapIds(attempt.id);
    const q2 = await snapIds(a2.id);
    expect([...q1].sort()).toEqual([...q2].sort());
    expect(q1.join()).not.toBe(q2.join());
  });

  it('autosave validates input and ownership', async () => {
    const choice = attempt.questions.find((q) => q.type === 'SINGLE_CHOICE')!;
    expect((await c1.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: choice.id, selectedOptionIds: ['forged-id'] })).statusCode).toBe(400);
    expect((await c1.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: choice.id, selectedOptionIds: choice.options.slice(0, 2).map((o) => o.id) })).statusCode).toBe(400);
    expect((await c1.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: choice.id, numericValue: 5 })).statusCode).toBe(400);
    expect((await c2.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: choice.id, selectedOptionIds: [choice.options[0]!.id] })).statusCode).toBe(404);
    const ok = await c1.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: choice.id, selectedOptionIds: [choice.options[0]!.id], flagged: true });
    expect(ok.statusCode).toBe(200);
    const view: AttemptView = (await c1.get(`/api/attempts/${attempt.id}`)).json();
    const saved = view.questions.find((q) => q.id === choice.id)!;
    expect(saved.answer.flagged).toBe(true);
    expect(saved.answer.selectedOptionIds).toEqual([choice.options[0]!.id]);
  });

  it('server-side scoring: all correct = 100%; double submit is idempotent; answers locked after', async () => {
    for (const q of attempt.questions) {
      const body = await correctAnswerFor(q.id);
      const r = await c1.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: q.id, ...body });
      expect(r.statusCode, JSON.stringify(r.json())).toBe(200);
    }
    // client tries to inject a score – ignored
    const [s1, s2] = await Promise.all([
      c1.post(`/api/attempts/${attempt.id}/submit`, { scorePercent: 1 }),
      c1.post(`/api/attempts/${attempt.id}/submit`, { scorePercent: 1 }),
    ]);
    expect([s1.statusCode, s2.statusCode]).toEqual([200, 200]);
    expect([s1.json().alreadySubmitted, s2.json().alreadySubmitted].sort()).toEqual([false, true]);
    expect(await prisma.examinationResult.count({ where: { attemptId: attempt.id } })).toBe(1);
    const res = (await c1.get(`/api/results/attempts/${attempt.id}`)).json();
    expect(res.summary.scorePercent).toBe(100);
    expect(res.summary.correctCount).toBe(30);
    expect(res.summary.passed).toBe(true);
    expect(res.byCategory.length).toBe(10);
    expect(res.questions[0].explanation).toBeTruthy();
    const q = attempt.questions[0]!;
    const late = await c1.put(`/api/attempts/${attempt.id}/answers`, { attemptQuestionId: q.id, selectedOptionIds: [] });
    expect(late.statusCode).toBe(409);
  });

  it('partial answers: incorrect and unanswered are counted correctly', async () => {
    const a = (await c2.get('/api/my/exams')).json().find((e: { id: string }) => e.id === examId).inProgressAttemptId;
    const view: AttemptView = (await c2.get(`/api/attempts/${a}`)).json();
    const [q1, q2] = view.questions;
    await c2.put(`/api/attempts/${a}/answers`, { attemptQuestionId: q1!.id, ...(await correctAnswerFor(q1!.id)) });
    const wrong = q2!.type === 'NUMERIC' ? { numericValue: -999999 } : { selectedOptionIds: [(await prisma.attemptQuestion.findUniqueOrThrow({ where: { id: q2!.id } })).snapshot as { options: Array<{ id: string; isCorrect: boolean }> }].flatMap((s) => s.options.filter((o) => !o.isCorrect).slice(0, 1).map((o) => o.id)) };
    await c2.put(`/api/attempts/${a}/answers`, { attemptQuestionId: q2!.id, ...wrong });
    await c2.post(`/api/attempts/${a}/submit`);
    const r = (await c2.get(`/api/results/attempts/${a}`)).json();
    expect(r.summary).toMatchObject({ correctCount: 1, incorrectCount: 1, unansweredCount: 28 });
    expect(r.summary.scorePercent).toBeCloseTo(3.33, 1);
    expect(r.summary.passed).toBe(false);
    expect(r.analysis.weaknesses.length).toBeGreaterThan(0);
  });

  it('candidates cannot read other candidates\' results; staff can', async () => {
    expect((await c2.get(`/api/results/attempts/${attempt.id}`)).statusCode).toBe(403);
    expect((await outsider.get(`/api/results/attempts/${attempt.id}`)).statusCode).toBe(403);
    expect((await manager.get(`/api/results/attempts/${attempt.id}`)).json().summary.scorePercent).toBe(100);
  });

  it('auto-submits when time expires (on access and via background job)', async () => {
    const s = (await c1.post(`/api/my/exams/${examId}/start`)).json(); // attempt 2 of 2
    await prisma.examinationAttempt.update({ where: { id: s.attemptId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    const view: AttemptView = (await prisma.attemptQuestion.findFirst({ where: { attemptId: s.attemptId } })) as never;
    const save = await c1.put(`/api/attempts/${s.attemptId}/answers`, { attemptQuestionId: (view as unknown as { id: string }).id, selectedOptionIds: [] });
    expect(save.statusCode).toBe(409);
    expect(save.json().code).toBe('TIME_UP');
    const a = await prisma.examinationAttempt.findUniqueOrThrow({ where: { id: s.attemptId } });
    expect(a.status).toBe('AUTO_SUBMITTED');
    expect(a.submittedAt!.getTime()).toBe(a.deadlineAt.getTime());
    // max attempts now reached
    const st = await c1.post(`/api/my/exams/${examId}/start`);
    expect(st.statusCode).toBe(403);
    expect(st.json().message).toMatch(/hết số lần thi/);
    // background job path
    const e2 = await makeExam({ maxAttempts: 1 });
    const s3 = (await c2.post(`/api/my/exams/${e2}/start`)).json();
    await prisma.examinationAttempt.update({ where: { id: s3.attemptId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    expect(await autoSubmitExpired()).toBeGreaterThanOrEqual(1);
    expect((await prisma.examinationAttempt.findUniqueOrThrow({ where: { id: s3.attemptId } })).status).toBe('AUTO_SUBMITTED');
  });

  it('respects result visibility: SCORE_ONLY and HIDDEN', async () => {
    const eScore = await makeExam({ resultVisibility: 'SCORE_ONLY', maxAttempts: 1 }, questionIds.slice(0, 5));
    const sa = (await c1.post(`/api/my/exams/${eScore}/start`)).json();
    await c1.post(`/api/attempts/${sa.attemptId}/submit`);
    const r1 = (await c1.get(`/api/results/attempts/${sa.attemptId}`)).json();
    expect(r1.summary).toBeTruthy();
    expect(r1.questions).toBeUndefined();
    const eHidden = await makeExam({ resultVisibility: 'HIDDEN', maxAttempts: 1 }, questionIds.slice(0, 5));
    const sb = (await c1.post(`/api/my/exams/${eHidden}/start`)).json();
    await c1.post(`/api/attempts/${sb.attemptId}/submit`);
    const r2 = (await c1.get(`/api/results/attempts/${sb.attemptId}`)).json();
    expect(r2.summary).toBeUndefined();
    expect(r2.visibility).toBe('HIDDEN');
    // staff still see full detail
    expect((await manager.get(`/api/results/attempts/${sb.attemptId}`)).json().questions).toHaveLength(5);
  });

  it('preserves historical results when the source question is later edited', async () => {
    const aq = await prisma.attemptQuestion.findFirstOrThrow({ where: { attemptId: attempt.id }, orderBy: { sortOrder: 'asc' } });
    const detail = (await admin.get(`/api/questions/${aq.questionId}`)).json().question;
    const before = (aq.snapshot as { content: string }).content;
    const upd = await admin.put(`/api/questions/${aq.questionId}`, { ...detail, content: detail.content + '\n\n(Đã sửa sau kỳ thi)', options: detail.options, references: detail.references, changeNote: 'Sửa sau thi' });
    expect(upd.statusCode).toBe(200);
    const res = (await c1.get(`/api/results/attempts/${attempt.id}`)).json();
    const q = res.questions.find((x: { id: string }) => x.id === aq.id);
    expect(q.content).toBe(before);
    expect(res.summary.scorePercent).toBe(100);
    // exams already attempted cannot have questions changed
    expect((await manager.put(`/api/exams/${examId}/questions`, { questionIds: questionIds.slice(0, 3) })).statusCode).toBe(409);
    // used question cannot be deleted
    expect((await admin.del(`/api/questions/${aq.questionId}`)).statusCode).toBe(409);
    // restore approval so later tests can reuse the question
    await admin.post(`/api/questions/${aq.questionId}/status`, { status: 'PENDING_REVIEW' });
    expect((await admin.post(`/api/questions/${aq.questionId}/status`, { status: 'APPROVED' })).statusCode).toBe(200);
  });

  it('closed exams cannot be started', async () => {
    const e = await makeExam({ maxAttempts: 3 }, questionIds.slice(0, 3));
    await manager.post(`/api/exams/${e}/status`, { status: 'CLOSED' });
    expect((await c2.post(`/api/my/exams/${e}/start`)).statusCode).toBe(403);
  });
});
