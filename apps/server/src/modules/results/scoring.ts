/**
 * Pure scoring functions (no DB access) so they can be unit-tested and reused.
 * Scoring rules:
 *  - SINGLE_CHOICE / TRUE_FALSE: correct iff the selected set equals the correct set.
 *  - MULTIPLE_CHOICE: all-or-nothing (selected set must equal the full correct set).
 *  - NUMERIC: correct iff |value − key| within tolerance (absolute or relative).
 *  - Unanswered questions score 0 and are counted separately.
 */
import { competencyLevel, withinTolerance, type CompetencyLevel } from '@solar/shared';

export interface SnapshotOption {
  id: string;
  label: string;
  isCorrect: boolean;
  rationale?: string | null;
}
export interface QuestionSnapshot {
  code: string;
  title: string;
  content: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMERIC';
  assumptions: string | null;
  isCalculation: boolean;
  isScenario: boolean;
  media: Array<{ id: string; caption: string | null }>;
  options: SnapshotOption[]; // already in delivery order
  numeric: { answer: number; unit: string | null; tolerance: number; toleranceType: 'ABSOLUTE' | 'RELATIVE'; decimals: number | null } | null;
  explanation: string | null;
  calcMethod: string | null;
  references: Array<{ standard: string; edition: string | null; clause: string | null; jurisdiction: string | null }>;
}

export interface AnswerInput {
  selectedOptionIds: string[];
  numericValue: number | null;
}

export function isAnswered(a: AnswerInput | null | undefined) {
  return !!a && (a.selectedOptionIds.length > 0 || a.numericValue != null);
}

export function gradeAnswer(snap: QuestionSnapshot, a: AnswerInput | null | undefined): boolean | null {
  if (!isAnswered(a)) return null;
  if (snap.type === 'NUMERIC') {
    if (!snap.numeric || a!.numericValue == null) return false;
    return withinTolerance(a!.numericValue, snap.numeric.answer, snap.numeric.tolerance, snap.numeric.toleranceType);
  }
  const correct = new Set(snap.options.filter((o) => o.isCorrect).map((o) => o.id));
  const chosen = new Set(a!.selectedOptionIds);
  if (chosen.size !== correct.size) return false;
  for (const id of chosen) if (!correct.has(id)) return false;
  return true;
}

export interface Bucket {
  key: string;
  code?: string;
  label: string;
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  pointsTotal: number;
  pointsEarned: number;
  percent: number;
  level: CompetencyLevel;
}

export interface GradedItem {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  difficulty: number;
  points: number;
  correct: boolean | null;
}

function emptyBucket(key: string, label: string): Bucket {
  return { key, label, total: 0, correct: 0, incorrect: 0, unanswered: 0, pointsTotal: 0, pointsEarned: 0, percent: 0, level: 'WEAK' };
}
function finish(b: Bucket): Bucket {
  b.percent = b.pointsTotal ? round2((b.pointsEarned / b.pointsTotal) * 100) : 0;
  b.level = competencyLevel(b.percent);
  return b;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarise(items: GradedItem[], passingScore: number) {
  const byCat = new Map<string, Bucket>();
  const byDiff = new Map<number, Bucket>();
  let pointsTotal = 0;
  let pointsEarned = 0;
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  for (const it of items) {
    const c = byCat.get(it.categoryId) ?? { ...emptyBucket(it.categoryId, it.categoryName), code: it.categoryCode };
    const d = byDiff.get(it.difficulty) ?? emptyBucket(String(it.difficulty), String(it.difficulty));
    for (const b of [c, d]) {
      b.total++;
      b.pointsTotal += it.points;
      if (it.correct === true) {
        b.correct++;
        b.pointsEarned += it.points;
      } else if (it.correct === false) b.incorrect++;
      else b.unanswered++;
    }
    byCat.set(it.categoryId, c);
    byDiff.set(it.difficulty, d);
    pointsTotal += it.points;
    if (it.correct === true) {
      pointsEarned += it.points;
      correct++;
    } else if (it.correct === false) incorrect++;
    else unanswered++;
  }
  const scorePercent = pointsTotal ? round2((pointsEarned / pointsTotal) * 100) : 0;
  return {
    pointsTotal,
    pointsEarned,
    correct,
    incorrect,
    unanswered,
    scorePercent,
    passed: scorePercent >= passingScore,
    byCategory: [...byCat.values()].map(finish).sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
    byDifficulty: [...byDiff.values()].map(finish).sort((a, b) => Number(a.key) - Number(b.key)),
  };
}

/** Merge several results' category buckets (for history / team competency). */
export function aggregateCategoryScores(list: Array<Array<Bucket & { code?: string }>>) {
  const m = new Map<string, Bucket & { code?: string }>();
  for (const arr of list) {
    for (const b of arr ?? []) {
      const cur = m.get(b.key) ?? { ...emptyBucket(b.key, b.label), code: b.code };
      cur.total += b.total;
      cur.correct += b.correct;
      cur.incorrect += b.incorrect;
      cur.unanswered += b.unanswered;
      cur.pointsTotal += b.pointsTotal;
      cur.pointsEarned += b.pointsEarned;
      m.set(b.key, cur);
    }
  }
  return [...m.values()].map(finish).sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
}
