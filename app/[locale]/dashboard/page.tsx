import { setRequestLocale, getTranslations } from "next-intl/server";
import { Plus, ChartLine } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { IntakeToggle } from "@/components/intake-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTodaySchedule, getAdherenceStats } from "@/lib/adherence/queries";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login?next=/dashboard", locale });

  const [schedule, stats] = await Promise.all([
    getTodaySchedule({ locale }),
    getAdherenceStats({ days: 30 }),
  ]);

  const t = await getTranslations("Dashboard");

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                {t("welcomeTitle")}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t("todaySubtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/regimen">{t("regimens")}</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/analytics">
                  <ChartLine className="size-4" aria-hidden />
                  {t("analytics")}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label={t("streakDays", { count: stats.currentStreak })}
              value={stats.currentStreak}
              suffix="🔥"
            />
            <Stat
              label={t("weeklyAdherence")}
              value={Math.round(stats.weeklyAdherenceRate * 100)}
              suffix="%"
            />
            <Stat
              label={t("monthlyAdherence")}
              value={Math.round(stats.adherenceRate * 100)}
              suffix="%"
              className="hidden sm:flex"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {schedule.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-muted-foreground text-sm">
                {t("noRegimens")}
              </p>
              <Button asChild>
                <Link href="/dashboard/regimen">
                  <Plus className="size-4" aria-hidden />
                  {t("createFirst")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {schedule.map((slot) => (
              <Card key={`${slot.itemId}::${slot.scheduledFor}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">{slot.timeOfDay}</Badge>
                      <span className="text-muted-foreground">
                        {slot.regimenName}
                      </span>
                    </div>
                    <h2 className="text-foreground text-sm font-medium leading-snug">
                      {slot.label}
                      {slot.dose != null && slot.unit && (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          {slot.dose} {slot.unit}
                        </span>
                      )}
                    </h2>
                    {slot.supplementSlug && slot.supplementName && (
                      <Link
                        href={`/supplements/${slot.supplementSlug}`}
                        className="text-primary text-xs hover:underline"
                      >
                        {slot.supplementName}
                      </Link>
                    )}
                  </div>
                  <IntakeToggle
                    itemId={slot.itemId}
                    scheduledFor={slot.scheduledFor}
                    initialTaken={slot.taken}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  suffix,
  className = "",
}: Readonly<{
  label: string;
  value: number;
  suffix?: string;
  className?: string;
}>) {
  return (
    <Card className={className}>
      <CardHeader className="px-4 pb-2 pt-4">
        <p className="text-muted-foreground text-xs">{label}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="text-foreground text-2xl font-semibold tabular-nums">
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
