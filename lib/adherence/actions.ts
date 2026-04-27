"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(120),
  dose: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  timesOfDay: z.array(z.string().regex(TIME_RE)).min(1),
  notifyPush: z.boolean().default(true),
  notifyEmail: z.boolean().default(false),
  supplementId: z.string().uuid().nullable().optional(),
});

const regimenSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  timezone: z.string().min(1),
  items: z.array(itemSchema).max(40),
});

export type SaveRegimenInput = z.infer<typeof regimenSchema>;

export async function saveRegimen(
  input: SaveRegimenInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = regimenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  let regimenId = parsed.data.id;

  if (regimenId) {
    const { error } = await supabase
      .from("regimens")
      .update({
        name: parsed.data.name,
        timezone: parsed.data.timezone,
      })
      .eq("id", regimenId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("regimens")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        timezone: parsed.data.timezone,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert" };
    regimenId = data.id as string;
  }

  // Replace all items wholesale: delete then insert. The UI is small
  // enough that the round-trip cost is negligible and the contract is
  // easier to reason about than partial updates.
  const { error: delErr } = await supabase
    .from("regimen_items")
    .delete()
    .eq("regimen_id", regimenId);
  if (delErr) return { ok: false, error: delErr.message };

  if (parsed.data.items.length > 0) {
    const { error: insErr } = await supabase.from("regimen_items").insert(
      parsed.data.items.map((it) => ({
        regimen_id: regimenId,
        supplement_id: it.supplementId ?? null,
        label: it.label,
        dose: it.dose ?? null,
        unit: it.unit ?? null,
        days_of_week: it.daysOfWeek,
        times_of_day: it.timesOfDay,
        notify_push: it.notifyPush,
        notify_email: it.notifyEmail,
      }))
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/regimen");
  return { ok: true, id: regimenId };
}

export async function deleteRegimen(
  id: string
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("regimens")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/regimen");
  return { ok: true };
}

export async function logIntake(input: {
  itemId: string;
  scheduledFor: string;
}): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("intake_log").upsert(
    {
      user_id: user.id,
      regimen_item_id: input.itemId,
      scheduled_for: input.scheduledFor,
    },
    { onConflict: "user_id,regimen_item_id,scheduled_for" }
  );
  if (error) return { ok: false };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytics");
  return { ok: true };
}

export async function unlogIntake(input: {
  itemId: string;
  scheduledFor: string;
}): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("intake_log")
    .delete()
    .eq("user_id", user.id)
    .eq("regimen_item_id", input.itemId)
    .eq("scheduled_for", input.scheduledFor);
  if (error) return { ok: false };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/analytics");
  return { ok: true };
}
