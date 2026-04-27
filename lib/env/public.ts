import { z } from "zod";

// Public env vars are bundled into the browser. Keep this set minimal —
// nothing prefixed with NEXT_PUBLIC_ should be a secret.
//
// Module-load validation is loose so `next build` succeeds before
// Supabase Marketplace provisioning. Runtime strictness lives in
// requirePublicEnv() and fires the first time the value is read.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export const publicEnv = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
