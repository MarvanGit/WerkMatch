import type { CandidateFactForDocuments } from '../ai/documents.ts';
import {
  tailoringPlanOutputSchema,
  type TailoringPlanOutput,
} from '../domain/contracts.ts';

export const documentPromptVersion =
  'documents-v7-required-cover-letter-content';

export function coverLetterRequirements(facts: CandidateFactForDocuments[]) {
  const study = facts.find(
    (fact) =>
      fact.category === 'education' &&
      typeof fact.details.cover_letter_study_de === 'string',
  );
  const availability = facts.find(
    (fact) => typeof fact.details.cover_letter_availability_de === 'string',
  );
  if (!study || !availability)
    throw new Error(
      'Confirm your current study semester and availability in your candidate profile before generating a cover letter.',
    );
  const studyText = String(study.details.cover_letter_study_de).trim();
  const availabilityText = String(
    availability.details.cover_letter_availability_de,
  ).trim();
  if (!studyText || !availabilityText)
    throw new Error(
      'Cover-letter study status and availability must not be empty.',
    );
  return {
    study: { text: studyText, factId: study.fact_key },
    availability: { text: availabilityText, factId: availability.fact_key },
  };
}

// These user-confirmed sentences are assembled by the application, not left to
// a model's choice of facts. The remaining prose must be specific to the job.
export function assembleRequiredContent(
  plan: TailoringPlanOutput,
  facts: CandidateFactForDocuments[],
) {
  const required = coverLetterRequirements(facts);
  const result = structuredClone(plan);
  if (result.coverLetter.paragraphs.length !== 4)
    throw new Error('Cover letters must have four structured paragraphs.');
  for (const [index, requirement] of [
    [0, required.study],
    [3, required.availability],
  ] as const) {
    const paragraph = result.coverLetter.paragraphs[index];
    if (!paragraph.text.startsWith(requirement.text))
      paragraph.text = `${requirement.text} ${paragraph.text}`;
    paragraph.evidenceFactIds = [
      ...new Set([...paragraph.evidenceFactIds, requirement.factId]),
    ];
  }
  return result;
}

export function validateCoverLetterPlan(
  plan: TailoringPlanOutput,
  facts: CandidateFactForDocuments[],
  job: { title: string; description: string },
) {
  // Also validate the final assembled plan after required sentences/citations
  // have been inserted, not just the original model response.
  tailoringPlanOutputSchema.parse(plan);
  const required = coverLetterRequirements(facts);
  const paragraphs = plan.coverLetter.paragraphs;
  if (
    paragraphs.length !== 4 ||
    !paragraphs[0].text.startsWith(required.study.text) ||
    !paragraphs[3].text.startsWith(required.availability.text)
  )
    throw new Error(
      'Cover letter is missing the required study status or availability.',
    );
  const factById = new Map(facts.map((fact) => [fact.fact_key, fact]));
  const priority = new Set(plan.factPriorityIds);
  const referencedIds = [
    ...plan.factPriorityIds,
    ...paragraphs.flatMap((p) => p.evidenceFactIds),
    ...(plan.jobAlignment ?? []).flatMap((item) => item.evidenceFactIds),
  ];
  if (referencedIds.some((id) => !factById.has(id)))
    throw new Error('Cover letter references an unverified candidate fact.');
  if (
    priority.size !== facts.length ||
    plan.factPriorityIds.length !== facts.length
  )
    throw new Error(
      'The plan must preserve every verified candidate fact exactly once.',
    );
  if (
    !paragraphs[0].evidenceFactIds.includes(required.study.factId) ||
    !paragraphs[3].evidenceFactIds.includes(required.availability.factId)
  )
    throw new Error(
      'Required cover-letter statements must cite their profile facts.',
    );
  const skills = paragraphs[1].evidenceFactIds
    .map((id) => factById.get(id)!)
    .filter(
      (fact) =>
        fact.category === 'skills' && fact.fact_key !== 'skills.work-style',
    );
  const namedSkills = new Set(
    skills
      .flatMap((fact) =>
        Array.isArray(fact.details.items) ? fact.details.items : fact.tags,
      )
      .filter(
        (skill): skill is string =>
          typeof skill === 'string' && containsTerm(paragraphs[1].text, skill),
      ),
  );
  if (namedSkills.size < 2 || paragraphs[1].text.length < 300)
    throw new Error(
      'The technical-skills paragraph must explain at least two verified skills and their relevance to the role.',
    );
  const employers = paragraphs[2].evidenceFactIds
    .map((id) => factById.get(id)!)
    .filter(
      (fact) =>
        fact.category === 'experience' &&
        typeof fact.details.organization === 'string',
    );
  if (
    !employers.some((fact) =>
      containsTerm(paragraphs[2].text, String(fact.details.organization)),
    ) ||
    paragraphs[2].text.length < 300
  )
    throw new Error(
      'The experience paragraph must name a verified employer and explain concrete relevant work.',
    );
  const alignment = plan.jobAlignment ?? [];
  for (const index of [1, 2]) {
    const item = alignment.find((entry) => entry.paragraphIndex === index);
    if (
      !item ||
      item.requirementQuote.length < 15 ||
      !normalize(job.title + ' ' + job.description).includes(
        normalize(item.requirementQuote),
      )
    ) {
      throw new Error(
        'jobAlignment for paragraphIndex ' +
          index +
          ' must copy a requirementQuote verbatim from jobRequirementQuotes (an exact requirement from this job listing).',
      );
    }
    if (
      !item.evidenceFactIds.length ||
      !item.evidenceFactIds.every((id) =>
        paragraphs[index].evidenceFactIds.includes(id),
      )
    ) {
      throw new Error(
        'jobAlignment for paragraphIndex ' +
          index +
          ' must use evidenceFactIds cited in that same coverLetter.paragraphs[' +
          index +
          '].evidenceFactIds.',
      );
    }
  }
  const text = paragraphs.map((p) => p.text).join(' ');
  if (text.length > 2_700)
    throw new Error('The cover letter exceeds the one-page content budget.');
  if (
    /(?:\\[a-zA-Z]+|```|\*\*)/.test(
      [
        plan.coverLetter.subject,
        plan.coverLetter.salutation,
        text,
        plan.coverLetter.closing,
      ].join(' '),
    )
  )
    throw new Error('Cover letters must contain plain text.');
}

export function reusableTailoringPlan(
  value: unknown,
  version: string | null,
  facts: CandidateFactForDocuments[],
  job: { title: string; description: string },
): TailoringPlanOutput | null {
  if (version !== documentPromptVersion) return null;
  const parsed = tailoringPlanOutputSchema.safeParse(value);
  if (!parsed.success) return null;
  try {
    validateCoverLetterPlan(parsed.data, facts, job);
    return parsed.data;
  } catch {
    return null;
  }
}

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
function containsTerm(text: string, term: string) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
    'iu',
  ).test(text);
}

export function jobRequirementQuotes(job: {
  title: string;
  description: string;
}): string[] {
  return [
    ...new Set(
      (job.description + '\n' + job.title)
        .split(/\n+|(?<=[.!?])\s+/)
        .map((text) =>
          text
            .replace(/^[-•]\s*/, '')
            .trim()
            .slice(0, 240),
        )
        .filter((text) => text.length >= 15),
    ),
  ].slice(0, 100);
}
