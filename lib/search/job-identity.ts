import type { NormalizedSourceJob } from '../sources/types.ts';

type ExistingJob = {
  source: string;
  external_id: string | null;
  canonical_url: string;
  content_fingerprint: string | null;
  title?: string;
  company?: string;
  location_text?: string;
  active?: boolean;
  published_at?: string | null;
  last_seen_at?: string | null;
};

type JobIdentityFields = {
  title: string;
  company: string;
  locationText?: string;
  location_text?: string;
};

export function jobIdentityKey(job: JobIdentityFields): string {
  return [
    normalizeCompany(job.company),
    normalizeTitle(job.title),
    normalizeLocation(job.locationText ?? job.location_text ?? ''),
  ].join('|');
}

export function canonicalizeJobUrl(value: string): string {
  try {
    const url = new URL(value);
    const linkedInId = /\/jobs\/view\/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)/i.exec(
      url.pathname,
    )?.[1];
    if (linkedInId) return `https://linkedin.com/jobs/view/${linkedInId}`;
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:utm_|trk$|ref$|source$|tracking)/i.test(key))
        url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return value.trim();
  }
}

// The canonical URL is unique per user, even across feeds and changed feed IDs.
// Keep the stored identity so evaluations and generated documents stay attached.
export function resolveJobIdentities(
  source: string,
  jobs: NormalizedSourceJob[],
  existing: ExistingJob[],
) {
  const preferred = [...existing].sort(compareStoredJobs);
  const byUrl = new Map<string, ExistingJob>();
  const byExternalId = new Map<string, ExistingJob>();
  const byIdentity = new Map<string, ExistingJob>();
  for (const stored of preferred) {
    const url = canonicalizeJobUrl(stored.canonical_url);
    if (!byUrl.has(url)) byUrl.set(url, stored);
    if (
      stored.source === source &&
      stored.external_id &&
      !byExternalId.has(stored.external_id)
    )
      byExternalId.set(stored.external_id, stored);
    if (stored.title && stored.company && stored.location_text) {
      const identity = jobIdentityKey(stored as JobIdentityFields);
      if (!byIdentity.has(identity)) byIdentity.set(identity, stored);
    }
  }
  const resolved = new Map<
    string,
    {
      normalized: NormalizedSourceJob;
      source: string;
      externalId: string;
      existingFingerprint: string | null;
    }
  >();
  const seenIdentities = new Set<string>();
  for (const job of jobs) {
    const identity = jobIdentityKey(job);
    if (seenIdentities.has(identity)) continue;
    seenIdentities.add(identity);
    const semanticMatch = byIdentity.get(identity);
    const directMatch =
      byUrl.get(canonicalizeJobUrl(job.canonicalUrl)) ??
      byExternalId.get(job.externalId);
    const stored =
      directMatch?.active === false && semanticMatch?.active !== false
        ? semanticMatch
        : (directMatch ?? semanticMatch);
    const resolvedSource = stored?.source ?? source;
    const externalId = stored?.external_id ?? job.externalId;
    const canonicalUrl =
      stored && stored.source !== source
        ? stored.canonical_url
        : canonicalizeJobUrl(job.canonicalUrl);
    resolved.set(JSON.stringify([resolvedSource, externalId]), {
      normalized: { ...job, canonicalUrl },
      source: resolvedSource,
      externalId,
      existingFingerprint: stored?.content_fingerprint ?? null,
    });
  }
  return [...resolved.values()];
}

function compareStoredJobs(left: ExistingJob, right: ExistingJob) {
  if (Boolean(left.active) !== Boolean(right.active))
    return left.active ? -1 : 1;
  return storedDate(right) - storedDate(left);
}

function storedDate(job: ExistingJob) {
  return (
    Date.parse(job.published_at ?? '') ||
    Date.parse(job.last_seen_at ?? '') ||
    0
  );
}

function normalizeCompany(value: string) {
  return normalizeIdentityPart(value);
}

function normalizeTitle(value: string) {
  return normalizeIdentityPart(
    value
      .replace(/[:*/]in\b/giu, '')
      .replace(/\b(?:m|w|d|f|x)(?:\s*\/\s*(?:m|w|d|f|x))+\b/giu, ' ')
      .replace(/\b(?:all genders?|gn)\b/giu, ' '),
  );
}

function normalizeLocation(value: string) {
  return normalizeIdentityPart(value)
    .replace(/\bmunchen\b/g, 'munich')
    .replace(/\bnurnberg\b/g, 'nuremberg');
}

function normalizeIdentityPart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
