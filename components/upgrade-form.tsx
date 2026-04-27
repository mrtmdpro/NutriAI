"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startPayment } from "@/lib/payments/actions";
import { formatVnd } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

const MONTHLY_VND = 199_000;
const YEARLY_VND = 1_990_000;

export function UpgradeForm({ locale }: Readonly<{ locale: Locale }>) {
  const t = useTranslations("Pricing");
  const tBilling = useTranslations("Billing");
  const router = useRouter();
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("period", period);
      const result = await startPayment(fd);
      if (!result.ok) {
        toast.error(tBilling("noActiveSub"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-foreground text-base font-semibold">
          {tBilling("upgradeCta")}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <PeriodOption
            active={period === "monthly"}
            onClick={() => setPeriod("monthly")}
            title={t("monthly")}
            price={formatVnd(MONTHLY_VND, locale)}
            cadence={t("perMonth")}
          />
          <PeriodOption
            active={period === "yearly"}
            onClick={() => setPeriod("yearly")}
            title={t("yearly")}
            price={formatVnd(YEARLY_VND, locale)}
            cadence={t("perYear")}
            badge={t("annualSavings")}
          />
        </div>
        <form action={onSubmit}>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isPending}
          >
            {tBilling("upgradeCta")}
          </Button>
        </form>
        <p className="text-muted-foreground text-center text-xs">
          {t("viaSepay")}
        </p>
      </CardContent>
    </Card>
  );
}

function PeriodOption({
  active,
  onClick,
  title,
  price,
  cadence,
  badge,
}: Readonly<{
  active: boolean;
  onClick: () => void;
  title: string;
  price: string;
  cadence: string;
  badge?: string;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "border-primary bg-primary/5 ring-primary/20 flex flex-col gap-1 rounded-xl border-2 p-4 text-left ring-2 transition"
          : "border-border bg-card flex flex-col gap-1 rounded-xl border p-4 text-left transition hover:border-primary/40"
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-foreground text-sm font-medium">{title}</span>
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </div>
      <span className="text-foreground text-xl font-semibold tabular-nums">
        {price}
        <span className="text-muted-foreground ml-1 text-sm font-normal">
          {cadence}
        </span>
      </span>
    </button>
  );
}
