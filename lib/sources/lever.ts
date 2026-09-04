import {
  decodeHtmlEntities,
  htmlToText,
  isBavariaLocation,
  isPotentialLocationMatch,
  isTargetStudentTechRole,
} from './job-filter.ts';
import type { NormalizedSourceJob } from './types.ts';

export type LeverBoard = {
  id: string;
  company: string;
  url: string;
};

export const defaultLeverBoards: LeverBoard[] = [
  { id: 'finn', company: 'FINN', url: 'https://jobs.lever.co/finn' },
  {
    id: 'netlight',
    company: 'Netlight',
    url: 'https://jobs.lever.co/netlight',
  },
  {
    id: 'clo-virtual-fashion',
    company: 'CLO Virtual Fashion',
    url: 'https://jobs.lever.co/clovirtualfashion',
  },
  {
    id: 'novaspace',
    company: 'Novaspace',
    url: 'https://jobs.lever.co/novaspace',
  },
  {
    id: 'quantco',
    company: 'QuantCo',
    url: 'https://jobs.lever.co/quantco-',
  },
];

export type LeverJobLink = {
  id: string;
  url: string;
  title: string;
  location: string;
  workMode: 'onsite' | 'hybrid' | 'remote' | 'unknown';
  commitment: string;
};

export type LeverScrapeResult = {
  source: 'lever';
  scanned: number;
  candidatePages: number;
  jobs: NormalizedSourceJob[];
  errors: string[];
};

export async function fetchLeverJobs(
  boards = defaultLeverBoards,
): Promise<LeverScrapeResult> {
  const boardResults = await Promise.allSettled(
    boards.map(async (board) => ({
      board,
      links: extractLeverJobLinks(await fetchHtml(board.url), board.url),
    })),
  );
  const errors: string[] = [];
  const candidates: Array<LeverJobLink & { board: LeverBoard }> = [];
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
          title: link.title,
          employmentType: link.commitment,
        }) &&
        isPotentialLocationMatch({
          locationText: link.location,
          workMode: link.workMode,
        })
      ) {
        candidates.push({ ...link, board });
      }
    }
  });

  const uniqueCandidates = [
    ...new Map(
      candidates.map((candidate) => [candidate.url, candidate]),
    ).values(),
  ].slice(0, 24);
  const jobs: NormalizedSourceJob[] = [];
  for (const batch of chunk(uniqueCandidates, 4)) {
    const results = await Promise.allSettled(
      batch.map(async (candidate) =>
        parseLeverJobPage(
          await fetchHtml(candidate.url),
          candidate,
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
      jobs.push(result.value);
    });
  }

  return {
    source: 'lever',
    scanned,
    candidatePages: uniqueCandidates.length,
    jobs,
    errors,
  };
}

export function extractLeverJobLinks(
  html: string,
  boardUrl: string,
): LeverJobLink[] {
  const board = new URL(boardUrl);
  const expectedPrefix = `${board.origin}${board.pathname.replace(/\/$/, '')}/`;
  const links = new Map<string, LeverJobLink>();
  const anchorPattern =
    /<a\b(?=[^>]*\bclass=["'][^"']*\bposting-title\b[^"']*["'])[^>]*>[\s\S]*?<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = readAttribute(match[0], 'href');
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(decodeHtmlEntities(href), boardUrl);
    } catch {
      continue;
    }
    if (!url.toString().startsWith(expectedPrefix)) continue;
    const id = url.pathname.split('/').filter(Boolean).at(-1) || '';
    if (!/^[0-9a-f-]{20,}$/i.test(id)) continue;
    const title =
      readClassText(match[0], 'posting-name') || readTagText(match[0], 'h5');
    if (!title) continue;
    const modeText = readClassText(match[0], 'workplaceTypes');
    links.set(id, {
      id,
      url: url.toString(),
      title,
      location: readClassText(match[0], 'location'),
      workMode: detectWorkMode(modeText),
      commitment: readClassText(match[0], 'commitment'),
    });
  }
  return [...links.values()];
}

export function parseLeverJobPage(
  html: string,
  listing: LeverJobLink,
  board: LeverBoard,
): NormalizedSourceJob {
  const headline = readClassInnerHtml(html, 'posting-headline') || '';
  const title = readTagText(headline, 'h2') || listing.title;
  const locationText =
    readClassText(headline, 'location') || listing.location || 'Germany';
  const commitment =
    readClassText(headline, 'commitment') || listing.commitment;
  const workMode = detectWorkMode(
    `${readClassText(headline, 'workplaceTypes')} ${listing.workMode} ${locationText}`,
  );
  const descriptionStart = html.search(/data-qa=["']job-description["']/i);
  const applicationStart = html.search(
    /<div\b[^>]*class=["'][^"']*application-page/i,
  );
  const descriptionMarkup =
    descriptionStart >= 0
      ? html.slice(
          descriptionStart,
          applicationStart > descriptionStart ? applicationStart : undefined,
        )
      : '';
  const description = htmlToText(descriptionMarkup).slice(0, 60_000);
  if (description.length < 40) throw new Error('job description not found');

  return {
    source: 'lever',
    externalId: `${board.id}:${listing.id}`,
    canonicalUrl: canonicalUrl(html, listing.url),
    title,
    company: board.company,
    description,
    locationText,
    region: isBavariaLocation(locationText) ? 'Bavaria' : null,
    country: countryFromLocation(locationText),
    workMode,
    employmentType: commitment || 'Working Student',
    publishedAt: null,
    tags: ['Lever', board.company],
    rawPayload: {
      board: board.id,
      sourceFormat: 'html',
    },
  };
}

function readClassText(html: string, className: string): string {
  return htmlToText(readClassInnerHtml(html, className) || '');
}

function readClassInnerHtml(html: string, className: string): string | null {
  const openingPattern = new RegExp(
    `<([a-z][\\w:-]*)\\b(?=[^>]*\\bclass=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'])[^>]*>`,
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

function readTagText(html: string, tag: string): string {
  return htmlToText(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(
      html,
    )?.[1] || '',
  );
}

function readAttribute(tag: string, name: string): string {
  return (
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(
      tag,
    )?.[2] || ''
  );
}

function canonicalUrl(html: string, fallback: string): string {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (readAttribute(match[0], 'rel').toLowerCase() !== 'canonical') continue;
    try {
      return new URL(
        decodeHtmlEntities(readAttribute(match[0], 'href')),
        fallback,
      ).toString();
    } catch {
      break;
    }
  }
  return fallback;
}

function detectWorkMode(
  text: string,
): 'onsite' | 'hybrid' | 'remote' | 'unknown' {
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bremote\b/i.test(text)) return 'remote';
  if (/\bon[ -]?site\b/i.test(text)) return 'onsite';
  return 'unknown';
}

function countryFromLocation(location: string): string {
  if (/\b(germany|deutschland)\b/i.test(location)) return 'Germany';
  return isBavariaLocation(location) ? 'Germany' : 'Unknown';
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
