import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isMissingEnvError } from "@/lib/env/server";

export const getCurrentUser = cache(async () => {
  // Returns the authenticated user (or null) for use in Server Components
  // and route handlers. Always uses cookie-bound session via @supabase/ssr.
  // Memoized per render via React.cache so multiple components on the same
  // page share a single Supabase round-trip.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (err) {
    // Pre-Marketplace install: render as logged-out. Anything else is a
    // real bug we don't want to silently swallow.
    if (isMissingEnvError(err)) {
      return null;
    }
    throw err;
  }
});
