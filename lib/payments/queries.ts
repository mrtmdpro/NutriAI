import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isMissingEnvError } from "@/lib/env/server";

export type Subscription = {
  id: string;
  paymentCode: string;
  status: "pending" | "active" | "canceled" | "expired";
  period: "monthly" | "yearly";
  amountVnd: number;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export async function listSubscriptions(): Promise<Subscription[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, payment_code, status, period, amount_vnd, activated_at, expires_at, created_at"
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[payments] list failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    paymentCode: row.payment_code as string,
    status: row.status as Subscription["status"],
    period: row.period as Subscription["period"],
    amountVnd: row.amount_vnd as number,
    activatedAt: row.activated_at as string | null,
    expiresAt: row.expires_at as string | null,
    createdAt: row.created_at as string,
  }));
}
