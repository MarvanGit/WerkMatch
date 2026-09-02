import type { TailoringPlanOutput } from '../domain/contracts.ts';
import type { CandidateFactForDocuments } from '../ai/documents.ts';

type Language = 'de' | 'en';

const sectionLabels: Record<Language, Record<string, string>> = {
  de: {
    skills: 'Fähigkeiten',
    experience: 'Berufserfahrung',
    education: 'Ausbildung',
    project: 'Projekte',
    certification: 'Zertifikate',
    award: 'Stipendien & Auszeichnungen',
    activity: 'Engagement & außeruniversitäre Aktivitäten',
    language: 'Sprachen',
    interest: 'Interessen',
  },
  en: {
    skills: 'Skills',
    experience: 'Professional Experience',
    education: 'Education',
    project: 'Projects',
    certification: 'Certifications',
    award: 'Scholarships & Awards',
    activity: 'Activities',
    language: 'Languages',
    interest: 'Interests',
  },
};

const skillLabels: Record<Language, Record<string, string>> = {
  de: {
    'skills.programming-languages': 'Programmiersprachen',
    'skills.full-stack': 'Full-Stack Entwicklung',
    'skills.databases': 'Datenbanken',
    'skills.devops': 'DevOps & Container',
    'skills.testing': 'Testing & Qualitätssicherung',
    'skills.software-engineering': 'Software Engineering',
    'skills.work-style': 'Arbeitsweise',
  },
  en: {
    'skills.programming-languages': 'Programming Languages',
    'skills.full-stack': 'Full-Stack Development',
    'skills.databases': 'Databases',
    'skills.devops': 'DevOps & Containers',
    'skills.testing': 'Testing & Quality Assurance',
    'skills.software-engineering': 'Software Engineering',
    'skills.work-style': 'Working Style',
  },
};

