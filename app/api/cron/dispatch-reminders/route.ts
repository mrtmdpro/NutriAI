import "server-only";
import { isAuthorizedCron, unauthorized } from "@/lib/cron/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sendReminder, dropDeadSubscription } from "@/lib/push/server";
import { sendReminderEmail } from "@/lib/reminders/email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reminder dispatcher. Runs every 5 minutes via Vercel Cron.
 *
 * For every enabled regimen_item, computes the next time slot in the
 * regimen's timezone, checks whether it falls inside the [now-5min, now]
 * window, and fires push + email per the item's notification prefs.
 *
 * Idempotency: `reminder_log` has a UNIQUE on
 * `(regimen_item_id, scheduled_for, channel)` and we INSERT … ON
 * CONFLICT DO NOTHING; a cron retry can't double-send.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();

  const supabase = createServiceClient();
  const stats = {
    items: 0,
    due_slots: 0,
    push_sent: 0,
    push_dead: 0,
    email_sent: 0,
    errors: 0,
  };

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  type ItemRow = {
    id: string;
    label: string;
    dose: number | null;
    unit: string | null;
    days_of_week: number[];
    times_of_day: string[];
    notify_push: boolean;
    notify_email: boolean;
    enabled: boolean;
    regimens: {
      timezone: string;
      enabled: boolean;
      user_id: string;
      profiles: { email: string } | null;
    } | null;
  };

  const { data: items, error: itErr } = await supabase
    .from("regimen_items")
    .select(
      `
      id, label, dose, unit, days_of_week, times_of_day,
      notify_push, notify_email, enabled,
      regimens (
        timezone, enabled, user_id,
        profiles:profiles!inner ( email )
      )
    `
    )
    .eq("enabled", true);
  if (itErr) {
    return Response.json(
      { ok: false, stats, error: itErr.message },
      { status: 500 }
    );
  }

  const dueByUser = new Map<
    string,
    Array<{
      item: ItemRow;
      scheduledFor: Date;
      timeOfDay: string;
    }>
  >();

  for (const itemRaw of (items ?? []) as unknown as ItemRow[]) {
    if (!itemRaw.regimens?.enabled) continue;
    stats.items += 1;
    const tz = itemRaw.regimens.timezone;

    for (const time of itemRaw.times_of_day) {
      const scheduled = scheduledForToday(now, time, tz);
      if (!scheduled) continue;
      if (scheduled < fiveMinAgo || scheduled > now) continue;

      const dow = dayOfWeek(scheduled, tz);
      if (
        itemRaw.days_of_week.length > 0 &&
        !itemRaw.days_of_week.includes(dow)
      ) {
        continue;
      }
      stats.due_slots += 1;
      const userId = itemRaw.regimens.user_id;
      const arr = dueByUser.get(userId) ?? [];
      arr.push({ item: itemRaw, scheduledFor: scheduled, timeOfDay: time });
      dueByUser.set(userId, arr);
    }
  }

  for (const [userId, slots] of dueByUser) {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .eq("user_id", userId);

    for (const slot of slots) {
      // Push channel
      if (slot.item.notify_push && subs && subs.length > 0) {
        const inserted = await tryInsertReminderLog(
          supabase,
          slot.item.id,
          slot.scheduledFor,
          "push"
        );
        if (inserted) {
          for (const sub of subs) {
            const result = await sendReminder({
              endpoint: sub.endpoint as string,
              p256dh: sub.p256dh as string,
              auth: sub.auth_key as string,
              payload: {
                title: slot.item.label,
                body: buildReminderBody(slot.item, slot.timeOfDay),
                url: "/dashboard",
                tag: slot.item.id,
              },
            });
            if (result.ok) {
              stats.push_sent += 1;
            } else {
              stats.errors += 1;
              if (result.gone) {
                stats.push_dead += 1;
                await dropDeadSubscription(sub.endpoint as string);
              }
            }
          }
        }
      }

      // Email channel
      if (slot.item.notify_email) {
        const inserted = await tryInsertReminderLog(
          supabase,
          slot.item.id,
          slot.scheduledFor,
          "email"
        );
        if (inserted) {
          const email = slot.item.regimens?.profiles?.email;
          if (email) {
            const result = await sendReminderEmail({
              to: email,
              subject: `NutriAI · ${slot.item.label}`,
              text: buildReminderBody(slot.item, slot.timeOfDay),
            });
            if (result.ok) stats.email_sent += 1;
            else stats.errors += 1;
          }
        }
      }
    }
  }

  return Response.json({ ok: true, stats });
}

function buildReminderBody(
  item: { label: string; dose: number | null; unit: string | null },
  timeOfDay: string
): string {
  const parts: string[] = [];
  if (item.dose != null && item.unit) {
    parts.push(`${item.dose} ${item.unit}`);
  }
  parts.push(`@ ${timeOfDay}`);
  return parts.join(" · ");
}

async function tryInsertReminderLog(
  supabase: ReturnType<typeof createServiceClient>,
  itemId: string,
  scheduledFor: Date,
  channel: "push" | "email"
): Promise<boolean> {
  const { error } = await supabase.from("reminder_log").insert({
    regimen_item_id: itemId,
    scheduled_for: scheduledFor.toISOString(),
    channel,
  });
  // Unique-violation = already fired for this slot; treat as a no-op.
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[dispatch-reminders] reminder_log insert failed:", error);
  return false;
}

function scheduledForToday(now: Date, hhmm: string, tz: string): Date | null {
  const re = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!re.test(hhmm)) return null;
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = dateParts.find((p) => p.type === "year")?.value ?? "1970";
  const m = dateParts.find((p) => p.type === "month")?.value ?? "01";
  const d = dateParts.find((p) => p.type === "day")?.value ?? "01";

  const naive = new Date(`${y}-${m}-${d}T${hhmm}:00Z`);
  const offset = timezoneOffsetMinutes(naive, tz);
  return new Date(naive.getTime() - offset * 60_000);
}

function dayOfWeek(at: Date, tz: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(at);
  return (
    {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    }[name] ?? 0
  );
}

function timezoneOffsetMinutes(at: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const localMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return Math.round((localMs - at.getTime()) / 60_000);
}
