import type { NormalizedSourceJob } from '../sources/types.ts';

type ExistingJob = {
  source: string;
  external_id: string;
  canonical_url: string;
  content_fingerprint: string | null;
};

// The canonical URL is unique per user, even across feeds and changed feed IDs.
// Keep the stored identity so evaluations and generated documents stay attached.
export function resolveJobIdentities(
  source: string,
  jobs: NormalizedSourceJob[],
  existing: ExistingJob[],
) {
  const byUrl = new Map(existing.map((job) => [job.canonical_url, job]));
  const byExternalId = new Map(
    existing
      .filter((job) => job.source === source)
      .map((job) => [job.external_id, job]),
  );
  const resolved = new Map<
    string,
    {
      normalized: NormalizedSourceJob;
      source: string;
      externalId: string;
      existingFingerprint: string | null;
    }
  >();
  const seenUrls = new Set<string>();
  for (const job of jobs) {
    if (seenUrls.has(job.canonicalUrl)) continue;
    seenUrls.add(job.canonicalUrl);
    const stored =
      byUrl.get(job.canonicalUrl) ?? byExternalId.get(job.externalId);
    const resolvedSource = stored?.source ?? source;
    const externalId = stored?.external_id ?? job.externalId;
    resolved.set(JSON.stringify([resolvedSource, externalId]), {
      normalized: job,
      source: resolvedSource,
      externalId,
      existingFingerprint: stored?.content_fingerprint ?? null,
    });
  }
  return [...resolved.values()];
}
