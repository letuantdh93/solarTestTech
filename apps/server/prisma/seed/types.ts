import type { QuestionInput } from '@solar/shared';

/** Seed question: category referenced by code; subcategory by index in taxonomy children. */
export type SeedQuestion = Omit<QuestionInput, 'categoryId' | 'subcategoryId' | 'changeNote'> & {
  key: string; // stable seed key, used as question code suffix
  category: string; // e.g. 'C'
  sub: number; // index into TAXONOMY children (0-based)
};
