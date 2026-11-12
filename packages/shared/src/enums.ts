// Domain enums shared by API and UI. Labels live in the web i18n dictionary, not here.

export const ROLE_CODES = ['ADMIN', 'EXAM_MANAGER', 'AUTHOR', 'CANDIDATE'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSIONS = [
  'users.manage',
  'roles.manage',
  'groups.manage',
  'categories.view',
  'categories.manage',
  'questions.view_all',
  'questions.create',
  'questions.edit_all',
  'questions.review',
  'questions.delete',
  'questions.import',
  'questions.export',
  'exams.manage',
  'exams.assign',
  'exams.view_stats',
  'exams.take',
  'results.view_all',
  'results.view_own',
  'results.export',
  'ai.use',
  'settings.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Default permission matrix applied by the seed. Admins can change it in the UI. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  ADMIN: [...PERMISSIONS].filter((p) => p !== 'exams.take' && p !== 'results.view_own'),
  EXAM_MANAGER: [
    'categories.view',
    'questions.view_all',
    'questions.export',
    'exams.manage',
    'exams.assign',
    'exams.view_stats',
    'results.view_all',
    'results.export',
    'groups.manage',
  ],
  AUTHOR: ['categories.view', 'questions.create', 'ai.use'],
  CANDIDATE: ['exams.take', 'results.view_own'],
};

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** Statuses usable in official examinations. */
export const USABLE_QUESTION_STATUSES: QuestionStatus[] = ['APPROVED', 'PUBLISHED'];

/** Allowed workflow transitions: from -> allowed targets. */
export const QUESTION_TRANSITIONS: Record<QuestionStatus, QuestionStatus[]> = {
  DRAFT: ['PENDING_REVIEW', 'ARCHIVED'],
  PENDING_REVIEW: ['APPROVED', 'DRAFT', 'ARCHIVED'], // DRAFT = rejected / returned
  APPROVED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: ['DRAFT'],
};

export const DIFFICULTIES = [1, 2, 3, 4] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Calculation complexity is tracked separately from theoretical difficulty. */
export const CALC_COMPLEXITIES = [0, 1, 2, 3] as const;
export type CalcComplexity = (typeof CALC_COMPLEXITIES)[number];

export const EXAM_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const RESULT_VISIBILITY = ['HIDDEN', 'SCORE_ONLY', 'DETAILED'] as const;
export type ResultVisibility = (typeof RESULT_VISIBILITY)[number];

export const EXPLANATION_VISIBILITY = ['NEVER', 'AFTER_SUBMIT', 'AFTER_CLOSE'] as const;
export type ExplanationVisibility = (typeof EXPLANATION_VISIBILITY)[number];

export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const TOLERANCE_TYPES = ['ABSOLUTE', 'RELATIVE'] as const;
export type ToleranceType = (typeof TOLERANCE_TYPES)[number];

export const AI_JOB_KINDS = [
  'GENERATE_QUESTIONS',
  'GENERATE_DISTRACTORS',
  'REVIEW_QUESTION',
  'GENERATE_EXPLANATION',
  'SUGGEST_DIFFICULTY',
  'DOCUMENT_TO_QUESTIONS',
  'GENERATE_VARIANTS',
] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];

/** Competency bands applied to a percentage score. */
export const COMPETENCY_BANDS = [
  { min: 85, level: 'EXCELLENT' },
  { min: 70, level: 'GOOD' },
  { min: 50, level: 'NEEDS_IMPROVEMENT' },
  { min: 0, level: 'WEAK' },
] as const;
export type CompetencyLevel = (typeof COMPETENCY_BANDS)[number]['level'];

export function competencyLevel(percent: number): CompetencyLevel {
  for (const b of COMPETENCY_BANDS) if (percent >= b.min) return b.level;
  return 'WEAK';
}
