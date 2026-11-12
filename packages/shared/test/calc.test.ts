import { describe, it, expect } from 'vitest';
import { evaluate, computeCalcSpec, withinTolerance, verifyCalculation, checkQuestionQuality, textSimilarity, shuffle, rng, CALC_TEMPLATES } from '../src';

describe('expression evaluator', () => {
  it('handles precedence, unary minus, power and functions', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('-2 ^ 2')).toBe(-4);
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluate('(1 + 2) * -3')).toBe(-9);
    expect(evaluate('sqrt(16) + max(1, 7, 3)')).toBe(11);
    expect(evaluate('round(3.14159, 2)')).toBe(3.14);
    expect(evaluate('floor(x / y)', { x: 10, y: 3 })).toBe(3);
    expect(evaluate('1e3 * 2')).toBe(2000);
    expect(evaluate('if(a > 3, 10, 20)', { a: 4 })).toBe(10);
    expect(evaluate('3 <= 3 && 2 > 5')).toBe(0);
  });
  it('rejects unsafe or invalid input', () => {
    expect(() => evaluate('process.exit()')).toThrow();
    expect(() => evaluate('constructor')).toThrow();
    expect(() => evaluate('foo(1)')).toThrow();
    expect(() => evaluate('1 / 0')).toThrow();
    expect(() => evaluate('(1 + 2')).toThrow();
  });
});

describe('engineering templates', () => {
  it('cold Voc of a module', () => {
    // 49.5 V, -0.27 %/°C, -5 °C  -> 49.5 * (1 + 0.081) = 53.5095
    expect(computeCalcSpec({ templateId: 'voc_at_temp', variables: { voc: 49.5, beta: -0.27, t: -5 } })).toBeCloseTo(53.5095, 4);
  });
  it('max modules per string', () => {
    expect(computeCalcSpec({ templateId: 'max_modules_per_string', variables: { vmax: 1100, voc: 49.5, beta: -0.27, tmin: -5 } })).toBe(20);
  });
  it('DC voltage drop %', () => {
    // 2*50*13*0.0175/4/600*100 = 0.9479...
    expect(computeCalcSpec({ templateId: 'vdrop_dc_percent', variables: { l: 50, i: 13, rho: 0.0175, s: 4, u: 600 } })).toBeCloseTo(0.94792, 4);
  });
  it('all templates evaluate with sample values', () => {
    for (const t of CALC_TEMPLATES) {
      const vars = Object.fromEntries(t.params.map((p) => [p.key, p.key === 'opex' ? 0 : 2]));
      expect(Number.isFinite(computeCalcSpec({ templateId: t.id, variables: vars }))).toBe(true);
    }
  });
  it('tolerance', () => {
    expect(withinTolerance(100.5, 100, 0.01, 'RELATIVE')).toBe(true);
    expect(withinTolerance(102, 100, 0.01, 'RELATIVE')).toBe(false);
    expect(withinTolerance(0.95, 0.948, 0.01, 'ABSOLUTE')).toBe(true);
  });
});

describe('quality checks', () => {
  const base = {
    title: 't', content: 'Một chuỗi gồm 20 tấm pin, Voc = 49,5 V, nhiệt độ thấp nhất -5 °C. Hỏi điện áp?', type: 'SINGLE_CHOICE' as const,
    categoryId: 'c', difficulty: 3, calcComplexity: 2, isCalculation: true, isScenario: false, tags: [], references: [],
    explanation: 'Giải thích chi tiết đủ dài để không cảnh báo về giải thích.', calcMethod: 'Bước 1',
    assumptions: 'Giả thiết',
  };
  it('flags wrong number of correct answers', () => {
    const issues = checkQuestionQuality({ ...base, options: [
      { label: 'A', isCorrect: true }, { label: 'B', isCorrect: true }, { label: 'C', isCorrect: false } ] });
    expect(issues.map((i) => i.code)).toContain('SINGLE_CORRECT');
  });
  it('detects calculation mismatch and distractor collision', () => {
    const calcSpec = { templateId: 'voc_at_temp', variables: { voc: 49.5, beta: -0.27, t: -5 } };
    const ok = verifyCalculation({ ...base, calcSpec, numericTolerance: 0.005, toleranceType: 'RELATIVE', options: [
      { label: '53,5 V', isCorrect: true, numericValue: 53.51 }, { label: '49,5 V', isCorrect: false, numericValue: 49.5 }, { label: '45,5 V', isCorrect: false, numericValue: 45.5 } ] });
    expect(ok.ok).toBe(true);
    const bad = verifyCalculation({ ...base, calcSpec, numericTolerance: 0.005, toleranceType: 'RELATIVE', options: [
      { label: '49,5 V', isCorrect: true, numericValue: 49.5 }, { label: '53,5 V', isCorrect: false, numericValue: 53.5 } ] });
    expect(bad.ok).toBe(false);
  });
});

describe('text utils', () => {
  it('similarity is diacritic-insensitive', () => {
    expect(textSimilarity('Điện áp hở mạch của chuỗi pin ở nhiệt độ thấp', 'Dien ap ho mach cua chuoi pin o nhiet do thap')).toBe(1);
    expect(textSimilarity('Tính sụt áp cáp DC', 'Lựa chọn SPD cho tủ AC')).toBeLessThan(0.2);
  });
  it('seeded shuffle is deterministic', () => {
    expect(shuffle([1, 2, 3, 4, 5], rng(42))).toEqual(shuffle([1, 2, 3, 4, 5], rng(42)));
  });
});

import { normalizePhone, guestEntrySchema } from '../src';
describe('guest entry', () => {
  it('normalises Vietnamese phone numbers', () => {
    expect(normalizePhone('0901 234 567')).toBe('0901234567');
    expect(normalizePhone('+84 901.234.567')).toBe('0901234567');
    expect(normalizePhone('84901234567')).toBe('0901234567');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('0901abc567')).toBeNull();
  });
  it('validates the entry form with Vietnamese names', () => {
    expect(guestEntrySchema.safeParse({ fullName: 'Nguyễn Thị Ánh Tuyết', phone: '0912345678', department: 'Phòng Thiết kế' }).success).toBe(true);
    expect(guestEntrySchema.safeParse({ fullName: '<script>', phone: '0912345678', department: 'X Y' }).success).toBe(false);
    expect(guestEntrySchema.safeParse({ fullName: 'An', phone: '123', department: '' }).success).toBe(false);
  });
});
