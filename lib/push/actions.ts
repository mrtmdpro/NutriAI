"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

export type SaveSubscriptionInput = z.infer<typeof subscriptionSchema>;

export async function saveSubscription(
  input: SaveSubscriptionInput
): Promise<{ ok: boolean }> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth_key: parsed.data.auth,
      user_agent: parsed.data.userAgent ?? null,
    },
    { onConflict: "endpoint", ignoreDuplicates: false }
  );
  if (error) {
    console.error("[push] saveSubscription failed:", error);
    return { ok: false };
  }
  return { ok: true };
}

export async function getPushPublicKey(): Promise<string | null> {
  const key = process.env.WEB_PUSH_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}
