export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
export const dec = (v: unknown): number | null => (v == null ? null : Number(v));
