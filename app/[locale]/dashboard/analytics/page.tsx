import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdherenceTrendChart } from "@/components/adherence-trend-chart";
import { AdherenceHeatmap } from "@/components/adherence-heatmap";
import { getCurrentUser } from "@/lib/auth";
import { getAdherenceStats } from "@/lib/adherence/queries";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login?next=/dashboard/analytics", locale });

  const t = await getTranslations("Analytics");
  const tCommon = await getTranslations("Common");
  const stats = await getAdherenceStats({ days: 30 });

  const hasData = stats.heatmap.some((d) => d.total > 0);

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 sm:px-6 sm:py-10">
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

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {!hasData ? (
          <Card>
            <CardContent className="text-muted-foreground px-6 py-16 text-center text-sm">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <BigStat
                label={t("currentStreak")}
                value={String(stats.currentStreak)}
                suffix="🔥"
              />
              <BigStat
                label={t("monthRate")}
                value={`${Math.round(stats.adherenceRate * 100)}`}
                suffix="%"
              />
              <BigStat
                label={t("weekRate")}
                value={`${Math.round(stats.weeklyAdherenceRate * 100)}`}
                suffix="%"
                className="hidden sm:flex"
              />
            </div>

            <Card>
              <CardHeader>
                <h2 className="text-foreground text-sm font-medium">
                  {t("trend")}
                </h2>
              </CardHeader>
              <CardContent>
                <AdherenceTrendChart data={stats.weeklyTrend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-foreground text-sm font-medium">
                  {t("heatmap")}
                </h2>
              </CardHeader>
              <CardContent>
                <AdherenceHeatmap days={stats.heatmap} />
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function BigStat({
  label,
  value,
  suffix,
  className = "",
}: Readonly<{
  label: string;
  value: string;
  suffix?: string;
  className?: string;
}>) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-1 px-4 py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-foreground text-3xl font-semibold tabular-nums">
          {value}
          {suffix && (
            <span className="text-muted-foreground ml-1 text-base font-normal">
              {suffix}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
