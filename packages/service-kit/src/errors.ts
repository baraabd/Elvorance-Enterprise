export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export function assert(
  condition: unknown,
  code: string,
  message: string,
  statusCode = 400,
): asserts condition {
  if (!condition) throw new AppError(statusCode, code, message);
}
export const notFound = (resource = 'Resource'): never => {
  throw new AppError(404, 'NOT_FOUND', `${resource} was not found`);
};
