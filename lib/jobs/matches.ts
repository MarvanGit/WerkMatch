import { jobIdentityKey } from '../search/job-identity.ts';

export const JOBS_PER_PAGE = 12;

export type JobSort = 'recent' | 'match' | 'oldest';
export type JobAge = 'all' | '24h' | '7d' | '30d';

type MatchLike = {
  title: string;
  company: string;
  location_text: string;
  published_at?: string | null;
  first_seen_at: string;
  overall_score?: number;
  score?: number;
};

export function parseJobSort(value?: string): JobSort {
  return value === 'match' || value === 'oldest' ? value : 'recent';
}

export function parseJobAge(value?: string): JobAge {
  return value === '24h' || value === '7d' || value === '30d' ? value : 'all';
}

export function parsePage(value?: string): number {
  const page = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function matchDate(match: MatchLike): string {
  return match.published_at ?? match.first_seen_at;
}

export function matchScore(match: MatchLike): number {
  return match.overall_score ?? match.score ?? 0;
}

export function deduplicateJobMatches<T extends MatchLike>(matches: T[]): T[] {
  const preferred = new Map<string, T>();

  for (const match of matches) {
    const identity = jobIdentityKey(match);
    const current = preferred.get(identity);
    if (!current || comparePreferred(match, current) < 0) {
      preferred.set(identity, match);
    }
  }

  return [...preferred.values()];
}

export function filterAndSortJobMatches<T extends MatchLike>(
  matches: T[],
  sort: JobSort,
  age: JobAge,
  now = new Date(),
): T[] {
  const ageMs =
    age === '24h'
      ? 24 * 60 * 60 * 1_000
      : age === '7d'
        ? 7 * 24 * 60 * 60 * 1_000
        : age === '30d'
          ? 30 * 24 * 60 * 60 * 1_000
          : null;
  const threshold = ageMs === null ? null : now.getTime() - ageMs;

  return matches
    .filter(
      (match) => threshold === null || dateValue(matchDate(match)) >= threshold,
    )
    .sort((left, right) => {
      const dateDifference =
        dateValue(matchDate(right)) - dateValue(matchDate(left));
      const scoreDifference = matchScore(right) - matchScore(left);

      if (sort === 'match') return scoreDifference || dateDifference;
      if (sort === 'oldest') return -dateDifference || scoreDifference;
      return dateDifference || scoreDifference;
    });
}

export function paginateMatches<T>(
  items: T[],
  requestedPage: number,
  pageSize: number,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    currentPage,
    totalPages,
    firstItem: items.length === 0 ? 0 : startIndex + 1,
    lastItem: Math.min(startIndex + pageSize, items.length),
  };
}

export function paginationRange(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const result: Array<number | 'ellipsis'> = [];
  let previous = 0;

  for (const page of [...pages]
    .filter((page) => page > 0 && page <= totalPages)
    .sort((a, b) => a - b)) {
    if (previous && page - previous > 1) result.push('ellipsis');
    result.push(page);
    previous = page;
  }

  return result;
}

function comparePreferred(left: MatchLike, right: MatchLike) {
  return (
    dateValue(matchDate(right)) - dateValue(matchDate(left)) ||
    matchScore(right) - matchScore(left)
  );
}

function dateValue(value: string) {
  return Date.parse(value) || 0;
}
