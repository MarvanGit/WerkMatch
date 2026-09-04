import type { CandidateFactForDocuments } from '../ai/documents.ts';
import type { TailoringPlanOutput } from '../domain/contracts.ts';

type Language = 'de' | 'en';

type JobForDocuments = {
  title: string;
  company: string;
  description?: string;
  locationText?: string;
};

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
  job?: JobForDocuments;
  facts: CandidateFactForDocuments[];
  plan: TailoringPlanOutput;
}) {
  assertAllFactsPreserved(input.facts, input.plan);
  const reorderedCv = reorderCvDetails(input.masterTemplate, input.job);
  assertSameCharacters(input.masterTemplate, reorderedCv);
  const cvTex = prepareLatexForTectonic(reorderedCv);
  const coverLetterTex = prepareLatexForTectonic(
    renderCoverLetter(
      input.coverLetterTemplate ?? extractTemplateHeader(input.masterTemplate),
      input.plan,
      input.plan.documentLanguage,
      input.job,
      Boolean(input.coverLetterTemplate),
    ),
  );

  return { cvTex, coverLetterTex };
}

export function prepareLatexForTectonic(source: string): string {
  const driverOptions = new Set([
    'pdftex',
    'dvips',
    'dvipdfm',
    'dvipdfmx',
    'xetex',
    'luatex',
  ]);

  return source
    .replace(
      /\\usepackage\s*\[([^\]]+)\]\s*\{([^{}]+)\}/g,
      (declaration, options: string, packages: string) => {
        const retainedOptions = options
          .split(',')
          .map((option) => option.trim())
          .filter((option) => !driverOptions.has(option.toLowerCase()));
        if (retainedOptions.length === options.split(',').length) {
          return declaration;
        }
        return retainedOptions.length
          ? `\\usepackage[${retainedOptions.join(',')}]{${packages}}`
          : `\\usepackage{${packages}}`;
      },
    )
    .replace(
      /\\PassOptionsToPackage\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
      (declaration, options: string, packages: string) => {
        const retainedOptions = options
          .split(',')
          .map((option) => option.trim())
          .filter((option) => !driverOptions.has(option.toLowerCase()));
        if (retainedOptions.length === options.split(',').length) {
          return declaration;
        }
        return retainedOptions.length
          ? `\\PassOptionsToPackage{${retainedOptions.join(',')}}{${packages}}`
          : '';
      },
    );
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

function reorderCvDetails(
  template: string,
  job: JobForDocuments | undefined,
): string {
  if (!job) return template;
  const jobText = searchableText(`${job.title}\n${job.description ?? ''}`);
  if (!jobText) return template;
  return reorderBulletPoints(
    reorderSkillTechnologies(template, jobText),
    jobText,
  );
}

function reorderSkillTechnologies(template: string, jobText: string): string {
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

  let output = template;

  for (let index = skillSections.length - 1; index >= 0; index -= 1) {
    const { section, index: sectionIndex } = skillSections[index];
    const sectionStart = (section.index ?? 0) + section[0].length;
    const sectionEnd =
      sectionIndex + 1 < sections.length
        ? (sections[sectionIndex + 1].index ?? endDocumentIndex)
        : endDocumentIndex;
    const body = template.slice(sectionStart, sectionEnd);
    const reorderedBody = reorderTechnologyLists(body, jobText);
    if (reorderedBody !== body) {
      output =
        output.slice(0, sectionStart) +
        reorderedBody +
        output.slice(sectionEnd);
    }
  }
  return output;
}

type CvItem = {
  start: number;
  end: number;
  source: string;
  originalIndex: number;
  relevance: number;
};

