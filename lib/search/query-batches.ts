import { databaseOperation } from '../supabase/operation.ts';

// Keep PostgREST IN filters below proxy URL limits as source coverage grows.
export async function queryBatches<T>(
  values: string[],
  query: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  context: string,
  batchSize = 50,
): Promise<T[]> {
  const unique = [...new Set(values)];
  const rows: T[] = [];
  for (let offset = 0; offset < unique.length; offset += batchSize) {
    const result = await databaseOperation(
      () => query(unique.slice(offset, offset + batchSize)),
      context,
    );
    rows.push(...(result.data ?? []));
  }
  return rows;
}
