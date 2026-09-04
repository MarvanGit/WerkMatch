import {
  decodeHtmlEntities,
  htmlToText,
  isBavariaLocation,
  isPotentialLocationMatch,
  isTargetStudentTechRole,
} from './job-filter.ts';
import type { NormalizedSourceJob } from './types.ts';

export type PersonioBoard = {
  id: string;
  company: string;
  url: string;
};

export const defaultPersonioBoards: PersonioBoard[] = [
  {
    id: 'finanztip',
    company: 'Finanztip',
    url: 'https://finanztip.jobs.personio.de/?language=de',
  },
  {
    id: 'gini',
    company: 'Gini',
    url: 'https://gini.jobs.personio.de/?language=de',
  },
  {
    id: 'magazino',
    company: 'Magazino',
    url: 'https://magazino.jobs.personio.de/?language=de',
  },
  {
    id: 'membrain',
    company: 'Membrain',
    url: 'https://membrain.jobs.personio.de/?language=de',
  },
  {
    id: 'pentland-firth-software',
    company: 'Pentland Firth Software',
    url: 'https://pentland-firth-software-gmbh.jobs.personio.de/?language=de',
  },
  {
    id: 'qwitto',
    company: 'qwitto',
    url: 'https://qwitto-gmbh.jobs.personio.de/?language=de',
  },
  {
    id: 'steadforce',
    company: 'Steadforce',
    url: 'https://steadforce.jobs.personio.de/?language=de',
  },
  {
    id: 'the-mobility-house',
    company: 'The Mobility House',
    url: 'https://tmh.jobs.personio.de/?language=de',
  },
  {
    id: 'ommax',
    company: 'OMMAX',
    url: 'https://ommax.jobs.personio.de/?language=en',
  },
  {
    id: 'revel8',
    company: 'revel8',
    url: 'https://revel8.jobs.personio.de/?language=en',
  },
  {
    id: 'snke',
    company: 'Snke',
    url: 'https://snke.jobs.personio.de/?language=en',
  },
  {
    id: 'trusteq',
    company: 'TRUSTEQ',
    url: 'https://trusteq-gmbh.jobs.personio.de/?language=en',
  },
  {
    id: 'dataciders',
    company: 'Dataciders',
    url: 'https://dataciders.jobs.personio.de/?language=de',
  },
  {
    id: 'rocksolid',
    company: 'ROCKSOLID Personalvermittlung',
    url: 'https://rocksolid.jobs.personio.de/?language=de',
  },
  {
    id: 'rise-partners',
    company: 'RISE PARTNERS',
    url: 'https://rise-partners.jobs.personio.de/?language=de',
  },
];

type JsonObject = Record<string, unknown>;

export type PersonioScrapeResult = {
  source: 'personio';
  scanned: number;
  candidatePages: number;
  jobs: NormalizedSourceJob[];
  errors: string[];
};

export async function fetchPersonioJobs(
  boards = defaultPersonioBoards,
): Promise<PersonioScrapeResult> {
  const jobs: NormalizedSourceJob[] = [];
  const errors: string[] = [];
  let scanned = 0;
  let candidatePages = 0;

  for (const board of boards) {
    try {
      const listingHtml = await fetchHtml(board.url);
      const links = extractPersonioJobLinks(listingHtml, board.url);
      scanned += links.length;
      const candidates = links
        .filter((link) =>
          isTargetStudentTechRole({
            title: link.text,
            employmentType: link.text,
          }),
        )
        .slice(0, 10);
      candidatePages += candidates.length;

      for (const candidateBatch of chunk(candidates, 3)) {
        const results = await Promise.allSettled(
          candidateBatch.map(async (candidate) => {
            const html = await fetchHtml(candidate.url);
            return parsePersonioJobPage(html, candidate.url, board);
          }),
        );
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            errors.push(
              `${board.id}: ${result.reason instanceof Error ? result.reason.message : 'job page failed'}`,
            );
            return;
          }
          const job = result.value;
          if (
            isTargetStudentTechRole({
              title: job.title,
              employmentType: job.employmentType,
              tags: job.tags,
            }) &&
            isPotentialLocationMatch(job)
          ) {
            jobs.push(job);
          } else if (!job.title) {
            errors.push(
              `${board.id}: empty job at ${candidateBatch[index].url}`,
            );
          }
        });
      }
    } catch (error) {
      errors.push(
        `${board.id}: ${error instanceof Error ? error.message : 'board failed'}`,
      );
    }
  }

  return {
    source: 'personio',
    scanned,
    candidatePages,
    jobs: deduplicateJobs(jobs),
    errors,
  };
}

export function extractPersonioJobLinks(html: string, baseUrl: string) {
  const links = new Map<string, { url: string; text: string }>();
  const anchorPattern =
    /<a\b([^>]*\bhref=["']([^"']*\/job\/[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    try {
      const url = new URL(decodeHtmlEntities(match[2]), baseUrl);
      if (url.hostname !== new URL(baseUrl).hostname) continue;
      const text = htmlToText(match[3]);
      if (text) links.set(url.toString(), { url: url.toString(), text });
    } catch {
      // Ignore malformed links supplied by the remote page.
    }
  }
  return [...links.values()];
}

