import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeJobUrl,
  jobIdentityKey,
  resolveJobIdentities,
} from '../lib/search/job-identity.ts';
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
void test('distinct roles remain distinct jobs', () => {
  assert.equal(
    resolveJobIdentities(
      'linkedin',
      [
        job('one'),
        {
          ...job('two', 'https://example.com/jobs/2'),
          title: 'Working Student Data Science',
        },
      ],
      [],
    ).length,
    2,
  );
});
void test('reposted jobs with new IDs collapse to the active semantic identity', () => {
  const [result] = resolveJobIdentities(
    'linkedin',
    [job('new-id', 'https://linkedin.com/jobs/view/new-id')],
    [
      {
        source: 'linkedin',
        external_id: 'old-id',
        canonical_url: 'https://linkedin.com/jobs/view/old-id',
        content_fingerprint: 'old',
        title: 'Working Student Software (m/f/d)',
        company: 'Example',
        location_text: 'Munich',
        active: true,
        published_at: '2026-09-01',
      },
    ],
  );
  assert.equal(result.externalId, 'old-id');
  assert.equal(
    result.normalized.canonicalUrl,
    'https://linkedin.com/jobs/view/new-id',
  );
});
void test('an inactive direct match does not displace the active duplicate', () => {
  const [result] = resolveJobIdentities(
    'linkedin',
    [job('inactive-id', 'https://example.com/jobs/inactive')],
    [
      {
        source: 'linkedin',
        external_id: 'inactive-id',
        canonical_url: 'https://example.com/jobs/inactive',
        content_fingerprint: 'inactive',
        title: 'Working Student Software',
        company: 'Example',
        location_text: 'Munich',
        active: false,
      },
      {
        source: 'linkedin',
        external_id: 'active-id',
        canonical_url: 'https://example.com/jobs/active',
        content_fingerprint: 'active',
        title: 'Working Student Software',
        company: 'Example',
        location_text: 'Munich',
        active: true,
      },
    ],
  );
  assert.equal(result.externalId, 'active-id');
});
void test('identity normalization ignores gender markers and URL tracking', () => {
  assert.equal(
    jobIdentityKey({
      title: 'Werkstudent:in Software (m/w/d)',
      company: 'Example GmbH',
      locationText: 'München',
    }),
    jobIdentityKey({
      title: 'Werkstudent Software',
      company: 'Example GmbH',
      locationText: 'Munich',
    }),
  );
  assert.equal(
    canonicalizeJobUrl('https://example.com/jobs/1/?utm_source=test#apply'),
    'https://example.com/jobs/1',
  );
});
