import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

const settingsSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(15).max(10_080),
  notificationThreshold: z.number().int().min(0).max(100),
  telegramEnabled: z.boolean(),
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

  const now = new Date();
  const nextRunAt = input.data.enabled
    ? new Date(
        now.getTime() + input.data.intervalMinutes * 60_000,
      ).toISOString()
    : null;
  const { error } = await supabase.from('search_schedules').upsert(
    {
      user_id: user.id,
      enabled: input.data.enabled,
      interval_minutes: input.data.intervalMinutes,
      notification_threshold: input.data.notificationThreshold,
      telegram_enabled: input.data.telegramEnabled,
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
