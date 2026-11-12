import { describe, it, expect } from 'vitest';
import { difficultyTargets, generateSelection, type PoolQuestion } from '../src/modules/exams/generator';

let n = 0;
const q = (categoryId: string, difficulty: number, extra: Partial<PoolQuestion> = {}): PoolQuestion => ({
  id: `q${++n}`, code: `Q${String(n).padStart(4, '0')}`, categoryId, difficulty, type: 'SINGLE_CHOICE', isCalculation: false, isScenario: false, conceptKey: null, ...extra,
});
const base = { questionTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC'] as const, minCalculation: 0, minScenario: 0, maxPerConcept: 1, seed: 7 };

describe('generator', () => {
  it('rounds difficulty percentages with largest remainder', () => {
    expect(difficultyTargets(30, { 1: 10, 2: 20, 3: 40, 4: 30 })).toEqual({ 1: 3, 2: 6, 3: 12, 4: 9 });
    const t = difficultyTargets(7, { 1: 25, 2: 25, 3: 25, 4: 25 });
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('solves the category × difficulty allocation exactly when feasible (flow, not greedy)', () => {
    // Greedy trap: category A could absorb the only L4 questions B needs.
    const pool = [q('A', 1), q('A', 4), q('A', 4), q('B', 4), q('B', 1), q('B', 1)];
    const r = generateSelection(pool, { ...base, totalQuestions: 4, categoryDistribution: [{ categoryId: 'A', count: 2 }, { categoryId: 'B', count: 2 }], difficultyDistribution: { 1: 50, 2: 0, 3: 0, 4: 50 } } as never);
    expect(r.feasible).toBe(true);
    expect(r.difficultyActual).toEqual({ 1: 2, 2: 0, 3: 0, 4: 2 });
  });

  it('never substitutes questions from another category; reports shortfall', () => {
    const pool = [q('A', 2), q('B', 2), q('B', 2), q('B', 2)];
    const r = generateSelection(pool, { ...base, totalQuestions: 3, categoryDistribution: [{ categoryId: 'A', count: 3 }], difficultyDistribution: { 1: 0, 2: 100, 3: 0, 4: 0 } } as never, { A: 'A. Cơ bản' });
    expect(r.questionIds).toHaveLength(1);
    expect(r.feasible).toBe(false);
    expect(r.shortfalls.find((s) => s.kind === 'CATEGORY')!.message).toMatch(/A\. Cơ bản/);
  });

  it('keeps category counts but reports difficulty deviation when difficulty mix is impossible', () => {
    const pool = [q('A', 2), q('A', 2), q('A', 2)];
    const r = generateSelection(pool, { ...base, totalQuestions: 2, categoryDistribution: [{ categoryId: 'A', count: 2 }], difficultyDistribution: { 1: 0, 2: 0, 3: 0, 4: 100 } } as never);
    expect(r.questionIds).toHaveLength(2);
    expect(r.shortfalls.some((s) => s.kind === 'DIFFICULTY')).toBe(true);
  });

  it('respects max questions per concept and no duplicates', () => {
    const pool = [q('A', 3, { conceptKey: 'x' }), q('A', 3, { conceptKey: 'x' }), q('A', 3, { conceptKey: 'x' }), q('A', 3)];
    const r = generateSelection(pool, { ...base, totalQuestions: 3, categoryDistribution: [{ categoryId: 'A', count: 3 }], difficultyDistribution: { 1: 0, 2: 0, 3: 100, 4: 0 } } as never);
    expect(r.questionIds).toHaveLength(2); // only one 'x' + the free one
    expect(new Set(r.questionIds).size).toBe(r.questionIds.length);
  });

  it('meets minimum calculation/scenario counts via preference and swaps', () => {
    const pool = [...Array.from({ length: 6 }, () => q('A', 2)), q('A', 2, { isCalculation: true }), q('A', 2, { isCalculation: true }), q('A', 2, { isScenario: true })];
    for (let seed = 1; seed < 15; seed++) {
      const r = generateSelection(pool, { ...base, seed, totalQuestions: 4, minCalculation: 2, minScenario: 1, categoryDistribution: [{ categoryId: 'A', count: 4 }], difficultyDistribution: { 1: 0, 2: 100, 3: 0, 4: 0 } } as never);
      expect(r.calculationCount).toBeGreaterThanOrEqual(2);
      expect(r.scenarioCount).toBeGreaterThanOrEqual(1);
      expect(r.feasible).toBe(true);
    }
  });

  it('filters by question type', () => {
    const pool = [q('A', 2, { type: 'NUMERIC' }), q('A', 2)];
    const r = generateSelection(pool, { ...base, questionTypes: ['NUMERIC'], totalQuestions: 1, categoryDistribution: [{ categoryId: 'A', count: 1 }], difficultyDistribution: { 1: 0, 2: 100, 3: 0, 4: 0 } } as never);
    expect(r.questionIds).toEqual([pool[0]!.id]);
  });
});
