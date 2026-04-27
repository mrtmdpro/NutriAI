"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { saveRegimen, type SaveRegimenInput } from "@/lib/adherence/actions";

const PRESET_TIMES = [
  { key: "morning", value: "08:00" },
  { key: "noon", value: "12:00" },
  { key: "evening", value: "19:00" },
  { key: "bedtime", value: "22:00" },
] as const;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type ItemDraft = {
  id?: string;
  label: string;
  dose: string;
  unit: string;
  daysOfWeek: number[];
  timesOfDay: string[];
  notifyPush: boolean;
  notifyEmail: boolean;
};

function emptyItem(): ItemDraft {
  return {
    label: "",
    dose: "",
    unit: "",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timesOfDay: ["08:00"],
    notifyPush: true,
    notifyEmail: false,
  };
}

export function RegimenBuilder({
  initial,
  defaultTimezone,
}: Readonly<{
  initial?: {
    id?: string;
    name: string;
    timezone: string;
    items: Array<Omit<ItemDraft, "dose" | "unit"> & {
      dose: number | null;
      unit: string | null;
    }>;
  };
  defaultTimezone: string;
}>) {
  const t = useTranslations("Regimen");
  const tDays = useTranslations("Regimen.days");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name ?? "");
  const [timezone, setTimezone] = useState(
    initial?.timezone ?? defaultTimezone
  );
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((i) => ({
      id: i.id,
      label: i.label,
      dose: i.dose != null ? String(i.dose) : "",
      unit: i.unit ?? "",
      daysOfWeek: i.daysOfWeek,
      timesOfDay: i.timesOfDay,
      notifyPush: i.notifyPush,
      notifyEmail: i.notifyEmail,
    })) ?? [emptyItem()]
  );

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  function toggleDay(index: number, day: number) {
    updateItem(index, {
      daysOfWeek: items[index].daysOfWeek.includes(day)
        ? items[index].daysOfWeek.filter((d) => d !== day)
        : [...items[index].daysOfWeek, day].sort((a, b) => a - b),
    });
  }

  function toggleTime(index: number, value: string) {
    updateItem(index, {
      timesOfDay: items[index].timesOfDay.includes(value)
        ? items[index].timesOfDay.filter((t) => t !== value)
        : [...items[index].timesOfDay, value].sort(),
    });
  }

  function onSubmit() {
    startTransition(async () => {
      const payload: SaveRegimenInput = {
        id: initial?.id,
        name: name.trim(),
        timezone: timezone.trim(),
        items: items.map((it) => ({
          id: it.id,
          label: it.label.trim(),
          dose: it.dose ? Number(it.dose) : null,
          unit: it.unit.trim() || null,
          daysOfWeek: it.daysOfWeek,
          timesOfDay: it.timesOfDay,
          notifyPush: it.notifyPush,
          notifyEmail: it.notifyEmail,
        })),
      };
      const result = await saveRegimen(payload);
      if (!result.ok) {
        toast.error(t("saveFailed"));
        return;
      }
      toast.success(t("saved"));
      router.push("/dashboard/regimen");
      router.refresh();
    });
  }

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
              disabled={isPending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">{t("timezone")}</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-base font-semibold">
          {t("items")}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
          disabled={isPending}
        >
          <Plus className="size-4" aria-hidden />
          {t("addItem")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item, index) => (
          <Card key={item.id ?? `new-${index}`}>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <div className="grid gap-1.5">
                  <Label htmlFor={`label-${index}`}>{t("itemLabel")}</Label>
                  <Input
                    id={`label-${index}`}
                    value={item.label}
                    onChange={(e) =>
                      updateItem(index, { label: e.target.value })
                    }
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`dose-${index}`}>{t("itemDose")}</Label>
                  <Input
                    id={`dose-${index}`}
                    inputMode="decimal"
                    value={item.dose}
                    onChange={(e) =>
                      updateItem(index, { dose: e.target.value })
                    }
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`unit-${index}`}>{t("itemUnit")}</Label>
                  <Input
                    id={`unit-${index}`}
                    value={item.unit}
                    onChange={(e) =>
                      updateItem(index, { unit: e.target.value })
                    }
                    disabled={isPending}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== index))
                    }
                    aria-label={t("remove")}
                    disabled={isPending || items.length === 1}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs">
                  {t("itemTimes")}
                </span>
                <p className="text-muted-foreground text-[11px]">
                  {t("itemTimesHint")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TIMES.map((preset) => {
                    const active = item.timesOfDay.includes(preset.value);
                    return (
                      <Button
                        key={preset.value}
                        type="button"
                        size="xs"
                        variant={active ? "secondary" : "outline"}
                        onClick={() => toggleTime(index, preset.value)}
                        disabled={isPending}
                      >
                        {t(preset.key as "morning" | "noon" | "evening" | "bedtime")}
                        <Badge variant="outline" className="ml-1.5">
                          {preset.value}
                        </Badge>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs">
                  {t("itemDays")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_KEYS.map((dk, dow) => {
                    const active = item.daysOfWeek.includes(dow);
                    return (
                      <Button
                        key={dk}
                        type="button"
                        size="xs"
                        variant={active ? "secondary" : "outline"}
                        onClick={() => toggleDay(index, dow)}
                        disabled={isPending}
                        className="w-12"
                      >
                        {tDays(dk)}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.notifyPush}
                    onCheckedChange={(checked) =>
                      updateItem(index, { notifyPush: checked })
                    }
                    disabled={isPending}
                  />
                  {t("notifyPush")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.notifyEmail}
                    onCheckedChange={(checked) =>
                      updateItem(index, { notifyEmail: checked })
                    }
                    disabled={isPending}
                  />
                  {t("notifyEmail")}
                </label>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
