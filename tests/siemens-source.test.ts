import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSiemensListings,
  fetchSiemensJobs,
  parseHealthineersJob,
  parseHealthineersJobPage,
  parseSiemensMarketplaceJobPage,
  type SiemensMarketplaceQuery,
} from '../lib/sources/siemens.ts';

const siemensListingHtml = `
  <div class="list-controls__text__legend" aria-label="1 results">1 - 1 of 1 results</div>
  <article class="article article--result 1">
    <h3><a href="https://jobs.siemens.com/en_US/externaljobs/JobDetail/521001">
      Werkstudent (w/m/d) Softwareentwicklung
    </a></h3>
    <span class="list-item-location">
      <span class="list-item-jobCity">Munich</span>,
      <span class="list-item-jobState">Bayern</span>,
      <span class="list-item-jobCountry">Germany</span>
    </span>
    <span class="list-item-family">Software Engineering</span>
  </article>
`;

const siemensDetailHtml = `
  <meta property="og:url" content="https://jobs.siemens.com/en_US/externaljobs/JobDetail/521001">
  <div class="section__header__text__title">Werkstudent (w/m/d) Softwareentwicklung</div>
  ${detailField('Job ID', '521001')}
  ${detailField('Posted since', '18-Sep-2026')}
  ${detailField('Organization', 'Mobility')}
  ${detailField('Field of work', 'Engineering')}
  ${detailField('Company', 'Siemens Mobility GmbH')}
  ${detailField('Experience level', 'Student (Not Yet Graduated)')}
  ${detailField('Job type', 'Part-time')}
  ${detailField('Work mode', 'Hybrid (Remote/Office)')}
  ${detailField('Employment type', 'Fixed Term')}
  ${detailField('Location(s)', '<ul><li>Munich - Bayern - Germany</li></ul>')}
  <article>
    <div class="article__content__view__field">
      <div class="article__content__view__field__value">
        <p>Develop and test TypeScript software for railway automation with our engineering team.</p>
        <p>You are currently enrolled in computer science.</p>
      </div>
    </div>
  </article>
`;

void test('extracts Siemens and Siemens Energy result cards', () => {
  assert.deepEqual(
    extractSiemensListings(
      siemensListingHtml,
      'https://jobs.siemens.com/en_US/externaljobs/SearchJobs',
      'siemens',
    ),
    [
      {
        id: '521001',
        marketplace: 'siemens',
        title: 'Werkstudent (w/m/d) Softwareentwicklung',
        url: 'https://jobs.siemens.com/en_US/externaljobs/JobDetail/521001',
        location: 'Munich',
        country: 'Germany',
        family: 'Software Engineering',
      },
    ],
  );

  const energy = extractSiemensListings(
    `<article class="article article--result"><a class="article__header__focusable" href="https://jobs.siemens-energy.com/en_US/jobs/FolderDetail/Working-Student-Software/303193">Working Student Software Engineering</a></article>`,
    'https://jobs.siemens-energy.com/en_US/jobs/Jobs',
    'siemens-energy',
  );
  assert.equal(energy[0].id, '303193');
  assert.equal(energy[0].marketplace, 'siemens-energy');
});

void test('normalizes Siemens Marketplace details including Mobility metadata', () => {
  const job = parseSiemensMarketplaceJobPage(
    siemensDetailHtml,
    'https://jobs.siemens.com/en_US/externaljobs/JobDetail/521001',
    'siemens',
  );
  assert.equal(job.source, 'siemens');
  assert.equal(job.externalId, 'siemens:521001');
  assert.equal(job.company, 'Siemens Mobility GmbH');
  assert.equal(job.region, 'Bavaria');
  assert.equal(job.country, 'Germany');
  assert.equal(job.workMode, 'hybrid');
  assert.equal(job.publishedAt, '2026-09-18T00:00:00.000Z');
  assert.ok(job.tags.includes('Mobility'));
  assert.match(job.description, /TypeScript software/);
});

