'use client';

import { Check, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  applicationStatusMeta,
  applicationStatuses,
  type ApplicationStatus,
} from '@/lib/domain/applications';

export function ApplicationStatusControl({
  jobId,
  initialStatus,
  compact = false,
}: {
  jobId: string;
  initialStatus: ApplicationStatus | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ApplicationStatus | null>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveStatus(nextStatus: ApplicationStatus) {
    const previousStatus = status;
    setStatus(nextStatus);
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/application`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json()) as {
        application?: { status: ApplicationStatus };
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error ?? 'Could not update this application.');
      }
      setStatus(payload.application.status);
      setMessage(
        nextStatus === 'applied'
          ? 'Added to Applications.'
          : `Status changed to ${applicationStatusMeta[nextStatus].label}.`,
      );
      router.refresh();
    } catch (error) {
      setStatus(previousStatus);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not update this application.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!status) {
    return (
      <div className="space-y-2">
        <Button
          className="h-10 w-full gap-2"
          disabled={saving}
          onClick={() => void saveStatus('applied')}
          type="button"
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
          {saving ? 'Saving…' : 'Mark as applied'}
        </Button>
        {message ? (
          <output className="block text-xs leading-relaxed text-muted-foreground">
            {message}
          </output>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Only confirm this after you submit the application.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'min-w-[150px]' : 'space-y-2'}>
      {!compact ? (
        <label
          className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          htmlFor={`application-status-${jobId}`}
        >
          Application status
        </label>
      ) : null}
      <NativeSelect
        aria-label={compact ? 'Application status' : undefined}
        className="w-full"
        disabled={saving}
        id={`application-status-${jobId}`}
        onChange={(event) =>
          void saveStatus(event.target.value as ApplicationStatus)
        }
        size={compact ? 'sm' : 'default'}
        value={status}
      >
        {applicationStatuses.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {applicationStatusMeta[value].label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {saving ? (
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" />
          Saving
        </span>
      ) : message && !compact ? (
        <output className="block text-xs leading-relaxed text-muted-foreground">
          {message}
        </output>
      ) : null}
    </div>
  );
}
