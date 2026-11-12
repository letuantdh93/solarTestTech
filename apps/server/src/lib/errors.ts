/** Application error with a Vietnamese message safe to show to users. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'APP_ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (m: string, details?: unknown) => new AppError(400, m, 'BAD_REQUEST', details);
export const unauthorized = (m = 'Vui lòng đăng nhập để tiếp tục') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'Bạn không có quyền thực hiện thao tác này') => new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Không tìm thấy dữ liệu') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m: string, details?: unknown) => new AppError(409, m, 'CONFLICT', details);
