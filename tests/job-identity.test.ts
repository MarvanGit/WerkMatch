import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveJobIdentities } from '../lib/search/job-identity.ts';
import type { NormalizedSourceJob } from '../lib/sources/types.ts';
const job = (
  externalId: string,
  canonicalUrl = 'https://example.com/jobs/1',
): NormalizedSourceJob => ({
  source: 'linkedin',
  externalId,
  canonicalUrl,
  title: 'Working Student Software',
  company: 'Example',
  description: 'TypeScript',
  locationText: 'Munich',
  region: 'Bavaria',
  country: 'Germany',
  workMode: 'hybrid',
  employmentType: 'working_student',
  publishedAt: null,
  tags: [],
  rawPayload: {},
});
void test('a changed feed ID reuses the stored identity for its canonical URL', () => {
  const [result] = resolveJobIdentities(
    'linkedin',
    [job('new-id')],
    [
      {
        source: 'linkedin',
        external_id: 'old-id',
        canonical_url: job('').canonicalUrl,
        content_fingerprint: 'old',
      },
    ],
  );
  assert.equal(result.externalId, 'old-id');
  assert.equal(result.existingFingerprint, 'old');
});
void test('cross-source duplicates preserve the original source and external ID', () => {
  const [result] = resolveJobIdentities(
    'linkedin',
    [job('linkedin-123')],
    [
      {
        source: 'personio',
        external_id: '456',
        canonical_url: job('').canonicalUrl,
        content_fingerprint: 'old',
      },
    ],
  );
  assert.equal(result.source, 'personio');
  assert.equal(result.externalId, '456');
});
void test('two new IDs with the same URL produce only one row', () => {
  assert.equal(
    resolveJobIdentities('linkedin', [job('one'), job('two')], []).length,
    1,
  );
});
void test('a URL change with a stable external ID keeps its identity', () => {
  const [result] = resolveJobIdentities(
    'linkedin',
    [job('one', 'https://example.com/new')],
    [
      {
        source: 'linkedin',
        external_id: 'one',
        canonical_url: job('').canonicalUrl,
        content_fingerprint: 'old',
      },
    ],
  );
  assert.equal(result.externalId, 'one');
  assert.equal(result.normalized.canonicalUrl, 'https://example.com/new');
  assert.equal(result.existingFingerprint, 'old');
});
void test('distinct URLs remain distinct jobs', () => {
  assert.equal(
    resolveJobIdentities(
      'linkedin',
      [job('one'), job('two', 'https://example.com/jobs/2')],
      [],
    ).length,
    2,
  );
});
