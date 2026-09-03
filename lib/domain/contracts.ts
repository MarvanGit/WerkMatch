import { z } from 'zod';

export const manualJobSchema = z.object({
  title: z.string().trim().min(3).max(240),
  company: z.string().trim().min(2).max(180),
  canonicalUrl: z.url().max(2_048),
  description: z.string().trim().min(40).max(100_000),
  locationText: z.string().trim().min(2).max(240),
  region: z.string().trim().max(120).nullable().default(null),
  country: z.string().trim().min(2).max(120).default('Germany'),
  workMode: z
    .enum(['onsite', 'hybrid', 'remote', 'unknown'])
    .default('unknown'),
  employmentType: z.string().trim().min(2).max(120),
  publishedAt: z.iso.datetime().nullable().default(null),
});

export const matchEvaluationOutputSchema = z.object({
  eligible: z.boolean(),
  overallScore: z.number().int().min(0).max(100),
  technicalScore: z.number().int().min(0).max(100),
  locationEligible: z.boolean(),
  remoteFromGermanyConfirmed: z.boolean(),
  languageRisk: z.enum(['none', 'low', 'medium', 'high']),
  languageAssessment: z.string().min(1),
  summary: z.string().min(1),
  reasons: z.array(z.string().min(1)).max(8),
  matchedEvidence: z
    .array(
      z.object({
        requirement: z.string().min(1),
        candidateFactId: z.string().min(1),
        explanation: z.string().min(1),
      }),
    )
    .max(12),
  gaps: z.array(z.string().min(1)).max(10),
  redFlags: z.array(z.string().min(1)).max(10),
});

export const tailoringPlanOutputSchema = z.object({
  documentLanguage: z.enum(['de', 'en']),
  factPriorityIds: z.array(z.string().min(1)).max(60),
  sectionOrder: z
    .array(
      z.enum([
        'skills',
        'experience',
        'education',
        'project',
        'certification',
        'award',
        'activity',
        'language',
        'interest',
      ]),
    )
    .max(9),
  coverLetter: z.object({
    subject: z.string().min(1).max(300),
    salutation: z.string().min(1).max(200),
    paragraphs: z
      .array(
        z.object({
          text: z.string().min(1).max(2_000),
          evidenceFactIds: z.array(z.string().min(1)).min(1).max(8),
        }),
      )
      .min(3)
      .max(6),
    closing: z.string().min(1).max(400),
  }),
});

export type ManualJobInput = z.infer<typeof manualJobSchema>;
export type MatchEvaluationOutput = z.infer<typeof matchEvaluationOutputSchema>;
export type TailoringPlanOutput = z.infer<typeof tailoringPlanOutputSchema>;
