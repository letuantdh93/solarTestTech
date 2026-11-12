import { describe, it, expect, beforeAll } from 'vitest';
import { Client, loginAs } from './helpers';

describe('Phase 3 – examination builder', () => {
  let admin: Client, manager: Client, cand: Client, author: Client;
  let blueprint: { id: string; config: Record<string, unknown>; durationMinutes: number; passingScore: number };
  beforeAll(async () => {
    admin = await loginAs('admin');
    manager = await loginAs('quanly');
    cand = await loginAs('ts.nguyenvan');
    author = await loginAs('bientap');
    blueprint = (await manager.get('/api/blueprints')).json().find((b: { isDefault: boolean }) => b.isDefault);
  });

  const examBody = (extra: Record<string, unknown> = {}) => ({
    name: 'Sát hạch kỹ sư PV – Quý 4', description: 'Đề chuẩn 30 câu', targetAudience: 'Kỹ sư thiết kế', examCategory: 'Định kỳ',
    durationMinutes: 75, passingScore: 70, randomizeQuestions: true, randomizeOptions: true, maxAttempts: 2,
    resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT', ...extra,
  });

  it('default blueprint = 30 questions with the specified distribution', () => {
    const cfg = blueprint.config as { totalQuestions: number; difficultyDistribution: Record<string, number>; categoryDistribution: Array<{ count: number }> };
    expect(cfg.totalQuestions).toBe(30);
    expect(cfg.categoryDistribution.reduce((a, c) => a + c.count, 0)).toBe(30);
    expect(cfg.difficultyDistribution).toEqual({ 1: 10, 2: 20, 3: 40, 4: 30 });
  });

  it('generates a feasible 30-question exam from the demo bank', async () => {
    const res = await manager.post('/api/exam-builder/generate', { ...blueprint.config, seed: 42 });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.shortfalls).toEqual([]);
    expect(r.feasible).toBe(true);
    expect(r.questionIds).toHaveLength(30);
    expect(new Set(r.questionIds).size).toBe(30);
    expect(r.difficultyActual).toEqual({ 1: 3, 2: 6, 3: 12, 4: 9 });
    expect(r.calculationCount).toBeGreaterThanOrEqual(8);
    expect(r.scenarioCount).toBeGreaterThanOrEqual(4);
    // concept uniqueness
    const concepts = r.questions.map((q: { conceptKey: string | null }) => q.conceptKey).filter(Boolean);
    expect(new Set(concepts).size).toBe(concepts.length);
    // category counts honoured, never substituted
    for (const a of r.allocation) expect(a.selected).toBe(a.requested);
  });

  it('different seeds give different selections', async () => {
    const a = (await manager.post('/api/exam-builder/generate', { ...blueprint.config, seed: 1 })).json();
    const b = (await manager.post('/api/exam-builder/generate', { ...blueprint.config, seed: 2 })).json();
    expect(a.questionIds.join()).not.toBe(b.questionIds.join());
  });

  it('reports shortfalls clearly when the bank is insufficient', async () => {
    const cats = (await admin.get('/api/categories')).json();
    const K = cats.find((c: { code: string }) => c.code === 'K').id;
    const r = (await manager.post('/api/exam-builder/generate', { totalQuestions: 20, categoryDistribution: [{ categoryId: K, count: 20 }], difficultyDistribution: { 1: 0, 2: 0, 3: 0, 4: 100 }, questionTypes: ['SINGLE_CHOICE'], minCalculation: 0, minScenario: 0, maxPerConcept: 1 })).json();
    expect(r.feasible).toBe(false);
    expect(r.questionIds.length).toBeLessThan(20);
    expect(r.shortfalls[0].message).toMatch(/K\. Tiêu chuẩn/);
  });

  let examId = '';
  it('creates, configures, publishes and assigns an exam', async () => {
    const gen = (await manager.post('/api/exam-builder/generate', { ...blueprint.config, seed: 99 })).json();
    const res = await manager.post('/api/exams', { ...examBody(), questionIds: gen.questionIds, generationConfig: { ...blueprint.config, seed: 99 }, blueprintId: blueprint.id });
    expect(res.statusCode).toBe(201);
    examId = res.json().id;
    expect(res.json().code).toMatch(/^DT-\d{4}-\d{4}$/);
    expect(res.json()._count.questions).toBe(30);
    expect((await manager.post(`/api/exams/${examId}/status`, { status: 'PUBLISHED' })).json().status).toBe('PUBLISHED');
    const groups = (await manager.get('/api/groups')).json();
    const a = await manager.post(`/api/exams/${examId}/assignments`, { groupIds: [groups[0].id], userIds: [] });
    expect(a.json().created).toBe(1);
    const detail = (await manager.get(`/api/exams/${examId}`)).json();
    expect(detail.assignments).toHaveLength(1);
    expect(detail.questions).toHaveLength(30);
  });

  it('rejects non-approved questions in official exams', async () => {
    const draft = (await author.post('/api/questions', {
      title: 'Draft không được dùng', content: 'Nội dung câu hỏi nháp đủ dài để qua kiểm tra độ dài tối thiểu của hệ thống.', type: 'TRUE_FALSE',
      categoryId: (await admin.get('/api/categories')).json()[0].id, difficulty: 1, calcComplexity: 0, isCalculation: false, isScenario: false,
      options: [{ label: 'Đúng', isCorrect: true }, { label: 'Sai', isCorrect: false }], tags: [], references: [],
    })).json();
    const r = await manager.post('/api/exams', { ...examBody({ name: 'Đề lỗi' }), questionIds: [draft.id] });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/đã duyệt/);
  });

  it('cannot publish an empty exam; validates end date after start', async () => {
    const e = (await manager.post('/api/exams', examBody({ name: 'Đề rỗng' }))).json();
    expect((await manager.post(`/api/exams/${e.id}/status`, { status: 'PUBLISHED' })).statusCode).toBe(400);
    const bad = await manager.post('/api/exams', examBody({ startAt: '2030-01-02T00:00:00Z', endAt: '2030-01-01T00:00:00Z' }));
    expect(bad.statusCode).toBe(422);
    expect((await manager.del(`/api/exams/${e.id}`)).statusCode).toBe(200);
  });

  it('duplicate exam copies questions', async () => {
    const r = (await manager.post(`/api/exams/${examId}/duplicate`)).json();
    expect(r.exam.name).toMatch(/bản sao/);
    expect(r.exam._count.questions).toBe(30);
    expect(r.exam.status).toBe('DRAFT');
  });

  it('candidates and authors cannot use the builder', async () => {
    expect((await cand.post('/api/exam-builder/generate', blueprint.config)).statusCode).toBe(403);
    expect((await cand.get('/api/exams')).statusCode).toBe(403);
    expect((await author.post('/api/exams', examBody())).statusCode).toBe(403);
  });

  it('manual selection list exposes only approved questions and no answer keys', async () => {
    const r = (await manager.get('/api/exam-builder/questions?pageSize=100')).json();
    expect(r.total).toBeGreaterThanOrEqual(50);
    expect(JSON.stringify(r)).not.toMatch(/isCorrect|numericAnswer/);
  });
});
