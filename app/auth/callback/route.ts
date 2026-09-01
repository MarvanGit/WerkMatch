import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const requestedNext = requestUrl.searchParams.get('next') ?? '/';
  const next = safeRelativePath(requestedNext);
  const response = NextResponse.redirect(new URL(next, request.url));

  if (!code) {
    response.headers.set(
      'Location',
      new URL('/login?error=missing-code', request.url).toString(),
    );
    return response;
  }

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    response.headers.set(
      'Location',
      new URL('/login?error=invalid-link', request.url).toString(),
    );
  }

  return response;
}

function safeRelativePath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
