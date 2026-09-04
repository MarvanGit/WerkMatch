import {
  decodeHtmlEntities,
  htmlToText,
  isBavariaLocation,
  isPotentialLocationMatch,
  isTargetStudentTechRole,
} from './job-filter.ts';
import type { NormalizedSourceJob } from './types.ts';

export type SmartRecruitersBoard = {
  id: string;
  company: string;
  url: string;
};

export const defaultSmartRecruitersBoards: SmartRecruitersBoard[] = [
  {
    id: 'brainlab',
    company: 'Brainlab',
    url: 'https://jobs.smartrecruiters.com/Brainlab',
  },
  {
    id: 'scalable',
    company: 'Scalable Capital',
    url: 'https://jobs.smartrecruiters.com/ScalableGmbH',
  },
  {
    id: 'check24',
    company: 'CHECK24',
    url: 'https://jobs.smartrecruiters.com/CHECK24',
  },
  {
    id: 'bosch',
    company: 'Bosch',
    url: 'https://jobs.smartrecruiters.com/BoschGroup',
  },
  {
    id: 'roland-berger',
    company: 'Roland Berger',
    url: 'https://jobs.smartrecruiters.com/RolandBerger',
  },
  {
    id: 'wabtec',
    company: 'Wabtec',
    url: 'https://jobs.smartrecruiters.com/Wabtec',
  },
  {
    id: 'giants-software',
    company: 'GIANTS Software',
    url: 'https://jobs.smartrecruiters.com/GIANTSSoftwareGmbH',
  },
  {
    id: 'leoni',
    company: 'LEONI',
    url: 'https://jobs.smartrecruiters.com/LEONI1',
  },
  {
    id: 'zooplus',
    company: 'zooplus',
    url: 'https://jobs.smartrecruiters.com/ZooplusSE',
  },
];

type SmartRecruitersLink = {
  id: string;
  titleHint: string;
  url: string;
};

export type SmartRecruitersScrapeResult = {
  source: 'smartrecruiters';
  scanned: number;
  candidatePages: number;
  jobs: NormalizedSourceJob[];
  errors: string[];
};

const maxCandidates = 30;

export async function fetchSmartRecruitersJobs(
  boards = defaultSmartRecruitersBoards,
): Promise<SmartRecruitersScrapeResult> {
  const boardResults = await Promise.allSettled(
    boards.map(async (board) => {
      const listingUrl = new URL(board.url);
      listingUrl.searchParams.set('search', 'student');
      const html = await fetchHtml(listingUrl.toString());
      return {
        board,
        links: extractSmartRecruitersJobLinks(html, board),
      };
    }),
  );
  const errors: string[] = [];
  const links: Array<SmartRecruitersLink & { board: SmartRecruitersBoard }> =
    [];
  let scanned = 0;

  boardResults.forEach((result, index) => {
    const board = boards[index];
    if (result.status === 'rejected') {
      errors.push(
        `${board.id}: ${result.reason instanceof Error ? result.reason.message : 'board failed'}`,
      );
      return;
    }
    scanned += result.value.links.length;
    for (const link of result.value.links) {
      if (
        isTargetStudentTechRole({
          title: link.titleHint,
          employmentType: link.titleHint,
        })
      ) {
        links.push({ ...link, board });
      }
    }
  });

  const candidates = [
    ...new Map(links.map((link) => [link.url, link])).values(),
  ].slice(0, maxCandidates);
  const jobs: NormalizedSourceJob[] = [];

  for (const batch of chunk(candidates, 4)) {
    const results = await Promise.allSettled(
      batch.map(async (candidate) =>
        parseSmartRecruitersJobPage(
          await fetchHtml(candidate.url),
          candidate.url,
          candidate.board,
        ),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        errors.push(
          `${batch[index].board.id}/${batch[index].id}: ${result.reason instanceof Error ? result.reason.message : 'job page failed'}`,
        );
        return;
      }
      if (
        isTargetStudentTechRole({
          title: result.value.title,
          employmentType: result.value.employmentType,
          tags: result.value.tags,
        }) &&
        isPotentialLocationMatch(result.value)
      ) {
        jobs.push(result.value);
      }
    });
  }

  return {
    source: 'smartrecruiters',
    scanned,
    candidatePages: candidates.length,
    jobs: deduplicateJobs(jobs),
    errors,
  };
}

export function extractSmartRecruitersJobLinks(
  html: string,
  board: SmartRecruitersBoard,
): SmartRecruitersLink[] {
  const expectedHost = new URL(board.url).hostname;
  const expectedCompany = new URL(board.url).pathname.split('/')[1];
  const escapedCompany = escapeRegExp(expectedCompany);
  const pattern = new RegExp(
    `https?:\\/\\/${escapeRegExp(expectedHost)}\\/${escapedCompany}\\/(\\d+)-([^\\s<>"'\\\\]+)`,
    'gi',
  );
  const links = new Map<string, SmartRecruitersLink>();

  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    const slug = decodeHtmlEntities(match[2]).replace(/[),.;]+$/, '');
    const url = `${board.url}/${id}-${slug}`;
    links.set(id, {
      id,
      titleHint: titleFromSlug(slug),
      url,
    });
  }
  return [...links.values()];
}

