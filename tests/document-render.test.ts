import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareLatexForTectonic,
  renderTailoredDocuments,
} from '../lib/documents/render.ts';

const facts = [
  {
    fact_key: 'skills.verified',
    category: 'skills',
    title: 'Verified skills',
    summary: 'Verified skills',
    details: {},
    tags: ['TypeScript', 'Docker'],
    order_index: 0,
  },
];

const plan = {
  documentLanguage: 'de' as const,
  factPriorityIds: ['skills.verified'],
  coverLetter: {
    subject: 'Bewerbung als Working Student Software Engineer',
    salutation: 'Sehr geehrtes Example-Team,',
    paragraphs: [
      {
        text: 'Erster belegter Absatz.',
        evidenceFactIds: ['skills.verified'],
      },
      {
        text: 'Zweiter belegter Absatz.',
        evidenceFactIds: ['skills.verified'],
      },
      {
        text: 'Dritter belegter Absatz.',
        evidenceFactIds: ['skills.verified'],
      },
    ],
    closing: 'Mit freundlichen Grüßen',
  },
};

void test('removes only explicit TeX engine driver options', () => {
  const source = String.raw`\usepackage[pdftex,colorlinks=true]{hyperref}
\usepackage[pdftex]{graphicx}
\usepackage[margin=1in]{geometry}
\begin{document}
Verified CV content
\end{document}`;

  const prepared = prepareLatexForTectonic(source);

  assert.match(prepared, /\\usepackage\[colorlinks=true\]\{hyperref\}/);
  assert.match(prepared, /\\usepackage\{graphicx\}/);
  assert.match(prepared, /\\usepackage\[margin=1in\]\{geometry\}/);
  assert.match(prepared, /Verified CV content/);
  assert.doesNotMatch(prepared, /pdftex/);
});

void test('keeps package declarations without driver options byte-for-byte', () => {
  const source = String.raw`\usepackage[unicode,hidelinks]{hyperref}`;
  assert.equal(prepareLatexForTectonic(source), source);
});

void test('preserves CV field order and text while reordering only technologies and local bullets', () => {
  const masterTemplate = String.raw`\documentclass{article}
\begin{document}
\section{Skills}
\resumeSubHeadingListStart
\resumeSubItem{Languages}{Python, TypeScript, Java}
\resumeSubItem{DevOps}{Git, Docker, Linux}
\resumeSubHeadingListEnd
\section{Experience}
\resumeSubheading{Example}{Bavaria}{Working Student}{2025}
\resumeItemListStart
\resumeItem{Documentation}{Wrote internal documentation.}
\resumeItem{Web development}{Built TypeScript services.}
\resumeItemListEnd
\end{document}`;

  const { cvTex } = renderTailoredDocuments({
    masterTemplate,
    facts,
    plan,
    job: {
      title: 'Working Student TypeScript Engineer',
      company: 'Example GmbH',
      description: 'Build TypeScript services with Docker.',
    },
  });

  assert.ok(cvTex.indexOf('{Languages}') < cvTex.indexOf('{DevOps}'));
  assert.match(cvTex, /\{Languages\}\{TypeScript, Python, Java\}/);
  assert.match(cvTex, /\{DevOps\}\{Docker, Git, Linux\}/);
  assert.ok(
    cvTex.indexOf('{Web development}') < cvTex.indexOf('{Documentation}'),
  );
  for (const unchanged of [
    '\\section{Skills}',
    '\\section{Experience}',
    '\\resumeSubheading{Example}{Bavaria}{Working Student}{2025}',
    'Built TypeScript services.',
    'Wrote internal documentation.',
  ]) {
    assert.ok(cvTex.includes(unchanged));
  }
});

void test('uses the uploaded cover-letter document as the authoritative template', () => {
  const coverLetterTemplate = String.raw`\documentclass[a4paper,11pt]{article}
\usepackage{geometry}
\begin{document}
% Sender
{\Large\textbf{Candidate Name}}

Candidate address\\
Candidate city

\vspace{0.8cm}
% Recipient
\textbf{Old Company}\\
Old Team\\
Old Street\\
Old City

\vspace{0.5cm}
\begin{flushright}
Candidate City, \today
\end{flushright}
\vspace{0.8cm}

{\large\textbf{Old position}}

\vspace{0.5cm}

Old salutation,

Old body paragraph one.

Old body paragraph two.

\vspace{0.2cm}
Old closing

\vspace{0.1cm}
\textbf{Candidate Name}

\end{document}`;

  const { coverLetterTex } = renderTailoredDocuments({
    masterTemplate: String.raw`\documentclass{article}
\begin{document}
\section{Skills}
\end{document}`,
    coverLetterTemplate,
    facts,
    plan,
    job: {
      title: 'Working Student Software Engineer',
      company: 'Example GmbH',
      description: 'TypeScript and Docker',
      locationText: 'Munich, Bavaria, Germany',
    },
  });

  for (const preserved of [
    '\\documentclass[a4paper,11pt]{article}',
    '\\usepackage{geometry}',
    '{\\Large\\textbf{Candidate Name}}',
    'Candidate address\\\\',
    'Candidate City, \\today',
    '\\vspace{0.8cm}',
    '\\vspace{0.5cm}',
    '\\vspace{0.2cm}',
    '\\vspace{0.1cm}',
  ]) {
    assert.ok(coverLetterTex.includes(preserved));
  }
  for (const tailored of [
    '\\textbf{Example GmbH}\\\\',
    'Recruiting-Team\\\\',
    'Munich\\\\',
    'Bavaria\\\\',
    'Germany',
    plan.coverLetter.subject,
    plan.coverLetter.salutation,
    ...plan.coverLetter.paragraphs.map((paragraph) => paragraph.text),
    plan.coverLetter.closing,
  ]) {
    assert.ok(coverLetterTex.includes(tailored));
  }
  assert.ok(
    coverLetterTex.includes(`{\\large\\textbf{${plan.coverLetter.subject}}}`),
  );
  assert.match(
    coverLetterTex,
    /\\vspace\{0\.5cm\}\s+Sehr geehrtes Example-Team,/,
  );
  for (const removed of [
    'Old Company',
    'Old Team',
    'Old Street',
    'Old City',
    'Old position',
    'Old salutation',
    'Old body paragraph',
    'Old closing',
  ]) {
    assert.ok(!coverLetterTex.includes(removed));
  }
});
