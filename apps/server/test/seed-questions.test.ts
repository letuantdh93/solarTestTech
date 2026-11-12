import { describe, it, expect } from 'vitest';
import { checkQuestionQuality, verifyCalculation, questionInputSchema } from '@solar/shared';
import { SEED_QUESTIONS } from '../prisma/seed/questions';
import { TAXONOMY, DEFAULT_TEMPLATE_DISTRIBUTION } from '../prisma/seed/taxonomy';

describe('Demo question bank integrity', () => {
  it('has 50–65 questions with unique keys', () => {
    expect(SEED_QUESTIONS.length).toBeGreaterThanOrEqual(50);
    expect(SEED_QUESTIONS.length).toBeLessThanOrEqual(65);
    expect(new Set(SEED_QUESTIONS.map((q) => q.key)).size).toBe(SEED_QUESTIONS.length);
  });

  for (const q of SEED_QUESTIONS) {
    it(`${q.key}: valid schema, no blocking quality issues, verified answer key`, () => {
      const cat = TAXONOMY.find((c) => c.code === q.category);
      expect(cat, 'category exists').toBeTruthy();
      expect(cat!.children[q.sub], 'subcategory exists').toBeTruthy();
      const input = { ...q, categoryId: 'x', subcategoryId: 'y' };
      expect(questionInputSchema.safeParse(input).success).toBe(true);
      const errors = checkQuestionQuality(input).filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
      if (q.calcSpec) {
        const v = verifyCalculation(input);
        expect(v.ok, `${q.key} computed=${v.computed} expected=${v.expected} ${v.message ?? ''}`).toBe(true);
      }
      // No clause numbers are asserted in demo data (policy: do not invent clauses).
      for (const r of q.references) expect((r as { clause?: string | null }).clause ?? null).toBeNull();
    });
  }

  it('numerical questions carry a calcSpec (independently verified)', () => {
    const numeric = SEED_QUESTIONS.filter((q) => q.type === 'NUMERIC');
    expect(numeric.every((q) => q.calcSpec)).toBe(true);
    const verified = SEED_QUESTIONS.filter((q) => q.calcSpec).length;
    expect(verified).toBeGreaterThanOrEqual(30);
  });

  it('supports the default 30-question template (category × difficulty coverage)', () => {
    for (const [code, n] of Object.entries(DEFAULT_TEMPLATE_DISTRIBUTION)) {
      expect(SEED_QUESTIONS.filter((q) => q.category === code).length, code).toBeGreaterThanOrEqual(n);
    }
    const byDiff = (d: number) => SEED_QUESTIONS.filter((q) => q.difficulty === d).length;
    expect(byDiff(1)).toBeGreaterThanOrEqual(3);
    expect(byDiff(2)).toBeGreaterThanOrEqual(6);
    expect(byDiff(3)).toBeGreaterThanOrEqual(12);
    expect(byDiff(4)).toBeGreaterThanOrEqual(9);
  });
});
