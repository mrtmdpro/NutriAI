import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requirePublicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

/**
 * Refresh the Supabase session inside Next.js's proxy/middleware step.
 *
 * Returns a (possibly recreated) NextResponse so callers always
 * forward the latest cookie state. The recreation pattern follows
 * Supabase's canonical SSR guidance:
 *   1. setAll writes to request.cookies (so downstream reads see them)
 *   2. NextResponse.next({ request }) clones the request with the updates
 *   3. cookies are then re-applied to the new response
 *
 * If the session is cleared (SIGNED_OUT) or refreshed, the response
 * we return contains the appropriate Set-Cookie directives. Drop them
 * at your peril.
 */
export async function updateSession(
  request: NextRequest,
  initialResponse: NextResponse
) {
  let response = initialResponse;

  const supabase = createServerClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          const next = NextResponse.next({ request });

          // Preserve any headers/cookies the prior response carried
          // (e.g. NEXT_LOCALE from next-intl middleware).
          response.headers.forEach((value, key) => {
            // Avoid clobbering the new response's own framework headers.
            if (!next.headers.has(key)) {
              next.headers.set(key, value);
            }
          });
          for (const cookie of response.cookies.getAll()) {
            next.cookies.set(cookie);
          }
          for (const { name, value, options } of cookiesToSet) {
            next.cookies.set(name, value, options);
          }

          response = next;
        },
      },
    }
  );

  // Calling getUser() forces a token-refresh check; setAll fires
  // when SIGNED_OUT / TOKEN_REFRESHED / USER_UPDATED events occur.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
