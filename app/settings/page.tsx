import { redirect } from 'next/navigation';

import { SearchSettingsForm } from '@/components/search-settings-form';
import { Card, CardContent } from '@/components/ui/card';
import { WorkspacePage } from '@/components/workspace-chrome';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: schedule } = await supabase
    .from('search_schedules')
    .select('enabled,interval_minutes,notification_threshold,telegram_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <WorkspacePage
      active="/settings"
      description="Control scheduled discovery and the match score required before WerkMatch sends a Telegram alert."
      title="Search settings"
    >
      <Card className="bg-card/90">
        <CardContent>
          <SearchSettingsForm
            enabled={schedule?.enabled ?? true}
            intervalMinutes={schedule?.interval_minutes ?? 360}
            notificationThreshold={schedule?.notification_threshold ?? 75}
            telegramEnabled={schedule?.telegram_enabled ?? true}
          />
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
