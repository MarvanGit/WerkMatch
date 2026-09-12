// One-time compatibility step: never copy a personal default to multiple accounts.
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:profiles,error}=await db.from('candidate_profiles').select('user_id,cover_letter_template_object_key');
if(error) throw error;
if(profiles?.length !== 1) throw new Error('Expected exactly one existing personal account. No defaults changed.');
const profile=profiles[0];
const schedule=await db.from('search_schedules').select('telegram_chat_id').eq('user_id',profile.user_id).single();
if(schedule.error) throw schedule.error;
if(!schedule.data.telegram_chat_id && process.env.TELEGRAM_CHAT_ID) {
  const result=await db.from('search_schedules').update({telegram_chat_id:process.env.TELEGRAM_CHAT_ID}).eq('user_id',profile.user_id);
  if(result.error) throw result.error;
}
const key=process.env.COVER_LETTER_TEMPLATE_OBJECT_KEY;
if(!profile.cover_letter_template_object_key && key?.startsWith(profile.user_id+'/')) {
  const result=await db.from('candidate_profiles').update({cover_letter_template_object_key:key}).eq('user_id',profile.user_id);
  if(result.error) throw result.error;
}
console.log('Personal notification/template defaults are retained only on the existing account.');
