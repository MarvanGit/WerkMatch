import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractProfile } from '@/lib/ai/extract-profile';
import { validateTex } from '@/lib/domain/onboarding';
import { renderTailoredDocuments } from '@/lib/documents/render';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: 'Sign in to upload your documents.' },
      { status: 401 },
    );
  if (Number(request.headers.get('content-length') ?? 0) > 500_000)
    return NextResponse.json(
      { error: 'Uploads must total less than 500 KB.' },
      { status: 413 },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Choose your template files.' }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 500_000) { await reader.cancel(); return NextResponse.json({ error: 'Uploads must total less than 500 KB.' }, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    const form = await new Response(bytes,{ headers:{ 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
    const cv = form.get('cv');
    const cover = form.get('cover');
    if (
      !(cv instanceof File) ||
      !(cover instanceof File) ||
      !cv.name.endsWith('.tex') ||
      !cover.name.endsWith('.tex') ||
      cv.size > 200_000 ||
      cover.size > 200_000
    )
      return NextResponse.json(
        {
          error:
            'Choose a CV and a cover-letter template as .tex files, each under 200 KB.',
        },
        { status: 400 },
      );
    const cvText = await cv.text();
    const coverText = await cover.text();
    validateTex(cvText);
    validateTex(coverText);
    try {
      renderTailoredDocuments({ masterTemplate: cvText, coverLetterTemplate: coverText, facts: [], plan: { documentLanguage:'de',factPriorityIds:[],coverLetter:{subject:'Bewerbung',salutation:'Sehr geehrtes Team,',paragraphs:[{text:'Template check.',evidenceFactIds:[]}],closing:'Mit freundlichen Grüßen'} } });
    } catch {
      return NextResponse.json({ error: 'The cover-letter structure is not supported. Download the compatible starter, fill in your sender details, and upload it again.' }, { status: 422 });
    }
    const { data: allowed, error: quotaError } = await supabase.rpc(
      'consume_werkmatch_usage',
      { requested_user: user.id, requested_operation: 'upload' },
    );
    if (quotaError)
      return NextResponse.json(
        { error: 'Upload service is unavailable. Please try again later.' },
        { status: 503 },
      );
    if (!allowed)
      return NextResponse.json(
        {
          error:
            'You have reached the limit of 3 CV extractions today. Try again tomorrow.',
        },
        { status: 429 },
      );
    const facts = await extractProfile(cvText);
    const prefix = `${user.id}/${crypto.randomUUID()}`;
    const cvKey = `${prefix}-cv.tex`;
    const coverKey = `${prefix}-cover-letter.tex`;
    const cvHash = [
      ...new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cvText)),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    for (const [key, text] of [
      [cvKey, cvText],
      [coverKey, coverText],
    ]) {
      const { error } = await supabase.storage
        .from('candidate-assets')
        .upload(key, text, { contentType: 'application/x-tex', upsert: false });
      if (error) {
        await supabase.storage
          .from('candidate-assets')
          .remove([cvKey, coverKey]);
        throw new Error('The documents could not be stored. Please retry.');
      }
    }
    return NextResponse.json({ facts, cvKey, coverKey, cvHash });
  } catch {
    return NextResponse.json(
      {
        error:
          'Could not process these templates. Check that both files are complete UTF-8 LaTeX documents and try again.',
      },
      { status: 422 },
    );
  }
}
