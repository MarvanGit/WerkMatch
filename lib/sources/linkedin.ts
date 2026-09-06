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
const defaultMaxSearchPages = 8;
const hardMaxSearchPages = 12;
const defaultMaxCandidatePages = 160;
const hardMaxCandidatePages = 300;
const detailConcurrency = 4;
const listingConcurrency = 3;
const defaultRuntimeSeconds = 360;
const maxFetchAttempts = 3;
const maxHtmlBytes = 2_000_000;
const requestSpacingMilliseconds = 1_000;

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
      ...[
        'Werkstudent Software',
        'Working Student Software',
        'Werkstudent Developer',
        'Working Student Developer',
        'Werkstudent Data',
        'Working Student Data',
        'Werkstudent IT',
        'Working Student IT',
        'Werkstudent DevOps',
        'Working Student DevOps',
        'Werkstudent Cloud',
        'Working Student Cloud',
        'Werkstudent Testing',
        'Working Student QA',
        'Werkstudent Softwareentwicklung',
        'Working Student Software Development',
        'Werkstudent Informatik',
        'Working Student Computer Science',
        'Werkstudent Programmierung',
        'Working Student Programming',
        'Werkstudent Backend',
        'Working Student Backend',
        'Werkstudent Frontend',
        'Working Student Frontend',
        'Werkstudent Machine Learning',
        'Working Student Machine Learning',
        'Werkstudent Cyber Security',
        'Working Student Cyber Security',
        'Werkstudent Automation',
        'Working Student Automation',
        'Werkstudent Embedded Software',
        'Working Student Embedded Software',
        'Werkstudent Full Stack',
        'Working Student Full Stack',
        'Werkstudent Robotics',
        'Working Student Robotics',
        'Studentische Hilfskraft Software',
        'Student Assistant Software',
      ].map((keywords) => ({
        keywords,
        location: 'Bavaria, Germany',
        sortBy: 'DD',
      })),
      ...[
        'Munich, Bavaria, Germany',
        'Erlangen, Bavaria, Germany',
        'Nuremberg, Bavaria, Germany',
        'Augsburg, Bavaria, Germany',
        'Regensburg, Bavaria, Germany',
        'Ingolstadt, Bavaria, Germany',
        'Würzburg, Bavaria, Germany',
        'Bamberg, Bavaria, Germany',
        'Bayreuth, Bavaria, Germany',
        'Coburg, Bavaria, Germany',
        'Passau, Bavaria, Germany',
        'Landshut, Bavaria, Germany',
        'Rosenheim, Bavaria, Germany',
        'Garching, Bavaria, Germany',
        'Freising, Bavaria, Germany',
      ].map((location) => ({
        keywords: 'Werkstudent Software',
        location,
        sortBy: 'DD',
      })),
    ],
  },
  {
    id: 'guest-germany-remote',
    queries: [
      'Werkstudent Remote Software',
      'Working Student Remote Software',
      'Werkstudent Remote Developer',
      'Working Student Remote Developer',
      'Werkstudent Remote Data',
      'Working Student Remote IT',
      'Werkstudent Remote QA',
      'Working Student Remote QA',
      'Werkstudent Remote Cloud',
      'Working Student Remote Cloud',
      'Werkstudent Remote Machine Learning',
      'Working Student Remote Machine Learning',
      'Werkstudent Software',
      'Working Student Software',
      'Werkstudent Embedded Software',
      'Working Student Full Stack',
    ].map((keywords) => ({
      keywords,
      location: 'Germany',
      f_WT: '2',
      sortBy: 'DD',
    })),
  },
];

