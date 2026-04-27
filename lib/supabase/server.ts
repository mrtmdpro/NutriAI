import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/env/public";
import { requireServerEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored when middleware refreshes the session.
          }
        },
      },
    }
  );
}

export function createServiceClient() {
  // Service-role client for trusted server-only operations (cron, webhooks).
  // Never import this from a Client Component.
  return createServerClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      cookies: {
        getAll: () => [],
        setAll: () => {
          /* no-op: service client must not write cookies */
        },
      },
    }
  );
}
