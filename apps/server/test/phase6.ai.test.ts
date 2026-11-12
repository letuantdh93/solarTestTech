import { describe, it, expect, beforeAll } from 'vitest';
import { Client, loginAs } from './helpers';
import { AnthropicProvider } from '../src/modules/ai/providers/anthropic';
import { aiToInput } from '../src/modules/ai/ai.service';
import * as z from 'zod/v4';

describe('Phase 6 – AI-assisted authoring (mock provider)', () => {
  let author: Client, admin: Client, cand: Client, manager: Client;
  let catG = '';
  beforeAll(async () => {
    author = await loginAs('bientap');
    admin = await loginAs('admin');
    cand = await loginAs('ts.nguyenvan');
    manager = await loginAs('quanly');
    catG = (await admin.get('/api/categories')).json().find((c: { code: string }) => c.code === 'G').id;
  });

  it('anthropic adapter reports not configured without an API key (no network call)', async () => {
    const p = new AnthropicProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(p.generateStructured({ task: 'x', system: 's', user: 'u', schema: z.object({ a: z.string() }) })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('status endpoint and permissions', async () => {
    expect((await author.get('/api/ai/status')).json()).toMatchObject({ enabled: true, configured: true, provider: 'mock' });
    expect((await cand.post('/api/ai/generate', {})).statusCode).toBe(403);
    expect((await manager.get('/api/ai/status')).statusCode).toBe(403);
  });

  it('generated questions are saved as DRAFT, flagged AI, and answer keys are verified', async () => {
    const res = await author.post('/api/ai/generate', { categoryId: catG, difficulty: 3, type: 'SINGLE_CHOICE', count: 2, requireCalculation: true, requireScenario: false });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results).toHaveLength(2);
    const [good, bad] = results;
    expect(good.saved).toBe(true);
    expect(good.verification.ok).toBe(true);
    expect(bad.verification.ok).toBe(false); // fixture carries a wrong key
    const g = (await author.get(`/api/questions/${good.id}`)).json().question;
    expect(g.status).toBe('DRAFT');
    expect(g.isAiGenerated).toBe(true);
    expect(g.tags).toContain('ai');
    // Correct one can be submitted; wrong-key one is blocked by the verification gate.
    expect((await author.post(`/api/questions/${good.id}/status`, { status: 'PENDING_REVIEW' })).statusCode).toBe(200);
    const blocked = await author.post(`/api/questions/${bad.id}/status`, { status: 'PENDING_REVIEW' });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().details.map((d: { code: string }) => d.code)).toContain('CALC_MISMATCH');
  });

  it('AI-generated calculation question without calcSpec cannot be submitted', async () => {
    const res = await author.post('/api/ai/generate', { categoryId: catG, difficulty: 3, type: 'SINGLE_CHOICE', count: 1, requireCalculation: true, requireScenario: false });
    const id = res.json().results[0].id;
    const q = (await author.get(`/api/questions/${id}`)).json().question;
    // Author removes the calcSpec manually – gate must still block.
    await author.put(`/api/questions/${id}`, { ...q, calcSpec: null, options: q.options, references: q.references });
    const r = await author.post(`/api/questions/${id}/status`, { status: 'PENDING_REVIEW' });
    expect(r.statusCode).toBe(422);
    expect(r.json().details.map((d: { code: string }) => d.code)).toContain('AI_NO_CALCSPEC');
  });

  it('document → questions, review (with programmatic cross-check), distractors, explanation, variants', async () => {
    const doc = await author.post('/api/ai/document', { categoryId: catG, count: 1, difficulty: 2, text: 'Datasheet cáp PV: tiết diện 6 mm², dòng cho phép 70 A ở 60 °C, điện trở dây dẫn 3,39 Ω/km ở 20 °C, điện áp định mức 1,5 kV DC.' });
    expect(doc.statusCode).toBe(200);
    expect(doc.json().results[0].saved).toBe(true);
    const seeded = (await admin.get('/api/questions?q=' + encodeURIComponent('Sụt áp cáp chuỗi DC'))).json().items[0];
    const review = (await author.post(`/api/ai/questions/${seeded.id}/review`)).json();
    expect(review.review.technicalAccuracy).toBe('MINOR_ISSUES');
    expect(review.systemVerification.ok).toBe(true);
    expect(review.aiCalculation.value).toBeCloseTo(0.91, 2);
    expect((await author.post(`/api/ai/questions/${seeded.id}/distractors`, { count: 1 })).json().distractors).toHaveLength(1);
    expect((await author.post(`/api/ai/questions/${seeded.id}/explanation`)).json().explanation).toBeTruthy();
    const v = (await author.post(`/api/ai/questions/${seeded.id}/variants`, { count: 1 })).json();
    expect(v.results[0].saved).toBe(true);
    const variant = (await author.get(`/api/questions/${v.results[0].id}`)).json().question;
    expect(variant.conceptKey).toBe('dc-voltage-drop');
  });

  it('jobs are logged with token usage', async () => {
    const jobs = (await author.get('/api/ai/jobs')).json();
    expect(jobs.total).toBeGreaterThanOrEqual(6);
    expect(jobs.items[0].status).toBe('SUCCEEDED');
    expect(jobs.items[0].outputTokens).toBe(200);
  });

  it('disabling AI in settings blocks usage', async () => {
    await admin.put('/api/settings', { aiEnabled: false });
    const r = await author.post('/api/ai/generate', { categoryId: catG, difficulty: 2, type: 'SINGLE_CHOICE', count: 1, requireCalculation: false, requireScenario: false });
    expect(r.statusCode).toBe(403);
    await admin.put('/api/settings', { aiEnabled: true });
  });

  it('aiToInput never emits clause numbers and marks manufacturer-specific content', () => {
    const input = aiToInput({
      title: 't', content: 'c', type: 'TRUE_FALSE', difficulty: 9, calcComplexity: -1, isCalculation: false, isScenario: false, assumptions: '', explanation: '', calcMethod: null,
      conceptKey: 'Some Key!', tags: ['X'], options: [{ label: 'True', isCorrect: true, numericValue: null, rationale: '' }, { label: 'False', isCorrect: false, numericValue: null, rationale: '' }],
      numericAnswer: null, numericUnit: null, numericTolerance: null, toleranceType: null, calcSpec: null, references: [{ standard: 'IEC 62548', edition: '2016', note: null }], manufacturerSpecific: true,
    }, 'cat', null);
    expect(input.difficulty).toBe(4);
    expect(input.calcComplexity).toBe(0);
    expect(input.options.map((o) => o.label)).toEqual(['Đúng', 'Sai']);
    expect(input.references.every((r) => r.clause === null && r.verified === false)).toBe(true);
    expect(input.references.some((r) => r.standard.startsWith('Datasheet'))).toBe(true);
    expect(input.conceptKey).toBe('some-key-');
  });
});
