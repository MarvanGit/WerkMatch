import {
  Download,
  FileCode2,
  FileText,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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

type Generation = {
  id: string;
  job_id: string;
  status: 'queued' | 'generating' | 'compiling' | 'ready' | 'failed';
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
};

type Job = { id: string; title: string; company: string };
type Artifact = {
  generation_request_id: string;
  kind: string;
  file_name: string;
  object_key: string;
};

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: generationData } = await supabase
    .from('generation_requests')
    .select('id,job_id,status,error_message,requested_at,completed_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(100);
  const generations = (generationData ?? []) as Generation[];
  const jobIds = [...new Set(generations.map((item) => item.job_id))];
  const requestIds = generations.map((item) => item.id);
  const [{ data: jobData }, { data: artifactData }] = await Promise.all([
    jobIds.length
      ? supabase
          .from('jobs')
          .select('id,title,company')
          .eq('user_id', user.id)
          .in('id', jobIds)
      : Promise.resolve({ data: [] }),
    requestIds.length
      ? supabase
          .from('document_artifacts')
          .select('generation_request_id,kind,file_name,object_key')
          .eq('user_id', user.id)
          .in('generation_request_id', requestIds)
      : Promise.resolve({ data: [] }),
  ]);
  const jobById = new Map(
    ((jobData ?? []) as Job[]).map((job) => [job.id, job]),
  );
  const artifactsByRequest = new Map<string, Artifact[]>();
  for (const artifact of (artifactData ?? []) as Artifact[]) {
    artifactsByRequest.set(artifact.generation_request_id, [
      ...(artifactsByRequest.get(artifact.generation_request_id) ?? []),
      artifact,
    ]);
  }
  const signedByObjectKey = new Map<string, string>();
  await Promise.all(
    ((artifactData ?? []) as Artifact[]).map(async (artifact) => {
      const { data } = await supabase.storage
        .from('generated-documents')
        .createSignedUrl(artifact.object_key, 3_600, {
          download: artifact.file_name,
        });
      if (data?.signedUrl)
        signedByObjectKey.set(artifact.object_key, data.signedUrl);
    }),
  );

  return (
    <WorkspacePage
      active="/documents"
      description="Every document request and its generated LaTeX and PDF files. Download links remain private and expire after one hour."
      title="Documents"
    >
      {generations.length === 0 ? (
        <Card className="border-dashed bg-card/60 py-10 text-center">
          <CardContent>
            <FileText className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium">No document requests yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a job match and choose Generate tailored documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {generations.map((generation) => {
            const job = jobById.get(generation.job_id);
            const artifacts = artifactsByRequest.get(generation.id) ?? [];
            const working = ['queued', 'generating', 'compiling'].includes(
              generation.status,
            );
            return (
              <Card key={generation.id} className="bg-card/90">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{job?.title ?? 'Unknown job'}</CardTitle>
                      <CardDescription className="mt-1">
                        {job?.company ?? 'Unknown company'} · requested{' '}
                        {new Date(generation.requested_at).toLocaleString(
                          'en-GB',
                        )}
                      </CardDescription>
                    </div>
                    <Badge
                      className={
                        generation.status === 'failed'
                          ? 'bg-red-500/10 text-red-700'
                          : generation.status === 'ready'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : undefined
                      }
                      variant="secondary"
                    >
                      {working ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {generation.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {generation.status === 'failed' ? (
                    <p className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-950">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      {generation.error_message ??
                        'Document generation failed. Open the job and try again.'}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className={buttonVariants({
                        variant: 'ghost',
                        size: 'sm',
                      })}
                      href={`/?job=${generation.job_id}`}
                    >
                      Open job
                    </Link>
                    {artifacts.map((artifact) => {
                      const url = signedByObjectKey.get(artifact.object_key);
                      if (!url) return null;
                      const isPdf = artifact.kind.endsWith('_pdf');
                      return (
                        <a
                          key={artifact.kind}
                          className={buttonVariants({
                            variant: 'outline',
                            size: 'sm',
                          })}
                          href={url}
                        >
                          {isPdf ? <Download /> : <FileCode2 />}
                          {artifact.file_name}
                        </a>
                      );
                    })}
                    {working ? (
                      <span className="text-xs text-muted-foreground">
                        This page will show downloads when generation finishes.
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </WorkspacePage>
  );
}
