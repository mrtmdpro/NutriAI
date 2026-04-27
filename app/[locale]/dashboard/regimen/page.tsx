import { setRequestLocale, getTranslations } from "next-intl/server";
import { Plus, Pencil } from "lucide-react";
import { redirect, Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { listRegimens } from "@/lib/adherence/queries";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function RegimensPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login?next=/dashboard/regimen", locale });

  const regimens = await listRegimens({ locale });
  const t = await getTranslations("Regimen");

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-8 sm:px-6 sm:py-10">
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              {t("listTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("listSubtitle")}
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/regimen/new">
              <Plus className="size-4" aria-hidden />
              {t("newRegimen")}
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {regimens.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-muted-foreground text-sm">
                {t("listSubtitle")}
              </p>
              <Button asChild>
                <Link href="/dashboard/regimen/new">
                  <Plus className="size-4" aria-hidden />
                  {t("newRegimen")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {regimens.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-foreground text-base font-semibold">
                        {r.name}
                      </h2>
                      <p className="text-muted-foreground text-xs">
                        {r.timezone}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/regimen/${r.id}`}>
                        <Pencil className="size-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                  {r.items.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {r.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span className="text-foreground font-medium">
                            {item.label}
                          </span>
                          {item.dose != null && item.unit && (
                            <span className="text-muted-foreground text-xs">
                              {item.dose} {item.unit}
                            </span>
                          )}
                          {item.timesOfDay.map((time) => (
                            <Badge key={time} variant="outline">
                              {time}
                            </Badge>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
