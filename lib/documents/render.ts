import type { CandidateFactForDocuments } from '../ai/documents.ts';
import type { TailoringPlanOutput } from '../domain/contracts.ts';

type Language = 'de' | 'en';

const skillSectionLabels = new Set([
  'fähigkeiten',
  'skills',
  'technical skills',
  'skills & technologies',
  'technologies',
  'technical competencies',
]);

export function renderTailoredDocuments(input: {
  masterTemplate: string;
  coverLetterTemplate?: string;
  job?: { title: string; company: string };
  facts: CandidateFactForDocuments[];
  plan: TailoringPlanOutput;
}) {
  assertAllFactsPreserved(input.facts, input.plan);
  const cvTex = reorderSkillItems(
    input.masterTemplate,
    input.facts,
    input.plan.factPriorityIds,
  );
  const coverLetterTex = renderCoverLetter(
    input.coverLetterTemplate ?? extractTemplateHeader(input.masterTemplate),
    input.plan,
    input.plan.documentLanguage,
    input.job,
    Boolean(input.coverLetterTemplate),
  );

  return { cvTex, coverLetterTex };
}

function extractTemplateHeader(template: string): string {
  const endDocumentIndex = template.lastIndexOf('\\end{document}');
  if (endDocumentIndex < 0) {
    throw new Error('The LaTeX template has no \\end{document} marker.');
  }
  const firstSection = /\\section\*?\{[^{}]+\}/.exec(
    template.slice(0, endDocumentIndex),
  );
  return template.slice(0, firstSection?.index ?? endDocumentIndex);
}

function reorderSkillItems(
  template: string,
  facts: CandidateFactForDocuments[],
  priorityIds: string[],
): string {
  const endDocumentIndex = template.lastIndexOf('\\end{document}');
  if (endDocumentIndex < 0) {
    throw new Error('The LaTeX template has no \\end{document} marker.');
  }

  const sections = [
    ...template
      .slice(0, endDocumentIndex)
      .matchAll(/\\section\*?\{([^{}]+)\}/g),
  ];
  const skillSections = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => isSkillSection(section[1]));
  if (!skillSections.length) return template;

  const factRank = new Map(priorityIds.map((factId, index) => [factId, index]));
  const factTerms = facts.map((fact) => ({
    rank: factRank.get(fact.fact_key) ?? priorityIds.length,
    terms: [fact.title, ...fact.tags]
      .map(searchableText)
      .filter((term) => term.length > 1),
  }));
  let output = template;

  for (let index = skillSections.length - 1; index >= 0; index -= 1) {
    const { section, index: sectionIndex } = skillSections[index];
    const sectionStart = (section.index ?? 0) + section[0].length;
    const sectionEnd =
      sectionIndex + 1 < sections.length
        ? (sections[sectionIndex + 1].index ?? endDocumentIndex)
        : endDocumentIndex;
    const body = template.slice(sectionStart, sectionEnd);
    const reorderedBody = reorderCvItems(body, factTerms);
    if (reorderedBody !== body) {
      output =
        output.slice(0, sectionStart) +
        reorderedBody +
        output.slice(sectionEnd);
    }
  }
  return output;
}

type FactTerms = { rank: number; terms: string[] };

type CvItem = {
  start: number;
  end: number;
  source: string;
  originalIndex: number;
  rank: number;
};

function reorderCvItems(body: string, factTerms: FactTerms[]): string {
  const items: CvItem[] = [];
  for (const match of body.matchAll(/\\(?:cvitem|resumeSubItem)\b/g)) {
    const start = match.index ?? 0;
    const end = readCvItemEnd(body, start);
    if (end === null) continue;
    const source = body.slice(start, end);
    const rank = factTerms.reduce((best, fact) => {
      if (fact.terms.some((term) => searchableText(source).includes(term))) {
        return Math.min(best, fact.rank);
      }
      return best;
    }, Number.POSITIVE_INFINITY);
    items.push({
      start,
      end,
      source,
      originalIndex: items.length,
      rank,
    });
  }

  if (items.length < 2 || items.every((item) => !Number.isFinite(item.rank))) {
    return body;
  }

  const ordered = [...items].sort(
    (left, right) =>
      (Number.isFinite(left.rank) ? left.rank : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(right.rank) ? right.rank : Number.MAX_SAFE_INTEGER) ||
      left.originalIndex - right.originalIndex,
  );
  if (ordered.every((item, index) => item === items[index])) return body;

  let output = body.slice(0, items[0].start);
  for (let index = 0; index < ordered.length; index += 1) {
    output += ordered[index].source;
    const gapEnd = items[index + 1]?.start ?? body.length;
    output += body.slice(items[index].end, gapEnd);
  }
  return output;
}

function readCvItemEnd(source: string, start: number): number | null {
  const command = /\\(?:cvitem|resumeSubItem)\b/.exec(source.slice(start))?.[0];
  if (!command) return null;
  let cursor = start + command.length;
  cursor = skipWhitespace(source, cursor);
  if (source[cursor] === '[') {
    const optionalEnd = readBalanced(source, cursor, '[', ']');
    if (optionalEnd === null) return null;
    cursor = optionalEnd;
    cursor = skipWhitespace(source, cursor);
  }

  for (let argument = 0; argument < 2; argument += 1) {
    if (source[cursor] !== '{') return null;
    const argumentEnd = readBalanced(source, cursor, '{', '}');
    if (argumentEnd === null) return null;
    cursor = argumentEnd;
    cursor = skipWhitespace(source, cursor);
  }
  return cursor;
}

