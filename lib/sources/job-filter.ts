import type { NormalizedSourceJob } from './types.ts';

const studentRolePattern =
  /\b(werkstudent(?:in|en|entätigkeit)?|working[ -]student|studentische hilfskraft|student assistant|studentischer mitarbeiter|student trainee)\b/i;

const technicalRolePattern =
  /\b(software|developer|development|entwicklung|entwickler|engineering|engineer|backend|front[ -]?end|full[ -]?stack|devops|cloud|data (?:engineering|science|analytics|analysis|platform|pipeline)|daten(?:analyse|technik|plattform)|database|machine learning|artificial intelligence|künstliche intelligenz|ki|qa|quality assurance|test(?:ing|automatisierung| automation)?|informatik|it[ -](?:administration|support)|low[ -]?code|power platform|automation|cyber|security|embedded|robotics|systementwicklung|prototyping|programmier\w*|r&d)\b/i;

const excludedRolePattern =
  /\b(finance|accounting|controlling|marketing|sales|vertrieb|human resources|people(?:\s*&\s*| and )culture|recruit(?:ing|ment)?|talent acquisition|category management|social media|customer success|immobilien|real estate)\b/i;

const bavariaPattern =
  /\b(bayern|bavaria|münchen|munich|greater munich metropolitan area|metropolregion münchen|erlangen|nürnberg|nuremberg|regensburg|ingolstadt|augsburg|würzburg|wuerzburg|bamberg|bayreuth|coburg|fürth|fuerth|passau|landshut|rosenheim|neu-ulm|garching|unterföhring|ottobrunn|aschheim|martinsried|herzogenaurach|unterhaching|freising)\b/i;

export function isTargetStudentTechRole(input: {
  title: string;
  employmentType?: string;
  tags?: string[];
}): boolean {
  const roleText = [input.title, input.employmentType ?? ''].join(' ');
  const technicalText = [input.title, ...(input.tags ?? [])].join(' ');
  return (
    studentRolePattern.test(roleText) &&
    !excludedRolePattern.test(input.title) &&
    technicalRolePattern.test(technicalText)
  );
}

export function isPotentialLocationMatch(
  job: Pick<NormalizedSourceJob, 'locationText' | 'workMode'>,
): boolean {
  return job.workMode === 'remote' || isBavariaLocation(job.locationText);
}

export function isBavariaLocation(value: string): boolean {
  return bavariaPattern.test(value);
}

export function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<\s*\/div\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code.toLowerCase()] ?? entity;
  });
}
