'use client';

import { Download, FileCode2, LoaderCircle, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';

type Artifact = {
  kind: 'cv_tex' | 'cv_pdf' | 'cover_letter_tex' | 'cover_letter_pdf';
  fileName: string;
  url: string;
};

type Generation = {
  id: string;
  status: 'queued' | 'generating' | 'compiling' | 'ready' | 'failed';
  error_message: string | null;
  artifacts?: Artifact[];
};

export function GenerateDocumentsButton({ jobId }: { jobId: string }) {
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/jobs/${jobId}/generate`, {
      cache: 'no-store',
    });
    const payload = (await response.json()) as {
      generation?: Generation | null;
      error?: string;
    };
    if (!response.ok)
      throw new Error(payload.error ?? 'Could not load documents.');
    setGeneration(payload.generation ?? null);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus().catch((error) => {
        setMessage(
          error instanceof Error ? error.message : 'Could not load documents.',
        );
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  useEffect(() => {
    if (
      !generation ||
      !['queued', 'generating', 'compiling'].includes(generation.status)
    ) {
      return;
    }
    const timer = window.setInterval(() => void loadStatus(), 5_000);
    return () => window.clearInterval(timer);
  }, [generation, loadStatus]);

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/generate`, {
        method: 'POST',
      });
      const payload = (await response.json()) as {
        generation?: Generation;
        error?: string;
      };
      if (!response.ok || !payload.generation) {
        throw new Error(
          payload.error ?? 'Could not start document generation.',
        );
      }
      setGeneration(payload.generation);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not start generation.',
      );
    } finally {
      setLoading(false);
    }
  }

  const working =
    loading ||
    Boolean(
      generation &&
      ['queued', 'generating', 'compiling'].includes(generation.status),
    );
  const statusMessage = generation
    ? {
        queued:
          'Queued securely. The document worker checks every five minutes.',
        generating: 'OpenCode is tailoring the content from verified facts…',
        compiling: 'The LaTeX documents are compiling…',
        ready: 'Your tailored documents are ready.',
        failed: generation.error_message ?? 'Document generation failed.',
      }[generation.status]
    : null;
  const artifacts = generation?.artifacts ?? [];
  const pdfs = artifacts.filter((artifact) => artifact.kind.endsWith('_pdf'));
  const sources = artifacts.filter((artifact) =>
    artifact.kind.endsWith('_tex'),
  );

  return (
    <>
      <Button
        className="col-span-2 h-10 gap-2 shadow-sm"
        disabled={working}
        onClick={generate}
        type="button"
      >
        {working ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        {generation?.status === 'ready'
          ? 'Generate a new version'
          : working
            ? 'Generating…'
            : 'Generate tailored documents'}
      </Button>
      {statusMessage || message ? (
        <output className="col-span-2 rounded-lg bg-secondary px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
          {message ?? statusMessage}
        </output>
      ) : null}
      {pdfs.map((artifact) => (
        <a
          key={artifact.kind}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={artifact.url}
        >
          <Download />
          {artifact.kind === 'cv_pdf' ? 'CV PDF' : 'Letter PDF'}
        </a>
      ))}
      {sources.map((artifact) => (
        <a
          key={artifact.kind}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          href={artifact.url}
        >
          <FileCode2 />
          {artifact.kind === 'cv_tex' ? 'CV .tex' : 'Letter .tex'}
        </a>
      ))}
    </>
  );
}
