"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  next: z.string().optional(),
});

export type AuthResult =
  | { ok: true; checkInbox?: boolean }
  | {
      ok: false;
      code: "invalid_credentials" | "weak_password" | "generic";
    };

/**
 * Sign in with email + password.
 *
 * On success, this throws a NEXT_REDIRECT to the validated `next` path
 * — the calling client never sees a normal return value. On failure,
 * returns an `AuthResult` with `ok: false` so the form can render a
 * locale-aware error.
 *
 * We intentionally use the bare `redirect()` from next/navigation
 * (not the typed next-intl version) because `next` is already a fully
 * locale-prefixed path. Routing it through the typed router would
 * double-prefix to `/vi/vi/dashboard`.
 */
export async function signInWithPassword(
  formData: FormData
): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, code: "invalid_credentials" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.message.toLowerCase().includes("invalid")) {
      return { ok: false, code: "invalid_credentials" };
    }
    return { ok: false, code: "generic" };
  }

  const locale = await getLocale();
  redirect(safeNext(parsed.data.next, locale));
}

/**
 * Sign up with email + password. On success returns `ok: true` with
 * `checkInbox: true` if Supabase requires email confirmation; otherwise
 * throws a NEXT_REDIRECT to the validated `next` path.
 *
 * To prevent email enumeration, ALL signup attempts that look like the
 * email is already registered return the same "check your inbox" UX as
 * a fresh signup (Supabase's default behavior on duplicates is to
 * silently send a notice to the existing email — we don't surface that
 * to the requester).
 */
export async function signUpWithPassword(
  formData: FormData
): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "password")) {
      return { ok: false, code: "weak_password" };
    }
    return { ok: false, code: "generic" };
  }

  const supabase = await createClient();
  const locale = await getLocale();
  const reqHeaders = await headers();
  const origin =
    reqHeaders.get("origin") ??
    (reqHeaders.get("host") ? `https://${reqHeaders.get("host")}` : "");

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/${locale}/auth/callback?next=${encodeURIComponent(
        safeNext(parsed.data.next, locale)
      )}`,
    },
  });

  if (error) {
    // Map only the bug-class errors. Anything that hints at "already
    // registered" gets the generic "check your inbox" response so an
    // attacker can't enumerate registered emails.
    if (error.message.toLowerCase().includes("password")) {
      return { ok: false, code: "weak_password" };
    }
    if (error.message.toLowerCase().includes("registered")) {
      return { ok: true, checkInbox: true };
    }
    return { ok: false, code: "generic" };
  }

  if (!data.session) {
    // Email confirmation required (the default for production projects).
    return { ok: true, checkInbox: true };
  }

  redirect(safeNext(parsed.data.next, locale));
}

export async function signInWithGoogle(nextPath?: string): Promise<
  | { ok: true; url: string }
  | { ok: false; code: "generic" }
> {
  const supabase = await createClient();
  const locale = await getLocale();
  const reqHeaders = await headers();
  const origin =
    reqHeaders.get("origin") ??
    (reqHeaders.get("host") ? `https://${reqHeaders.get("host")}` : "");

  const safe = safeNext(nextPath, locale);
  const callbackUrl = `${origin}/${locale}/auth/callback?next=${encodeURIComponent(
    safe
  )}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl },
  });
  if (error || !data.url) {
    return { ok: false, code: "generic" };
  }
  return { ok: true, url: data.url };
}

/**
 * Sign the current user out. Caller is responsible for navigating
 * after the action resolves (use the typed router from @/i18n/navigation).
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
