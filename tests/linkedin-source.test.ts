import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  fetchLinkedInJobs,
  type LinkedInBoard,
} from '../lib/sources/linkedin.ts';
import { queryBatches } from '../lib/search/query-batches.ts';

const cards = (ids: number[]) =>
  ids
    .map(
      (id) =>
        `<li data-entity-urn="urn:li:jobPosting:${id}"><a href="https://www.linkedin.com/jobs/view/${id}"></a><h3 class="base-search-card__title">Working Student Software ${id}</h3><h4 class="base-search-card__subtitle">Example</h4><span class="job-search-card__location">Munich, Germany</span><time datetime="2026-09-06"></time></li>`,
    )
    .join('');
const detail =
  '<h1 class="topcard__title">Working Student Software</h1><span class="topcard__flavor--bullet">Munich, Germany</span><div class="show-more-less-html__markup">Build TypeScript applications and automated software tests with our engineering team.</div>';
const html = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/html' } });
const board: LinkedInBoard = { id: 'bavaria', queries: [{ keywords: 'A' }] };
function defaults(t: TestContext) {
  for (const key of [
    'LINKEDIN_ENABLED',
    'LINKEDIN_MAX_SEARCH_PAGES',
    'LINKEDIN_MAX_CANDIDATES',
    'LINKEDIN_MAX_RUNTIME_SECONDS',
  ]) {
    const previous = process.env[key];
    delete process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

void test('query overlap does not hide deeper results and regions are interleaved', async (t) => {
  defaults(t);
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    requests.push(input);
    if (!url.pathname.includes('jobs-guest')) return html(detail);
    const page = Number(url.searchParams.get('start'));
    return html(
      page === 0
        ? cards(Array.from({ length: 10 }, (_, i) => i + 1))
        : url.searchParams.get('keywords') === 'remote' && page === 10
          ? cards([99])
          : '<ul></ul>',
    );
  });
  const result = await fetchLinkedInJobs([
    { id: 'bavaria', queries: [{ keywords: 'A' }, { keywords: 'B' }] },
    { id: 'remote', queries: [{ keywords: 'remote' }] },
  ]);
  const listing = requests
    .filter((url) => url.includes('jobs-guest'))
    .map((url) => new URL(url));
  assert.deepEqual(
    listing.slice(0, 3).map((url) => url.searchParams.get('keywords')),
    ['A', 'remote', 'B'],
  );
  assert.ok(
    listing.some(
      (url) =>
        url.searchParams.get('keywords') === 'remote' &&
        url.searchParams.get('start') === '10',
    ),
  );
  assert.equal(result.jobs.length, 11);
  assert.equal(new Set(result.jobs.map((j) => j.canonicalUrl)).size, 11);
});

void test('default budget retrieves 240 details with at most four active workers', async (t) => {
  defaults(t);
  const realNow = Date.now.bind(Date),
    realTimer = setTimeout;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  t.mock.method(
    globalThis,
    'setTimeout',
    (callback: () => void, milliseconds: number) => {
      elapsed += milliseconds;
      return realTimer(callback, 0);
    },
  );
  let active = 0,
    maxActive = 0,
    listingCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    if (input.includes('jobs-guest'))
      return html(
        ++listingCalls === 1
          ? cards(Array.from({ length: 240 }, (_, i) => 100 + i))
          : '<ul></ul>',
      );
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return html(detail);
  });
  const result = await fetchLinkedInJobs([board]);
  assert.equal(result.detailRequests, 240);
  assert.equal(result.jobs.length, 240);
  assert.ok(maxActive <= 4);
  assert.equal(result.errors.length, 0);
});

void test('scheduled budget can retrieve 800 distinct job details', async (t) => {
  defaults(t);
  process.env.LINKEDIN_MAX_SEARCH_PAGES = '24';
  process.env.LINKEDIN_MAX_CANDIDATES = '800';
  process.env.LINKEDIN_MAX_RUNTIME_SECONDS = '1440';
  const realNow = Date.now.bind(Date),
    realTimer = setTimeout;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  t.mock.method(
    globalThis,
    'setTimeout',
    (callback: () => void, milliseconds: number) => {
      elapsed += milliseconds;
      return realTimer(callback, 0);
    },
  );
  let listingCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) =>
    html(
      input.includes('jobs-guest')
        ? ++listingCalls === 1
          ? cards(Array.from({ length: 800 }, (_, i) => 1_000 + i))
          : '<ul></ul>'
        : detail,
    ),
  );
  const result = await fetchLinkedInJobs([board]);
  assert.equal(result.detailRequests, 800);
  assert.equal(result.jobs.length, 800);
  assert.equal(result.budgetExhausted, false);
});

void test('repeated pages stop only their own query', async (t) => {
  defaults(t);
  let listings = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    if (!input.includes('jobs-guest')) return html(detail);
    listings++;
    return html(cards(Array.from({ length: 10 }, (_, i) => 200 + i)));
  });
  const result = await fetchLinkedInJobs([board]);
  assert.equal(listings, 2);
  assert.equal(result.jobs.length, 10);
});

void test('access challenges stop further collection', async (t) => {
  defaults(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return html('<html>Security verification captcha</html>');
  });
  const result = await fetchLinkedInJobs([
    {
      id: 'bavaria',
      queries: Array.from({ length: 8 }, (_, i) => ({ keywords: String(i) })),
    },
  ]);
  assert.ok(calls <= 3);
  assert.equal(result.detailRequests, 0);
  assert.ok(result.errors.some((e) => e.includes('challenge')));
});

void test('runtime budget retains completed jobs instead of discarding all results', async (t) => {
  defaults(t);
  process.env.LINKEDIN_MAX_RUNTIME_SECONDS = '30';
  const realNow = Date.now.bind(Date);
  let offset = 0;
  t.mock.method(Date, 'now', () => realNow() + offset);
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    if (input.includes('jobs-guest')) {
      offset = 17000;
      return html(cards(Array.from({ length: 20 }, (_, i) => 300 + i)));
    }
    offset = 31000;
    return html(detail);
  });
  const result = await fetchLinkedInJobs([board]);
  assert.equal(result.budgetExhausted, true);
  assert.ok(result.jobs.length > 0 && result.jobs.length < 20);
});

void test('database lookup batches deduplicate IDs and preserve every result', async () => {
  const sizes: number[] = [];
  const result = await queryBatches(
    [...Array.from({ length: 161 }, (_, i) => String(i)), '1'],
    async (batch) => {
      sizes.push(batch.length);
      return { data: batch.map((id) => ({ id })), error: null };
    },
    'Lookup',
  );
  assert.deepEqual(sizes, [50, 50, 50, 11]);
  assert.equal(result.length, 161);
});

void test('a rate limit pauses every worker for Retry-After before resuming', async (t) => {
  defaults(t);
  const realNow = Date.now.bind(Date),
    realTimer = setTimeout;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  t.mock.method(
    globalThis,
    'setTimeout',
    (callback: () => void, milliseconds: number) => {
      elapsed += milliseconds;
      return realTimer(callback, 0);
    },
  );
  const starts: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    starts.push(Date.now());
    if (starts.length === 1)
      return new Response('Slow down', {
        status: 429,
        headers: { 'Retry-After': '45' },
      });
    return html(input.includes('jobs-guest') ? cards([700]) : detail);
  });
  const result = await fetchLinkedInJobs([
    { id: 'bavaria', queries: [{ keywords: 'A' }, { keywords: 'B' }] },
  ]);
  assert.ok(starts[1] - starts[0] >= 45_000);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.errors.length, 0);
});
