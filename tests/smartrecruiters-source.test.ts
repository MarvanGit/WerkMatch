import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSmartRecruitersJobLinks,
  parseSmartRecruitersJobPage,
  type SmartRecruitersBoard,
} from '../lib/sources/smartrecruiters.ts';

const board: SmartRecruitersBoard = {
  id: 'brainlab',
  company: 'Brainlab',
  url: 'https://jobs.smartrecruiters.com/Brainlab',
};

void test('extracts and deduplicates student job links from board HTML', () => {
  const html = `
    <script>
      window.jobs = [
        "https://jobs.smartrecruiters.com/Brainlab/744000131687160-working-student-mixed-reality-developer-godot-c-",
        "https://jobs.smartrecruiters.com/Brainlab/744000131687160-working-student-mixed-reality-developer-godot-c-"
      ];
    </script>
  `;

  assert.deepEqual(extractSmartRecruitersJobLinks(html, board), [
    {
      id: '744000131687160',
      titleHint: 'working student mixed reality developer godot c',
      url: 'https://jobs.smartrecruiters.com/Brainlab/744000131687160-working-student-mixed-reality-developer-godot-c-',
    },
  ]);
});

void test('normalizes SmartRecruiters microdata without an API', () => {
  const html = `
    <html><head>
      <link rel="canonical" href="https://jobs.smartrecruiters.com/Brainlab/744000131687160-working-student-mixed-reality-developer-godot-c-">
    </head><body>
      <main itemscope itemtype="http://schema.org/JobPosting">
        <h1 itemprop="title">Working Student - Mixed Reality Developer (Godot/C++)</h1>
        <span itemprop="jobLocation">
          <spl-job-location formattedAddress="Munich, Germany" workplaceType="on_site"></spl-job-location>
          <meta itemprop="addressCountry" content="Germany">
          <meta itemprop="addressLocality" content="Munich">
          <meta itemprop="addressRegion" content="Bavaria">
        </span>
        <li itemprop="employmentType">Intern</li>
        <div itemprop="hiringOrganization"><meta itemprop="name" content="Brainlab"></div>
        <meta itemprop="datePosted" content="2026-06-11T14:12:45.627Z">
        <div itemprop="description">
          <section><h2>Job Description</h2><div><p>Build mixed reality prototypes with Godot and C++ for medical applications.</p></div></section>
          <section><h2>Qualifications</h2><div><p>Computer science student with software development experience.</p></div></section>
        </div>
      </main>
    </body></html>
  `;

  const job = parseSmartRecruitersJobPage(
    html,
    'https://jobs.smartrecruiters.com/Brainlab/744000131687160-working-student-mixed-reality-developer-godot-c-',
    board,
  );

  assert.equal(job.source, 'smartrecruiters');
  assert.equal(job.externalId, 'brainlab:744000131687160');
  assert.equal(job.company, 'Brainlab');
  assert.equal(job.region, 'Bavaria');
  assert.equal(job.country, 'Germany');
  assert.equal(job.workMode, 'onsite');
  assert.match(job.description, /Godot and C\+\+/);
});
