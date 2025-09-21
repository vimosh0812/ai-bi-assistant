import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const redirectUrl = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return url;
  };

  if (request.nextUrl.pathname.startsWith("/dashboard") && error) {
    return NextResponse.redirect(redirectUrl("/auth/sign-in"));
  }

  if (request.nextUrl.pathname === "/" && !error) {
    return NextResponse.redirect(redirectUrl("/dashboard"));
  }

  return response;
}
