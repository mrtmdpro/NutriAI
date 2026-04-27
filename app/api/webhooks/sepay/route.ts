import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requireServerEnv, isMissingEnvError } from "@/lib/env/server";
import { SEPAY_IP_ALLOWLIST, PRICING } from "@/lib/payments/sepay";

export const runtime = "nodejs";
export const maxDuration = 30;

const sepaySchema = z.object({
  id: z.number().int(),
  gateway: z.string().optional(),
  transactionDate: z.string().optional(),
  accountNumber: z.string().optional(),
  code: z.string().nullable().optional(),
  content: z.string().optional().default(""),
  transferType: z.enum(["in", "out"]).optional(),
  transferAmount: z.number().nonnegative().optional(),
  accumulated: z.number().optional(),
  subAccount: z.string().nullable().optional(),
  referenceCode: z.string().optional(),
  description: z.string().optional(),
});

/**
 * SePay webhook handler.
 *
 * Security:
 *   1. Source IP must be in the SePay allow-list.
 *   2. Authorization header must be `Apikey ${SEPAY_API_KEY}`.
 *   3. Idempotent on `payment_events.id` (the SePay event id) so a
 *      retry can't double-credit a subscription.
 *
 * Matching:
 *   - `content` (the bank-transfer memo) is searched for a known
 *     `subscriptions.payment_code`. If a match exists and the amount
 *     covers the subscription's `amount_vnd`, we mark the subscription
 *     active and bump `profiles.pro_until`.
 *
 * The handler always returns 200 to SePay so they don't retry, even
 * when we can't match the payment — the payment_events row preserves
 * the raw payload for manual reconciliation.
 */
export async function POST(request: Request) {
  // 1. IP allow-list. Vercel sets `x-forwarded-for` from the edge.
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const sourceIp = xff.split(",")[0].trim();
  if (sourceIp && !SEPAY_IP_ALLOWLIST.includes(sourceIp)) {
    return new Response("forbidden", { status: 403 });
  }

  // 2. Authorization header.
  let expectedKey: string;
  try {
    expectedKey = requireServerEnv("SEPAY_API_KEY");
  } catch (err) {
    if (isMissingEnvError(err)) {
      return new Response("not configured", { status: 503 });
    }
    throw err;
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Apikey ${expectedKey}`) {
    return new Response("unauthorized", { status: 401 });
  }

  // 3. Parse body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const parsed = sepaySchema.safeParse(body);
  if (!parsed.success) {
    console.error("[sepay] schema mismatch:", parsed.error.flatten());
    return new Response("bad request", { status: 400 });
  }
  const event = parsed.data;

  // Skip outgoing transfers — we only credit on inbound deposits.
  if (event.transferType && event.transferType !== "in") {
    return Response.json({ ok: true, ignored: "outbound" });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    if (isMissingEnvError(err)) {
      return new Response("not configured", { status: 503 });
    }
    throw err;
  }

  // 4. Idempotency. Insert the raw event; conflict = duplicate retry.
  const { error: insertErr } = await supabase
    .from("payment_events")
    .insert({ id: event.id, payload: event });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return Response.json({ ok: true, duplicate: true });
    }
    console.error("[sepay] insert payment_events failed:", insertErr);
    return new Response("server error", { status: 500 });
  }

  // 5. Match the payment code in the memo.
  const memo = (event.content ?? "").toUpperCase();
  const codeMatch = /NUTRI[A-Z0-9]{16}/.exec(memo);
  if (!codeMatch) {
    return Response.json({ ok: true, matched: false, reason: "no_code" });
  }
  const paymentCode = codeMatch[0];

  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("id, user_id, period, amount_vnd, status")
    .eq("payment_code", paymentCode)
    .maybeSingle();
  if (subErr || !sub) {
    return Response.json({
      ok: true,
      matched: false,
      reason: "no_subscription",
    });
  }
  if (sub.status === "active") {
    return Response.json({ ok: true, matched: true, alreadyActive: true });
  }

  // 6. Validate amount. Allow over-payment but not under.
  const required = sub.amount_vnd as number;
  const paid = event.transferAmount ?? 0;
  if (paid < required) {
    return Response.json({
      ok: true,
      matched: false,
      reason: "underpaid",
      required,
      paid,
    });
  }

  // 7. Activate. Update subscription + profile in two steps; the
  // service-role client bypasses RLS.
  const period = sub.period as keyof typeof PRICING;
  const days = PRICING[period].days;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const [{ error: subUpdateErr }, { error: profileUpdateErr }] = await Promise.all([
    supabase
      .from("subscriptions")
      .update({
        status: "active",
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        sepay_event_id: event.id,
      })
      .eq("id", sub.id),
    supabase
      .from("profiles")
      .update({
        plan: "pro",
        pro_until: expiresAt.toISOString(),
      })
      .eq("id", sub.user_id),
  ]);

  if (subUpdateErr) {
    console.error("[sepay] sub activate failed:", subUpdateErr);
  }
  if (profileUpdateErr) {
    console.error("[sepay] profile upgrade failed:", profileUpdateErr);
  }

  // Backfill the matched_subscription_id on the event row so audits
  // can trace events to their subscriptions.
  await supabase
    .from("payment_events")
    .update({ matched_subscription_id: sub.id })
    .eq("id", event.id);

  return Response.json({
    ok: true,
    matched: true,
    activatedUntil: expiresAt.toISOString(),
  });
}
