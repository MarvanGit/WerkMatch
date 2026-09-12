// Explicit opt-in integration check. Creates and removes only its own temporary
// accounts and objects. Never runs searches, sends messages, or submits applications.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const base = 'http://localhost:3000';
const accounts: {id:string;email:string;password:string}[] = [];
const uploaded: string[] = [];
const fresh = () => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
try {
  const blocked = await fresh().auth.signUp({email:`werkmatch-blocked-${crypto.randomUUID()}@example.com`,password:crypto.randomUUID()});
  assert.ok(blocked.error,'Direct public registration must fail');
  console.log('PASS: direct public registration blocked');
  for (let i=0;i<2;i++) {
    const email = `werkmatch-test-${crypto.randomUUID()}@example.com`; const password=crypto.randomUUID();
    assert.ifError((await admin.from('account_invitations').insert({email})).error);
    const result=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{werkmatch_access:'invited'}});
    assert.ifError(result.error); accounts.push({id:result.data.user!.id,email,password});
  }
  const a=fresh(),b=fresh();
  assert.ifError((await a.auth.signInWithPassword(accounts[0])).error);
  assert.ifError((await b.auth.signInWithPassword(accounts[1])).error);
  const defaults=await a.from('search_schedules').select('enabled,telegram_enabled').single();
  assert.deepEqual(defaults.data,{enabled:false,telegram_enabled:false});
  const login=await fetch(base+'/auth/password',{method:'POST',body:new URLSearchParams({email:accounts[0].email,password:accounts[0].password}),redirect:'manual'});
  assert.equal(login.status,303);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(cookie);
  const cv=String.raw`\documentclass{article}
\begin{document}
Alex Example is a Computer Science student at Example University, third semester.
\section{Skills}React, TypeScript, Python, Git.
\section{Projects}Study Planner: built accessible React forms and TypeScript components.
\section{Experience}Example Studio: student assistant, developed Python regression tests in 2025.
\end{document}`;
  const cover=await readFile(new URL('../public/templates/cover-letter.tex',import.meta.url),'utf8');
  const form=new FormData(); form.set('cv',new File([cv],'cv.tex'));form.set('cover',new File([cover],'cover-letter.tex'));
  const uploadResponse=await fetch(base+'/api/onboarding/upload',{method:'POST',headers:{cookie},body:form});
  const upload=await uploadResponse.json() as {cvKey:string;coverKey:string;cvHash:string;facts:unknown[];error?:string};
  assert.equal(uploadResponse.status,200,upload.error);
  uploaded.push(upload.cvKey,upload.coverKey);
  assert.ok(upload.facts.length);
  console.log('PASS: authenticated template upload and AI fact extraction');
  const payload={...upload,displayName:'Alex Example',homeCity:'Munich',germanLevel:'B2',englishLevel:'C1',location:'remote-only',roleKeywords:'React, Python',study:'Ich studiere Informatik im dritten Semester.',availability:'Ab Oktober stehe ich für 16 Stunden pro Woche zur Verfügung.',confirmed:true};
  const save=await fetch(base+'/api/onboarding',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(save.status,200,await save.text());
  const facts=await a.from('candidate_facts').select('*');
  assert.ok(facts.data!.length>1); assert.equal(facts.data![0].verification_status,'verified');
  assert.equal((await b.from('candidate_facts').select('*').eq('user_id',accounts[0].id)).data!.length,0);
  assert.ok((await b.storage.from('candidate-assets').download(upload.cvKey)).error);
  assert.ok((await b.rpc('save_werkmatch_profile',{payload})).error);
  assert.ok((await b.rpc('consume_werkmatch_usage',{requested_user:accounts[0].id,requested_operation:'generation'})).error);
  console.log('PASS: profile persistence and cross-account database/storage isolation');
  const quota=await Promise.all(Array.from({length:12},()=>a.rpc('consume_werkmatch_usage',{requested_user:accounts[0].id,requested_operation:'generation'})));
  quota.forEach(result=>assert.ifError(result.error));
  assert.equal(quota.filter(result=>result.data===true).length,8);
  console.log('PASS: atomic daily quota under concurrent requests');
  const job=await a.from('jobs').insert({user_id:accounts[0].id,source:'test',canonical_url:'https://example.com/'+crypto.randomUUID(),title:'Fictional role',company:'Fictional company',description:'Temporary quota test only.',location_text:'Munich',employment_type:'Working Student',content_fingerprint:'test'}).select('id').single();
  assert.ifError(job.error);
  const rejected=await a.from('generation_requests').insert({user_id:accounts[0].id,job_id:job.data!.id,profile_version:1,template_version:1});
  assert.ok(rejected.error?.message.includes('Daily generation limit'));
  console.log('PASS: direct database inserts cannot bypass the generation quota');
  const settings=await fetch(base+'/api/settings',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({enabled:false,intervalMinutes:360,notificationThreshold:80,telegramEnabled:false,telegramChatId:''})});
  assert.equal(settings.status,200);
  for (const path of ['/api/onboarding','/api/onboarding/upload','/api/search/run']) {
    const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
  }
  const privatePage=await fetch(base+'/profile',{redirect:'manual'});assert.equal(privatePage.status,307);
  console.log('PASS: unauthenticated private routes rejected; personal settings saved');
  // A generated invitation exercises the email-link flow without sending mail.
  const invited=await admin.auth.admin.generateLink({type:'recovery',email:accounts[1].email});
  assert.ifError(invited.error);
  const accepted=await fetch(base+'/auth/confirm?type=recovery&token_hash='+encodeURIComponent(invited.data.properties.hashed_token),{redirect:'manual'});
  assert.equal(accepted.status,307);assert.ok(accepted.headers.get('location')?.endsWith('/account/password'));
  assert.ok(accepted.headers.getSetCookie().length);
  console.log('PASS: invitation acceptance leads to password setup without sending email');
} finally {
  if(uploaded.length) assert.ifError((await admin.storage.from('candidate-assets').remove(uploaded)).error);
  for(const account of accounts) assert.ifError((await admin.auth.admin.deleteUser(account.id)).error);
  console.log('Temporary test accounts and uploaded files removed.');
}
