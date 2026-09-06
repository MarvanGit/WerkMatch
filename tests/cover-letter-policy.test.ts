import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleRequiredContent,
  coverLetterRequirements,
  documentPromptVersion,
  reusableTailoringPlan,
  validateCoverLetterPlan,
} from '../lib/documents/cover-letter-policy.ts';
import { createTailoringPlan } from '../lib/ai/documents.ts';
import type { TailoringPlanOutput } from '../lib/domain/contracts.ts';

const facts = [
  {
    fact_key: 'education.fau',
    category: 'education',
    title: 'FAU',
    summary: 'Verified study and availability',
    details: {
      cover_letter_study_de:
        'Ich studiere im 3. Semester Artificial Intelligence an der FAU.',
      cover_letter_availability_de:
        'Ich bin für 20 Stunden pro Woche verfügbar und verfüge über die erforderliche Arbeitserlaubnis.',
    },
    tags: [],
    order_index: 0,
  },
  {
    fact_key: 'skills.backend',
    category: 'skills',
    title: 'Backend',
    summary: 'Python and PostgreSQL',
    details: { items: ['Python', 'PostgreSQL'] },
    tags: [],
    order_index: 1,
  },
  {
    fact_key: 'experience.example',
    category: 'experience',
    title: 'Example Labs',
    summary: 'Backend development and testing',
    details: { organization: 'Example Labs' },
    tags: [],
    order_index: 2,
  },
];
const job = {
  title: 'Working Student Backend',
  description:
    'Develop Python services and PostgreSQL databases. Improve automated tests and document software defects.',
  company: 'Example',
  locationText: 'Munich',
  workMode: 'hybrid',
};
function draft(): TailoringPlanOutput {
  return {
    documentLanguage: 'de',
    factPriorityIds: facts.map((f) => f.fact_key),
    jobAlignment: [
      {
        requirementQuote: 'Develop Python services and PostgreSQL databases.',
        paragraphIndex: 1,
        evidenceFactIds: ['skills.backend'],
      },
      {
        requirementQuote:
          'Improve automated tests and document software defects.',
        paragraphIndex: 2,
        evidenceFactIds: ['experience.example'],
      },
    ],
    coverLetter: {
      subject: 'Bewerbung als Working Student Backend',
      salutation: 'Sehr geehrte Damen und Herren,',
      closing: 'Mit freundlichen Grüßen',
      paragraphs: [
        {
          text: 'Ihre Backend-Aufgaben passen zu meinem Interesse an zuverlässigen Softwarelösungen.',
          evidenceFactIds: ['skills.backend'],
        },
        {
          text: 'Mit Python und PostgreSQL kann ich die Entwicklung Ihrer Backend-Dienste unterstützen. Dabei lege ich Wert auf nachvollziehbare Datenmodelle, verständliche Schnittstellen und sorgfältige Tests. Diese Kenntnisse möchte ich gezielt für die in Ihrer Ausschreibung beschriebenen Aufgaben einsetzen und in der Zusammenarbeit mit Ihrem Team weiter vertiefen.',
          evidenceFactIds: ['skills.backend'],
        },
        {
          text: 'Bei Example Labs habe ich praktische Erfahrung in der Backend-Entwicklung und beim Testen gesammelt. Zu meinen Aufgaben gehörte es, Fehler nachvollziehbar zu untersuchen und die Ergebnisse klar zu dokumentieren. Dieses systematische Vorgehen möchte ich für Ihre automatisierten Tests einsetzen und damit zu gut überprüfbaren Softwareänderungen im Team beitragen.',
          evidenceFactIds: ['experience.example'],
        },
        {
          text: 'Ich freue mich darauf, meine Motivation und meine Erfahrungen in einem persönlichen Gespräch zu erläutern.',
          evidenceFactIds: ['education.fau'],
        },
      ],
    },
  };
}
void test('every assembled letter includes verified study and availability exactly once', () => {
  const plan = assembleRequiredContent(draft(), facts);
  validateCoverLetterPlan(plan, facts, job);
  assert.deepEqual(assembleRequiredContent(plan, facts), plan);
  assert.ok(plan.coverLetter.paragraphs[0].text.includes('3. Semester'));
  assert.ok(plan.coverLetter.paragraphs[3].text.includes('20 Stunden'));
});
void test('missing profile availability fails before any generation', () => {
  assert.throws(
    () =>
      coverLetterRequirements(facts.filter((f) => f.category !== 'education')),
    /Confirm your current study semester and availability/,
  );
});
void test('letters missing technical skills or professional experience are rejected', () => {
  for (const index of [1, 2]) {
    const plan = assembleRequiredContent(draft(), facts);
    plan.coverLetter.paragraphs[index].text =
      'Ich arbeite gerne in Ihrem Team. '.repeat(12);
    assert.throws(
      () => validateCoverLetterPlan(plan, facts, job),
      index === 1 ? /technical-skills/ : /experience paragraph/,
    );
  }
});
void test('invented job requirements and unverified evidence cannot pass validation', () => {
  const plan = assembleRequiredContent(draft(), facts);
  plan.jobAlignment![0].requirementQuote =
    'Invented requirement unrelated to this job';
  assert.throws(
    () => validateCoverLetterPlan(plan, facts, job),
    /exact requirement/,
  );
  plan.jobAlignment![0].evidenceFactIds = ['invented.fact'];
  assert.throws(() => validateCoverLetterPlan(plan, facts, job), /unverified/);
});
void test('old or now-inconsistent stored plans are regenerated', () => {
  const plan = assembleRequiredContent(draft(), facts);
  assert.equal(reusableTailoringPlan(plan, 'documents-v6', facts, job), null);
  assert.deepEqual(
    reusableTailoringPlan(plan, documentPromptVersion, facts, job),
    plan,
  );
  const updated = structuredClone(facts);
  updated[0].details.cover_letter_availability_de =
    'Neue bestätigte Verfügbarkeit.';
  assert.equal(
    reusableTailoringPlan(plan, documentPromptVersion, updated, job),
    null,
  );
});
void test('generation repairs missing sections once using the same OpenCode conversation', async (t) => {
  const previous = process.env.OPENCODE_GO_API_KEY;
  process.env.OPENCODE_GO_API_KEY = 'test';
  t.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'OPENCODE_GO_API_KEY');
    else process.env.OPENCODE_GO_API_KEY = previous;
  });
  const sessions: string[] = [];
  let calls = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async (_input: unknown, init: RequestInit) => {
      sessions.push(new Headers(init.headers).get('x-opencode-session')!);
      const response = draft();
      if (calls++ === 0) response.coverLetter.paragraphs[1].text = 'Too short.';
      return Response.json({
        output: [
          {
            content: [{ type: 'output_text', text: JSON.stringify(response) }],
          },
        ],
      });
    },
  );
  const { plan } = await createTailoringPlan({
    job,
    facts,
    matchSummary: null,
    matchReasons: [],
  });
  assert.equal(calls, 2);
  assert.equal(sessions[0], sessions[1]);
  validateCoverLetterPlan(plan, facts, job);
});
