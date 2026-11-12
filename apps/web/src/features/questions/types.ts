import type { QuestionStatus, QuestionType, QualityIssue, CalcVerification, CalcSpec } from '@solar/shared';

export interface QOption { id?: string; label: string; isCorrect: boolean; numericValue?: number | null; rationale?: string | null }
export interface QReference { standard: string; edition?: string | null; jurisdiction?: string | null; clause?: string | null; title?: string | null; note?: string | null; verified?: boolean }
export interface QMedia { id: string; url: string; originalName: string; caption: string | null }
export interface Question {
  id: string; code: string; title: string; content: string; type: QuestionType; status: QuestionStatus;
  categoryId: string; subcategoryId: string | null; difficulty: number; calcComplexity: number; isCalculation: boolean; isScenario: boolean;
  assumptions: string | null; explanation: string | null; calcMethod: string | null; conceptKey: string | null; tags: string[];
  numericAnswer: number | null; numericUnit: string | null; numericTolerance: number | null; toleranceType: 'ABSOLUTE' | 'RELATIVE' | null; numericDecimals: number | null;
  calcSpec: CalcSpec | null; version: number; isAiGenerated: boolean; reviewComment: string | null; approvedAt: string | null;
  createdAt: string; updatedAt: string;
  options: QOption[]; references: QReference[]; media: QMedia[];
  category: { id: string; code: string; name: string }; subcategory: { id: string; code: string; name: string } | null;
  author: { id: string; fullName: string }; reviewer: { id: string; fullName: string } | null;
}
export interface QuestionListItem {
  id: string; code: string; title: string; type: QuestionType; status: QuestionStatus; difficulty: number; calcComplexity: number;
  isCalculation: boolean; isScenario: boolean; tags: string[]; version: number; isAiGenerated: boolean; updatedAt: string;
  category: { id: string; code: string; name: string }; subcategory: { code: string; name: string } | null; author: { id: string; fullName: string };
  _count: { media: number; examQuestions: number };
}
export interface QualityReport { issues: QualityIssue[]; verification: CalcVerification }
export interface SimilarItem { id: string; code: string; title: string; status: string; score: number; isDuplicate: boolean }
export interface QuestionDetail {
  question: Question;
  quality: QualityReport;
  reviewLogs: Array<{ id: string; fromStatus: QuestionStatus; toStatus: QuestionStatus; comment: string | null; createdAt: string; actor: { fullName: string } }>;
  revisions: Array<{ id: string; version: number; changeNote: string | null; createdAt: string; changedBy: { fullName: string } }>;
  usage: number;
}
