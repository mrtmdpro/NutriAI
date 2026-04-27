import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingEnvError } from "@/lib/env/server";

const FREE_DAILY_LIMIT = 10;

export type Plan = "free" | "pro";

export async function checkAndRecordChatMessage(input: {
  userId: string;
  plan: Plan;
}): Promise<{ ok: true } | { ok: false; reason: "limit"; remaining: 0 }> {
  if (input.plan === "pro") return { ok: true };

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    // No Supabase configured — assume rate limit doesn't apply yet (dev only).
    if (isMissingEnvError(err)) return { ok: true };
    throw err;
  }

  const { data: count } = await supabase.rpc("chat_messages_today", {
    p_user_id: input.userId,
  });
  const used = typeof count === "number" ? count : Number(count ?? 0);
  if (used >= FREE_DAILY_LIMIT) {
    return { ok: false, reason: "limit", remaining: 0 };
  }

  // Fire-and-forget insert; eventual consistency on the count is OK
  // for a soft rate limit.
  await supabase.from("chat_message_log").insert({ user_id: input.userId });
  return { ok: true };
}

export async function getUserPlan(userId: string): Promise<Plan> {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    if (isMissingEnvError(err)) return "free";
    throw err;
  }
  const { data } = await supabase
    .from("profiles")
    .select("plan, pro_until")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return "free";
  if (data.plan === "pro") {
    if (!data.pro_until) return "pro";
    if (new Date(data.pro_until as string).getTime() > Date.now()) {
      return "pro";
    }
  }
  return "free";
}

export const CHAT_FREE_DAILY_LIMIT = FREE_DAILY_LIMIT;
