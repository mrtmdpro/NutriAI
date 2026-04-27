import "server-only";
import webpush, { type WebPushError } from "web-push";
import { requireServerEnv, isMissingEnvError } from "@/lib/env/server";
import { createServiceClient } from "@/lib/supabase/server";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const publicKey = requireServerEnv("WEB_PUSH_PUBLIC_KEY");
  const privateKey = requireServerEnv("WEB_PUSH_PRIVATE_KEY");
  const contact = requireServerEnv("WEB_PUSH_CONTACT_EMAIL");
  webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey);
  configured = true;
}

export type ReminderPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendReminder(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: ReminderPayload;
}): Promise<{ ok: true } | { ok: false; gone: boolean; error: string }> {
  try {
    ensureConfigured();
  } catch (err) {
    if (isMissingEnvError(err)) {
      return { ok: false, gone: false, error: "vapid_not_configured" };
    }
    throw err;
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: input.endpoint,
        keys: { p256dh: input.p256dh, auth: input.auth },
      },
      JSON.stringify(input.payload)
    );
    return { ok: true };
  } catch (err) {
    const e = err as WebPushError;
    // 404 / 410 = subscription is dead, drop it.
    const gone = e.statusCode === 404 || e.statusCode === 410;
    return {
      ok: false,
      gone,
      error: e.message || "webpush_failed",
    };
  }
}

/**
 * Best-effort cleanup: when sendReminder reports `gone`, remove the
 * subscription so we don't keep retrying.
 */
export async function dropDeadSubscription(endpoint: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch (err) {
    if (isMissingEnvError(err)) return;
    console.error("[push] dropDeadSubscription failed:", err);
  }
}
