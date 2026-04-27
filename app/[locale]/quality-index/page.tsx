import { setRequestLocale, getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { QualityTierBadge } from "@/components/quality-tier-badge";
import { listQualityIndex } from "@/lib/knowledge/search";
import { asLocale } from "@/lib/i18n/locale-text";

const TIERS: ReadonlyArray<"S" | "A" | "B" | "C"> = ["S", "A", "B", "C"];

export default async function QualityIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const t = await getTranslations("QualityIndex");
  const tSupp = await getTranslations("Supplement");

  const rows = await listQualityIndex({ locale });
  const grouped: Record<"S" | "A" | "B" | "C", typeof rows> = {
    S: [],
    A: [],
    B: [],
    C: [],
  };
  for (const row of rows) grouped[row.tier].push(row);

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-2">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="text-muted-foreground max-w-3xl text-sm sm:text-base">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground px-6 py-16 text-center text-sm">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-10">
            {TIERS.map((tier) =>
              grouped[tier].length === 0 ? null : (
                <div key={tier}>
                  <div className="mb-4 flex items-center gap-3">
                    <QualityTierBadge tier={tier} />
                    <h2 className="text-foreground text-lg font-semibold tracking-tight">
                      {t(`tier${tier}`)}
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {grouped[tier].map((row) => (
                      <Link
                        key={row.supplementSlug}
                        href={`/supplements/${row.supplementSlug}`}
                        className="group focus-visible:outline-none"
                      >
                        <Card className="hover:border-primary/40 hover:shadow-sm h-full transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring">
                          <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-muted-foreground text-xs">
                                {tSupp("by")} {row.brand}
                              </p>
                              <h3 className="text-foreground mt-0.5 line-clamp-2 text-sm font-medium leading-snug">
                                {row.supplementName}
                              </h3>
                            </div>
                            <span className="text-foreground text-base font-semibold tabular-nums">
                              {Math.round(row.total)}
                            </span>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-2">
                            <ScoreBar
                              label={tSupp("qualityLab")}
                              value={row.lab}
                              outOf={40}
                            />
                            <ScoreBar
                              label={tSupp("qualityIngredient")}
                              value={row.ingredient}
                              outOf={30}
                            />
                            <ScoreBar
                              label={tSupp("qualityPrice")}
                              value={row.price}
                              outOf={30}
                            />
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function ScoreBar({
  label,
  value,
  outOf,
}: Readonly<{ label: string; value: number; outOf: number }>) {
  const rounded = Math.round(value);
  const pct = Math.max(0, Math.min(100, (value / outOf) * 100));
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground w-32 shrink-0 truncate text-[11px]">
        {label}
      </span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={outOf}
        aria-valuenow={rounded}
        className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full transition-[width]"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <span className="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums">
        {rounded}/{outOf}
      </span>
    </div>
  );
}
