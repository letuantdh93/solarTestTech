import { z } from 'zod';
import {
  QUESTION_TYPES,
  QUESTION_STATUSES,
  RESULT_VISIBILITY,
  EXPLANATION_VISIBILITY,
  TOLERANCE_TYPES,
  ROLE_CODES,
  PERMISSIONS,
} from './enums';

// Vietnamese validation messages (server returns these to the UI).
const req = 'Trường này là bắt buộc';
const str = (max: number, min = 0) =>
  z
    .string({ required_error: req })
    .trim()
    .min(min, min > 0 ? req : undefined)
    .max(max, `Tối đa ${max} ký tự`);

export const idSchema = z.string().min(1).max(64);

export const loginSchema = z.object({
  username: str(100, 1),
  password: z.string().min(1, req).max(200),
});

export const passwordSchema = z
  .string()
  .min(10, 'Mật khẩu tối thiểu 10 ký tự')
  .max(200)
  .regex(/[a-z]/, 'Mật khẩu phải có chữ thường')
  .regex(/[A-Z]/, 'Mật khẩu phải có chữ hoa')
  .regex(/[0-9]/, 'Mật khẩu phải có chữ số');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, req),
  newPassword: passwordSchema,
});

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang'),
  fullName: str(150, 1),
  email: z.string().trim().email('Email không hợp lệ').max(200).optional().or(z.literal('')),
  department: str(150).optional(),
  position: str(150).optional(),
  roleCode: z.enum(ROLE_CODES),
  password: passwordSchema,
  groupIds: z.array(idSchema).max(50).optional(),
  categoryIds: z.array(idSchema).max(100).optional(),
});

export const userUpdateSchema = userCreateSchema
  .omit({ password: true, username: true })
  .partial()
  .extend({ isActive: z.boolean().optional(), password: passwordSchema.optional() });

export const rolePermissionsSchema = z.object({ permissions: z.array(z.enum(PERMISSIONS)) });

export const groupSchema = z.object({
  name: str(150, 1),
  description: str(1000).optional(),
  memberIds: z.array(idSchema).max(5000).optional(),
});

export const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, req)
    .max(20)
    .regex(/^[A-Z0-9.]+$/, 'Mã chỉ gồm chữ in hoa, số và dấu chấm'),
  name: str(200, 1),
  description: str(2000).optional(),
  parentId: idSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export const calcSpecSchema = z
  .object({
    templateId: z.string().max(64).optional(),
    expression: z.string().max(2000).optional(),
    variables: z.record(z.string().max(40), z.number()),
    unit: z.string().max(30).optional(),
  })
  .refine((v) => !!v.templateId || !!v.expression, 'Cần templateId hoặc biểu thức');

export const optionInputSchema = z.object({
  id: idSchema.optional(),
  label: str(2000, 1),
  isCorrect: z.boolean(),
  numericValue: z.number().nullable().optional(),
  rationale: str(2000).optional().nullable(),
});

export const referenceInputSchema = z.object({
  standard: str(200, 1),
  edition: str(50).optional().nullable(),
  jurisdiction: str(100).optional().nullable(),
  clause: str(100).optional().nullable(),
  title: str(300).optional().nullable(),
  note: str(1000).optional().nullable(),
  verified: z.boolean().optional(),
});