void test('normalizes Healthineers Workday details and recognizes Bavaria from prose', () => {
  const job = parseHealthineersJob(
    {
      title: 'Working Student Software Engineering (f/m/d)',
      jobDescription:
        '<p>Join our Erlangen engineering team and develop cloud software with TypeScript.</p>',
      jobReqId: 'R-30001',
      jobRequisitionLocation: {
        descriptor: 'ERL S F80',
        country: { descriptor: 'Germany', alpha2Code: 'DE' },
      },
      country: { descriptor: 'Germany' },
      remoteType: 'Hybrid',
      timeType: 'Part time',
      workerSubType: 'Intern (Fixed Term)',
      externalUrl:
        'https://onehealthineers.wd3.myworkdayjobs.com/SHSJB/job/example_R-30001',
    },
    {
      title: 'Working Student Software Engineering (f/m/d)',
      externalPath: '/job/example_R-30001',
      bulletFields: ['R-30001'],
    },
  );
  assert.equal(job.externalId, 'healthineers:R-30001');
  assert.equal(job.company, 'Siemens Healthineers');
  assert.equal(job.region, 'Bavaria');
  assert.equal(job.workMode, 'hybrid');
  assert.match(job.locationText, /Bavaria, Germany/);
});

void test('scrapes Healthineers public HTML and uses API data only as metadata', () => {
  const html = `
    <meta property="og:url" content="https://onehealthineers.wd3.myworkdayjobs.com/SHSJB/job/example_R-30002">
    <script type="application/ld+json">
      ${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: 'Working Student Cloud Development (f/m/d)',
        description:
          'Develop and test cloud software with our engineering team in Erlangen. You are currently enrolled in computer science.',
        identifier: { '@type': 'PropertyValue', value: 'R-30002' },
        hiringOrganization: {
          '@type': 'Organization',
          name: '506q Siemens Healthineers AG',
        },
        jobLocation: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: 'Erlangen',
            addressRegion: 'Bavaria',
            addressCountry: 'Germany',
          },
        },
        employmentType: 'PART_TIME',
        datePosted: '2026-09-21',
      })}
    </script>
  `;
  const job = parseHealthineersJobPage(
    html,
    'https://onehealthineers.wd3.myworkdayjobs.com/SHSJB/job/example_R-30002',
    {
      title: 'Working Student Cloud Development (f/m/d)',
      externalPath: '/job/example_R-30002',
      bulletFields: ['R-30002'],
    },
    { remoteType: 'Hybrid', timeType: 'Part time' },
  );
  assert.equal(job.externalId, 'healthineers:R-30002');
  assert.equal(job.company, 'Siemens Healthineers AG');
  assert.equal(job.workMode, 'hybrid');
  assert.equal(job.region, 'Bavaria');
  assert.equal(job.publishedAt, '2026-09-21T00:00:00.000Z');
  assert.match(job.description, /cloud software/);
});

void test('collector retains a healthy Siemens portal when another portal fails', async (t) => {
  const queries: SiemensMarketplaceQuery[] = [
    {
      id: 'healthy',
      marketplace: 'siemens',
      url: 'https://jobs.siemens.com/test-search',
      pageSize: 6,
      maxPages: 1,
    },
    {
      id: 'broken',
      marketplace: 'siemens-energy',
      url: 'https://energy.siemens.test/search',
      pageSize: 20,
      maxPages: 1,
    },
  ];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url === queries[0].url) return new Response(siemensListingHtml);
    if (url.includes('/JobDetail/521001'))
      return new Response(siemensDetailHtml);
    return new Response('unavailable', { status: 404 });
  });

  const result = await fetchSiemensJobs(queries, null);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].company, 'Siemens Mobility GmbH');
  assert.ok(result.errors.some((error) => error.startsWith('broken:')));
});

function detailField(label: string, value: string): string {
  return `
    <div class="article__content__view__field">
      <div class="article__content__view__field__label">${label}</div>
      <div class="article__content__view__field__value">${value}</div>
    </div>
  `;
}
