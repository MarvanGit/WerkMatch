export type WorkMode = 'onsite' | 'hybrid' | 'remote' | 'unknown';

export type LocationGateInput = {
  country: string;
  region: string | null;
  workMode: WorkMode;
  remoteFromGermanyConfirmed: boolean;
};

export type LocationGateResult = {
  eligible: boolean;
  reason:
    | 'bavaria'
    | 'remote-from-germany'
    | 'outside-bavaria-not-remote'
    | 'remote-eligibility-unconfirmed';
};

export const defaultMatchPolicy = {
  employmentTypes: ['Werkstudent', 'Working Student'],
  targetRoleFamilies: [
    'Software Engineering',
    'Backend Engineering',
    'Full-Stack Engineering',
    'QA and Test Automation',
    'DevOps and Cloud',
    'Data Engineering',
    'AI and Machine Learning Engineering',
    'Technical Automation',
  ],
  englishLevel: 'C1',
  germanLevel: 'B1',
  bavariaModes: ['onsite', 'hybrid', 'remote'] satisfies WorkMode[],
  outsideBavariaModes: ['remote'] satisfies WorkMode[],
  languagePolicy: {
    rejectAboveGermanLevel: false,
    flagHigherRequirement: true,
  },
} as const;

export function evaluateLocationGate(
  input: LocationGateInput,
): LocationGateResult {
  const inGermany = normalize(input.country) === 'germany';
  const inBavaria =
    inGermany && ['bavaria', 'bayern'].includes(normalize(input.region ?? ''));

  if (inBavaria && input.workMode !== 'unknown') {
    return { eligible: true, reason: 'bavaria' };
  }

  if (input.workMode !== 'remote') {
    return { eligible: false, reason: 'outside-bavaria-not-remote' };
  }

  if (!input.remoteFromGermanyConfirmed) {
    return { eligible: false, reason: 'remote-eligibility-unconfirmed' };
  }

  return { eligible: true, reason: 'remote-from-germany' };
}

export function classifyGermanRequirement(requirement: string): {
  risk: 'none' | 'low' | 'medium' | 'high';
  eligible: true;
} {
  const normalized = normalize(requirement);

  if (!normalized || normalized.includes('not specified')) {
    return { risk: 'none', eligible: true };
  }

  if (
    normalized.includes('native') ||
    normalized.includes('muttersprach') ||
    normalized.includes('c2')
  ) {
    return { risk: 'high', eligible: true };
  }

  if (
    normalized.includes('fluent') ||
    normalized.includes('fliessend') ||
    normalized.includes('fließend') ||
    normalized.includes('c1')
  ) {
    return { risk: 'high', eligible: true };
  }

  if (
    normalized.includes('b2') ||
    normalized.includes('very good') ||
    normalized.includes('sehr gut')
  ) {
    return { risk: 'medium', eligible: true };
  }

  if (normalized.includes('b1') || normalized.includes('good')) {
    return { risk: 'low', eligible: true };
  }

  return { risk: 'low', eligible: true };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE');
}
