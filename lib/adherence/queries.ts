import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isMissingEnvError } from "@/lib/env/server";
import { pickLocale } from "@/lib/i18n/locale-text";
import type { Locale } from "@/i18n/routing";

/**
 * Adherence-tracking server-side queries.
 *
 * Two coordinate systems coexist here:
 *  - Stored: regimen `timezone` + `times_of_day` (HH:MM strings) +
 *    `days_of_week` (0-6, Sun-first).
 *  - Computed: per-user-per-day "scheduled_for" timestamps, used for
 *    today's checklist and adherence math.
 */

export type TodayItem = {
  itemId: string;
  regimenId: string;
  regimenName: string;
  label: string;
  /** Bilingual fallback for KH-linked supplements; null for free-form items. */
  supplementName: string | null;
  supplementSlug: string | null;
  dose: number | null;
  unit: string | null;
  /** "HH:MM" in the regimen timezone. */
  timeOfDay: string;
  /** ISO timestamp marking the scheduled instant in UTC. */
  scheduledFor: string;
  /** Whether this slot has already been logged. */
  taken: boolean;
  /** ISO timestamp of the intake_log row (for "Undo"). */
  takenAt: string | null;
};

type RegimenItemRow = {
  id: string;
  label: string;
  dose: number | null;
  unit: string | null;
  days_of_week: number[];
  times_of_day: string[];
  notify_push: boolean;
  notify_email: boolean;
  enabled: boolean;
  supplement_id: string | null;
  supplements: {
    slug: string;
    name_vn: string | null;
    name_en: string;
  } | null;
};

type RegimenWithItems = {
  id: string;
  name: string;
  timezone: string;
  enabled: boolean;
  regimen_items: RegimenItemRow[];
};

/**
 * Compute the user-local "today" date in their regimen's timezone, then
 * map each regimen_item's `times_of_day` to UTC scheduled_for instants
 * we can join against intake_log.
 */
function buildTodaySlots(
  regimen: RegimenWithItems,
  today: Date
): Array<{ item: RegimenItemRow; timeOfDay: string; scheduledFor: Date }> {
  const slots: Array<{
    item: RegimenItemRow;
    timeOfDay: string;
    scheduledFor: Date;
  }> = [];

  // Compute the day-of-week in the regimen's timezone. Intl gives us
  // the locale-specific weekday; we map it back to 0-6 (Sun=0).
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: regimen.timezone,
    weekday: "long",
  }).format(today);
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const todayDow = dayMap[dayName] ?? 0;

  // Construct the YYYY-MM-DD in the regimen's timezone so we can build
  // an absolute UTC instant for each HH:MM slot.
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: regimen.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(today);
  const y = dateParts.find((p) => p.type === "year")?.value ?? "1970";
  const m = dateParts.find((p) => p.type === "month")?.value ?? "01";
  const d = dateParts.find((p) => p.type === "day")?.value ?? "01";

  for (const item of regimen.regimen_items) {
    if (!item.enabled) continue;
    if (item.days_of_week.length > 0 && !item.days_of_week.includes(todayDow)) {
      continue;
    }
    for (const time of item.times_of_day) {
      const scheduledFor = zonedDateTimeToUtc(`${y}-${m}-${d}`, time, regimen.timezone);
      slots.push({ item, timeOfDay: time, scheduledFor });
    }
  }
  return slots;
}

/**
 * Convert (YYYY-MM-DD, HH:MM, IANA timezone) → absolute UTC Date.
 *
 * We do this by formatting an ISO string with the timezone offset
 * computed via Intl. The offset depends on the date (DST), so we
 * resolve it at the input date.
 */
function zonedDateTimeToUtc(
  ymd: string,
  hhmm: string,
  timezone: string
): Date {
  // Build a "naive" local timestamp, then probe Intl to discover the
  // timezone's offset at that instant.
  const naiveUtc = new Date(`${ymd}T${hhmm}:00Z`);
  const offsetMin = timezoneOffsetMinutes(naiveUtc, timezone);
  return new Date(naiveUtc.getTime() - offsetMin * 60_000);
}