export function parseSmartRecruitersJobPage(
  html: string,
  pageUrl: string,
  board: SmartRecruitersBoard,
): NormalizedSourceJob {
  const title = readItempropText(html, 'title') || readHeading(html, 'h1');
  if (!title) throw new Error('job title not found');

  const descriptionMarkup = readItempropInnerHtml(html, 'description');
  const description = htmlToText(descriptionMarkup || '').slice(0, 60_000);
  if (description.length < 40) throw new Error('job description not found');

  const locationElement = /<spl-job-location\b[^>]*>/i.exec(html)?.[0] ?? '';
  const locationText =
    readAttribute(locationElement, 'formattedAddress') ||
    [
      readMetaItemprop(html, 'addressLocality'),
      readMetaItemprop(html, 'addressRegion'),
      readMetaItemprop(html, 'addressCountry'),
    ]
      .filter(Boolean)
      .join(', ') ||
    'Germany';
  const workplaceType = readAttribute(locationElement, 'workplaceType');
  const employmentType =
    readItempropText(html, 'employmentType') || 'Working Student';
  const organizationMarkup = readItempropInnerHtml(html, 'hiringOrganization');
  const company =
    readMetaItemprop(organizationMarkup || '', 'name') || board.company;
  const workMode = detectWorkMode(
    `${workplaceType} ${locationText} ${title} ${description}`,
  );
  const id = /\/(\d+)-[^/?#]+/.exec(new URL(pageUrl).pathname)?.[1];
  if (!id) throw new Error('job identifier not found');

  return {
    source: 'smartrecruiters',
    externalId: `${board.id}:${id}`,
    canonicalUrl: canonicalUrl(html, pageUrl),
    title,
    company,
    description,
    locationText,
    region: isBavariaLocation(locationText) ? 'Bavaria' : null,
    country: countryFromLocation(locationText),
    workMode,
    employmentType,
    publishedAt: isoDateOrNull(readMetaItemprop(html, 'datePosted')),
    tags: ['SmartRecruiters', board.company],
    rawPayload: {
      board: board.id,
      sourceFormat: 'html-microdata',
      workplaceType: workplaceType || null,
    },
  };
}

function readItempropText(html: string, itemprop: string): string {
  return htmlToText(readItempropInnerHtml(html, itemprop) || '');
}

function readItempropInnerHtml(html: string, itemprop: string): string | null {
  const openingPattern = new RegExp(
    `<([a-z][\\w:-]*)\\b(?=[^>]*\\bitemprop=["']${escapeRegExp(itemprop)}["'])[^>]*>`,
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
  let depth = 1;
  for (const token of html.slice(contentStart).matchAll(tokenPattern)) {
    const tokenIndex = contentStart + (token.index ?? 0);
    if (token[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, tokenIndex);
    } else if (!/\/\s*>$/.test(token[0])) {
      depth += 1;
    }
  }
  return null;
}

function readMetaItemprop(html: string, itemprop: string): string {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (readAttribute(match[0], 'itemprop') === itemprop) {
      return decodeHtmlEntities(readAttribute(match[0], 'content') || '');
    }
  }
  return '';
}

function readHeading(html: string, tag: string): string {
  return htmlToText(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(
      html,
    )?.[1] || '',
  );
}

function readAttribute(tag: string, name: string): string {
  const match = new RegExp(
    `\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`,
    'i',
  ).exec(tag);
  return match ? decodeHtmlEntities(match[2]) : '';
}

function canonicalUrl(html: string, fallback: string): string {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (readAttribute(match[0], 'rel').toLowerCase() !== 'canonical') continue;
    try {
      return new URL(readAttribute(match[0], 'href'), fallback).toString();
    } catch {
      break;
    }
  }
  return fallback;
}

function titleFromSlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectWorkMode(
  text: string,
): 'onsite' | 'hybrid' | 'remote' | 'unknown' {
  if (/\b(hybrid|homeoffice|home office|mobile work)\b/i.test(text)) {
    return 'hybrid';
  }
  if (/\b(remote|telecommute|fully distributed)\b/i.test(text)) {
    return 'remote';
  }
  if (/\b(on[ _-]?site|vor ort)\b/i.test(text)) return 'onsite';
  return 'unknown';
}

function countryFromLocation(location: string): string {
  if (/\b(germany|deutschland|bayern|bavaria)\b/i.test(location)) {
    return 'Germany';
  }
  return isBavariaLocation(location) ? 'Germany' : 'Unknown';
}

function isoDateOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
      'User-Agent': 'WerkMatch/0.3 (+https://github.com/MarvanGit/WerkMatch)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`request failed with status ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error(`unexpected content type ${contentType || 'unknown'}`);
  }
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('page exceeded 2 MB');
  return html;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
