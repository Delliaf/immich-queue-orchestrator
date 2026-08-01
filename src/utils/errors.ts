export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class ConflictError extends Error {
  override name = 'ConflictError';
}

export class ControlDisabledError extends Error {
  override name = 'ControlDisabledError';
}