function reorderTechnologyLists(body: string, jobText: string): string {
  const matches = [...body.matchAll(/\\resumeSubItem\b/g)];
  let output = body;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const start = matches[index].index ?? 0;
    const command = readCvItem(body, start, 'resumeSubItem');
    if (!command) continue;
    const technologies = body.slice(
      command.arguments[1].contentStart,
      command.arguments[1].contentEnd,
    );
    const reordered = reorderCommaSeparatedValues(technologies, jobText);
    if (reordered === technologies) continue;
    output = replaceRange(
      output,
      command.arguments[1].contentStart,
      command.arguments[1].contentEnd,
      reordered,
    );
  }
  return output;
}

function reorderCommaSeparatedValues(value: string, jobText: string): string {
  const { items, separators } = splitTopLevelCommaList(value);
  if (items.length < 2) return value;
  const ranked = items.map((source, originalIndex) => ({
    source,
    originalIndex,
    relevance: relevanceScore(source, jobText),
  }));
  if (ranked.every((item) => item.relevance === 0)) return value;
  const ordered = [...ranked].sort(
    (left, right) =>
      right.relevance - left.relevance ||
      left.originalIndex - right.originalIndex,
  );
  if (ordered.every((item, index) => item === ranked[index])) return value;
  return ordered
    .map((item, index) => item.source + (separators[index] ?? ''))
    .join('');
}

function splitTopLevelCommaList(value: string): {
  items: string[];
  separators: string[];
} {
  const items: string[] = [];
  const separators: string[] = [];
  let braceDepth = 0;
  let itemStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '{' && value[index - 1] !== '\\') braceDepth += 1;
    if (value[index] === '}' && value[index - 1] !== '\\') braceDepth -= 1;
    if (value[index] !== ',' || braceDepth !== 0) continue;
    items.push(value.slice(itemStart, index));
    let separatorEnd = index + 1;
    while (/\s/.test(value[separatorEnd] ?? '')) separatorEnd += 1;
    separators.push(value.slice(index, separatorEnd));
    itemStart = separatorEnd;
    index = separatorEnd - 1;
  }
  items.push(value.slice(itemStart));
  return { items, separators };
}

function reorderBulletPoints(template: string, jobText: string): string {
  const listStart = '\\resumeItemListStart';
  const listEnd = '\\resumeItemListEnd';
  let cursor = 0;
  let output = '';
  while (cursor < template.length) {
    const start = template.indexOf(listStart, cursor);
    if (start < 0) return output + template.slice(cursor);
    const bodyStart = start + listStart.length;
    const end = template.indexOf(listEnd, bodyStart);
    if (end < 0) return output + template.slice(cursor);
    output += template.slice(cursor, bodyStart);
    output += reorderCvItems(template.slice(bodyStart, end), jobText);
    output += listEnd;
    cursor = end + listEnd.length;
  }
  return output;
}

