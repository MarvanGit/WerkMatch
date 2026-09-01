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

export type NormalizedSourceJob = {
  source: 'arbeitnow';
  externalId: string;
  canonicalUrl: string;
  title: string;
  company: string;
  description: string;
  locationText: string;
  region: string | null;
  country: string;
  workMode: 'onsite' | 'hybrid' | 'remote';
  employmentType: string;
  publishedAt: string | null;
  tags: string[];
  rawPayload: ArbeitnowJob;
};

const studentRolePattern =
  /\b(werkstudent(?:in)?|working[ -]student|studentische hilfskraft|student assistant|studentischer mitarbeiter)\b/i;

const technicalRolePattern =
  /\b(software|developer|entwicklung|entwickler|engineering|engineer|backend|front[ -]?end|full[ -]?stack|devops|cloud|data (?:engineering|science|analytics|analysis|platform)|machine learning|artificial intelligence|künstliche intelligenz|ki|qa|quality assurance|test(?:ing|automatisierung| automation)?|informatik|automation|cyber|security|embedded|robotics|systementwicklung|prototyping|programmier\w*)\b/i;

const excludedRolePattern =
  /\b(finance|accounting|controlling|marketing|sales|vertrieb|human resources|people(?:\s*&\s*| and )culture|recruit(?:ing|ment)?|talent acquisition|category management|social media|customer success|immobilien|real estate)\b/i;

const bavariaPattern =
  /\b(bayern|bavaria|münchen|munich|erlangen|nürnberg|nuremberg|regensburg|ingolstadt|augsburg|würzburg|wuerzburg|bamberg|bayreuth|coburg|fürth|fuerth|passau|landshut|rosenheim|neu-ulm|garching|unterföhring|ottobrunn|aschheim|martinsried)\b/i;

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
  const roleText = [job.title, ...job.job_types].join(' ');
  const technicalText = [job.title, ...job.tags].join(' ');
  return (
    studentRolePattern.test(roleText) &&
    !excludedRolePattern.test(job.title) &&
    technicalRolePattern.test(technicalText)
  );
}

export function isPotentialLocationMatch(job: ArbeitnowJob): boolean {
  return job.remote || bavariaPattern.test(job.location);
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
    region: bavariaPattern.test(job.location) ? 'Bavaria' : null,
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

function htmlToText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
