export type ArbeitnowJob = {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
};

import {
  htmlToText,
  isBavariaLocation,
  isPotentialLocationMatch as isPotentialNormalizedLocationMatch,
  isTargetStudentTechRole as isTargetNormalizedStudentTechRole,
} from './job-filter.ts';
import type { NormalizedSourceJob } from './types.ts';

export async function fetchArbeitnowJobs(
  pageCount = 8,
): Promise<ArbeitnowJob[]> {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => index + 1).map(
      async (page) => {
        const response = await fetch(
          `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
          {
            headers: {
              Accept: 'application/json',
              'User-Agent':
                'WerkMatch/0.1 (+https://github.com/MarvanGit/WerkMatch)',
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Arbeitnow request failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as { data?: ArbeitnowJob[] };
        return payload.data ?? [];
      },
    ),
  );

  return pages.flat();
}

export function isTargetStudentTechRole(job: ArbeitnowJob): boolean {
  return isTargetNormalizedStudentTechRole({
    title: job.title,
    employmentType: job.job_types.join(' '),
    tags: job.tags,
  });
}

export function isPotentialLocationMatch(job: ArbeitnowJob): boolean {
  return isPotentialNormalizedLocationMatch({
    locationText: job.location,
    workMode: job.remote ? 'remote' : 'onsite',
  });
}

export function normalizeArbeitnowJob(job: ArbeitnowJob): NormalizedSourceJob {
  const workMode = job.remote
    ? 'remote'
    : /\bhybrid\b/i.test(`${job.location} ${job.description}`)
      ? 'hybrid'
      : 'onsite';

  return {
    source: 'arbeitnow',
    externalId: job.slug,
    canonicalUrl: job.url,
    title: job.title.trim(),
    company: job.company_name.trim(),
    description: htmlToText(job.description).slice(0, 60_000),
    locationText: job.location.trim() || (job.remote ? 'Remote' : 'Germany'),
    region: isBavariaLocation(job.location) ? 'Bavaria' : null,
    country: 'Germany',
    workMode,
    employmentType:
      job.job_types.filter(Boolean).join(', ') || 'Working Student',
    publishedAt: Number.isFinite(job.created_at)
      ? new Date(job.created_at * 1_000).toISOString()
      : null,
    tags: job.tags.filter(Boolean),
    rawPayload: job,
  };
}
