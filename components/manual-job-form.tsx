'use client';

import { LoaderCircle, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ManualJobForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);

    const payload = {
      title: formValue(formData, 'title'),
      company: formValue(formData, 'company'),
      canonicalUrl: formValue(formData, 'canonicalUrl'),
      description: formValue(formData, 'description'),
      locationText: formValue(formData, 'locationText'),
      region: null,
      country: 'Germany',
      workMode: formValue(formData, 'workMode') || 'unknown',
      employmentType:
        formValue(formData, 'employmentType') || 'Working Student',
      publishedAt: null,
    };

    try {
      const response = await fetch('/api/jobs/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        job?: { id: string };
        error?: string;
      };
      if (!response.ok || !result.job) {
        throw new Error(result.error ?? 'Could not save this job.');
      }
      router.push(`/?job=${result.job.id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this job.',
      );
      setSaving(false);
    }
  }

  return (
    <form action={submit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Job title" name="title">
          <Input
            id="title"
            name="title"
            placeholder="Working Student Software Engineering"
            required
          />
        </Field>
        <Field label="Company" name="company">
          <Input
            id="company"
            name="company"
            placeholder="Company name"
            required
          />
        </Field>
        <Field label="Listing URL" name="canonicalUrl" wide>
          <Input
            id="canonicalUrl"
            name="canonicalUrl"
            placeholder="https://…"
            required
            type="url"
          />
        </Field>
        <Field label="Location" name="locationText">
          <Input
            id="locationText"
            name="locationText"
            placeholder="Munich, Bavaria"
            required
          />
        </Field>
        <Field label="Work mode" name="workMode">
          <select
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            defaultValue="unknown"
            id="workMode"
            name="workMode"
          >
            <option value="unknown">Not specified</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </Field>
        <Field label="Employment type" name="employmentType" wide>
          <Input
            defaultValue="Working Student"
            id="employmentType"
            name="employmentType"
            required
          />
        </Field>
        <Field label="Job description" name="description" wide>
          <Textarea
            className="min-h-64 resize-y"
            id="description"
            minLength={40}
            name="description"
            placeholder="Paste the complete job description here. WerkMatch will use it when matching and tailoring documents."
            required
          />
        </Field>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-950"
          role="alert"
        >
          {error} Check the form and try again.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button className="h-10 gap-2" disabled={saving} type="submit">
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          {saving ? 'Adding job…' : 'Add job to inbox'}
        </Button>
      </div>
    </form>
  );
}

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function Field({
  label,
  name,
  wide = false,
  children,
}: {
  label: string;
  name: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
      <Label htmlFor={name}>{label}</Label>
      {children}
    </div>
  );
}
