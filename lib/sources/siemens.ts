import {
  decodeHtmlEntities,
  htmlToText,
  isBavariaLocation,
  isPotentialLocationMatch,
  isTargetStudentTechRole,
} from './job-filter.ts';
import type { NormalizedSourceJob } from './types.ts';

export type SiemensMarketplace = 'siemens' | 'siemens-energy';

export type SiemensMarketplaceQuery = {
  id: string;
  marketplace: SiemensMarketplace;
  url: string;
  pageSize: number;
  maxPages: number;
};

export type HealthineersBoard = {
  id: 'healthineers';
  apiBaseUrl: string;
  careersBaseUrl: string;
  countryFacetId: string;
};

export type SiemensListing = {
  id: string;
  marketplace: SiemensMarketplace;
  title: string;
  url: string;
  location: string;
  country: string;
  family: string;
};

type WorkdayListing = {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

type WorkdaySearchResponse = {
  total?: number;
  jobPostings?: WorkdayListing[];
};

export type HealthineersJobPostingInfo = {
  title?: string;
  jobDescription?: string;
  location?: string;
  postedOn?: string;
  jobReqId?: string;
  jobPostingId?: string;
  country?: { descriptor?: string } | string;
  jobRequisitionLocation?: {
    descriptor?: string;
    country?: { descriptor?: string; alpha2Code?: string };
  };
  remoteType?: string;
  externalUrl?: string;
  timeType?: string;
  workerSubType?: string;
};

type WorkdayDetailResponse = {
  jobPostingInfo?: HealthineersJobPostingInfo;
};

type JsonObject = Record<string, unknown>;

export type SiemensScrapeResult = {
  source: 'siemens';
  scanned: number;
  candidatePages: number;
  listingRequests: number;
  jobs: NormalizedSourceJob[];
  errors: string[];
  portals: Array<{
    id: string;
    scanned: number;
    candidatePages: number;
    listingRequests: number;
  }>;
};

export const defaultSiemensMarketplaceQueries: SiemensMarketplaceQuery[] = [
  {
    id: 'siemens-werkstudent',
    marketplace: 'siemens',
    url: 'https://jobs.siemens.com/en_US/externaljobs/SearchJobs/?search=Werkstudent',
    pageSize: 6,
    maxPages: 12,
  },
  {
    id: 'siemens-working-student-germany',
    marketplace: 'siemens',
    url: 'https://jobs.siemens.com/en_US/externaljobs/SearchJobs/?search=Working%20Student%20Germany',
    pageSize: 6,
    maxPages: 10,
  },
  {
    id: 'siemens-energy-werkstudent-germany',
    marketplace: 'siemens-energy',
    url: 'https://jobs.siemens-energy.com/en_US/jobs/Jobs/Werkstudent?29454=964485&29454_format=11381&listFilterMode=1&folderRecordsPerPage=20',
    pageSize: 20,
    maxPages: 4,
  },
  {
    id: 'siemens-energy-working-student-germany',
    marketplace: 'siemens-energy',
    url: 'https://jobs.siemens-energy.com/en_US/jobs/Jobs/Working%20Student?29454=964485&29454_format=11381&listFilterMode=1&folderRecordsPerPage=20',
    pageSize: 20,
    maxPages: 4,
  },
];

export const defaultHealthineersBoard: HealthineersBoard = {
  id: 'healthineers',
  apiBaseUrl:
    'https://onehealthineers.wd3.myworkdayjobs.com/wday/cxs/onehealthineers/SHSJB',
  careersBaseUrl: 'https://onehealthineers.wd3.myworkdayjobs.com/SHSJB',
  countryFacetId: 'dcc5b7608d8644b3a93716604e78e995',
};

const listingConcurrency = 3;
const detailConcurrency = 4;
const healthineersPageSize = 20;

export async function fetchSiemensJobs(
  queries = defaultSiemensMarketplaceQueries,
  healthineersBoard: HealthineersBoard | null = defaultHealthineersBoard,
): Promise<SiemensScrapeResult> {
  const errors: string[] = [];
  const portalStats = new Map<
    string,
    {
      id: string;
      scanned: number;
      candidatePages: number;
      listingRequests: number;
    }
  >();
  const marketplaceListings: SiemensListing[] = [];

  const queryResults = await Promise.allSettled(
    queries.map((query) => fetchMarketplaceQuery(query)),
  );
  queryResults.forEach((result, index) => {
    const query = queries[index];
    const stat = portalStats.get(query.marketplace) ?? {
      id: query.marketplace,
      scanned: 0,
      candidatePages: 0,
      listingRequests: 0,
    };
    if (result.status === 'rejected') {
      errors.push(`${query.id}: ${errorMessage(result.reason)}`);
      portalStats.set(query.marketplace, stat);
      return;
    }
    stat.scanned += result.value.listings.length;
    stat.listingRequests += result.value.requests;
    marketplaceListings.push(...result.value.listings);
    portalStats.set(query.marketplace, stat);
  });

  const uniqueMarketplaceListings = [
    ...new Map(
      marketplaceListings.map((listing) => [
        `${listing.marketplace}:${listing.id}`,
        listing,
      ]),
    ).values(),
  ];
  const maxCandidates = boundedEnvironmentInteger(
    'SIEMENS_MAX_CANDIDATES',
    64,
    1,
    160,
  );
  const marketplaceCandidates = uniqueMarketplaceListings
    .filter(
      (listing) =>
        (!listing.country || /germany|deutschland/i.test(listing.country)) &&
        isTargetStudentTechRole({
          title: listing.title,
          employmentType: listing.title,
          tags: [listing.family],
        }),
    )
    .slice(0, maxCandidates);

  const jobs: NormalizedSourceJob[] = [];
  for (const batch of chunk(marketplaceCandidates, detailConcurrency)) {
    const results = await Promise.allSettled(
      batch.map(async (listing) =>
        parseSiemensMarketplaceJobPage(
          await fetchText(listing.url),
          listing.url,
          listing.marketplace,
        ),
      ),
    );
    results.forEach((result, index) => {
      const listing = batch[index];
      const stat = portalStats.get(listing.marketplace)!;
      stat.candidatePages += 1;
      if (result.status === 'rejected') {
        errors.push(
          `${listing.marketplace}/${listing.id}: ${errorMessage(result.reason)}`,
        );
        return;
      }
      if (isEligibleSiemensJob(result.value)) jobs.push(result.value);
    });
  }

  if (healthineersBoard) {
    const stat = {
      id: healthineersBoard.id,
      scanned: 0,
      candidatePages: 0,
      listingRequests: 0,
    };
    try {
      const healthineers = await fetchHealthineersListings(healthineersBoard);
      stat.scanned = healthineers.listings.length;
      stat.listingRequests = healthineers.requests;
      const candidates = healthineers.listings
        .filter((listing) =>
          isTargetStudentTechRole({
            title: listing.title ?? '',
            employmentType: listing.title ?? '',
          }),
        )
        .slice(0, maxCandidates);
      for (const batch of chunk(candidates, detailConcurrency)) {
        const results = await Promise.allSettled(
          batch.map(async (listing) => {
            const externalPath = requiredExternalPath(listing);
            let info: HealthineersJobPostingInfo | undefined;
            try {
              const response = await fetchJson<WorkdayDetailResponse>(
                healthineersBoard.apiBaseUrl + externalPath,
              );
              info = response.jobPostingInfo;
            } catch {
              // The public HTML page remains independently scrapeable.
            }
            const pageUrl =
              info?.externalUrl ||
              healthineersBoard.careersBaseUrl + externalPath;
            try {
              return {
                job: parseHealthineersJobPage(
                  await fetchText(pageUrl),
                  pageUrl,
                  listing,
                  info,
                  healthineersBoard,
                ),
                warning: null,
              };
            } catch (scrapeError) {
              if (!info) throw scrapeError;
              return {
                job: parseHealthineersJob(info, listing, healthineersBoard),
                warning: `HTML scrape failed; used structured fallback (${errorMessage(scrapeError)})`,
              };
            }
          }),
        );
        results.forEach((result, index) => {
          stat.candidatePages += 1;
          if (result.status === 'rejected') {
            errors.push(
              `healthineers/${batch[index].bulletFields?.[0] ?? 'unknown'}: ${errorMessage(result.reason)}`,
            );
            return;
          }
          if (result.value.warning)
            errors.push(
              `healthineers/${batch[index].bulletFields?.[0] ?? 'unknown'}: ${result.value.warning}`,
            );
          if (isEligibleSiemensJob(result.value.job))
            jobs.push(result.value.job);
        });
      }
    } catch (error) {
      errors.push(`healthineers: ${errorMessage(error)}`);
    }
    portalStats.set(healthineersBoard.id, stat);
  }

  const portals = [...portalStats.values()];
  return {
    source: 'siemens',
    scanned: portals.reduce((total, portal) => total + portal.scanned, 0),
    candidatePages: portals.reduce(
      (total, portal) => total + portal.candidatePages,
      0,
    ),
    listingRequests: portals.reduce(
      (total, portal) => total + portal.listingRequests,
      0,
    ),
    jobs: deduplicateJobs(jobs),
    errors,
    portals,
  };
}

async function fetchMarketplaceQuery(query: SiemensMarketplaceQuery) {
  const firstHtml = await fetchText(query.url);
  const firstListings = extractSiemensListings(
    firstHtml,
    query.url,
    query.marketplace,
  );
  const total = extractResultCount(firstHtml) || firstListings.length;
  const environmentMaxPages = boundedEnvironmentInteger(
    'SIEMENS_MAX_SEARCH_PAGES',
    query.maxPages,
    1,
    20,
  );
  const pageCount = Math.min(
    Math.max(1, Math.ceil(total / query.pageSize)),
    query.maxPages,
    environmentMaxPages,
  );
  const listings = [...firstListings];
  const pageUrls = Array.from({ length: pageCount - 1 }, (_, index) =>
    marketplacePageUrl(query.url, query.pageSize, (index + 1) * query.pageSize),
  );
  for (const batch of chunk(pageUrls, listingConcurrency)) {
    const pages = await Promise.all(batch.map((url) => fetchText(url)));
    pages.forEach((html, index) =>
      listings.push(
        ...extractSiemensListings(html, batch[index], query.marketplace),
      ),
    );
  }
  return {
    listings: [
      ...new Map(listings.map((listing) => [listing.id, listing])).values(),
    ],
    requests: 1 + pageUrls.length,
  };
}

export function extractSiemensListings(
  html: string,
  pageUrl: string,
  marketplace: SiemensMarketplace,
): SiemensListing[] {
  const listings = new Map<string, SiemensListing>();
  const articlePattern =
    /<article\b(?=[^>]*\bclass=["'][^"']*\barticle--result\b[^"']*["'])[^>]*>([\s\S]*?)<\/article>/gi;
  for (const articleMatch of html.matchAll(articlePattern)) {
    const article = articleMatch[0];
    const linkMatch =
      /<a\b[^>]*\bhref=["']([^"']*\/(?:JobDetail|FolderDetail)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(
        article,
      );
    if (!linkMatch) continue;
    let url: URL;
    try {
      url = new URL(decodeHtmlEntities(linkMatch[1]), pageUrl);
    } catch {
      continue;
    }
    if (url.hostname !== new URL(pageUrl).hostname) continue;
    const id = /\/(\d+)\/?(?:[?#].*)?$/.exec(url.toString())?.[1];
    const title = htmlToText(linkMatch[2]);
    if (!id || !title) continue;
    const location = readClassText(article, 'list-item-location');
    listings.set(id, {
      id,
      marketplace,
      title,
      url: url.toString(),
      location,
      country: readClassText(article, 'list-item-jobCountry'),
      family: readClassText(article, 'list-item-family'),
    });
  }
  return [...listings.values()];
}

export function parseSiemensMarketplaceJobPage(
  html: string,
  pageUrl: string,
  marketplace: SiemensMarketplace,
): NormalizedSourceJob {
  const fields = extractDetailFields(html);
  const id =
    fields.get('job id') ||
    /\/(\d+)\/?(?:[?#].*)?$/.exec(new URL(pageUrl).toString())?.[1];
  if (!id) throw new Error('job identifier not found');
  const title =
    readClassText(html, 'section__header__text__title') ||
    decodeHtmlEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
      .replace(/\s+-\s+Job Detail[\s\S]*$/i, '')
      .trim();
  if (!title) throw new Error('job title not found');
  const description = extractLongestDetailValue(html).slice(0, 60_000);
  if (description.length < 40) throw new Error('job description not found');
  const locationText = normalizeLocationText(
    fields.get('location(s)') || joinLocationFields(fields) || 'Germany',
  );
  const company =
    fields.get('company') ||
    (marketplace === 'siemens-energy' ? 'Siemens Energy' : 'Siemens');
  const workMode = detectWorkMode(
    `${fields.get('work mode') ?? ''} ${fields.get('remote vs. office') ?? ''} ${description}`,
  );
  const employmentType = [
    fields.get('job type'),
    fields.get('full / part time'),
    fields.get('employment type'),
    fields.get('experience level'),
  ]
    .filter(Boolean)
    .join(', ');
  const canonicalUrl =
    readMetaContent(html, 'og:url') || new URL(pageUrl).toString();
  const fieldOfWork = fields.get('field of work') || '';
  const organization = fields.get('organization') || '';
  const businessUnit = fields.get('business unit') || '';
  const bavaria = isBavariaLocation(`${locationText} ${description}`);

  return {
    source: 'siemens',
    externalId: `${marketplace}:${id}`,
    canonicalUrl,
    title,
    company,
    description,
    locationText,
    region: bavaria ? 'Bavaria' : null,
    country: /germany|deutschland/i.test(locationText)
      ? 'Germany'
      : countryFromLocation(locationText),
    workMode,
    employmentType: employmentType || 'Working Student',
    publishedAt: parseAvatureDate(fields.get('posted since')),
    tags: [
      marketplace === 'siemens-energy'
        ? 'Siemens Energy / Siemens Gamesa'
        : 'Siemens Careers Marketplace',
      company,
      organization,
      businessUnit,
      fieldOfWork,
    ].filter(Boolean),
    rawPayload: {
      portal: marketplace,
      sourceFormat: 'avature-html',
      jobId: id,
      organization: organization || null,
      businessUnit: businessUnit || null,
      fieldOfWork: fieldOfWork || null,
    },
  };
}

export function parseHealthineersJob(
  info: HealthineersJobPostingInfo,
  listing: WorkdayListing,
  board = defaultHealthineersBoard,
): NormalizedSourceJob {
  const title = info.title?.trim() || listing.title?.trim() || '';
  if (!title) throw new Error('job title not found');
  const id =
    info.jobReqId?.trim() ||
    listing.bulletFields?.find(Boolean) ||
    info.jobPostingId?.trim();
  if (!id) throw new Error('job identifier not found');
  const description = htmlToText(info.jobDescription ?? '').slice(0, 60_000);
  if (description.length < 40) throw new Error('job description not found');
  const country =
    (typeof info.country === 'string'
      ? info.country
      : info.country?.descriptor) ||
    info.jobRequisitionLocation?.country?.descriptor ||
    'Germany';
  const rawLocation =
    info.jobRequisitionLocation?.descriptor ||
    info.location ||
    listing.locationsText ||
    country;
  const bavaria = isBavariaLocation(`${rawLocation} ${description}`);
  const locationText = bavaria
    ? `${rawLocation}, Bavaria, ${country}`
    : `${rawLocation}, ${country}`;
  const workMode = detectWorkMode(
    `${info.remoteType ?? ''} ${locationText} ${description}`,
  );
  const externalPath = listing.externalPath ?? '';
  const canonicalUrl =
    info.externalUrl ||
    (externalPath ? board.careersBaseUrl + externalPath : board.careersBaseUrl);

  return {
    source: 'siemens',
    externalId: `healthineers:${id}`,
    canonicalUrl,
    title,
    company: 'Siemens Healthineers',
    description,
    locationText,
    region: bavaria ? 'Bavaria' : null,
    country,
    workMode,
    employmentType:
      [info.workerSubType, info.timeType].filter(Boolean).join(', ') ||
      'Working Student',
    publishedAt: null,
    tags: [
      'Siemens Healthineers',
      info.remoteType ?? '',
      info.timeType ?? '',
    ].filter(Boolean),
    rawPayload: {
      portal: board.id,
      sourceFormat: 'workday-json',
      jobReqId: id,
      postedOn: info.postedOn || listing.postedOn || null,
      locationCode: rawLocation,
    },
  };
}

export function parseHealthineersJobPage(
  html: string,
  pageUrl: string,
  listing: WorkdayListing,
  info?: HealthineersJobPostingInfo,
  board = defaultHealthineersBoard,
): NormalizedSourceJob {
  const posting = extractJobPostingJsonLd(html);
  if (!posting) throw new Error('JobPosting JSON-LD not found');
  const title =
    stringValue(posting.title) ||
    info?.title?.trim() ||
    listing.title?.trim() ||
    '';
  if (!title) throw new Error('job title not found');
  const identifier = objectValue(posting.identifier);
  const id =
    stringValue(identifier?.value) ||
    info?.jobReqId?.trim() ||
    listing.bulletFields?.find(Boolean) ||
    info?.jobPostingId?.trim();
  if (!id) throw new Error('job identifier not found');
  const description = htmlToText(stringValue(posting.description)).slice(
    0,
    60_000,
  );
  if (description.length < 40) throw new Error('job description not found');
  const locations = arrayValue(posting.jobLocation)
    .map(objectValue)
    .filter((location): location is JsonObject => Boolean(location))
    .map((location) => objectValue(location.address))
    .filter((address): address is JsonObject => Boolean(address));
  const applicantCountry = objectValue(posting.applicantLocationRequirements);
  const country =
    locations
      .map((address) => stringValue(address.addressCountry))
      .find(Boolean) ||
    stringValue(applicantCountry?.name) ||
    (typeof info?.country === 'string'
      ? info.country
      : info?.country?.descriptor) ||
    info?.jobRequisitionLocation?.country?.descriptor ||
    'Germany';
  const scrapedLocations = locations
    .map((address) =>
      [
        stringValue(address.addressLocality),
        stringValue(address.addressRegion),
        stringValue(address.addressCountry),
      ]
        .filter(Boolean)
        .join(', '),
    )
    .filter(Boolean);
  const rawLocation =
    [...new Set(scrapedLocations)].join('; ') ||
    info?.jobRequisitionLocation?.descriptor ||
    info?.location ||
    listing.locationsText ||
    country;
  const bavaria = isBavariaLocation(`${rawLocation} ${description}`);
  const locationText = bavaria
    ? `${rawLocation}, Bavaria, ${country}`
    : rawLocation;
  const organization = objectValue(posting.hiringOrganization);
  const company = cleanWorkdayCompany(
    stringValue(organization?.name) || 'Siemens Healthineers',
  );
  const workMode = detectWorkMode(
    `${info?.remoteType || stringValue(posting.jobLocationType)} ${locationText} ${description}`,
  );
  const employmentValues = arrayValue(posting.employmentType)
    .map(stringValue)
    .filter(Boolean)
    .map(humanizeWorkdayValue);
  const publishedAt = isoDateOrNull(stringValue(posting.datePosted));

  return {
    source: 'siemens',
    externalId: `healthineers:${id}`,
    canonicalUrl: readMetaContent(html, 'og:url') || pageUrl,
    title,
    company,
    description,
    locationText,
    region: bavaria ? 'Bavaria' : null,
    country,
    workMode,
    employmentType:
      [info?.workerSubType, info?.timeType, ...employmentValues]
        .filter(Boolean)
        .join(', ') || 'Working Student',
    publishedAt,
    tags: [
      'Siemens Healthineers',
      company,
      info?.remoteType ?? '',
      info?.timeType ?? '',
    ].filter(Boolean),
    rawPayload: {
      portal: board.id,
      sourceFormat: 'workday-jsonld-html',
      jobReqId: id,
      postedOn: info?.postedOn || listing.postedOn || null,
      locationCode: info?.jobRequisitionLocation?.descriptor || null,
    },
  };
}

async function fetchHealthineersListings(board: HealthineersBoard) {
  const listings: WorkdayListing[] = [];
  let offset = 0;
  let total = 1;
  let requests = 0;
  const maxPages = boundedEnvironmentInteger(
    'SIEMENS_HEALTHINEERS_MAX_PAGES',
    4,
    1,
    10,
  );
  while (offset < total && requests < maxPages) {
    const page = await fetchJson<WorkdaySearchResponse>(
      `${board.apiBaseUrl}/jobs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appliedFacets: { locationCountry: [board.countryFacetId] },
          limit: healthineersPageSize,
          offset,
          searchText: '',
        }),
      },
    );
    requests += 1;
    total = Math.max(0, page.total ?? 0);
    listings.push(...(page.jobPostings ?? []));
    if (!(page.jobPostings?.length ?? 0)) break;
    offset += healthineersPageSize;
  }
  return {
    listings: [
      ...new Map(
        listings.map((listing) => [
          listing.externalPath || listing.bulletFields?.[0] || listing.title,
          listing,
        ]),
      ).values(),
    ],
    requests,
  };
}

function isEligibleSiemensJob(job: NormalizedSourceJob): boolean {
  return (
    isTargetStudentTechRole({
      title: job.title,
      employmentType: job.employmentType,
      tags: job.tags,
    }) &&
    (job.region === 'Bavaria' || isPotentialLocationMatch(job))
  );
}

function extractDetailFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  const pattern =
    /<div class=["']article__content__view__field[^"']*["'][^>]*>[\s\S]*?<div class=["']article__content__view__field__label["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class=["']article__content__view__field__value["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    const label = htmlToText(match[1]).toLowerCase();
    const value = htmlToText(match[2]);
    if (label && value) fields.set(label, value);
  }
  return fields;
}

function extractLongestDetailValue(html: string): string {
  const openingPattern =
    /<div class=["']article__content__view__field__value["'][^>]*>/gi;
  const matches = [...html.matchAll(openingPattern)];
  let longest = '';
  for (const match of matches) {
    if (match.index === undefined) continue;
    const start = match.index + match[0].length;
    const end = html.indexOf('</article>', start);
    const text = htmlToText(html.slice(start, end > start ? end : undefined));
    if (text.length > longest.length) longest = text;
  }
  return longest;
}

function joinLocationFields(fields: Map<string, string>): string {
  return [fields.get('city'), fields.get('state'), fields.get('country')]
    .filter(Boolean)
    .join(', ');
}

function readClassText(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `<[a-z][\\w:-]*\\b(?=[^>]*\\bclass=["'][^"']*\\b${escaped}\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/[a-z][\\w:-]*>`,
    'i',
  ).exec(html);
  return htmlToText(match?.[1] ?? '');
}

function readMetaContent(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = new RegExp(
    `<meta\\b(?=[^>]*(?:property|name)=["']${escaped}["'])[^>]*>`,
    'i',
  ).exec(html)?.[0];
  if (!tag) return '';
  return decodeHtmlEntities(/\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
}

function extractResultCount(html: string): number {
  const value =
    /aria-label=["']([\d,.]+)\s+results["']/i.exec(html)?.[1] ||
    /\bof\s+([\d,.]+)\s+results\b/i.exec(html)?.[1] ||
    /\b([\d,.]+)\s+results\b/i.exec(html)?.[1];
  return Number((value ?? '').replace(/[^\d]/g, '')) || 0;
}

function marketplacePageUrl(
  baseUrl: string,
  pageSize: number,
  offset: number,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('folderRecordsPerPage', String(pageSize));
  url.searchParams.set('folderOffset', String(offset));
  return url.toString();
}

function parseAvatureDate(value?: string): string | null {
  if (!value) return null;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = months[match[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(
    Date.UTC(Number(match[3]), month, Number(match[1])),
  ).toISOString();
}

function detectWorkMode(
  value: string,
): 'onsite' | 'hybrid' | 'remote' | 'unknown' {
  if (
    /\b(hybrid|remote\s*\/\s*office|mobiles arbeiten|mobile working)\b/i.test(
      value,
    )
  )
    return 'hybrid';
  if (/\b(remote|home[ -]?office|telecommute)\b/i.test(value)) return 'remote';
  if (/\b(office based|office\/site|on[ -]?site|vor ort)\b/i.test(value))
    return 'onsite';
  return 'unknown';
}

function countryFromLocation(location: string): string {
  if (/germany|deutschland/i.test(location)) return 'Germany';
  const parts = location
    .split(/,|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) || 'Germany';
}

function normalizeLocationText(value: string): string {
  return value
    .replace(/^\s*-\s*/, '')
    .replace(/\n\s*-\s*/g, '; ')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJobPostingJsonLd(html: string): JsonObject | null {
  const scripts =
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scripts)) {
    try {
      const posting = findJobPosting(JSON.parse(match[1].trim()));
      if (posting) return posting;
    } catch {
      // Ignore unrelated or malformed structured-data blocks.
    }
  }
  return null;
}

function findJobPosting(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const posting = findJobPosting(item);
      if (posting) return posting;
    }
    return null;
  }
  const object = objectValue(value);
  if (!object) return null;
  if (
    stringValue(object['@type']).toLowerCase() === 'jobposting' ||
    (object.title && object.description && object.identifier)
  ) {
    return object;
  }
  for (const child of Object.values(object)) {
    const posting = findJobPosting(child);
    if (posting) return posting;
  }
  return null;
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanWorkdayCompany(value: string): string {
  return value.replace(/^\d+[a-z]?\s+/i, '').trim();
}

function humanizeWorkdayValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isoDateOrNull(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function requiredExternalPath(listing: WorkdayListing): string {
  if (!listing.externalPath?.startsWith('/job/'))
    throw new Error('job external path is missing');
  return listing.externalPath;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await request(url, init);
  const body = await response.text();
  if (!body.trim()) throw new Error('empty response');
  return body;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await request(url, init);
  return (await response.json()) as T;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const headers = new Headers(init?.headers);
      if (!headers.has('Accept'))
        headers.set('Accept', 'text/html,application/json;q=0.9,*/*;q=0.8');
      if (!headers.has('User-Agent'))
        headers.set(
          'User-Agent',
          'WerkMatch/0.1 (+https://github.com/MarvanGit/WerkMatch)',
        );
      const response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500)
        throw new PermanentRequestError(
          `request failed with status ${response.status}`,
        );
      lastError = new Error(`request failed with status ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after') ?? '0');
      await delay(Math.max(retryAfter * 1_000, attempt * 1_000));
    } catch (error) {
      if (error instanceof PermanentRequestError) throw error;
      lastError = error;
      if (attempt < 3) await delay(attempt * 1_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}

class PermanentRequestError extends Error {}

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function deduplicateJobs(jobs: NormalizedSourceJob[]): NormalizedSourceJob[] {
  return [...new Map(jobs.map((job) => [job.externalId, job])).values()];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'request failed';
}
