import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deduplicateJobMatches,
  filterAndSortJobMatches,
  paginateMatches,
  paginationRange,
} from '../lib/jobs/matches.ts';

const base = {
  title: 'Working Student Software',
  company: 'Example GmbH',
  location_text: 'Munich',
  first_seen_at: '2026-09-01T00:00:00.000Z',
};

void test('deduplication keeps the newest repost of the same role', () => {
  const matches = deduplicateJobMatches([
    { ...base, id: 'old', overall_score: 92 },
    {
      ...base,
      id: 'new',
      title: 'Working Student Software (m/f/d)',
      published_at: '2026-09-10T00:00:00.000Z',
      overall_score: 88,
    },
  ]);

  assert.deepEqual(
    matches.map((match) => match.id),
    ['new'],
  );
});

void test('date filters and match sorting compose predictably', () => {
  const matches = filterAndSortJobMatches(
    [
      {
        ...base,
        id: 'recent-low',
        overall_score: 72,
        published_at: '2026-09-17T12:00:00.000Z',
      },
      {
        ...base,
        id: 'recent-high',
        company: 'Other',
        overall_score: 95,
        published_at: '2026-09-17T10:00:00.000Z',
      },
      {
        ...base,
        id: 'old',
        company: 'Third',
        overall_score: 99,
        published_at: '2026-08-01T00:00:00.000Z',
      },
    ],
    'match',
    '7d',
    new Date('2026-09-18T00:00:00.000Z'),
  );

  assert.deepEqual(
    matches.map((match) => match.id),
    ['recent-high', 'recent-low'],
  );
});

void test('pagination clamps invalid pages and creates compact ranges', () => {
  const page = paginateMatches(
    Array.from({ length: 25 }, (_, index) => index),
    9,
    12,
  );

  assert.equal(page.currentPage, 3);
  assert.deepEqual(page.items, [24]);
  assert.deepEqual(paginationRange(5, 10), [
    1,
    'ellipsis',
    4,
    5,
    6,
    'ellipsis',
    10,
  ]);
});
