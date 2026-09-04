import {
  decodeHtmlEntities,
  htmlToText,
  isBavariaLocation,
  isPotentialLocationMatch,
  isTargetStudentTechRole,
} from './job-filter.ts';
import type { NormalizedSourceJob } from './types.ts';

const guestJobsEndpoint =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const searchPageSize = 10;
const defaultMaxSearchPages = 2;
const maxCandidatePages = 16;
const detailConcurrency = 2;
const maxFetchAttempts = 3;
const maxHtmlBytes = 2_000_000;

export type LinkedInQuery = {
  keywords?: string;
  location?: string;
  start?: number;
  [key: string]: string | number | undefined;
};

export type LinkedInBoard = {
  id: string;
  queries: LinkedInQuery[];
  maxPages?: number;
};

export const defaultLinkedInBoards: LinkedInBoard[] = [
  {
    id: 'guest-bavaria',
    queries: [
      { keywords: 'Werkstudent Software', location: 'Bavaria, Germany' },
      { keywords: 'Working Student Software', location: 'Bavaria, Germany' },
      { keywords: 'Werkstudent Developer', location: 'Bavaria, Germany' },
      { keywords: 'Working Student Developer', location: 'Bavaria, Germany' },
      { keywords: 'Werkstudent Data', location: 'Bavaria, Germany' },
      { keywords: 'Working Student Data', location: 'Bavaria, Germany' },
    ],
    maxPages: defaultMaxSearchPages,
  },
];

export type LinkedInScrapeResult = {
  source: 'linkedin';
  scanned: number;
  candidateUrls: number;
  jobs: NormalizedSourceJob[];
  errors: string[];
};

export async function fetchLinkedInJobs(
  boards = defaultLinkedInBoards,
): Promise<LinkedInScrapeResult> {
  if (process.env.LINKEDIN_ENABLED === 'false') {
    return {
      source: 'linkedin',
      scanned: 0,
      candidateUrls: 0,
      jobs: [],
      errors: [],
    };
  }

  const errors: string[] = [];
  const cardsById = new Map<string, LinkedInJobCard>();

  for (const board of boards) {
    const maxPages = Math.max(
      1,
      Math.min(board.maxPages ?? defaultMaxSearchPages, 5),
    );

    for (const [queryIndex, query] of board.queries.entries()) {
      try {
        for (let page = 0; page < maxPages; page += 1) {
          const listingHtml = await fetchHtml(
            buildSearchUrl(guestJobsEndpoint, {
              ...query,
              start: page * searchPageSize,
            }),
          );
          const pageCards = extractJobCards(listingHtml);
          if (!pageCards.length) {
            if (page === 0 && isBlockedListing(listingHtml)) {
              throw new Error('LinkedIn returned a blocked or challenge page.');
            }
            break;
          }

          const previousSize = cardsById.size;
          for (const card of pageCards) {
            cardsById.set(card.id, { ...card, boardId: board.id });
          }
          if (cardsById.size === previousSize) break;
          if (pageCards.length < searchPageSize) break;
        }
      } catch (error) {
        errors.push(
          `${board.id}/query-${queryIndex + 1}: ${error instanceof Error ? error.message : 'search failed'}`,
        );
      }
    }
  }

  const candidates = [...cardsById.values()]
    .filter((card) => isTargetStudentTechRole({ title: card.title }))
    .sort(comparePublishedAt)
    .slice(0, maxCandidatePages);
  const jobs: NormalizedSourceJob[] = [];

  for (const candidateBatch of chunk(candidates, detailConcurrency)) {
    const results = await Promise.allSettled(
      candidateBatch.map(async (candidate) => {
        const html = await fetchHtml(candidate.viewUrl);
        return parseLinkedInJobPage(
          html,
          candidate,
          candidate.boardId ?? 'guest-bavaria',
        );
      }),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        errors.push(
          `job ${candidateBatch[index].id}: ${result.reason instanceof Error ? result.reason.message : 'job page failed'}`,
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
      }
    });
  }

  return {
    source: 'linkedin',
    scanned: cardsById.size,
    candidateUrls: candidates.length,
    jobs: deduplicateJobs(jobs),
    errors,
  };
}

