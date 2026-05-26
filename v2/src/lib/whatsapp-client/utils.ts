export function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return obj.message;
    }
  }

  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}
