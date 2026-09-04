import { AlertTriangle, CheckCircle2, Clock3, Radio } from 'lucide-react';
import { redirect } from 'next/navigation';

import { RunSearchButton } from '@/components/run-search-button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkspacePage } from '@/components/workspace-chrome';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SourceConfig = {
  source: string;
  enabled: boolean;
  config: Record<string, unknown>;
  last_successful_run_at: string | null;
  last_error: string | null;
};

const sourceCopy: Record<string, { name: string; description: string }> = {
  arbeitnow: {
    name: 'Arbeitnow',
    description: 'German job listings from the Arbeitnow feed.',
  },
  personio: {
    name: 'Personio career sites',
    description: 'Direct listings from selected company career pages.',
  },
  linkedin: {
    name: 'LinkedIn public jobs',
    description: 'Public LinkedIn search pages for working-student tech roles.',
  },
  smartrecruiters: {
    name: 'SmartRecruiters career sites',
    description:
      'Direct HTML listings from selected Bavarian employer career pages.',
  },
  lever: {
    name: 'Lever career sites',
    description:
      'Direct HTML listings from selected employers with Bavarian and remote roles.',
  },
};

export default async function SourcesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('source_configs')
    .select('source,enabled,config,last_successful_run_at,last_error')
    .eq('user_id', user.id)
    .order('source');
  const stored = (data ?? []) as SourceConfig[];
  const sourceNames = [
    'arbeitnow',
    'personio',
    'smartrecruiters',
    'lever',
    'linkedin',
  ];
  const byName = new Map(stored.map((source) => [source.source, source]));
  const sources = sourceNames.map(
    (source) =>
      byName.get(source) ?? {
        source,
        enabled: true,
        config: {},
        last_successful_run_at: null,
        last_error: null,
      },
  );

  return (
    <WorkspacePage
      active="/sources"
      actions={<RunSearchButton />}
      description="The live collectors used for discovery. Statuses refresh after each search run."
      title="Job sources"
    >
      <div className="space-y-3">
        {sources.map((source) => {
          const copy = sourceCopy[source.source] ?? {
            name: source.source,
            description: 'Configured job source.',
          };
          const healthy = !source.last_error;
          return (
            <Card key={source.source} className="bg-card/90">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                      <Radio className="size-4" />
                    </div>
                    <div>
                      <CardTitle>{copy.name}</CardTitle>
                      <CardDescription className="mt-1 leading-relaxed">
                        {copy.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={source.enabled ? 'secondary' : 'outline'}>
                    {source.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  {source.last_successful_run_at ? (
                    <>
                      <Clock3 className="size-3.5" />
                      Last successful run{' '}
                      {new Date(source.last_successful_run_at).toLocaleString(
                        'en-GB',
                      )}
                    </>
                  ) : (
                    <>Waiting for the first completed search</>
                  )}
                </span>
                <span
                  className={
                    healthy
                      ? 'inline-flex items-center gap-1.5 text-xs text-emerald-700'
                      : 'inline-flex items-center gap-1.5 text-xs text-amber-800'
                  }
                >
                  {healthy ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <AlertTriangle className="size-3.5" />
                  )}
                  {healthy ? 'No current errors' : source.last_error}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </WorkspacePage>
  );
}