export type LinkedInJobCard = {
  url: string;
  viewUrl: string;
  id: string;
  title: string;
  company: string;
  location: string;
  publishedAt: string | null;
  boardId?: string;
};

export function buildSearchUrl(endpoint: string, query: LinkedInQuery): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function extractJobCards(html: string): LinkedInJobCard[] {
  const cards: LinkedInJobCard[] = [];
  const seenIds = new Set<string>();
  const liPattern = /<li\b[\s\S]*?<\/li>/gi;

  for (const match of html.matchAll(liPattern)) {
    const card = match[0];
    const link = extractJobLink(card);
    if (!link) continue;

    const id =
      readAttribute(card, 'data-entity-urn')?.match(
        /urn:li:jobPosting:(\d+)/i,
      )?.[1] ?? extractJobId(link);
    if (!id || seenIds.has(id)) continue;

    const title =
      readElementText(card, 'base-search-card__title') ||
      readElementText(card, 'sr-only');
    if (!title) continue;

    cards.push({
      url: link,
      viewUrl: normalizedViewUrl(id),
      id,
      title,
      company: readElementText(card, 'base-search-card__subtitle'),
      location: readElementText(card, 'job-search-card__location'),
      publishedAt: isoDateOrNull(
        readFirstAttribute(card, 'time', 'datetime') ?? '',
      ),
    });
    seenIds.add(id);
  }

  return cards;
}

export function parseLinkedInJobPage(
  html: string,
  card: LinkedInJobCard,
  boardId: string,
): NormalizedSourceJob {
  const title =
    readElementText(html, 'topcard__title') ||
    readElementText(html, 'top-card-layout__title') ||
    card.title;
  const company =
    readElementText(html, 'topcard__org-name-link') ||
    readElementText(html, 'top-card-layout__second-subline') ||
    card.company;
  const location =
    readElementText(html, 'topcard__flavor--bullet') ||
    readElementText(html, 'top-card-layout__first-subline') ||
    card.location;
  const descriptionMarkup =
    readElementInnerHtml(html, 'description__text') ??
    readElementInnerHtml(html, 'show-more-less-html__markup');

  if (!title) throw new Error('LinkedIn job title not found.');
  if (!descriptionMarkup) {
    throw new Error(
      'LinkedIn job description not found; page may be restricted.',
    );
  }

  const description = normalizeDescription(descriptionMarkup);
  if (description.length < 40) {
    throw new Error('LinkedIn job description is empty or incomplete.');
  }

  const criteria = extractJobCriteria(html);
  const employmentType = [
    /\b(werkstudent(?:in|en)?|working student|student assistant)\b/i.exec(
      title,
    )?.[0],
    findCriterion(criteria, [
      'employment type',
      'beschäftigungsart',
      'beschäftigungsform',
      'anstellungsart',
    ]),
    findCriterion(criteria, ['seniority level', 'karrierestufe']),
  ]
    .filter(Boolean)
    .join(', ');
  const workMode = detectWorkMode(
    [location, title, description, ...criteria.values()].join(' '),
  );

  return {
    source: 'linkedin',
    externalId: `${boardId}:${card.id}`,
    canonicalUrl: canonicalUrl(html, card.id),
    title,
    company,
    description,
    locationText: location || 'Germany',
    region: isBavariaLocation(location) ? 'Bavaria' : null,
    country: countryFromLocation(location),
    workMode,
    employmentType: cleanText(employmentType) || 'Working Student',
    publishedAt: card.publishedAt,
    tags: [
      'LinkedIn',
      company,
      findCriterion(criteria, ['job function', 'berufsfunktion']),
      findCriterion(criteria, ['industries', 'branchen']),
    ].filter((value): value is string => Boolean(value)),
    rawPayload: {
      board: boardId,
      linkedinId: card.id,
      listingUrl: card.url,
      criteria: Object.fromEntries(criteria),
      sourceFormat: 'html',
    },
  };
}

