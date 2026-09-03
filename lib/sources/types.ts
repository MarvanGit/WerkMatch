export type NormalizedSourceJob = {
  source: string;
  externalId: string;
  canonicalUrl: string;
  title: string;
  company: string;
  description: string;
  locationText: string;
  region: string | null;
  country: string;
  workMode: 'onsite' | 'hybrid' | 'remote' | 'unknown';
  employmentType: string;
  publishedAt: string | null;
  tags: string[];
  rawPayload: unknown;
};
