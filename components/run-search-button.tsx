'use client';

import { LoaderCircle, Search } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type SearchResult = {
  scanned: number;
  evaluated: number;
  eligibleMatches: number;
  notificationsSent: number;
};

export function RunSearchButton() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runSearch() {
    setRunning(true);
    setMessage(null);

    try {
      const response = await fetch('/api/search/run', { method: 'POST' });
      const payload = (await response.json()) as SearchResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Search failed.');

      setMessage(
        `Scanned ${payload.scanned}; evaluated ${payload.evaluated}; found ${payload.eligibleMatches} match${payload.eligibleMatches === 1 ? '' : 'es'}.`,
      );
      window.setTimeout(() => window.location.reload(), 1_200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed.');
      setRunning(false);
    }
  }

  return (
    <div className="relative">
      <Button
        className="gap-2 shadow-sm"
        disabled={running}
        onClick={runSearch}
        type="button"
      >
        {running ? <LoaderCircle className="animate-spin" /> : <Search />}
        {running ? 'Searching…' : 'Run search'}
      </Button>
      {message ? (
        <output className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-border bg-card px-3 py-2.5 text-xs leading-relaxed text-foreground shadow-lg">
          {message}
        </output>
      ) : null}
    </div>
  );
}
