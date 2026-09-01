import { createClient } from '@supabase/supabase-js';

import { runSearchForUser } from '../lib/search/run-search.ts';

const supabaseUrl = requiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL');
const supabaseSecretKey = requiredEnvironmentVariable('SUPABASE_SECRET_KEY');
const forceSearch = process.env.FORCE_SEARCH === 'true';

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: schedules, error } = await supabase
  .from('search_schedules')
  .select('user_id,next_run_at')
  .eq('enabled', true);

if (error) throw error;

const now = Date.now();
const dueSchedules = (schedules ?? []).filter(
  (schedule) =>
    forceSearch ||
    !schedule.next_run_at ||
    new Date(schedule.next_run_at).getTime() <= now,
);

console.log(`WerkMatch scheduler found ${dueSchedules.length} due search(es).`);

let failures = 0;
for (const schedule of dueSchedules) {
  try {
    const result = await runSearchForUser(supabase, schedule.user_id);
    console.log(
      `Search complete: scanned=${result.scanned}, evaluated=${result.evaluated}, matches=${result.eligibleMatches}, notifications=${result.notificationsSent}.`,
    );
  } catch (searchError) {
    failures += 1;
    console.error(
      `Scheduled search failed: ${searchError instanceof Error ? searchError.message : 'unknown error'}`,
    );
  }
}

if (failures > 0) process.exitCode = 1;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
