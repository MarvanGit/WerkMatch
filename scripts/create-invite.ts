// Run locally with --env-file=.env.local. Does not send email.
import { createClient } from '@supabase/supabase-js';
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usage: node --env-file=.env.local scripts/create-invite.ts person@example.com');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const permit = await supabase.from('account_invitations').upsert({email:email.toLowerCase(),expires_at:new Date(Date.now()+300000).toISOString()});
if(permit.error) throw new Error('Could not authorize the invitation.');
const {error} = await supabase.auth.admin.createUser({email,password:crypto.randomUUID()+crypto.randomUUID(),email_confirm:true,app_metadata:{werkmatch_access:'invited'}});
if(error) throw new Error('Could not create the invited account: '+error.message);
const link = await supabase.auth.admin.generateLink({type:'recovery',email});
if(link.error) throw new Error('Account created, but setup link generation failed: '+link.error.message);
const origin=process.env.NEXT_PUBLIC_SITE_URL;
if(!origin) throw new Error('Set NEXT_PUBLIC_SITE_URL to the published website before generating links.');
const setup = new URL('/auth/confirm',origin);
setup.searchParams.set('type','recovery');setup.searchParams.set('token_hash',link.data.properties.hashed_token);
console.log('Share this one-time setup link privately with the invited person. No email has been sent.');
console.log(setup.toString());