export function renderTailoredDocuments(input: {
  masterTemplate: string;
  facts: CandidateFactForDocuments[];
  plan: TailoringPlanOutput;
}) {
  const template = makeTemplateEngineNeutral(input.masterTemplate);
  const firstSectionIndex = template.search(
    /\\section\{(?:Fähigkeiten|Skills)\}/,
  );
  const endDocumentIndex = template.lastIndexOf('\\end{document}');
  if (firstSectionIndex < 0 || endDocumentIndex < 0) {
    throw new Error(
      'The LaTeX template does not contain the expected document markers.',
    );
  }

  const header = template.slice(0, firstSectionIndex).trimEnd();
  const selectedFacts = selectFacts(input.facts, input.plan);
  const cvSections = orderedCategories(input.plan).flatMap((category) => {
    const facts = selectedFacts.filter((fact) => fact.category === category);
    return facts.length
      ? [
          renderSection(
            category,
            facts,
            input.plan,
            input.plan.documentLanguage,
          ),
        ]
      : [];
  });

  const cvTex = `${header}\n\n${cvSections.join('\n\n')}\n\n\\end{document}\n`;
  const coverLetterTex = renderCoverLetter(
    header,
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

function orderedCategories(plan: TailoringPlanOutput): string[] {
  const order = [...new Set(plan.sectionOrder)];
  for (const required of [
    'skills',
    'experience',
    'education',
    'project',
    'language',
  ]) {
    if (!order.includes(required as (typeof order)[number])) {
      order.push(required as (typeof order)[number]);
    }
  }
  return order;
}

function selectFacts(
  facts: CandidateFactForDocuments[],
  plan: TailoringPlanOutput,
): CandidateFactForDocuments[] {
  const selected = new Set(plan.selectedFactIds);
  const requiredCategories = new Set(['education', 'language']);
  const chosen = facts.filter(
    (fact) =>
      selected.has(fact.fact_key) || requiredCategories.has(fact.category),
  );
  const categories = new Set(chosen.map((fact) => fact.category));
  for (const fallbackCategory of ['skills', 'experience', 'project']) {
    if (!categories.has(fallbackCategory)) {
      chosen.push(
        ...facts.filter((fact) => fact.category === fallbackCategory),
      );
    }
  }

  const selectedRank = new Map(
    plan.selectedFactIds.map((factId, index) => [factId, index]),
  );
  const emphasizedRank = new Map(
    plan.emphasizedSkillFactIds.map((factId, index) => [factId, index]),
  );
  return [
    ...new Map(chosen.map((fact) => [fact.fact_key, fact])).values(),
  ].sort((left, right) => {
    if (left.category === 'skills' && right.category === 'skills') {
      return (
        (emphasizedRank.get(left.fact_key) ?? 1_000) -
          (emphasizedRank.get(right.fact_key) ?? 1_000) ||
        left.order_index - right.order_index
      );
    }
    return (
      (selectedRank.get(left.fact_key) ?? 1_000) -
        (selectedRank.get(right.fact_key) ?? 1_000) ||
      left.order_index - right.order_index
    );
  });
}

function renderSection(
  category: string,
  facts: CandidateFactForDocuments[],
  plan: TailoringPlanOutput,
  language: Language,
): string {
  const label = sectionLabels[language][category] ?? category;
  const entries = facts.map((fact) => renderFact(fact, plan, language));
  return [
    category === 'project' ? '\\newpage' : '',
    `\\section{${escapeLatex(label)}}`,
    '\\resumeSubHeadingListStart',
    ...entries,
    '\\resumeSubHeadingListEnd',
  ].join('\n');
}

function renderFact(
  fact: CandidateFactForDocuments,
  plan: TailoringPlanOutput,
  language: Language,
): string {
  const presentation = plan.localizedFacts.find(
    (item) => item.sourceFactId === fact.fact_key,
  );
  if (fact.category === 'skills') {
    const label = skillLabels[language][fact.fact_key] ?? fact.title;
    return `\\resumeSubItem{${escapeLatex(label)}}{${escapeLatex(detailItems(fact).join(', ') || fact.summary)}}`;
  }
  if (fact.category === 'language' || fact.category === 'interest') {
    return `\\resumeSubItem{${escapeLatex(presentation?.title ?? fact.title)}}{${escapeLatex(presentation?.summary ?? fact.summary)}}`;
  }

  const details = fact.details;
  const heading =
    presentation?.title ||
    stringDetail(details, 'organization') ||
    stringDetail(details, 'institution') ||
    fact.title;
  const location =
    presentation?.location ||
    stringDetail(details, 'location') ||
    (fact.category === 'certification' ? stringDetail(details, 'issuer') : '');
  const subtitle =
    presentation?.subtitle ||
    stringDetail(details, 'role') ||
    stringDetail(details, 'degree') ||
    (fact.category === 'certification' ? stringDetail(details, 'status') : '');
  const dates = formatDates(
    stringDetail(details, 'start'),
    stringDetail(details, 'end') || stringDetail(details, 'year'),
    language,
  );
  const rewritten = plan.rewrittenBullets
    .filter((bullet) => bullet.sourceFactId === fact.fact_key)
    .map((bullet) => bullet.text);
  const originalHighlights = arrayDetail(details, 'highlights');
  const modules = arrayDetail(details, 'modules');
  const technologies = arrayDetail(details, 'technologies');
  const bullets = rewritten.length
    ? rewritten
    : originalHighlights.length
      ? originalHighlights
      : modules.length
        ? [
            `${language === 'de' ? 'Relevante Module' : 'Relevant modules'}: ${modules.join(', ')}`,
          ]
        : [presentation?.summary ?? fact.summary];
  if (technologies.length && !rewritten.length) {
    bullets.push(
      `${language === 'de' ? 'Technologien' : 'Technologies'}: ${technologies.join(', ')}`,
    );
  }

  return [
    '\\resumeSubheading',
    `  {${escapeLatex(heading)}}{${escapeLatex(location)}}`,
    `  {${escapeLatex(subtitle)}}{${escapeLatex(dates)}}`,
    '\\resumeItemListStart',
    ...bullets
      .slice(0, 4)
      .map(
        (bullet) =>
          `  \\resumeItem{${language === 'de' ? 'Relevanz' : 'Relevance'}}{${escapeLatex(bullet)}}`,
      ),
    '\\resumeItemListEnd',
  ].join('\n');
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

function detailItems(fact: CandidateFactForDocuments): string[] {
  return arrayDetail(fact.details, 'items');
}

function stringDetail(details: Record<string, unknown>, key: string): string {
  return typeof details[key] === 'string' ? details[key] : '';
}

function arrayDetail(details: Record<string, unknown>, key: string): string[] {
  return Array.isArray(details[key])
    ? details[key].filter((value): value is string => typeof value === 'string')
    : [];
}

function formatDates(start: string, end: string, language: Language): string {
  const present = language === 'de' ? 'heute' : 'present';
  const formatPart = (value: string) => {
    if (!value) return '';
    if (value.toLowerCase() === 'present') return present;
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    return match ? `${match[2]}/${match[1]}` : value;
  };
  const parts = [formatPart(start), formatPart(end)].filter(Boolean);
  return parts.join(' -- ');
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
