/** Structured-output schemas for AI responses (zod v4, as required by the SDK helper). */
import * as z from 'zod/v4';

export const aiReference = z.object({
  standard: z.string(),
  edition: z.string().nullable(),
  note: z.string().nullable(),
});

export const aiQuestion = z.object({
  title: z.string(),
  content: z.string(),
  type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC']),
  difficulty: z.number().int(),
  calcComplexity: z.number().int(),
  isCalculation: z.boolean(),
  isScenario: z.boolean(),
  assumptions: z.string(),
  explanation: z.string(),
  calcMethod: z.string().nullable(),
  conceptKey: z.string(),
  tags: z.array(z.string()),
  options: z.array(z.object({ label: z.string(), isCorrect: z.boolean(), numericValue: z.number().nullable(), rationale: z.string() })),
  numericAnswer: z.number().nullable(),
  numericUnit: z.string().nullable(),
  numericTolerance: z.number().nullable(),
  toleranceType: z.enum(['ABSOLUTE', 'RELATIVE']).nullable(),
  calcSpec: z
    .object({
      expression: z.string(),
      variables: z.array(z.object({ name: z.string(), value: z.number() })),
      unit: z.string().nullable(),
    })
    .nullable(),
  references: z.array(aiReference),
  manufacturerSpecific: z.boolean(),
});
export type AiQuestion = z.infer<typeof aiQuestion>;

export const aiQuestionSet = z.object({ questions: z.array(aiQuestion) });

export const aiReview = z.object({
  technicalAccuracy: z.enum(['CORRECT', 'MINOR_ISSUES', 'MAJOR_ISSUES']),
  ambiguity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  answerKeyAssessment: z.string(),
  issues: z.array(z.object({ severity: z.enum(['error', 'warning', 'info']), message: z.string() })),
  suggestions: z.array(z.string()),
  suggestedDifficulty: z.number().int(),
  difficultyRationale: z.string(),
  distractorQuality: z.string(),
  standardsConcerns: z.array(z.string()),
  independentCalculation: z.object({ performed: z.boolean(), expression: z.string().nullable(), variables: z.array(z.object({ name: z.string(), value: z.number() })), result: z.number().nullable(), note: z.string() }),
});
export type AiReview = z.infer<typeof aiReview>;

export const aiDistractors = z.object({
  distractors: z.array(z.object({ label: z.string(), numericValue: z.number().nullable(), misconception: z.string() })),
});

export const aiExplanation = z.object({ explanation: z.string(), calcMethod: z.string().nullable() });
