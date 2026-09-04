import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLeverJobLinks,
  parseLeverJobPage,
  type LeverBoard,
} from '../lib/sources/lever.ts';

const board: LeverBoard = {
  id: 'example',
  company: 'Example GmbH',
  url: 'https://jobs.lever.co/example',
};

const listingHtml = `
  <div class="posting" data-qa-posting-id="12345678-abcd-4567-89ab-123456789012">
    <a class="posting-title" href="https://jobs.lever.co/example/12345678-abcd-4567-89ab-123456789012">
      <h5 data-qa="posting-name">Working Student Software Engineering</h5>
      <div class="posting-categories">
        <span class="workplaceTypes">Hybrid — </span>
        <span class="commitment">Working Student</span>
        <span class="location">Munich</span>
      </div>
    </a>
  </div>
`;

void test('extracts Lever job cards from server-rendered HTML', () => {
  assert.deepEqual(extractLeverJobLinks(listingHtml, board.url), [
    {
      id: '12345678-abcd-4567-89ab-123456789012',
      url: 'https://jobs.lever.co/example/12345678-abcd-4567-89ab-123456789012',
      title: 'Working Student Software Engineering',
      location: 'Munich',
      workMode: 'hybrid',
      commitment: 'Working Student',
    },
  ]);
});

void test('normalizes a Lever detail page without an API', () => {
  const listing = extractLeverJobLinks(listingHtml, board.url)[0];
  const html = `
    <html><head><link rel="canonical" href="${listing.url}"></head><body>
      <div class="posting-headline">
        <h2>Working Student Software Engineering</h2>
        <div class="posting-categories">
          <div class="location">Munich, Germany</div>
          <div class="commitment">Working Student</div>
          <div class="workplaceTypes">Hybrid</div>
        </div>
      </div>
      <div class="section" data-qa="job-description">
        <p>Build and test TypeScript applications with an experienced engineering team.</p>
      </div>
      <div class="section page-centered">
        <h3>Your profile</h3><p>You are enrolled in computer science and enjoy software development.</p>
      </div>
    </body></html>
  `;

  const job = parseLeverJobPage(html, listing, board);
  assert.equal(job.source, 'lever');
  assert.equal(job.externalId, 'example:12345678-abcd-4567-89ab-123456789012');
  assert.equal(job.region, 'Bavaria');
  assert.equal(job.country, 'Germany');
  assert.equal(job.workMode, 'hybrid');
  assert.match(job.description, /TypeScript applications/);
});
