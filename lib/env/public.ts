import { z } from "zod";

// Public env vars are bundled into the browser. Keep this set minimal —
// nothing prefixed with NEXT_PUBLIC_ should be a secret.
//
// Module-load validation is loose so `next build` succeeds before
// Supabase Marketplace provisioning. Runtime strictness lives in
// requirePublicEnv() and fires the first time the value is read.
//
// Supabase is renaming the "anon key" to "publishable key" (sb_publishable_*).
// We accept either name and fall back, so the codebase works with both
// the old (Marketplace-injected) and new (manual) env conventions.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

const rawAnon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const publicEnv = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: rawAnon,
});

export function requirePublicEnv<K extends keyof typeof publicEnv>(
  key: K
): NonNullable<(typeof publicEnv)[K]> {
  const value = publicEnv[key];
  if (!value) {
    throw new Error(
      `Missing required env var: ${key}. Set it in .env.local or via 'vercel env pull'.`
    );
  }
  return value as NonNullable<(typeof publicEnv)[K]>;
}
