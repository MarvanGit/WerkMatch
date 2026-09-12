import { z } from 'zod';

export const factSchema = z.object({
  category: z.enum([
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
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(80)).max(30),
  organization: z.string().trim().max(180),
});
export const setupSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  homeCity: z.string().trim().min(1).max(120),
  germanLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  englishLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  location: z.enum(['bavaria-and-remote', 'remote-only']),
  roleKeywords: z.string().trim().max(300),
  study: z.string().trim().min(15).max(1000),
  availability: z.string().trim().min(15).max(1000),
  facts: z.array(factSchema).min(1).max(60),
  cvKey: z.string().min(1).max(500),
  coverKey: z.string().min(1).max(500),
  cvHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export function ownsAsset(userId: string, key: string) {
  return (
    key.startsWith(`${userId}/`) &&
    !key.includes('..') &&
    !key.includes('\\') &&
    !key.includes('//')
  );
}
export function validateTex(text: string) {
  if (!text.includes('\\begin{document}') || !text.includes('\\end{document}'))
    throw new Error(
      'Upload a complete LaTeX document with begin and end document markers.',
    );
  if (text.length > 200_000)
    throw new Error('Each LaTeX source must be under 200 KB.');
}
export type SetupInput = z.infer<typeof setupSchema>;
