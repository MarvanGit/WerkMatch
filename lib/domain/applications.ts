export const applicationStatuses = [
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const applicationStatusMeta: Record<
  ApplicationStatus,
  { label: string; description: string }
> = {
  applied: {
    label: 'Applied',
    description: 'Application submitted',
  },
  screening: {
    label: 'Screening',
    description: 'Application is under review',
  },
  interview: {
    label: 'Interview',
    description: 'Interview process started',
  },
  offer: {
    label: 'Offer',
    description: 'Offer received',
  },
  rejected: {
    label: 'Rejected',
    description: 'Application was not successful',
  },
  withdrawn: {
    label: 'Withdrawn',
    description: 'Application withdrawn',
  },
};

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.includes(value as ApplicationStatus);
}
