import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildVietQrImageUrl } from "@/lib/payments/sepay";
import { isMissingEnvError } from "@/lib/env/server";

export const runtime = "nodejs";

const querySchema = z.object({
  code: z.string().regex(/^NUTRI[A-Z0-9]{16}$/),
  amount: z.coerce.number().int().min(1_000).max(100_000_000),
});

/**
 * Server-side proxy that builds the VietQR image URL and 302s to it.
 * We don't expose the bank account/holder in client JS bundles; the
 * client only sees the unique payment_code for its own pending order.
 *
 * Auth: the requested `code` must match a `subscriptions` row owned
 * by the current user.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    code: url.searchParams.get("code"),
    amount: url.searchParams.get("amount"),
  });
  if (!parsed.success) return new Response("bad request", { status: 400 });

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return new Response("not configured", { status: 503 });
    throw err;
  }
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id, status, amount_vnd")
    .eq("payment_code", parsed.data.code)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return new Response("not found", { status: 404 });
  }
  if (sub.status !== "pending") {
    return new Response("not pending", { status: 410 });
  }
  if (sub.amount_vnd !== parsed.data.amount) {
    return new Response("amount mismatch", { status: 400 });
  }

  let qrUrl: string;
  try {
    qrUrl = buildVietQrImageUrl({
      amountVnd: parsed.data.amount,
      memo: parsed.data.code,
    });
  } catch (err) {
    if (isMissingEnvError(err)) return new Response("not configured", { status: 503 });
    throw err;
  }
  return NextResponse.redirect(qrUrl, { status: 302 });
}