function timezoneOffsetMinutes(at: Date, timezone: string): number {
  // Use a roundtrip: format the UTC instant in the target timezone,
  // re-parse, diff against the original.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
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

export async function getTodaySchedule(input: {
  locale: Locale;
}): Promise<TodayItem[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data: regimens, error: rErr } = await supabase
    .from("regimens")
    .select(
      `
      id, name, timezone, enabled,
      regimen_items (
        id, label, dose, unit, days_of_week, times_of_day,
        enabled, supplement_id,
        supplements ( slug, name_vn, name_en )
      )
    `
    )
    .eq("enabled", true);
  if (rErr) {
    console.error("[getTodaySchedule] query failed:", rErr);
    return [];
  }
  const today = new Date();
  const allSlots: TodayItem[] = [];
  const slotKeys: Array<{ itemId: string; scheduledFor: string }> = [];

  for (const r of (regimens ?? []) as unknown as RegimenWithItems[]) {
    const slots = buildTodaySlots(r, today);
    for (const { item, timeOfDay, scheduledFor } of slots) {
      const supp = item.supplements;
      allSlots.push({
        itemId: item.id,
        regimenId: r.id,
        regimenName: r.name,
        label: item.label,
        supplementName: supp ? pickLocale(supp, "name", input.locale) : null,
        supplementSlug: supp?.slug ?? null,
        dose: item.dose,
        unit: item.unit,
        timeOfDay,
        scheduledFor: scheduledFor.toISOString(),
        taken: false,
        takenAt: null,
      });
      slotKeys.push({
        itemId: item.id,
        scheduledFor: scheduledFor.toISOString(),
      });
    }
  }

  if (slotKeys.length === 0) return [];

  // Backfill taken state from intake_log. PostgREST `.in()` supports
  // single-column arrays, so we filter by item ids and verify the
  // scheduled_for matches client-side.
  const itemIds = Array.from(new Set(slotKeys.map((s) => s.itemId)));
  const { data: logs, error: lErr } = await supabase
    .from("intake_log")
    .select("regimen_item_id, scheduled_for, taken_at")
    .in("regimen_item_id", itemIds);
  if (lErr) console.error("[getTodaySchedule] intake_log failed:", lErr);

  const takenIndex = new Map<string, string>();
  for (const log of logs ?? []) {
    takenIndex.set(
      `${log.regimen_item_id}::${log.scheduled_for}`,
      log.taken_at as string
    );
  }
  for (const slot of allSlots) {
    const taken = takenIndex.get(`${slot.itemId}::${slot.scheduledFor}`);
    if (taken) {
      slot.taken = true;
      slot.takenAt = taken;
    }
  }

  // Sort chronologically.
  allSlots.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return allSlots;
}

export async function listRegimens(input: { locale: Locale }) {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data, error } = await supabase
    .from("regimens")
    .select(
      `
      id, name, timezone, enabled, created_at,
      regimen_items (
        id, label, dose, unit, days_of_week, times_of_day,
        notify_push, notify_email, enabled, supplement_id,
        supplements ( slug, name_vn, name_en )
      )
    `
    )
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[listRegimens] query failed:", error);
    return [];
  }

  type Row = RegimenWithItems & {
    created_at: string;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    timezone: r.timezone,
    enabled: r.enabled,
    items: r.regimen_items.map((i) => ({
      id: i.id,
      label: i.label,
      dose: i.dose,
      unit: i.unit,
      daysOfWeek: i.days_of_week,
      timesOfDay: i.times_of_day,
      notifyPush: i.notify_push,
      notifyEmail: i.notify_email,
      enabled: i.enabled,
      supplement: i.supplements
        ? {
            slug: i.supplements.slug,
            name: pickLocale(i.supplements, "name", input.locale),
          }
        : null,
    })),
  }));
}

/**
 * Compute simple adherence stats over the last `days` days for the
 * current user. Returns:
 *   - adherenceRate: 0..1 across the window
 *   - currentStreak: consecutive days with >= 80% of slots taken
 *   - heatmap: {date, total, taken}[] for the window
 *   - weeklyTrend: 12-week running adherence percentage
 */
