'use client';

import { LoaderCircle, Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SearchSettingsFormProps = {
  enabled: boolean;
  intervalMinutes: number;
  notificationThreshold: number;
  telegramEnabled: boolean;
};

export function SearchSettingsForm(props: SearchSettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function submit(formData: FormData) {
    setSaving(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: formData.get('enabled') === 'on',
          intervalMinutes: Number(formData.get('intervalMinutes')),
          notificationThreshold: Number(formData.get('notificationThreshold')),
          telegramEnabled: formData.get('telegramEnabled') === 'on',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Could not save search settings.');
      }
      setMessage('Search settings saved.');
    } catch (cause) {
      setIsError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Could not save search settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={submit} className="space-y-7">
      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-semibold">
          Automation
        </legend>
        <CheckboxRow
          defaultChecked={props.enabled}
          description="Allow scheduled searches to run at the cadence below. Manual searches remain available."
          label="Scheduled discovery"
          name="enabled"
        />
        <div className="space-y-2">
          <Label htmlFor="intervalMinutes">Search cadence</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs"
            defaultValue={String(props.intervalMinutes)}
            id="intervalMinutes"
            name="intervalMinutes"
          >
            <option value="60">Every hour</option>
            <option value="180">Every 3 hours</option>
            <option value="360">Every 6 hours</option>
            <option value="720">Every 12 hours</option>
            <option value="1440">Every 24 hours</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-border/70 pt-6">
        <legend className="font-heading text-lg font-semibold">
          Telegram alerts
        </legend>
        <CheckboxRow
          defaultChecked={props.telegramEnabled}
          description="Send a Telegram message when a newly evaluated job reaches your threshold."
          label="Telegram notifications"
          name="telegramEnabled"
        />
        <div className="space-y-2">
          <Label htmlFor="notificationThreshold">Minimum match score</Label>
          <div className="flex items-center gap-2">
            <Input
              className="w-24"
              defaultValue={props.notificationThreshold}
              id="notificationThreshold"
              max={100}
              min={0}
              name="notificationThreshold"
              required
              type="number"
            />
            <span className="text-sm text-muted-foreground">
              percent or higher
            </span>
          </div>
        </div>
      </fieldset>

      {message ? (
        <output
          className={
            isError
              ? 'block rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-950'
              : 'block rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-950'
          }
        >
          {message}
          {isError ? ' Try again.' : ''}
        </output>
      ) : null}

      <Button className="h-10 gap-2" disabled={saving} type="submit">
        {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}

function CheckboxRow({
  defaultChecked,
  description,
  label,
  name,
}: {
  defaultChecked: boolean;
  description: string;
  label: string;
  name: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/55 p-4">
      <input
        aria-labelledby={`${name}-label`}
        className="mt-0.5 size-4 accent-primary"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      <label className="cursor-pointer" htmlFor={name}>
        <span className="block text-sm font-medium" id={`${name}-label`}>
          {label}
        </span>
        <span className="mt-1 block max-w-[65ch] text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </label>
    </div>
  );
}
