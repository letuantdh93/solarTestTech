import type { ZodTypeAny, z } from 'zod';
import { AppError } from './errors';

/** Parse input with zod and raise a 422 with Vietnamese field messages. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(422, 'Dữ liệu không hợp lệ', 'VALIDATION_ERROR', fields);
  }
  return r.data;
}
