import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PREFIXES = ["/dashboard", "/account", "/chat"];

const LOCALE_PREFIX_RE = /^\/(vi|en)(?=\/|$)/;

function isProtectedPath(pathname: string): boolean {
  // Strip locale prefix before matching against PROTECTED_PREFIXES.
  const stripped = pathname.replace(LOCALE_PREFIX_RE, "") || "/";
  return PROTECTED_PREFIXES.some(
    (prefix) => stripped === prefix || stripped.startsWith(`${prefix}/`)
  );
}

function supabaseConfigured(): boolean {
  // Env vars are present once the Supabase Marketplace install completes.
  // Before that, we render the public app shell as logged-out.
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function proxy(request: NextRequest) {
  // Run intl first so the response carries locale-aware cookies/headers.
  let response = intlMiddleware(request);

  let user = null;
  if (supabaseConfigured()) {
    try {
      const result = await updateSession(request, response);
      response = result.response;
      user = result.user;
    } catch (err) {
      // Real Supabase failure (network/5xx). Don't bounce the user;
      // log and treat as unauthenticated for this request only.
      console.error("[proxy] supabase getUser failed", err);
    }
  }

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const localeMatch = LOCALE_PREFIX_RE.exec(request.nextUrl.pathname)?.[1];
    const locale = localeMatch ?? routing.defaultLocale;

    // Ensure `next` is locale-prefixed so the post-login redirect lands
    // on a single hop without re-triggering the intl rewrite.
    const nextPath = localeMatch
      ? request.nextUrl.pathname
      : `/${locale}${request.nextUrl.pathname}`;

    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("next", nextPath + request.nextUrl.search);

    const redirectResponse = NextResponse.redirect(loginUrl);
    // Carry over any cookies that intl/Supabase set on `response`,
    // including SIGNED_OUT clears that must reach the browser.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return response;
}

// Anchored prefixes prevent /apiology / /_next-thing from leaking through.
// Next.js 16 requires this to be a literal string the static analyzer can
// resolve, so String.raw cannot be used. NOSONAR
export const config = {
  matcher: ["/((?!api(?:/|$)|_next/|_vercel/|.*\\..*).*)"],
};
