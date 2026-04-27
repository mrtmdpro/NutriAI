"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PRICING,
  generatePaymentCode,
  buildVietQrImageUrl,
  getRecipient,
  type Period,
} from "@/lib/payments/sepay";
import { isMissingEnvError } from "@/lib/env/server";

const startSchema = z.object({
  period: z.enum(["monthly", "yearly"]),
});

export type StartPaymentResult =
  | {
      ok: true;
      paymentCode: string;
      qrUrl: string;
      amountVnd: number;
      period: Period;
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    }
  | { ok: false; error: "auth" | "config" | "db" };

export async function startPayment(
  formData: FormData
): Promise<StartPaymentResult> {
  const parsed = startSchema.safeParse({ period: formData.get("period") });
  if (!parsed.success) return { ok: false, error: "config" };
  const period = parsed.data.period;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    if (isMissingEnvError(err)) return { ok: false, error: "config" };
    throw err;
  }

  const paymentCode = generatePaymentCode(user.id);
  const amount = PRICING[period].vnd;

  const { error } = await supabase.from("subscriptions").insert({
    user_id: user.id,
    payment_code: paymentCode,
    status: "pending",
    period,
    amount_vnd: amount,
  });
  if (error) {
    console.error("[payments] insert pending failed:", error);
    return { ok: false, error: "db" };
  }

  let qrUrl: string;
  let recipient;
  try {
    qrUrl = buildVietQrImageUrl({ amountVnd: amount, memo: paymentCode });
    recipient = getRecipient();
  } catch (err) {
    if (isMissingEnvError(err)) return { ok: false, error: "config" };
    throw err;
  }

  revalidatePath("/account/billing");
  return {
    ok: true,
    paymentCode,
    qrUrl,
    amountVnd: amount,
    period,
    bankName: recipient.bankName,
    accountNumber: recipient.accountNumber,
    accountHolder: recipient.accountHolder,
  };
}

export async function cancelPendingSubscription(
  paymentCode: string
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    if (isMissingEnvError(err)) return { ok: false };
    throw err;
  }
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("user_id", user.id)
    .eq("payment_code", paymentCode)
    .eq("status", "pending");
  if (error) return { ok: false };
  revalidatePath("/account/billing");
  return { ok: true };
}
