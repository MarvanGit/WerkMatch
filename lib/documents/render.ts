import type { CandidateFactForDocuments } from '../ai/documents.ts';
import type { TailoringPlanOutput } from '../domain/contracts.ts';

type Language = 'de' | 'en';

const categoryBySectionLabel = new Map<string, string>([
  ['fähigkeiten', 'skills'],
  ['skills', 'skills'],
  ['berufserfahrung', 'experience'],
  ['professional experience', 'experience'],
  ['experience', 'experience'],
  ['ausbildung', 'education'],
  ['education', 'education'],
  ['projekte', 'project'],
  ['projects', 'project'],
  ['zertifikate', 'certification'],
  ['certifications', 'certification'],
  ['stipendien & auszeichnungen', 'award'],
  ['scholarships & awards', 'award'],
  ['engagement & außeruniversitäre aktivitäten', 'activity'],
  ['activities', 'activity'],
  ['sprachen', 'language'],
  ['languages', 'language'],
  ['interessen', 'interest'],
  ['interests', 'interest'],
]);

export function renderTailoredDocuments(input: {
  masterTemplate: string;
  facts: CandidateFactForDocuments[];
  plan: TailoringPlanOutput;
}) {
  const template = makeTemplateEngineNeutral(input.masterTemplate);
  assertAllFactsPreserved(input.facts, input.plan);
  const structure = splitTemplate(template);
  const cvTex = reorderSections(structure, input.plan.sectionOrder);
  const coverLetterTex = renderCoverLetter(
    structure.header.trimEnd(),
    input.plan,
    input.plan.documentLanguage,
  );

  return { cvTex, coverLetterTex };
}

function makeTemplateEngineNeutral(template: string): string {
  return template.replace(
    /\\usepackage\s*\[pdftex\]\s*\{hyperref\}/,
    '\\usepackage{hyperref}',
  );
}

type TemplateSection = {
  category: string | null;
  originalIndex: number;
  pageGroup: number;
  source: string;
};

type TemplateStructure = {
  header: string;
  sections: TemplateSection[];
  pageGroupPrefixes: Map<number, string>;
  footer: string;
};

function splitTemplate(template: string): TemplateStructure {
  const endDocumentIndex = template.lastIndexOf('\\end{document}');
  if (endDocumentIndex < 0) {
    throw new Error('The LaTeX template has no \\end{document} marker.');
  }
  const sectionMatches = [
    ...template.slice(0, endDocumentIndex).matchAll(/\\section\{([^{}]+)\}/g),
  ];
  if (!sectionMatches.length) {
    throw new Error('The LaTeX template has no section markers.');
  }

  const starts = sectionMatches.map((match) =>
    includeLeadingPageBreak(template, match.index ?? 0),
  );
  let pageGroup = 0;
  const pageGroupPrefixes = new Map<number, string>([[0, '']]);
  const sections = sectionMatches.map((match, index) => {
    const sectionIndex = match.index ?? 0;
    if (index > 0 && starts[index] < sectionIndex) {
      pageGroup += 1;
      pageGroupPrefixes.set(
        pageGroup,
        template.slice(starts[index], sectionIndex),
      );
    }
    return {
      category: categoryForLabel(match[1]),
      originalIndex: index,
      pageGroup,
      source: template.slice(
        sectionIndex,
        index + 1 < starts.length ? starts[index + 1] : endDocumentIndex,
      ),
    };
  });
  return {
    header: template.slice(0, starts[0]),
    sections,
    pageGroupPrefixes,
    footer: template.slice(endDocumentIndex),
  };
}

function includeLeadingPageBreak(template: string, sectionIndex: number) {
  const prefix = template.slice(0, sectionIndex);
  const pageBreak = /(\r?\n[ \t]*\\newpage[ \t]*\r?\n?[ \t]*)$/.exec(prefix);
  return pageBreak?.index ?? sectionIndex;
}

function categoryForLabel(label: string): string | null {
  const normalized = label
    .replace(/\\&/g, '&')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('de-DE');
  return categoryBySectionLabel.get(normalized) ?? null;
}

function reorderSections(
  structure: TemplateStructure,
  requestedOrder: string[],
) {
  const rank = new Map(
    [...new Set(requestedOrder)].map((category, index) => [category, index]),
  );
  const pageGroups = [
    ...new Set(structure.sections.map((section) => section.pageGroup)),
  ];
  const orderedBody = pageGroups
    .map((pageGroup) => {
      const ordered = structure.sections
        .filter((section) => section.pageGroup === pageGroup)
        .sort((left, right) => {
          const leftRank = left.category
            ? (rank.get(left.category) ?? requestedOrder.length)
            : requestedOrder.length + 1;
          const rightRank = right.category
            ? (rank.get(right.category) ?? requestedOrder.length)
            : requestedOrder.length + 1;
          return (
            leftRank - rightRank || left.originalIndex - right.originalIndex
          );
        });
      return `${structure.pageGroupPrefixes.get(pageGroup) ?? ''}${ordered.map((section) => section.source).join('')}`;
    })
    .join('');
  return `${structure.header}${orderedBody}${structure.footer}`;
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
  header: string,
  plan: TailoringPlanOutput,
  language: Language,
): string {
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
  return `${header}\n\n\\begin{flushright}\n${escapeLatex(dateLabel)}\n\\end{flushright}\n\n\\vspace{8pt}\n\\textbf{${escapeLatex(plan.coverLetter.subject)}}\n\n\\vspace{10pt}\n${escapeLatex(plan.coverLetter.salutation)}\n\n${paragraphs}\n\n${escapeLatex(plan.coverLetter.closing)}\n\n\\vspace{18pt}\nMarwan Abdelsamad\n\n\\end{document}\n`;
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