function reorderCvItems(body: string, jobText: string): string {
  const items: CvItem[] = [];
  for (const match of body.matchAll(/\\resumeItem\b/g)) {
    const start = match.index ?? 0;
    const end = readCvItemEnd(body, start, 'resumeItem');
    if (end === null) continue;
    const source = body.slice(start, end);
    items.push({
      start,
      end,
      source,
      originalIndex: items.length,
      relevance: relevanceScore(source, jobText),
    });
  }

  if (items.length < 2 || items.every((item) => item.relevance === 0)) {
    return body;
  }

  const ordered = [...items].sort(
    (left, right) =>
      right.relevance - left.relevance ||
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

function readCvItemEnd(
  source: string,
  start: number,
  commandName: 'resumeItem' | 'resumeSubItem',
): number | null {
  return readCvItem(source, start, commandName)?.end ?? null;
}

function readCvItem(
  source: string,
  start: number,
  commandName: 'resumeItem' | 'resumeSubItem',
): {
  end: number;
  arguments: Array<{ contentStart: number; contentEnd: number }>;
} | null {
  const command = new RegExp(`\\\\${commandName}\\b`).exec(
    source.slice(start),
  )?.[0];
  if (!command) return null;
  let cursor = start + command.length;
  const commandArguments: Array<{
    contentStart: number;
    contentEnd: number;
  }> = [];
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
    commandArguments.push({
      contentStart: cursor + 1,
      contentEnd: argumentEnd - 1,
    });
    cursor = argumentEnd;
    cursor = skipWhitespace(source, cursor);
  }
  return { end: cursor, arguments: commandArguments };
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
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const relevanceStopWords = new Set([
  'and',
  'the',
  'with',
  'for',
  'from',
  'und',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'mit',
  'von',
  'zur',
  'zum',
  'sowie',
  'durch',
  'bei',
  'eine',
  'einer',
  'einem',
]);

function relevanceScore(value: string, jobText: string): number {
  const normalized = searchableText(value);
  if (!normalized) return 0;
  const jobTokens = new Set(jobText.split(' '));
  const tokens = [
    ...new Set(
      normalized
        .split(' ')
        .filter((token) => token.length >= 3 && !relevanceStopWords.has(token)),
    ),
  ];
  const overlap = tokens.reduce(
    (score, token) => score + (jobTokens.has(token) ? 1 : 0),
    0,
  );
  return (
    overlap + (normalized.length >= 4 && jobText.includes(normalized) ? 8 : 0)
  );
}

function assertSameCharacters(before: string, after: string) {
  const sortedCharacters = (value: string) => value.split('').sort().join('');
  if (sortedCharacters(before) !== sortedCharacters(after)) {
    throw new Error(
      'CV tailoring may only reorder existing technologies and bullet points.',
    );
  }
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
  job: JobForDocuments | undefined,
  isCoverLetterTemplate: boolean,
): string {
  if (isCoverLetterTemplate) {
    return renderCoverLetterTemplate(template, plan, language, job);
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
  const subject = coverLetterSubject(plan, language, job);
  return `${template.trimEnd()}

\\begin{flushright}
${escapeLatex(dateLabel)}
\\end{flushright}

\\vspace{8pt}
\\textbf{${escapeLatex(subject)}}

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
  language: Language,
  job: JobForDocuments | undefined,
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
  if (job) body = replaceRecipient(body, job, language);

  let subject = findSubjectArgument(body);
  if (!subject) {
    throw new Error('The cover-letter template has no subject placeholder.');
  }
  body = replaceRange(
    body,
    subject.contentStart,
    subject.contentEnd,
    escapeLatex(coverLetterSubject(plan, language, job)),
  );

  subject = findSubjectArgument(body);
  const salutationStart = subject
    ? findFirstPlainTextLineStart(body, subject.end)
    : -1;
  const signature = findLastTextbfArgument(body);
  const spacing =
    salutationStart >= 0 && signature
      ? findVspaceCommands(body, salutationStart, signature.start)
      : [];
  if (salutationStart < 0 || !signature || spacing.length < 2) {
    throw new Error('The cover-letter template has no recognizable body.');
  }

  const closingGap = spacing.at(-2);
  const signatureGap = spacing.at(-1);
  if (!closingGap || !signatureGap) {
    throw new Error('The cover-letter template has no recognizable closing.');
  }
  const closingStart = findFirstPlainTextLineStart(body, closingGap.end);
  const closingEnd =
    closingStart < 0 ? -1 : findLineEnd(body, closingStart, signatureGap.start);
  if (closingStart < 0 || closingEnd < 0) {
    throw new Error('The cover-letter template has no recognizable closing.');
  }

  body = replaceRange(
    body,
    closingStart,
    closingEnd,
    escapeLatex(plan.coverLetter.closing),
  );

  const lineEnding = detectLineEnding(template);
  const paragraphs = plan.coverLetter.paragraphs
    .map((paragraph) => escapeLatex(paragraph.text))
    .join(`${lineEnding}${lineEnding}`);
  const replacement = `${escapeLatex(plan.coverLetter.salutation)}${lineEnding}${lineEnding}${paragraphs}${lineEnding}${lineEnding}`;
  body = replaceRange(body, salutationStart, closingGap.start, replacement);

  return `${template.slice(0, beginDocument + '\\begin{document}'.length)}${body}${template.slice(endDocument)}`;
}

function coverLetterSubject(
  plan: TailoringPlanOutput,
  language: Language,
  job: JobForDocuments | undefined,
): string {
  if (!job) return plan.coverLetter.subject;
  return language === 'de'
    ? `Bewerbung als ${job.title}`
    : `Application for ${job.title}`;
}

function replaceRecipient(
  body: string,
  job: JobForDocuments,
  language: Language,
): string {
  const marker = /^[ \t]*%\s*(?:empfänger|empfaenger|recipient)\s*$/imu.exec(
    body,
  );
  if (!marker || marker.index === undefined) return body;
  const contentStart = skipLineBreak(body, marker.index + marker[0].length);
  const end = findVspaceCommands(body, contentStart, body.length)[0]?.start;
  if (end === undefined) return body;
  const lineEnding = detectLineEnding(body);
  const addressLines = (job.locationText ?? '')
    .split(/\s*,\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
  const recipientLines = [
    `\\textbf{${escapeLatex(job.company)}}`,
    language === 'de' ? 'Recruiting-Team' : 'Recruiting Team',
    ...addressLines.map(escapeLatex),
  ];
  const replacement = `${recipientLines
    .map((line, index) =>
      index < recipientLines.length - 1 ? `${line}\\\\` : line,
    )
    .join(lineEnding)}${lineEnding}${lineEnding}`;
  return replaceRange(body, contentStart, end, replacement);
}

function findSubjectArgument(body: string): {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
} | null {
  const subjectCommand = /\\large\s*\\textbf\s*/g.exec(body);
  if (!subjectCommand || subjectCommand.index === undefined) return null;
  const openingBrace = body.indexOf(
    '{',
    subjectCommand.index + subjectCommand[0].length,
  );
  if (openingBrace < 0) return null;
  const end = readBalanced(body, openingBrace, '{', '}');
  if (end === null) return null;
  return {
    start: subjectCommand.index,
    end,
    contentStart: openingBrace + 1,
    contentEnd: end - 1,
  };
}

function findLastTextbfArgument(body: string): {
  start: number;
  end: number;
} | null {
  const matches = [...body.matchAll(/\\textbf\s*\{/g)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) return null;
  const openingBrace = body.indexOf('{', last.index + last[0].length - 1);
  const end = readBalanced(body, openingBrace, '{', '}');
  return end === null ? null : { start: last.index, end };
}

function findVspaceCommands(
  body: string,
  from: number,
  to: number,
): Array<{ start: number; end: number }> {
  const matches = body.slice(from, to).matchAll(/\\vspace\*?\s*\{[^{}]+\}/g);
  return [...matches].map((match) => ({
    start: from + (match.index ?? 0),
    end: from + (match.index ?? 0) + match[0].length,
  }));
}

function skipLineBreak(source: string, start: number): number {
  if (source.slice(start, start + 2) === '\r\n') return start + 2;
  if (source[start] === '\n' || source[start] === '\r') return start + 1;
  return start;
}

function findLineEnd(source: string, start: number, limit: number): number {
  const lineFeed = source.indexOf('\n', start);
  const end = lineFeed < 0 ? limit : Math.min(lineFeed, limit);
  return end > start && source[end - 1] === '\r' ? end - 1 : end;
}

function detectLineEnding(source: string): '\r\n' | '\n' {
  return source.includes('\r\n') ? '\r\n' : '\n';
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
      !trimmed.startsWith('{') &&
      !trimmed.startsWith('}')
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
  const normalized = value
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–−]/g, '--')
    .replace(/—/g, '---')
    .replace(/[‐‑]/g, '-')
    .replace(/\u00a0/g, ' ');
  return normalized.replace(
    /[\\{}$&#%_~^]/g,
    (character) => replacements[character],
  );
}
