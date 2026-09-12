'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SetupInput } from '@/lib/domain/onboarding';

type Upload = Pick<SetupInput, 'facts' | 'cvKey' | 'coverKey' | 'cvHash'>;
type Defaults = {
  display_name?: string;
  home_city?: string;
  german_level?: string;
  english_level?: string;
  search_policy?: { location?: string; roleKeywords?: string };
};
const field = 'min-h-10 w-full rounded-lg border bg-card px-3 py-2 text-sm';
export function OnboardingForm({
  profile,
  initialUpload,
  study,
  availability,
}: {
  profile: Defaults;
  initialUpload?: Upload;
  study?: string;
  availability?: string;
}) {
  const router = useRouter();
  const [upload, setUpload] = useState<Upload | undefined>(initialUpload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [confirm, setConfirm] = useState(false);
  async function uploadFiles(form: FormData) {
    setBusy(true);
    setUploadError('');
    setConfirm(false);
    try {
      const response = await fetch('/api/onboarding/upload', {
        method: 'POST',
        body: form,
      });
      const result = (await response.json()) as Upload & { error?: string };
      if (!response.ok) throw new Error(result.error);
      setUpload(result);
    } catch (cause) {
      setUploadError(
        cause instanceof Error ? cause.message : 'Upload failed. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(form: FormData) {
    if (!upload) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          ...upload,
          facts: upload.facts.map((fact) => ({
            ...fact,
            tags: fact.tags.filter(Boolean),
          })),
          confirmed: confirm,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      router.push('/settings');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Save failed. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  function changeFact(
    index: number,
    values: Partial<SetupInput['facts'][number]>,
  ) {
    setConfirm(false);
    setUpload((current) =>
      current
        ? {
            ...current,
            facts: current.facts.map((fact, i) =>
              i === index ? { ...fact, ...values } : fact,
            ),
          }
        : current,
    );
  }
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-semibold">Your document templates</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Upload complete, self-contained LaTeX files (.tex, up to 200 KB each).
          Your CV is the factual source. Its text is sent to the AI service to
          extract draft facts for your review. PDF and Word template import is
          not supported yet. Avoid external image or custom class dependencies.
        </p>
        <form
          action={uploadFiles}
          className="mt-5 space-y-4 rounded-xl bg-card p-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cv">CV LaTeX source</Label>
              <Input
                id="cv"
                name="cv"
                type="file"
                accept=".tex"
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover">Cover-letter LaTeX template</Label>
              <Input
                id="cover"
                name="cover"
                type="file"
                accept=".tex"
                required
                disabled={busy}
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The letter template needs a subject, salutation, body, closing, and
            signature.{' '}
            <a
              href="/templates/cover-letter.tex"
              download
              className="text-primary underline"
            >
              Download a compatible starter
            </a>
            .
          </p>
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Processing…'
              : upload
                ? 'Replace templates and extract facts'
                : 'Upload and extract facts'}
          </Button>
          {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
          {upload && (
            <p className="text-sm text-primary">
              Templates ready. Review your details below before saving.
            </p>
          )}
        </form>
      </section>
      <form action={save} className="space-y-9">
        <fieldset disabled={busy} className="space-y-5">
          <legend className="mb-4 text-xl font-semibold">
            Make the search yours
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              ['displayName', 'Your name', profile.display_name ?? ''],
              ['homeCity', 'Home city', profile.home_city ?? ''],
            ].map(([name, label, value]) => (
              <div className="space-y-2" key={name}>
                <Label htmlFor={name}>{label}</Label>
                <Input
                  id={name}
                  name={name}
                  defaultValue={value}
                  required
                  maxLength={120}
                />
              </div>
            ))}
            {[
              ['germanLevel', 'German level', profile.german_level ?? 'B1'],
              ['englishLevel', 'English level', profile.english_level ?? 'C1'],
            ].map(([name, label, value]) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name}>{label}</Label>
                <select
                  id={name}
                  name={name}
                  defaultValue={value}
                  className={field}
                >
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location preference</Label>
            <select
              id="location"
              name="location"
              defaultValue={
                profile.search_policy?.location ?? 'bavaria-and-remote'
              }
              className={field}
            >
              <option value="bavaria-and-remote">
                Bavaria and confirmed remote roles from Germany
              </option>
              <option value="remote-only">
                Confirmed remote roles from Germany only
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              Current sources focus on technical working-student roles in
              Bavaria and Germany-wide remote roles.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="roleKeywords">
              Focus areas (optional, separated by commas)
            </Label>
            <Input
              name="roleKeywords"
              id="roleKeywords"
              maxLength={300}
              placeholder="Frontend, Python, robotics"
              defaultValue={profile.search_policy?.roleKeywords ?? ''}
            />
            <p className="text-xs text-muted-foreground">
              Keep roles mentioning at least one of these terms. Leave empty to
              consider all supported technical roles.
            </p>
          </div>
        </fieldset>
        <fieldset disabled={busy} className="space-y-5">
          <legend className="mb-4 text-xl font-semibold">
            Your cover-letter statements
          </legend>
          <p className="text-sm text-muted-foreground">
            Write these in German. They are inserted exactly as confirmed into
            your letters.
          </p>
          <div className="space-y-2">
            <Label htmlFor="study">Current study status</Label>
            <textarea
              className={field}
              id="study"
              name="study"
              required
              minLength={15}
              maxLength={1000}
              rows={3}
              defaultValue={study}
              placeholder="Ich studiere derzeit …"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="availability">Availability</Label>
            <textarea
              className={field}
              id="availability"
              name="availability"
              required
              minLength={15}
              maxLength={1000}
              rows={3}
              defaultValue={availability}
              placeholder="Ab … stehe ich Ihnen für … Stunden pro Woche zur Verfügung."
            />
          </div>
        </fieldset>
        {upload && (
          <section>
            <h2 className="text-xl font-semibold">
              Review every candidate fact
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Correct or remove anything inaccurate. Only facts you confirm will
              be used. Saving replaces the profile facts for this account.
            </p>
            <div className="mt-5 space-y-4">
              {upload.facts.map((fact, index) => (
                <fieldset
                  key={index}
                  disabled={busy}
                  className="space-y-3 rounded-xl border p-4"
                >
                  <legend className="px-2 text-sm font-medium">
                    Fact {index + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      Category
                      <select
                        aria-label={`Fact ${index + 1} category`}
                        className={field}
                        value={fact.category}
                        onChange={(e) =>
                          changeFact(index, {
                            category: e.target.value as typeof fact.category,
                          })
                        }
                      >
                        {[
                          'skills',
                          'experience',
                          'education',
                          'project',
                          'certification',
                          'award',
                          'activity',
                          'language',
                          'interest',
                        ].map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor={`fact-title-${index}`} className="space-y-1 text-sm">
                      Title
                      <Input
                        id={`fact-title-${index}`}
                        value={fact.title}
                        required
                        maxLength={180}
                        onChange={(e) =>
                          changeFact(index, { title: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm">
                    Evidence
                    <textarea
                      className={field}
                      value={fact.summary}
                      rows={3}
                      required
                      maxLength={2000}
                      onChange={(e) =>
                        changeFact(index, { summary: e.target.value })
                      }
                    />
                  </label>
                  <label htmlFor={`fact-tags-${index}`} className="block space-y-1 text-sm">
                    Skills or tags, separated by commas
                    <Input
                      id={`fact-tags-${index}`}
                      value={fact.tags.join(', ')}
                      onChange={(e) =>
                        changeFact(index, {
                          tags: e.target.value
                            .split(',')
                            .map((tag) => tag.trim()),
                        })
                      }
                    />
                  </label>
                  <label htmlFor={`fact-org-${index}`} className="block space-y-1 text-sm">
                    Employer or organization (if applicable)
                    <Input
                      id={`fact-org-${index}`}
                      value={fact.organization ?? ''}
                      maxLength={180}
                      onChange={(e) =>
                        changeFact(index, { organization: e.target.value })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setConfirm(false);
                      setUpload({
                        ...upload,
                        facts: upload.facts.filter((_, i) => i !== index),
                      });
                    }}
                  >
                    Remove fact
                  </Button>
                </fieldset>
              ))}
            </div>
            <Button
              type="button"
              className="mt-4"
              variant="outline"
              disabled={busy || upload.facts.length >= 60}
              onClick={() => {
                setConfirm(false);
                setUpload({
                  ...upload,
                  facts: [
                    ...upload.facts,
                    {
                      category: 'project',
                      title: '',
                      summary: '',
                      tags: [],
                      organization: '',
                    },
                  ],
                });
              }}
            >
              Add a fact
            </Button>
          </section>
        )}
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            required
            disabled={!upload || busy}
          />
          I reviewed these facts and statements and confirm they accurately
          describe me. Use them for my job matches and application documents.
        </label>
        <p aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
        <Button type="submit" size="lg" disabled={!upload || !confirm || busy}>
          {busy ? 'Please wait…' : 'Save profile and set up automation'}
        </Button>
      </form>
    </div>
  );
}