export function parsePersonioJobPage(
  html: string,
  pageUrl: string,
  board: PersonioBoard,
): NormalizedSourceJob {
  const structuredPosting = extractJobPosting(html);
  const posting = structuredPosting ?? extractVisibleJobPosting(html, pageUrl);

  const title = stringValue(posting.title);
  const description = htmlToText(stringValue(posting.description)).slice(
    0,
    60_000,
  );
  const locations = extractLocations(posting.jobLocation);
  const locationText =
    [
      ...new Set(locations.map((location) => location.label).filter(Boolean)),
    ].join(', ') || 'Germany';
  const organization = objectValue(posting.hiringOrganization);
  const company = stringValue(organization?.name) || board.company;
  const remote = includesValue(posting.jobLocationType, 'TELECOMMUTE');
  const hybrid = /\b(hybrid|homeoffice|home office|mobiles arbeiten)\b/i.test(
    `${locationText} ${description}`,
  );
  const workMode = remote ? 'remote' : hybrid ? 'hybrid' : 'onsite';
  const identifier = objectValue(posting.identifier);
  const externalId =
    stringValue(identifier?.value) ||
    /\/job\/([^/?#]+)/.exec(pageUrl)?.[1] ||
    pageUrl;
  const employmentValues = arrayOfStrings(posting.employmentType);
  const employmentType = [
    /\b(werkstudent|working student|student assistant)\b/i.exec(title)?.[0],
    ...employmentValues.map(humanizeEmploymentType),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    source: 'personio',
    externalId: `${board.id}:${externalId}`,
    canonicalUrl: canonicalUrl(html, pageUrl),
    title,
    company,
    description,
    locationText,
    region: isBavariaLocation(locationText) ? 'Bavaria' : null,
    country:
      locations.map((location) => location.country).find(Boolean) || 'Germany',
    workMode,
    employmentType: employmentType || 'Working Student',
    publishedAt: isoDateOrNull(stringValue(posting.datePosted)),
    tags: ['Personio', board.company],
    rawPayload: {
      board: board.id,
      sourceFormat: structuredPosting ? 'json-ld' : 'html',
      identifier: externalId,
      datePosted: stringValue(posting.datePosted) || null,
      employmentType: employmentValues,
    },
  };
}

function extractJobPosting(html: string): JsonObject | null {
  const scriptPattern =
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      const posting = findJobPosting(parsed);
      if (posting) return posting;
    } catch {
      // Continue past unrelated or malformed JSON-LD blocks.
    }
  }
  return null;
}

function extractVisibleJobPosting(html: string, pageUrl: string): JsonObject {
  const metaTitle = readMetaContent(html, 'og:title');
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '';
  const titleWithCompany = metaTitle || htmlToText(heading);
  const title = titleWithCompany.replace(/\s*\|\s*Jobs bei\s+.+$/i, '').trim();
  if (!title) throw new Error('no job title found');
  const company = /\|\s*Jobs bei\s+(.+)$/i.exec(titleWithCompany)?.[1]?.trim();
  const metadata = [
    ...html.matchAll(
      /<span\b[^>]*class=["'][^"']*JobAttributes_jobMetaText[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    ),
  ]
    .map((match) => htmlToText(match[1]))
    .filter(Boolean);
  const descriptionStart = html.search(
    /<div\b[^>]*class=["'][^"']*detail-content-block/i,
  );
  const id = /\/job\/([^/?#]+)/.exec(pageUrl)?.[1] ?? pageUrl;
  return {
    '@type': 'JobPosting',
    title,
    description: descriptionStart >= 0 ? html.slice(descriptionStart) : html,
    identifier: { value: id },
    hiringOrganization: company ? { name: company } : undefined,
    jobLocation: {
      address: {
        addressLocality: metadata[0] ?? '',
        addressCountry: 'Germany',
      },
    },
    employmentType: metadata.slice(1),
  };
}

function findJobPosting(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const object = value as JsonObject;
  if (arrayOfStrings(object['@type']).includes('JobPosting')) return object;
  for (const nested of Object.values(object)) {
    const found = findJobPosting(nested);
    if (found) return found;
  }
  return null;
}

function extractLocations(value: unknown) {
  const entries = Array.isArray(value) ? value : [value];
  return entries.flatMap((entry) => {
    const address = objectValue(objectValue(entry)?.address);
    if (!address) return [];
    const locality = stringValue(address.addressLocality);
    const region = stringValue(address.addressRegion);
    const countryObject = objectValue(address.addressCountry);
    const country =
      stringValue(countryObject?.name) || stringValue(address.addressCountry);
    return [
      {
        label: [locality, region, country].filter(Boolean).join(', '),
        country,
      },
    ];
  });
}

function canonicalUrl(html: string, fallback: string): string {
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].find(
    (match) => readAttribute(match[0], 'rel')?.toLowerCase() === 'canonical',
  )?.[0];
  try {
    return new URL(
      (canonicalTag && readAttribute(canonicalTag, 'href')) || fallback,
      fallback,
    ).toString();
  } catch {
    return fallback;
  }
}

function readMetaContent(html: string, key: string): string {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name =
      readAttribute(match[0], 'property') ?? readAttribute(match[0], 'name');
    if (name?.toLowerCase() === key.toLowerCase()) {
      return decodeHtmlEntities(readAttribute(match[0], 'content') ?? '');
    }
  }
  return '';
}

function readAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i');
  return pattern.exec(tag)?.[1] ?? null;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'WerkMatch/0.2 (+https://github.com/MarvanGit/WerkMatch)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`request failed with status ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(`unexpected content type ${contentType || 'unknown'}`);
  }
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('page exceeded 2 MB');
  return html;
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayOfStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function includesValue(value: unknown, expected: string): boolean {
  return arrayOfStrings(value).some((item) => item === expected);
}

function humanizeEmploymentType(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isoDateOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function deduplicateJobs(jobs: NormalizedSourceJob[]) {
  return [...new Map(jobs.map((job) => [job.externalId, job])).values()];
}