function readBalanced(
  source: string,
  start: number,
  opening: string,
  closing: string,
): number | null {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? '')) cursor += 1;
  return cursor;
}

function isSkillSection(label: string): boolean {
  return skillSectionLabels.has(
    label
      .replace(/\\&/g, '&')
      .replace(/~/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('de-DE'),
  );
}

function searchableText(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertAllFactsPreserved(
  facts: CandidateFactForDocuments[],
  plan: TailoringPlanOutput,
) {
  const priorityIds = new Set(plan.factPriorityIds);
  if (
    priorityIds.size !== facts.length ||
    facts.some((fact) => !priorityIds.has(fact.fact_key))
  ) {
    throw new Error('The tailoring plan must include every verified fact.');
  }
}

function renderCoverLetter(
  template: string,
  plan: TailoringPlanOutput,
  language: Language,
  job: { title: string; company: string } | undefined,
  isCoverLetterTemplate: boolean,
): string {
  if (isCoverLetterTemplate) {
    return renderCoverLetterTemplate(template, plan, job);
  }

  const dateLabel = new Intl.DateTimeFormat(
    language === 'de' ? 'de-DE' : 'en-GB',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Berlin',
    },
  ).format(new Date());
  const paragraphs = plan.coverLetter.paragraphs
    .map((paragraph) => escapeLatex(paragraph.text))
    .join('\n\n');
  return `${template.trimEnd()}

\\begin{flushright}
${escapeLatex(dateLabel)}
\\end{flushright}

\\vspace{8pt}
\\textbf{${escapeLatex(plan.coverLetter.subject)}}

\\vspace{10pt}
${escapeLatex(plan.coverLetter.salutation)}

${paragraphs}

${escapeLatex(plan.coverLetter.closing)}

\\end{document}
`;
}

function renderCoverLetterTemplate(
  template: string,
  plan: TailoringPlanOutput,
  job: { title: string; company: string } | undefined,
): string {
  const beginDocument = template.indexOf('\\begin{document}');
  const endDocument = template.lastIndexOf('\\end{document}');
  if (beginDocument < 0 || endDocument < beginDocument) {
    throw new Error(
      'The cover-letter template is not a complete LaTeX document.',
    );
  }

  let body = template.slice(
    beginDocument + '\\begin{document}'.length,
    endDocument,
  );
  if (job) body = replaceRecipient(body, job.company);

  const subjectPattern = /\{\\large\\textbf\{([^{}]*)\}\}/;
  const subjectMatch = subjectPattern.exec(body);
  if (!subjectMatch || subjectMatch.index === undefined) {
    throw new Error('The cover-letter template has no subject placeholder.');
  }
  body = replaceRange(
    body,
    subjectMatch.index + subjectMatch[0].indexOf(subjectMatch[1]),
    subjectMatch.index +
      subjectMatch[0].indexOf(subjectMatch[1]) +
      subjectMatch[1].length,
    escapeLatex(plan.coverLetter.subject),
  );

  const refreshedSubject = subjectPattern.exec(body);
  const subjectEnd = refreshedSubject
    ? (refreshedSubject.index ?? 0) + refreshedSubject[0].length
    : subjectMatch.index + subjectMatch[0].length;
  const salutationStart = findFirstPlainTextLineStart(body, subjectEnd);
  const bodyEnd = body.indexOf('\\vspace{0.2cm}', salutationStart);
  if (salutationStart < 0 || bodyEnd < 0) {
    throw new Error('The cover-letter template has no recognizable body.');
  }

  const salutationText = plan.coverLetter.salutation;
  const paragraphs = plan.coverLetter.paragraphs
    .map((paragraph) => escapeLatex(paragraph.text))
    .join('\n\n');
  const replacement = `${escapeLatex(salutationText)}\n\n${paragraphs}\n\n`;
  body = replaceRange(body, salutationStart, bodyEnd, replacement);

  return `${template.slice(0, beginDocument + '\\begin{document}'.length)}${body}${template.slice(endDocument)}`;
}

function replaceRecipient(body: string, company: string): string {
  const marker = body.indexOf('% Empfänger');
  const end = marker < 0 ? -1 : body.indexOf('\\vspace{0.5cm}', marker);
  if (marker < 0 || end < 0) return body;
  const prefix = body.slice(marker, marker + '% Empfänger'.length);
  return `${body.slice(0, marker)}${prefix}\n\\textbf{${escapeLatex(company)}}\\\\\nRecruiting-Team\n\n${body.slice(end)}`;
}

function findFirstPlainTextLineStart(body: string, from: number): number {
  const lines = body.slice(from).split(/\r?\n/);
  let offset = from;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith('%') &&
      !trimmed.startsWith('\\') &&
      !trimmed.startsWith('{')
    ) {
      return offset + line.indexOf(trimmed);
    }
    offset += line.length + 1;
  }
  return -1;
}

function replaceRange(
  source: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

export function escapeLatex(value: string): string {
  const replacements: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    '%': '\\%',
    _: '\\_',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return value.replace(
    /[\\{}$&#%_~^]/g,
    (character) => replacements[character],
  );
}
