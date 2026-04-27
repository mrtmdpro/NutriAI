import "server-only";
import { Resend } from "resend";
import { requireServerEnv, isMissingEnvError } from "@/lib/env/server";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (client) return client;
  try {
    const key = requireServerEnv("RESEND_API_KEY");
    client = new Resend(key);
    return client;
  } catch (err) {
    if (isMissingEnvError(err)) return null;
    throw err;
  }
}

export type EmailReminder = {
  to: string;
  subject: string;
  text: string;
};

export async function sendReminderEmail(
  reminder: EmailReminder
): Promise<{ ok: boolean; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, error: "resend_not_configured" };

  try {
    const { error } = await c.emails.send({
      from: "NutriAI <reminders@nutriai.app>",
      to: reminder.to,
      subject: reminder.subject,
      text: reminder.text,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
