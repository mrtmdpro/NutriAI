import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env/server";

/**
 * Validate that a request is coming from Vercel Cron (or our own
 * scheduled invocations). Vercel Cron sets the `Authorization` header
 * to `Bearer ${CRON_SECRET}` when calling `/api/cron/*` paths.
 *
 * Uses `timingSafeEqual` so we don't leak `CRON_SECRET` byte-by-byte to
 * a latency oracle on the public cron URLs.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) {
    // Env not provisioned yet. Return 401 (via caller) rather than 500
    // so Vercel Cron treats the failure as transient and stops retrying.
    return false;
  }

  const expected = `Bearer ${secret}`;
  const header = request.headers.get("authorization") ?? "";

  // Length check is intentionally not constant-time: the prefix is fixed
  // and the secret has a fixed width that we control.
  if (header.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

/** Vercel Pro/Team allow up to 60s by default; raise via `maxDuration` per route. */
export const CRON_DEFAULT_TIMEOUT_S = 60;
