import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}
