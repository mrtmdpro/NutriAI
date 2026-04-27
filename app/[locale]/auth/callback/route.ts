import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import { safeNext, isKnownLocale } from "@/lib/auth/safe-next";

/**
 * Supabase OAuth + email-confirmation callback.
 *
 * Supabase redirects here with `?code=<exchange_code>` (PKCE) after either
 * an OAuth provider login or an email-confirmation link. We swap the code
 * for a session via `exchangeCodeForSession`, then bounce to `?next` (or
 * the default dashboard).
 *
 * Note: this is a Route Handler (not a page) so we can return a 302 cleanly
 * before any rendering happens.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale: rawLocale } = await params;
  const locale = isKnownLocale(rawLocale) ? rawLocale : routing.defaultLocale;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failed = new URL(`/${locale}/login`, request.url);
    failed.searchParams.set("error", "callback_failed");
    return NextResponse.redirect(failed);
  }

  const target = safeNext(requestedNext ?? undefined, locale);
  return NextResponse.redirect(new URL(target, request.url));
}