function extractJobLink(html: string): string | null {
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = readAttribute(match[0], 'href');
    if (href && /\/jobs\/view\//i.test(href)) {
      return decodeHtmlEntities(href);
    }
  }
  return null;
}

function extractJobId(url: string): string | null {
  const segment = /\/jobs\/view\/([^/?#]+)/i.exec(url)?.[1];
  return segment?.match(/(\d+)$/)?.[1] ?? null;
}

function extractJobCriteria(html: string): Map<string, string> {
  const criteria = new Map<string, string>();
  const itemPattern =
    /<li\b[^>]*class=["'][^"']*description__job-criteria-item[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;
  for (const match of html.matchAll(itemPattern)) {
    const key = readElementText(
      match[0],
      'description__job-criteria-subheader',
    );
    const value = readElementText(match[0], 'description__job-criteria-text');
    if (key && value) criteria.set(key, value);
  }
  return criteria;
}

function findCriterion(
  criteria: Map<string, string>,
  labels: string[],
): string {
  for (const [key, value] of criteria) {
    if (labels.includes(key.toLocaleLowerCase('de-DE'))) return value;
  }
  return '';
}

function detectWorkMode(
  text: string,
): 'onsite' | 'hybrid' | 'remote' | 'unknown' {
  const normalized = text.toLocaleLowerCase('de-DE');
  const hasHybrid =
    /\b(hybrid|homeoffice|home office|mobiles? arbeiten|mobilarbeit)\b/i.test(
      normalized,
    );
  const hasOnsite = /\b(on-?site|vor ort|vor-ort)\b/i.test(normalized);
  const hasNegativeRemote =
    /\b(no|not|kein|keine|nicht)\s+(fully\s+)?remote\b/i.test(normalized);
  const hasRemote =
    /\b(remote|fully distributed|work from home|home-based|100\s*%\s*remote)\b/i.test(
      normalized,
    );

  if (hasHybrid || (hasRemote && hasOnsite)) return 'hybrid';
  if (hasRemote && !hasNegativeRemote) return 'remote';
  if (hasOnsite) return 'onsite';
  return 'unknown';
}

function normalizeDescription(markup: string): string {
  return htmlToText(markup)
    .replace(/\bShow more\b|\bShow less\b/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 60_000);
}

function isBlockedListing(html: string): boolean {
  return /captcha|security verification|unusual activity|checkpoint|authwall|challenge/i.test(
    html,
  );
}

function normalizedViewUrl(id: string): string {
  return `https://www.linkedin.com/jobs/view/${id}`;
}

function canonicalUrl(html: string, id: string): string {
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].find(
    (match) => readAttribute(match[0], 'rel')?.toLowerCase() === 'canonical',
  );
  const candidate = canonicalTag
    ? readAttribute(canonicalTag[0], 'href')
    : null;
  try {
    const url = new URL(
      decodeHtmlEntities(candidate || `/jobs/view/${id}`),
      'https://www.linkedin.com',
    );
    if (
      !/linkedin\.com$/i.test(url.hostname) ||
      !/\/jobs\/view\//i.test(url.pathname)
    ) {
      throw new Error('invalid canonical URL');
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `https://www.linkedin.com/jobs/view/${id}`;
  }
}

function countryFromLocation(location: string): string {
  if (/\b(germany|deutschland)\b/i.test(location)) return 'Germany';
  if (/\b(austria|österreich)\b/i.test(location)) return 'Austria';
  if (/\b(switzerland|schweiz)\b/i.test(location)) return 'Switzerland';
  if (/\b(united kingdom|england|scotland|wales|uk)\b/i.test(location)) {
    return 'United Kingdom';
  }
  if (/\b(united states|usa|us)\b/i.test(location)) return 'United States';
  if (/\b(netherlands|nederland)\b/i.test(location)) return 'Netherlands';
  if (/\b(france|frankreich)\b/i.test(location)) return 'France';
  if (/\b(italy|italien)\b/i.test(location)) return 'Italy';
  if (/\b(spain|spanien)\b/i.test(location)) return 'Spain';
  if (/\b(poland|polen)\b/i.test(location)) return 'Poland';
  if (/\b(ireland|irland)\b/i.test(location)) return 'Ireland';
  return isBavariaLocation(location) ? 'Germany' : 'Unknown';
}

function readElementText(html: string, className: string): string {
  const innerHtml = readElementInnerHtml(html, className);
  return innerHtml ? cleanText(innerHtml) : '';
}

function readElementInnerHtml(html: string, className: string): string | null {
  const openingPattern = new RegExp(
    `<([a-z][\\w:-]*)\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'])[^>]*>`,
    'i',
  );
  const opening = openingPattern.exec(html);
  if (!opening || opening.index === undefined) return null;

  const tagName = opening[1];
  const contentStart = opening.index + opening[0].length;
  const tokenPattern = new RegExp(
    `<\\/?${escapeRegExp(tagName)}\\b[^>]*>`,
    'gi',
  );
  tokenPattern.lastIndex = contentStart;
  let depth = 1;

  for (const token of html.matchAll(tokenPattern)) {
    const tokenIndex = token.index ?? 0;
    if (tokenIndex < contentStart) continue;
    if (token[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, tokenIndex);
    } else if (!/\/\s*>$/.test(token[0])) {
      depth += 1;
    }
  }
  return null;
}

function readAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`,
    'i',
  );
  return pattern.exec(tag)?.[2] ?? null;
}

function readFirstAttribute(
  html: string,
  tagName: string,
  attribute: string,
): string | null {
  const tag = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html)?.[0];
  return tag ? readAttribute(tag, attribute) : null;
}

function cleanText(value: string): string {
  return htmlToText(decodeHtmlEntities(value)).replace(/\s+/g, ' ').trim();
}

function isoDateOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchHtml(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
          throw fetchError(
            `request failed with status ${response.status}`,
            false,
          );
        }
        throw fetchError(
          `retryable request failed with status ${response.status}`,
          true,
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }
      if (/\/login(?:[/?#]|$)|authwall/i.test(response.url)) {
        throw fetchError(
          'LinkedIn redirected to an authentication wall.',
          false,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        throw fetchError(
          `unexpected content type ${contentType || 'unknown'}`,
          false,
        );
      }
      const html = await response.text();
      if (!html.trim()) {
        throw fetchError('LinkedIn returned an empty page.', false);
      }
      if (html.length > maxHtmlBytes) {
        throw fetchError('page exceeded 2 MB', false);
      }
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('request failed');
      const retryable =
        !(error instanceof Error) ||
        (error as Error & { retryable?: boolean }).retryable !== false;
      if (attempt + 1 < maxFetchAttempts && retryable) {
        const retryAfter =
          error instanceof Error
            ? (error as Error & { retryAfter?: number }).retryAfter
            : undefined;
        await delay(retryAfter ?? 400 * 2 ** attempt);
      } else {
        break;
      }
    }
  }

  throw lastError ?? new Error('LinkedIn request failed.');
}

function fetchError(
  message: string,
  retryable: boolean,
  retryAfter?: number,
): Error & { retryable: boolean; retryAfter?: number } {
  const error = new Error(message) as Error & {
    retryable: boolean;
    retryAfter?: number;
  };
  error.retryable = retryable;
  if (retryAfter !== undefined) error.retryAfter = retryAfter;
  return error;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1_000, 10_000)
    : undefined;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function comparePublishedAt(
  left: LinkedInJobCard,
  right: LinkedInJobCard,
): number {
  return (
    Date.parse(right.publishedAt ?? '') - Date.parse(left.publishedAt ?? '')
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function deduplicateJobs(jobs: NormalizedSourceJob[]): NormalizedSourceJob[] {
  return [...new Map(jobs.map((job) => [job.externalId, job])).values()];
}
