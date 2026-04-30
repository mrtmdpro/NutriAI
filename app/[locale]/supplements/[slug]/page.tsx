import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QualityTierBadge } from "@/components/quality-tier-badge";
import { EvidenceTierBadge } from "@/components/evidence-tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSupplementBySlug } from "@/lib/knowledge/search";
import { asLocale } from "@/lib/i18n/locale-text";
import { getCategoryLabel } from "@/lib/i18n/categories";
import { formatVnd, formatDate } from "@/lib/format";

export default async function SupplementDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const supplement = await getSupplementBySlug({ slug, locale });
  if (!supplement) notFound();

  const t = await getTranslations("Supplement");
  const tCommon = await getTranslations("Common");
  const categoryLabel = await getCategoryLabel();

  return (
    <AppShell>
      <section className="bg-accent/20 border-border border-b">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-3">
            <Button asChild variant="ghost" size="xs" className="self-start">
              <Link href="/search">← {tCommon("back")}</Link>
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <p className="text-muted-foreground text-sm">
                  {t("by")} {supplement.brand}
                </p>
                <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
                  {supplement.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  {supplement.form && (
                    <Badge variant="outline">{supplement.form}</Badge>
                  )}
                  {supplement.netQuantity && (
                    <Badge variant="outline">{supplement.netQuantity}</Badge>
                  )}
                  {supplement.priceVnd != null && (
                    <Badge variant="secondary">
                      {formatVnd(supplement.priceVnd, locale)} {t("perDose")}
                    </Badge>
                  )}
                </div>
              </div>
              {supplement.quality && (
                <QualityTierBadge
                  tier={supplement.quality.tier}
                  total={supplement.quality.total}
                />
              )}
            </div>
            {supplement.description && (
              <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
                {supplement.description}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Tabs defaultValue="ingredients" className="flex flex-col gap-6">
          <TabsList className="self-start">
            <TabsTrigger value="ingredients">{t("ingredients")}</TabsTrigger>
            <TabsTrigger value="evidence">{t("evidence")}</TabsTrigger>
            <TabsTrigger value="quality">{t("quality")}</TabsTrigger>
          </TabsList>

          <TabsContent value="ingredients">
            <Card>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">{t("ingredients")}</TableHead>
                      <TableHead>{t("doseColumn")}</TableHead>
                      <TableHead className="text-right pr-6">
                        {t("dailyValue")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplement.ingredients.map((ing) => (
                      <TableRow key={ing.id}>
                        <TableCell className="pl-6">
                          <Link
                            href={`/ingredients/${ing.slug}`}
                            className="hover:text-primary group flex flex-col transition-colors"
                          >
                            <span className="text-foreground group-hover:text-primary font-medium underline-offset-2 group-hover:underline">
                              {ing.name}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {categoryLabel(ing.category)}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {ing.dose} {ing.unit}
                        </TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">
                          {ing.dailyValuePct != null
                            ? `${ing.dailyValuePct}%`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evidence">
            {supplement.evidence.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground px-6 py-10 text-center text-sm">
                  {t("noEvidence")}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {supplement.evidence.map((ev) => (
                  <Card key={ev.id}>
                    <CardContent className="flex flex-col gap-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <EvidenceTierBadge tier={ev.tier} />
                            <span className="text-muted-foreground text-xs uppercase tracking-wide">
                              {ev.source}
                            </span>
                            {ev.publishedAt && (
                              <span className="text-muted-foreground text-xs">
                                · {t("publishedAt")}: {formatDate(ev.publishedAt, locale)}
                              </span>
                            )}
                          </div>
                          <h3 className="text-foreground text-sm font-medium leading-snug">
                            {ev.title}
                          </h3>
                        </div>
                      </div>
                      {ev.summary && (
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {ev.summary}
                        </p>
                      )}
                      <a
                        href={ev.citationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex w-fit items-center gap-1 text-xs font-medium hover:underline"
                      >
                        {t("viewSource")}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quality">
            {supplement.quality ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <ScoreCard
                  label={t("qualityLab")}
                  value={supplement.quality.lab}
                  outOf={40}
                />
                <ScoreCard
                  label={t("qualityIngredient")}
                  value={supplement.quality.ingredient}
                  outOf={30}
                />
                <ScoreCard
                  label={t("qualityPrice")}
                  value={supplement.quality.price}
                  outOf={30}
                />
                <Card className="sm:col-span-3">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <h3 className="text-foreground text-sm font-medium">
                      {t("qualityScore")}
                    </h3>
                    <QualityTierBadge
                      tier={supplement.quality.tier}
                      total={supplement.quality.total}
                    />
                  </CardHeader>
                  {supplement.quality.notes && (
                    <CardContent className="text-muted-foreground text-sm leading-relaxed">
                      {supplement.quality.notes}
                    </CardContent>
                  )}
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-muted-foreground px-6 py-10 text-center text-sm">
                  {t("noQuality")}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </AppShell>
  );
}

function ScoreCard({
  label,
  value,
  outOf,
}: Readonly<{ label: string; value: number; outOf: number }>) {
  const rounded = Math.round(value);
  const pct = Math.max(0, Math.min(100, (value / outOf) * 100));
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-foreground text-2xl font-semibold tabular-nums">
          {rounded}
          <span className="text-muted-foreground ml-1 text-sm font-normal">
            / {outOf}
          </span>
        </p>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={outOf}
          aria-valuenow={rounded}
          className="bg-muted h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full transition-[width]"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </CardContent>
    </Card>
  );
}
