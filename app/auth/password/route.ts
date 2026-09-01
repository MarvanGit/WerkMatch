import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function loginRedirect(request: NextRequest, error: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('error', error);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const emailEntry = formData.get('email');
  const passwordEntry = formData.get('password');
  const email = typeof emailEntry === 'string' ? emailEntry.trim() : '';
  const password = typeof passwordEntry === 'string' ? passwordEntry : '';

  if (!email || !password) {
    return loginRedirect(request, 'missing-credentials');
  }

  const destination = request.nextUrl.clone();
  destination.pathname = '/';
  destination.search = '';
  const response = NextResponse.redirect(destination, 303);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !session) {
    return loginRedirect(
      request,
      error?.message === 'Invalid login credentials'
        ? 'invalid-credentials'
        : 'sign-in-failed',
    );
  }

  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