export type LinkedInScrapeResult = {
  source: 'linkedin';
  scanned: number;
  candidateUrls: number;
  jobs: NormalizedSourceJob[];
  errors: string[];
  listingRequests: number;
  detailRequests: number;
  budgetExhausted: boolean;
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
      listingRequests: 0,
      detailRequests: 0,
      budgetExhausted: false,
    };
  }

  const errors: string[] = [];
  const cardsById = new Map<string, LinkedInJobCard>();
  const maxCandidates = boundedEnvironmentInteger(
    'LINKEDIN_MAX_CANDIDATES',
    defaultMaxCandidatePages,
    1,
    hardMaxCandidatePages,
  );
  const configuredMaxSearchPages = boundedEnvironmentInteger(
    'LINKEDIN_MAX_SEARCH_PAGES',
    defaultMaxSearchPages,
    1,
    hardMaxSearchPages,
  );
  const runtimeMilliseconds =
    boundedEnvironmentInteger(
      'LINKEDIN_MAX_RUNTIME_SECONDS',
      defaultRuntimeSeconds,
      30,
      480,
    ) * 1_000;
  const startedAt = Date.now();
  const listingDeadline = startedAt + Math.floor(runtimeMilliseconds * 0.55);
  const deadline = startedAt + runtimeMilliseconds;
  const limiter = createRequestLimiter();
  const listingSignal = AbortSignal.timeout(
    Math.max(1, listingDeadline - Date.now()),
  );
  const runSignal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  let listingRequests = 0;
  let detailRequests = 0;
  let budgetExhausted = false;
  let blocked = false;

  // Interleave boards and visit every query's first page before going deeper.
  // A query tracks its own IDs: overlap with another query is not exhaustion.
  const queries = interleave(
    boards.map((board) =>
      board.queries.map((query, index) => ({
        board,
        query,
        index,
        offset: Math.max(0, Number(query.start) || 0),
        maxPages: Math.max(
          1,
          Math.min(
            board.maxPages ?? configuredMaxSearchPages,
            configuredMaxSearchPages,
          ),
        ),
        seen: new Set<string>(),
        done: false,
      })),
    ),
  );
  for (let page = 0; page < configuredMaxSearchPages && !blocked; page += 1) {
    const active = queries.filter(
      (query) => !query.done && page < query.maxPages,
    );
    for (const batch of chunk(active, listingConcurrency)) {
      if (Date.now() >= listingDeadline || blocked) break;
      await Promise.all(
        batch.map(async (state) => {
          try {
            listingRequests += 1;
            const html = await fetchHtml(
              buildSearchUrl(guestJobsEndpoint, {
                ...state.query,
                start: state.offset,
              }),
              limiter,
              listingSignal,
            );
            const cards = extractJobCards(html);
            if (!cards.length && isBlockedListing(html)) {
              blocked = true;
              throw fetchError(
                'LinkedIn returned a blocked or challenge page.',
                false,
              );
            }
            const fresh = cards.filter((card) => !state.seen.has(card.id));
            for (const card of cards) {
              state.seen.add(card.id);
              // The first discovery owns provenance, independent of later overlap.
              if (!cardsById.has(card.id))
                cardsById.set(card.id, { ...card, boardId: state.board.id });
            }
            state.offset += cards.length;
            state.done = !fresh.length || cards.length < searchPageSize;
          } catch (error) {
            state.done = true;
            if (listingSignal.aborted) budgetExhausted = true;
            else
              errors.push(
                state.board.id +
                  '/query-' +
                  (state.index + 1) +
                  ': ' +
                  errorMessage(error),
              );
            if (isAccessBlocked(error)) blocked = true;
          }
        }),
      );
    }
    if (Date.now() >= listingDeadline) {
      budgetExhausted = true;
      break;
    }
  }

  const candidates = [...cardsById.values()]
    .filter((card) => isTargetStudentTechRole({ title: card.title }))
    .sort(comparePublishedAt);
  const jobs: NormalizedSourceJob[] = [];
  if (candidates.length > maxCandidates) budgetExhausted = true;

  for (const batch of chunk(
    candidates.slice(0, maxCandidates),
    detailConcurrency,
  )) {
    if (Date.now() >= deadline || blocked) break;
    const results = await Promise.allSettled(
      batch.map(async (candidate) => {
        detailRequests += 1;
        const html = await fetchHtml(candidate.viewUrl, limiter, runSignal);
        return parseLinkedInJobPage(
          html,
          candidate,
          candidate.boardId ?? 'guest-bavaria',
        );
      }),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        if (runSignal.aborted) budgetExhausted = true;
        else
          errors.push(
            'job ' + batch[index].id + ': ' + errorMessage(result.reason),
          );
        if (isAccessBlocked(result.reason)) blocked = true;
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
      )
        jobs.push(job);
    });
  }
  if (Date.now() >= deadline) budgetExhausted = true;
  return {
    source: 'linkedin',
    scanned: cardsById.size,
    candidateUrls: candidates.length,
    jobs: deduplicateJobs(jobs),
    errors,
    listingRequests,
    detailRequests,
    budgetExhausted,
  };
}

function interleave<T>(groups: T[][]): T[] {
  const result: T[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups)
      if (index < group.length) result.push(group[index]);
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'request failed';
}

function isAccessBlocked(error: unknown): boolean {
  return /status (401|403|429|999)|authentication wall|blocked or challenge/i.test(
    errorMessage(error),
  );
}

// One start-time gate for all workers, including retries. A shared cooldown
// prevents other workers from continuing immediately after a rate-limit reply.
function createRequestLimiter() {
  let nextStart = 0;
  let cooldownUntil = 0;
  let queue = Promise.resolve();
  return {
    cooldown(milliseconds: number) {
      cooldownUntil = Math.max(cooldownUntil, Date.now() + milliseconds);
    },
    wait(signal: AbortSignal) {
      const turn = queue.then(async () => {
        while (Date.now() < Math.max(nextStart, cooldownUntil)) {
          await delay(Math.max(nextStart, cooldownUntil) - Date.now(), signal);
        }
        signal.throwIfAborted();
        nextStart = Date.now() + requestSpacingMilliseconds;
      });
      queue = turn.catch(() => {});
      return turn;
    },
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

async function fetchHtml(
  url: string,
  limiter: ReturnType<typeof createRequestLimiter>,
  signal: AbortSignal,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxFetchAttempts; attempt += 1) {
    try {
      await limiter.wait(signal);
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      });

      if (!response.ok) {
        await response.body?.cancel();
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
      if (signal.aborted) throw error;
      if (attempt + 1 < maxFetchAttempts && retryable) {
        const retryAfter =
          error instanceof Error
            ? (error as Error & { retryAfter?: number }).retryAfter
            : undefined;
        const rateLimited = /status 429/.test(lastError.message);
        limiter.cooldown(
          Math.max(
            retryAfter ?? 0,
            (rateLimited ? 30_000 : 1_000) * 2 ** attempt,
          ),
        );
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
    ? seconds * 1_000
    : Number.isFinite(Date.parse(value))
      ? Math.max(0, Date.parse(value) - Date.now())
      : undefined;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      Math.min(milliseconds, 60_000),
    );
    signal.addEventListener('abort', abort, { once: true });
  });
}

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value)
    ? Math.max(minimum, Math.min(value, maximum))
    : fallback;
}

function comparePublishedAt(
  left: LinkedInJobCard,
  right: LinkedInJobCard,
): number {
  return (
    (Date.parse(right.publishedAt ?? '') || 0) -
    (Date.parse(left.publishedAt ?? '') || 0)
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
