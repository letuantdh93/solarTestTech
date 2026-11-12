import type * as z from 'zod/v4';
import type { AiProvider, StructuredRequest, StructuredResponse } from './types';
import type { AiQuestion } from '../ai.schemas';

/**
 * Deterministic provider for automated tests and offline demos (AI_PROVIDER=mock).
 * Fixture #2 deliberately carries a WRONG answer key so the verification gate can be exercised.
 */
const q1: AiQuestion = {
  title: 'Sụt áp mạch DC của chuỗi mái nhà kho',
  content: 'Chuỗi PV có $I_{mp}$ = 12 A, $V_{mp}$ chuỗi = 640 V, cáp đồng 6 mm² dài 45 m (một chiều), $\\rho$ = 0,0175 Ω·mm²/m. Sụt áp phần trăm của mạch DC là bao nhiêu?',
  type: 'SINGLE_CHOICE', difficulty: 3, calcComplexity: 2, isCalculation: true, isScenario: true,
  assumptions: 'Mạch DC hai dây cùng chiều dài; bỏ qua điện trở đầu nối.',
  explanation: 'ΔU = 2·45·12·0,0175/6 = 3,15 V → 3,15/640 = 0,49 %.',
  calcMethod: '1) ΔU = 2LIρ/S. 2) Chia cho Vmp.', conceptKey: 'dc-voltage-drop-ai', tags: ['sụt áp', 'ai'],
  options: [
    { label: '0,49 %', isCorrect: true, numericValue: 0.492, rationale: 'Đúng phương pháp.' },
    { label: '0,25 %', isCorrect: false, numericValue: 0.246, rationale: 'Quên hệ số 2.' },
    { label: '0,74 %', isCorrect: false, numericValue: 0.738, rationale: 'Dùng tiết diện 4 mm².' },
    { label: '0,98 %', isCorrect: false, numericValue: 0.984, rationale: 'Nhân đôi hai lần.' },
  ],
  numericAnswer: null, numericUnit: null, numericTolerance: 0.01, toleranceType: 'RELATIVE',
  calcSpec: { expression: '2 * l * i * rho / s / u * 100', variables: [{ name: 'l', value: 45 }, { name: 'i', value: 12 }, { name: 'rho', value: 0.0175 }, { name: 's', value: 6 }, { name: 'u', value: 640 }], unit: '%' },
  references: [], manufacturerSpecific: false,
};
const q2: AiQuestion = {
  ...q1,
  title: 'Tỷ lệ DC/AC của hệ 60 kWp',
  content: 'Hệ gồm 110 tấm 545 Wp đấu vào inverter 50 kW. Tỷ lệ DC/AC là bao nhiêu?',
  isScenario: false, conceptKey: 'dc-ac-ratio-ai',
  // Deliberately wrong key: correct is 1.199
  options: [
    { label: '1,30', isCorrect: true, numericValue: 1.3, rationale: '' },
    { label: '1,20', isCorrect: false, numericValue: 1.199, rationale: '' },
    { label: '0,83', isCorrect: false, numericValue: 0.83, rationale: '' },
    { label: '1,10', isCorrect: false, numericValue: 1.1, rationale: '' },
  ],
  calcSpec: { expression: 'n * p / 1000 / pac', variables: [{ name: 'n', value: 110 }, { name: 'p', value: 545 }, { name: 'pac', value: 50 }], unit: null },
};

const FIXTURES: Record<string, unknown> = {
  generate: { questions: [q1, q2] },
  document: { questions: [{ ...q1, title: 'Câu hỏi từ tài liệu', references: [{ standard: 'Tài liệu do người dùng cung cấp', edition: null, note: null }] }] },
  variants: { questions: [{ ...q1, title: `${q1.title} (biến thể)`, calcSpec: { ...q1.calcSpec!, variables: q1.calcSpec!.variables.map((v) => (v.name === 'l' ? { ...v, value: 60 } : v)) }, options: q1.options.map((o) => ({ ...o, numericValue: o.numericValue! * (60 / 45) })) }] },
  review: {
    technicalAccuracy: 'MINOR_ISSUES', ambiguity: 'LOW', answerKeyAssessment: 'Đáp án đúng phù hợp với tính toán.',
    issues: [{ severity: 'warning', message: 'Nên nêu rõ nhiệt độ làm việc của dây dẫn.' }], suggestions: ['Bổ sung giả thiết nhiệt độ.'],
    suggestedDifficulty: 3, difficultyRationale: 'Tính toán nhiều bước.', distractorQuality: 'Hợp lý.', standardsConcerns: [],
    independentCalculation: { performed: true, expression: '2*60*13*0.0175/4/750*100', variables: [], result: 0.91, note: 'Tính lại độc lập.' },
  },
  distractors: { distractors: [{ label: '1,21 %', numericValue: 1.21, misconception: 'Dùng điện áp Voc thay vì Vmp.' }] },
  explanation: { explanation: 'Giải thích chi tiết do AI đề xuất (mô phỏng).', calcMethod: '1) Bước một. 2) Bước hai.' },
};

export class MockProvider implements AiProvider {
  readonly name = 'mock';
  isConfigured() {
    return true;
  }
  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>> {
    const data = req.schema.parse(FIXTURES[req.task]);
    return { data, model: 'mock-model', inputTokens: 100, outputTokens: 200 };
  }
}