export const questionInputSchema = z.object({
  title: str(300, 1),
  content: str(20000, 1),
  type: z.enum(QUESTION_TYPES),
  categoryId: idSchema,
  subcategoryId: idSchema.nullable().optional(),
  difficulty: z.number().int().min(1).max(4),
  calcComplexity: z.number().int().min(0).max(3).default(0),
  isCalculation: z.boolean().default(false),
  isScenario: z.boolean().default(false),
  assumptions: str(5000).optional().nullable(),
  explanation: str(20000).optional().nullable(),
  calcMethod: str(20000).optional().nullable(),
  conceptKey: str(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  options: z.array(optionInputSchema).max(10).default([]),
  numericAnswer: z.number().nullable().optional(),
  numericUnit: str(30).optional().nullable(),
  numericTolerance: z.number().min(0).nullable().optional(),
  toleranceType: z.enum(TOLERANCE_TYPES).nullable().optional(),
  numericDecimals: z.number().int().min(0).max(6).nullable().optional(),
  calcSpec: calcSpecSchema.nullable().optional(),
  references: z.array(referenceInputSchema).max(20).default([]),
  changeNote: str(500).optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionStatusChangeSchema = z.object({
  status: z.enum(QUESTION_STATUSES),
  comment: str(2000).optional(),
});

export const questionListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  categoryId: z.string().max(64).optional(),
  difficulty: z.coerce.number().int().min(1).max(4).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  authorId: z.string().max(64).optional(),
  isCalculation: z.enum(['true', 'false']).optional(),
  isScenario: z.enum(['true', 'false']).optional(),
  tag: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.enum(['updatedAt', 'createdAt', 'code', 'difficulty']).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

/** Distribution entries used by blueprints and automatic generation. */
export const categoryDistributionSchema = z.array(
  z.object({ categoryId: idSchema, count: z.number().int().min(0).max(500) }),
);
export const difficultyDistributionSchema = z.object({
  1: z.number().min(0).max(100),
  2: z.number().min(0).max(100),
  3: z.number().min(0).max(100),
  4: z.number().min(0).max(100),
});

export const generationConfigSchema = z.object({
  totalQuestions: z.number().int().min(1).max(300),
  categoryDistribution: categoryDistributionSchema,
  difficultyDistribution: difficultyDistributionSchema,
  questionTypes: z.array(z.enum(QUESTION_TYPES)).min(1).default([...QUESTION_TYPES]),
  minCalculation: z.number().int().min(0).max(300).default(0),
  minScenario: z.number().int().min(0).max(300).default(0),
  maxPerConcept: z.number().int().min(1).max(10).default(1),
  targetCompetency: str(200).optional(),
  seed: z.number().int().optional(),
});
export type GenerationConfig = z.infer<typeof generationConfigSchema>;

export const examInputSchema = z
  .object({
    name: str(300, 1),
    description: str(5000).optional().nullable(),
    targetAudience: str(300).optional().nullable(),
    examCategory: str(200).optional().nullable(),
    durationMinutes: z.number().int().min(1).max(600),
    passingScore: z.number().min(0).max(100),
    randomizeQuestions: z.boolean().default(true),
    randomizeOptions: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(20).default(1),
    startAt: z.coerce.date().nullable().optional(),
    endAt: z.coerce.date().nullable().optional(),
    resultVisibility: z.enum(RESULT_VISIBILITY).default('DETAILED'),
    explanationVisibility: z.enum(EXPLANATION_VISIBILITY).default('AFTER_SUBMIT'),
    blueprintId: idSchema.nullable().optional(),
  })
  .refine((v) => !v.startAt || !v.endAt || v.endAt > v.startAt, {
    message: 'Ngày hết hạn phải sau ngày bắt đầu',
    path: ['endAt'],
  });

export const blueprintInputSchema = z.object({
  name: str(200, 1),
  description: str(2000).optional().nullable(),
  config: generationConfigSchema,
  durationMinutes: z.number().int().min(1).max(600).default(60),
  passingScore: z.number().min(0).max(100).default(70),
});

export const examQuestionsSetSchema = z.object({
  questionIds: z.array(idSchema).max(300),
});

export const assignmentSchema = z.object({
  userIds: z.array(idSchema).max(5000).default([]),
  groupIds: z.array(idSchema).max(200).default([]),
  dueAt: z.coerce.date().nullable().optional(),
});

export const saveAnswerSchema = z.object({
  attemptQuestionId: idSchema,
  selectedOptionIds: z.array(idSchema).max(10).optional(),
  numericValue: z.number().finite().nullable().optional(),
  flagged: z.boolean().optional(),
});

export const aiGenerateSchema = z.object({
  categoryId: idSchema,
  subcategoryId: idSchema.nullable().optional(),
  difficulty: z.number().int().min(1).max(4),
  type: z.enum(QUESTION_TYPES),
  count: z.number().int().min(1).max(5),
  topic: str(500).optional(),
  requireCalculation: z.boolean().default(false),
  requireScenario: z.boolean().default(false),
});

export const aiDocumentSchema = z.object({
  categoryId: idSchema,
  text: str(30000, 50),
  count: z.number().int().min(1).max(5),
  difficulty: z.number().int().min(1).max(4).default(2),
});

export const settingsSchema = z.object({
  organizationName: str(200).optional(),
  defaultDurationMinutes: z.number().int().min(1).max(600).optional(),
  defaultPassingScore: z.number().min(0).max(100).optional(),
  sessionTimeoutMinutes: z.number().int().min(15).max(1440).optional(),
  aiEnabled: z.boolean().optional(),
  aiModel: str(100).optional(),
  similarityThreshold: z.number().min(0.3).max(0.99).optional(),
});
