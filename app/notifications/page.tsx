import { Bell, BellOff, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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

type NotifiedEvaluation = {
  job_id: string;
  overall_score: number;
  summary: string;
  notified_at: string;
};

type Job = {
  id: string;
  title: string;
  company: string;
  location_text: string;
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: evaluationData } = await supabase
    .from('match_evaluations')
    .select('job_id,overall_score,summary,notified_at')
    .eq('user_id', user.id)
    .not('notified_at', 'is', null)
    .order('notified_at', { ascending: false })
    .limit(100);
  const evaluations = (evaluationData ?? []) as NotifiedEvaluation[];
  const jobIds = evaluations.map((item) => item.job_id);
  const { data: jobData } = jobIds.length
    ? await supabase
        .from('jobs')
        .select('id,title,company,location_text')
        .eq('user_id', user.id)
        .in('id', jobIds)
    : { data: [] };
  const jobById = new Map(
    ((jobData ?? []) as Job[]).map((job) => [job.id, job]),
  );
  const notifications = evaluations.flatMap((evaluation) => {
    const job = jobById.get(evaluation.job_id);
    return job ? [{ ...job, ...evaluation }] : [];
  });

  return (
    <WorkspacePage
      active="/notifications"
      description="A history of strong-match alerts that WerkMatch sent to your Telegram chat."
      title="Notifications"
    >
      {notifications.length === 0 ? (
        <Card className="border-dashed bg-card/60 py-10 text-center">
          <CardContent>
            <BellOff className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium">No Telegram alerts sent yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              New matches appear here after they meet your notification
              threshold.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Link
              key={`${notification.job_id}-${notification.notified_at}`}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/?job=${notification.job_id}`}
            >
              <Card className="bg-card/90 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Bell className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{notification.title}</CardTitle>
                        <Badge variant="secondary">
                          {notification.overall_score}% match
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{notification.company}</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {notification.location_text}
                        </span>
                        <span>
                          {new Date(notification.notified_at).toLocaleString(
                            'en-GB',
                          )}
                        </span>
                      </CardDescription>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="pl-16 text-sm leading-relaxed text-muted-foreground">
                  {notification.summary}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </WorkspacePage>
  );
}
