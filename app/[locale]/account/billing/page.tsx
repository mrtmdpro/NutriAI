import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UpgradeForm } from "@/components/upgrade-form";
import { PendingPaymentPanel } from "@/components/pending-payment-panel";
import { getCurrentUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/rag/rate-limit";
import { listSubscriptions } from "@/lib/payments/queries";
import { formatVnd, formatDate } from "@/lib/format";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login?next=/account/billing", locale });
  }

  const sp = await searchParams;
  const showUpgrade = sp.upgrade === "1";
  const plan = await getUserPlan(user!.id);
  const subs = await listSubscriptions();
  const pending = subs.find((s) => s.status === "pending");
  const activeSub = subs.find((s) => s.status === "active");

  const t = await getTranslations("Billing");
  const tCommon = await getTranslations("Common");

  return (
    <AppShell>
      <section className="bg-accent/20 border-border border-b">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6 sm:py-10">
          <Button asChild variant="ghost" size="xs" className="self-start">
            <Link href="/dashboard">← {tCommon("back")}</Link>
          </Button>
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <h2 className="text-foreground text-base font-semibold">
                {t("currentPlan")}
              </h2>
              {plan === "pro" && activeSub?.expiresAt && (
                <p className="text-muted-foreground text-xs">
                  {t("proUntil", {
                    date: formatDate(activeSub.expiresAt, locale),
                  })}
                </p>
              )}
            </div>
            <Badge variant={plan === "pro" ? "secondary" : "outline"}>
              {plan === "pro" ? t("pro") : t("free")}
            </Badge>
          </CardHeader>
          {plan === "free" && !pending && (
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t("noActiveSub")}
              </p>
            </CardContent>
          )}
        </Card>

        {pending ? (
          <PendingPaymentPanel
            paymentCode={pending.paymentCode}
            amountVnd={pending.amountVnd}
            period={pending.period}
            locale={locale}
          />
        ) : plan === "free" && showUpgrade ? (
          <UpgradeForm locale={locale} />
        ) : null}

        <Card>
          <CardHeader>
            <h2 className="text-foreground text-base font-semibold">
              {t("history")}
            </h2>
          </CardHeader>
          <CardContent className="px-0">
            {subs.length === 0 ? (
              <p className="text-muted-foreground px-6 pb-6 text-sm">
                {t("noHistory")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{t("amount")}</TableHead>
                    <TableHead>{t("memo")}</TableHead>
                    <TableHead className="text-right pr-6">
                      {t("currentPlan")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <div className="flex flex-col">
                          <span className="text-foreground tabular-nums">
                            {formatVnd(s.amountVnd, locale)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {s.period === "monthly"
                              ? t("periodMonthly")
                              : t("periodYearly")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.paymentCode}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Badge
                          variant={
                            s.status === "active" ? "secondary" : "outline"
                          }
                        >
                          {t(
                            `status${s.status[0].toUpperCase()}${s.status.slice(1)}` as
                              | "statusActive"
                              | "statusPending"
                              | "statusCanceled"
                              | "statusExpired"
                          )}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
