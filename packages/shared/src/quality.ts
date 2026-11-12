import type { QuestionInput } from './schemas';
import { computeCalcSpec, withinTolerance } from './calc/templates';

export type IssueSeverity = 'error' | 'warning';
export interface QualityIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
}

export interface CalcVerification {
  computed: number | null;
  expected: number | null;
  ok: boolean | null; // null = not applicable
  message?: string;
}

const UNIT_PATTERN = /\d\s*(v|a|w|wp|kw|kwp|kwh|mwh|mm2|mm²|m|°c|%|ω|ohm|kva|hz|vnđ|h)\b/i;

/**
 * Verifies the stored answer key against calcSpec.
 * NUMERIC: numericAnswer must match computed value within tolerance.
 * Choice types: the single correct option's numericValue must match.
 */
export function verifyCalculation(q: Pick<
  QuestionInput,
  'calcSpec' | 'type' | 'numericAnswer' | 'numericTolerance' | 'toleranceType' | 'options'
>): CalcVerification {
  if (!q.calcSpec) return { computed: null, expected: null, ok: null };
  let computed: number;
  try {
    computed = computeCalcSpec(q.calcSpec);
  } catch (e) {
    return { computed: null, expected: null, ok: false, message: (e as Error).message };
  }
  const tolType = q.toleranceType ?? 'RELATIVE';
  const tol = q.numericTolerance ?? (tolType === 'RELATIVE' ? 0.01 : 0);
  if (q.type === 'NUMERIC') {
    const expected = q.numericAnswer ?? null;
    if (expected == null) return { computed, expected, ok: false, message: 'Thiếu đáp án số' };
    return { computed, expected, ok: withinTolerance(expected, computed, tol, tolType) };
  }
  const correct = q.options.filter((o) => o.isCorrect && o.numericValue != null);
  if (correct.length === 0) {
    return { computed, expected: null, ok: null, message: 'Phương án đúng không khai báo giá trị số để đối chiếu' };
  }
  const expected = correct[0]!.numericValue!;
  // Also ensure no distractor carries the computed value.
  const distractorHit = q.options.some(
    (o) => !o.isCorrect && o.numericValue != null && withinTolerance(o.numericValue, computed, tol, tolType),
  );
  const ok = withinTolerance(expected, computed, tol, tolType) && !distractorHit;
  return {
    computed,
    expected,
    ok,
    message: distractorHit ? 'Một phương án nhiễu trùng với kết quả tính toán' : undefined,
  };
}

/** Structural and content quality checks run before submission/approval. */
export function checkQuestionQuality(q: QuestionInput): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const add = (code: string, severity: IssueSeverity, message: string) => issues.push({ code, severity, message });
  const correct = q.options.filter((o) => o.isCorrect);

  switch (q.type) {
    case 'SINGLE_CHOICE':
      if (q.options.length < 3) add('OPTIONS_MIN', 'error', 'Câu hỏi một đáp án cần ít nhất 3 phương án');
      if (correct.length !== 1) add('SINGLE_CORRECT', 'error', 'Câu hỏi một đáp án phải có đúng 1 phương án đúng');
      break;
    case 'MULTIPLE_CHOICE':
      if (q.options.length < 4) add('OPTIONS_MIN', 'error', 'Câu hỏi nhiều đáp án cần ít nhất 4 phương án');
      if (correct.length < 2) add('MULTI_CORRECT', 'error', 'Câu hỏi nhiều đáp án phải có ít nhất 2 phương án đúng');
      if (correct.length === q.options.length)
        add('MULTI_ALL_CORRECT', 'error', 'Không được để tất cả phương án đều đúng');
      break;
    case 'TRUE_FALSE':
      if (q.options.length !== 2) add('TF_OPTIONS', 'error', 'Câu hỏi Đúng/Sai phải có đúng 2 phương án');
      if (correct.length !== 1) add('TF_CORRECT', 'error', 'Câu hỏi Đúng/Sai phải có đúng 1 phương án đúng');
      break;
    case 'NUMERIC':
      if (q.numericAnswer == null) add('NUMERIC_ANSWER', 'error', 'Câu hỏi nhập số phải có đáp án số');
      if (!q.numericUnit) add('NUMERIC_UNIT', 'warning', 'Nên khai báo đơn vị cho đáp án số');
      if (q.numericTolerance == null) add('NUMERIC_TOL', 'warning', 'Nên khai báo sai số chấp nhận');
      if (q.options.length) add('NUMERIC_OPTIONS', 'error', 'Câu hỏi nhập số không dùng phương án lựa chọn');
      break;
  }

  // Duplicate option text
  const seen = new Set<string>();
  for (const o of q.options) {
    const k = o.label.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k)) add('OPTION_DUP', 'error', `Phương án bị trùng: "${o.label.slice(0, 60)}"`);
    seen.add(k);
  }
  // "All of the above" style options weaken randomisation
  if (q.options.some((o) => /tất cả (các )?(phương án|đáp án) (trên|đều)/i.test(o.label)))
    add('OPTION_ALL_ABOVE', 'warning', 'Tránh phương án "Tất cả các đáp án trên" vì thứ tự phương án được xáo trộn');

  if (!q.explanation || q.explanation.trim().length < 30)
    add('EXPLANATION', 'warning', 'Nên bổ sung giải thích kỹ thuật chi tiết (≥ 30 ký tự)');

  if (q.content.trim().length < 40) add('CONTENT_SHORT', 'warning', 'Nội dung câu hỏi quá ngắn, có thể thiếu dữ kiện');

  if (q.isCalculation) {
    if (!q.calcMethod) add('CALC_METHOD', 'warning', 'Câu hỏi tính toán nên có phương pháp/các bước tính');
    if (!q.calcSpec) add('CALC_SPEC', 'warning', 'Câu hỏi tính toán nên có đặc tả tính toán để kiểm chứng đáp án tự động');
    if (!UNIT_PATTERN.test(q.content)) add('UNITS', 'warning', 'Không phát hiện đơn vị SI trong nội dung câu hỏi');
    if (!q.assumptions) add('ASSUMPTIONS', 'warning', 'Câu hỏi tính toán nên nêu rõ các giả thiết');
  }

  const v = verifyCalculation(q);
  if (v.ok === false)
    add(
      'CALC_MISMATCH',
      'error',
      `Đáp án không khớp với kết quả tính toán (tính được ${v.computed?.toPrecision(6) ?? '—'}, khai báo ${v.expected ?? '—'})${v.message ? ': ' + v.message : ''}`,
    );

  for (const r of q.references) {
    if (/^(IEC|TCVN|QCVN|IEEE|EN)\b/i.test(r.standard) && !r.edition)
      add('REF_EDITION', 'warning', `Tham chiếu ${r.standard} chưa ghi phiên bản (edition)`);
    if (r.clause && !r.verified)
      add('REF_CLAUSE_UNVERIFIED', 'warning', `Điều khoản ${r.clause} của ${r.standard} chưa được xác minh`);
  }
  if (q.categoryId && q.references.length === 0 && q.tags.some((t) => /iec|tcvn|qcvn/i.test(t)))
    add('REF_MISSING', 'warning', 'Câu hỏi liên quan tiêu chuẩn nhưng chưa có tham chiếu');

  return issues;
}

export function hasBlockingIssues(issues: QualityIssue[]) {
  return issues.some((i) => i.severity === 'error');
}
