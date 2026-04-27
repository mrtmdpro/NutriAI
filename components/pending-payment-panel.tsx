"use client";

import { useTransition, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Copy, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cancelPendingSubscription } from "@/lib/payments/actions";
import { formatVnd } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export function PendingPaymentPanel({
  paymentCode,
  amountVnd,
  period,
  locale,
}: Readonly<{
  paymentCode: string;
  amountVnd: number;
  period: "monthly" | "yearly";
  locale: Locale;
}>) {
  const t = useTranslations("Billing");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Construct the QR via the public VietQR image API on the client too
  // so we don't have to plumb the URL through. The bank/account/holder
  // come from a small public endpoint.
  const qrUrl = `/api/payments/qr?code=${encodeURIComponent(paymentCode)}&amount=${amountVnd}`;

  // Poll every 8s while the panel is mounted; the webhook will flip
  // the row to active out of band, so a soft refresh detects it.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(id);
  }, [router]);

  function copyMemo() {
    navigator.clipboard
      .writeText(paymentCode)
      .then(() => toast.success(t("memoCopied")))
      .catch(() => {
        /* clipboard blocked in some browsers; surface silently */
      });
  }

  function onCancel() {
    startTransition(async () => {
      const result = await cancelPendingSubscription(paymentCode);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <h2 className="text-foreground text-base font-semibold">
            {t("pendingTitle")}
          </h2>
          <p className="text-muted-foreground text-xs">{t("pendingBody")}</p>
        </div>
        <Badge variant="outline">
          {period === "monthly" ? t("periodMonthly") : t("periodYearly")}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="bg-card border-border w-fit rounded-lg border p-2">
            <Image
              src={qrUrl}
              width={220}
              height={220}
              alt="VietQR"
              unoptimized
              className="size-[200px] rounded"
            />
          </div>
          <div className="flex flex-col gap-3">
            <Field label={t("amount")} value={formatVnd(amountVnd, locale)} />
            <FieldWithAction
              label={t("memo")}
              value={paymentCode}
              actionLabel={t("copyMemo")}
              onAction={copyMemo}
            />
          </div>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1">
            <RotateCw className="size-3 animate-spin" aria-hidden />
            {t("pendingTitle")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onCancel}
            disabled={isPending}
          >
            <X className="size-3.5" aria-hidden />
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm font-medium">{value}</span>
    </div>
  );
}

function FieldWithAction({
  label,
  value,
  actionLabel,
  onAction,
}: Readonly<{
  label: string;
  value: string;
  actionLabel: string;
  onAction: () => void;
}>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-foreground bg-muted/60 rounded-md px-2 py-1 font-mono text-xs">
          {value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onAction}
          aria-label={actionLabel}
        >
          <Copy className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
