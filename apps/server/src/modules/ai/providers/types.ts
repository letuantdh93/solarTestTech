import type * as z from 'zod/v4';

export interface StructuredRequest<S extends z.ZodType> {
  /** Task identifier (used for logging and by the mock provider). */
  task: string;
  system: string;
  user: string;
  schema: S;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens?: number;
  model?: string;
}

export interface StructuredResponse<T> {
  data: T;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Provider-agnostic interface. Add new providers by implementing this. */
export interface AiProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>>;
}

export class AiError extends Error {
  constructor(message: string, public code: 'NOT_CONFIGURED' | 'REFUSED' | 'INVALID_OUTPUT' | 'PROVIDER_ERROR' | 'RATE_LIMIT') {
    super(message);
  }
}
