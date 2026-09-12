import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

const settingsSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(240).max(10_080),
  notificationThreshold: z.number().int().min(0).max(100),
  telegramEnabled: z.boolean(),
  telegramChatId: z.string().trim().regex(/^-?[0-9]{1,20}$|^$/).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }

  const input = settingsSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json(
      { error: 'The search settings are invalid.' },
      { status: 400 },
    );
  }

  if (input.data.enabled) {
    const { count, error } = await supabase.from('candidate_facts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('verification_status', 'verified');
    if (error || !count) return NextResponse.json({ error: 'Complete your profile and verify your facts before enabling automation.' }, { status: 409 });
  }
  const now = new Date();
  const { data: currentSchedule } = await supabase
    .from('search_schedules')
    .select('last_run_at,telegram_chat_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const cadenceAnchor = currentSchedule?.last_run_at
    ? new Date(currentSchedule.last_run_at).getTime()
    : now.getTime();
  const telegramChatId = input.data.telegramChatId ?? currentSchedule?.telegram_chat_id ?? '';
  if (input.data.telegramEnabled && !telegramChatId) return NextResponse.json({ error: 'Enter your Telegram chat ID before enabling alerts.' }, { status: 400 });
  const nextRunAt = input.data.enabled
    ? new Date(
        Math.max(
          now.getTime(),
          cadenceAnchor + input.data.intervalMinutes * 60_000,
        ),
      ).toISOString()
    : null;
  const { error } = await supabase.from('search_schedules').upsert(
    {
      user_id: user.id,
      enabled: input.data.enabled,
      interval_minutes: input.data.intervalMinutes,
      notification_threshold: input.data.notificationThreshold,
      telegram_enabled: input.data.telegramEnabled,
      telegram_chat_id: telegramChatId || null,
      next_run_at: nextRunAt,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return NextResponse.json(
      { error: 'Could not save search settings.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, nextRunAt });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