export async function getAdherenceStats(input: {
  days?: number;
}): Promise<{
  adherenceRate: number;
  weeklyAdherenceRate: number;
  currentStreak: number;
  heatmap: Array<{ date: string; total: number; taken: number }>;
  weeklyTrend: Array<{ weekStart: string; rate: number }>;
}> {
  const days = input.days ?? 30;
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) {
      return {
        adherenceRate: 0,
        weeklyAdherenceRate: 0,
        currentStreak: 0,
        heatmap: [],
        weeklyTrend: [],
      };
    }
    throw err;
  }

  // Pull all regimen items + their schedule, plus all intake_log rows
  // in the window. We compute everything client-side (in the server
  // component) so the SQL stays simple. Worst-case row counts are
  // small (1 user × ~30 items × 84 days = 2520).
  const since = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000);

  const [{ data: items }, { data: logs }] = await Promise.all([
    supabase
      .from("regimen_items")
      .select(
        `id, label, days_of_week, times_of_day, enabled,
         regimens ( timezone, enabled, user_id )`
      ),
    supabase
      .from("intake_log")
      .select("regimen_item_id, scheduled_for, taken_at")
      .gte("scheduled_for", since.toISOString()),
  ]);

  type ItemShape = {
    id: string;
    days_of_week: number[];
    times_of_day: string[];
    enabled: boolean;
    regimens: { timezone: string; enabled: boolean } | null;
  };
  const itemRows = ((items ?? []) as unknown as ItemShape[]).filter(
    (x) => x.enabled && x.regimens?.enabled
  );

  const heatmap = new Map<string, { total: number; taken: number }>();
  const today = new Date();
  for (let d = 0; d < 84; d += 1) {
    const day = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
    const ymd = day.toISOString().slice(0, 10);
    heatmap.set(ymd, { total: 0, taken: 0 });
  }

  const takenIndex = new Set<string>();
  for (const log of logs ?? []) {
    takenIndex.add(
      `${log.regimen_item_id}::${(log.scheduled_for as string).slice(0, 10)}::${(log.scheduled_for as string).slice(11, 16)}`
    );
  }

  for (const item of itemRows) {
    const tz = item.regimens?.timezone ?? "Asia/Ho_Chi_Minh";
    for (let d = 0; d < 84; d += 1) {
      const day = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
      const dow = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
        })
          .format(day)
          .replace("Sun", "0")
          .replace("Mon", "1")
          .replace("Tue", "2")
          .replace("Wed", "3")
          .replace("Thu", "4")
          .replace("Fri", "5")
          .replace("Sat", "6")
      );
      if (item.days_of_week.length > 0 && !item.days_of_week.includes(dow)) continue;
      const ymd = day.toISOString().slice(0, 10);
      const bucket = heatmap.get(ymd);
      if (!bucket) continue;
      for (const time of item.times_of_day) {
        bucket.total += 1;
        const key = `${item.id}::${ymd}::${time}`;
        if (takenIndex.has(key)) bucket.taken += 1;
      }
    }
  }

  const heatmapArr = Array.from(heatmap.entries())
    .map(([date, v]) => ({ date, total: v.total, taken: v.taken }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 30-day rate
  const window30 = heatmapArr.slice(-days);
  const total30 = window30.reduce((s, x) => s + x.total, 0);
  const taken30 = window30.reduce((s, x) => s + x.taken, 0);
  const adherenceRate = total30 > 0 ? taken30 / total30 : 0;

  // 7-day rate
  const window7 = heatmapArr.slice(-7);
  const total7 = window7.reduce((s, x) => s + x.total, 0);
  const taken7 = window7.reduce((s, x) => s + x.taken, 0);
  const weeklyAdherenceRate = total7 > 0 ? taken7 / total7 : 0;

  // Current streak
  let currentStreak = 0;
  for (let i = heatmapArr.length - 1; i >= 0; i -= 1) {
    const day = heatmapArr[i];
    if (day.total === 0) continue;
    const rate = day.taken / day.total;
    if (rate >= 0.8) currentStreak += 1;
    else break;
  }

  // 12-week trend
  const weeklyTrend: Array<{ weekStart: string; rate: number }> = [];
  for (let w = 11; w >= 0; w -= 1) {
    const start = w * 7;
    const slice = heatmapArr.slice(
      Math.max(0, heatmapArr.length - start - 7),
      heatmapArr.length - start
    );
    const t = slice.reduce((s, x) => s + x.total, 0);
    const k = slice.reduce((s, x) => s + x.taken, 0);
    weeklyTrend.push({
      weekStart: slice[0]?.date ?? "",
      rate: t > 0 ? k / t : 0,
    });
  }

  return {
    adherenceRate,
    weeklyAdherenceRate,
    currentStreak,
    heatmap: heatmapArr,
    weeklyTrend,
  };
}
