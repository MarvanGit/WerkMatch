import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ownsAsset, validateTex } from '../lib/domain/onboarding.ts';
import { renderTailoredDocuments } from '../lib/documents/render.ts';

void test('assets must belong to the requesting user without path traversal', () => {
  assert.equal(ownsAsset('alice', 'alice/cv.tex'), true);
  for (const key of [
    'bob/cv.tex',
    'alice-other/cv.tex',
    'alice/../bob/cv.tex',
    'alice/\\bob.tex',
    'alice//cv.tex',
  ])
    assert.equal(ownsAsset('alice', key), false);
});
void test('LaTeX upload rejects incomplete and oversized sources', () => {
  assert.throws(() => validateTex('plain text'));
  assert.throws(() =>
    validateTex('\\begin{document}' + 'x'.repeat(200001) + '\\end{document}'),
  );
});
void test('downloadable starter supports recipient, subject, body and signature rendering', () => {
  const template = readFileSync(
    new URL('../public/templates/cover-letter.tex', import.meta.url),
    'utf8',
  );
  const output = renderTailoredDocuments({
    masterTemplate:
      '\\documentclass{article}\\begin{document}CV\\end{document}',
    coverLetterTemplate: template,
    facts: [],
    job: {
      title: 'Working Student',
      company: 'Fictional Team',
      description: 'A software position.',
      locationText: 'Munich',
    },
    plan: {
      documentLanguage: 'de',
      factPriorityIds: [],
      coverLetter: {
        subject: 'Bewerbung als Working Student',
        salutation: 'Sehr geehrtes Team,',
        paragraphs: [
          { text: 'Eine individuelle Bewerbung.', evidenceFactIds: [] },
          { text: 'Meine bestätigten Fähigkeiten.', evidenceFactIds: [] },
          { text: 'Ich freue mich auf ein Gespräch.', evidenceFactIds: [] },
        ],
        closing: 'Mit freundlichen Grüßen',
      },
    },
  });
  assert.match(output.coverLetterTex, /Fictional Team/);
  assert.match(output.coverLetterTex, /Eine individuelle Bewerbung/);
  assert.doesNotMatch(output.coverLetterTex, /Example Company/);
  assert.match(output.coverLetterTex, /Your name/);
});
