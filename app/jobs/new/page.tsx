import { redirect } from 'next/navigation';

import { ManualJobForm } from '@/components/manual-job-form';
import { Card, CardContent } from '@/components/ui/card';
import { WorkspacePage } from '@/components/workspace-chrome';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewJobPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <WorkspacePage
      active="/"
      description="Paste a listing from any job board. WerkMatch saves the original text and opens it in your inbox for matching and document generation."
      title="Add a job"
    >
      <Card className="bg-card/90">
        <CardContent>
          <ManualJobForm />
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
