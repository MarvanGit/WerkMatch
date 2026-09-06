export function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const code =
      'code' in error && typeof error.code === 'string' && error.code;
    return `${code ? `${code}: ` : ''}${error.message}`;
  }
  return typeof error === 'string' ? error : 'Unknown error.';
}

// Opt in only for operations that remain safe if the first response was lost.
export async function databaseOperation<T extends { error: unknown }>(
  operation: () => PromiseLike<T>,
  context: string,
  retrySafe = false,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const result = await operation();
    if (!result.error) return result;
    const message = errorMessage(result.error);
    if (
      retrySafe &&
      attempt < 2 &&
      /fetch failed|ECONNRESET|ETIMEDOUT|502|503|504|520|522|524/i.test(message)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${context}: ${message}`);
  }
}
