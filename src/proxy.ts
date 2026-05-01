import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup'];

function isPublicPath(path: string) {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // If env vars are missing in this environment, don't 500 the whole site —
  // just let public routes render so the user can at least see /login.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('proxy: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the session cookie if expired and tells us who's signed in.
  // If the auth call throws (network blip, bad token, etc.), treat the user as
  // unauthenticated rather than 500-ing the entire site.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error('proxy: supabase.auth.getUser() failed', err);
  }

  const isPublic = isPublicPath(path);

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', path === '/' ? '/' : `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = request.nextUrl.searchParams.get('next') || '/';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip API routes (they do their own auth + would break on HTML redirect),
    // static assets, image optimizer, signout handler, and common file extensions.
    '/((?!api|_next/static|_next/image|auth/signout|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
