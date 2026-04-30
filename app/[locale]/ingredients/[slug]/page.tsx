import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QualityTierBadge } from "@/components/quality-tier-badge";
import { EvidenceTierBadge } from "@/components/evidence-tier-badge";
import { getIngredientPageBySlug } from "@/lib/knowledge/search";
import { asLocale } from "@/lib/i18n/locale-text";
import { getCategoryLabel } from "@/lib/i18n/categories";
import { formatVnd, formatDate } from "@/lib/format";

type RouteParams = {
  locale: string;
  slug: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const data = await getIngredientPageBySlug({ slug, locale: asLocale(rawLocale) });
  if (!data) return {};
  // Strip markdown punctuation so the meta description reads cleanly.
  const description =
    data.ingredient.description ??
    data.page?.body.slice(0, 160).replace(/[#*_\[\]]/g, "").trim() ??
    undefined;
  return { title: data.ingredient.name, description };
}

export default async function IngredientDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { locale: rawLocale, slug } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const data = await getIngredientPageBySlug({ slug, locale });
  if (!data) notFound();

  const { ingredient, page, imageUrl, supplements, evidence } = data;

  const t = await getTranslations("IngredientPage");
  const tCommon = await getTranslations("Common");
  const categoryLabel = await getCategoryLabel();

  const doseRange = formatDoseRange(
    ingredient.typicalDoseMin,
    ingredient.typicalDoseMax,
    ingredient.typicalUnit
  );

  return (
    <AppShell>
      <section className="bg-accent/20 border-border border-b">
        <div
          className={`mx-auto px-4 py-10 sm:px-6 sm:py-14 ${
            imageUrl ? "max-w-5xl" : "max-w-3xl"
          }`}
        >
          <Button asChild variant="ghost" size="xs" className="mb-3 self-start">
            <Link href="/search">← {tCommon("back")}</Link>
          </Button>
          <div
            className={`flex flex-col gap-6 ${
              imageUrl ? "md:grid md:grid-cols-[1fr_minmax(0,18rem)] md:items-center md:gap-10" : ""
            }`}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <Badge variant="outline" className="w-fit">
                {categoryLabel(ingredient.category)}
              </Badge>
              <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
                {ingredient.name}
              </h1>
              {ingredient.description && (
                <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
                  {ingredient.description}
                </p>
              )}
              <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                {doseRange && (
                  <span>
                    {t("typicalDose")}: <span className="text-foreground font-medium">{doseRange}</span>
                  </span>
                )}
                {page?.kol && (
                  <span>
                    · {t("by")} <span className="text-foreground font-medium">{page.kol}</span>
                  </span>
                )}
                {page?.publishedAt && (
                  <span>
                    · {t("publishedAt")} {formatDate(page.publishedAt, locale)}
                  </span>
                )}
              </div>
            </div>
            {imageUrl && (
              <div className="bg-background border-border relative aspect-[16/9] overflow-hidden rounded-2xl border md:aspect-square">
                <Image
                  src={imageUrl}
                  alt={ingredient.name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 768px) 18rem, 100vw"
                  priority
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {(page?.body || ingredient.safetyNotes) && (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          {page?.body && (
            <article className="text-foreground prose-styled max-w-none text-base leading-relaxed">
              <Markdown remarkPlugins={[remarkGfm]}>{page.body}</Markdown>
            </article>
          )}

          {ingredient.safetyNotes && (
            <Card className="mt-10 border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <h2 className="text-foreground text-base font-semibold tracking-tight">
                  {t("safetyNotes")}
                </h2>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/90 text-sm leading-relaxed">
                  {ingredient.safetyNotes}
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="bg-accent/30 border-border border-y">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <div className="mb-6 flex flex-col gap-1">
            <h2 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("productsHeading", { ingredient: ingredient.name })}
            </h2>
            <p className="text-muted-foreground max-w-2xl text-sm">
              {t("productsSubtitle")}
            </p>
          </div>

          {supplements.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground px-6 py-10 text-center text-sm">
                {t("productsEmpty")}
              </CardContent>
            </Card>
          ) : (
            <ol className="grid gap-3 md:grid-cols-2">
              {supplements.map((s, idx) => (
                <li key={s.slug} className="contents">
                  <RankedCard
                    rank={idx + 1}
                    slug={s.slug}
                    name={s.name}
                    brand={s.brand}
                    form={s.form}
                    description={s.description}
                    priceVnd={s.priceVnd}
                    tier={s.qualityTier}
                    total={s.qualityTotal}
                    lab={s.qualityLab}
                    ingredient={s.qualityIngredient}
                    price={s.qualityPrice}
                    notes={s.notes}
                    perDoseLabel={t("perDose")}
                    byLabel={t("by")}
                    locale={locale}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {evidence.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
              {t("evidenceHeading")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("evidenceSubtitle")}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {evidence.map((ev) => (
              <li key={ev.id}>
                <a
                  href={ev.citationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block focus-visible:outline-none"
                >
                  <Card className="hover:border-primary/40 transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    <CardContent className="flex items-start gap-3 py-4">
                      <EvidenceTierBadge tier={ev.tier} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h3 className="text-foreground line-clamp-2 text-sm font-medium leading-snug">
                          {ev.title}
                        </h3>
                        {ev.summary && (
                          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                            {ev.summary}
                          </p>
                        )}
                        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="uppercase tracking-wide">{ev.source}</span>
                          {ev.publishedAt && (
                            <span>· {formatDate(ev.publishedAt, locale)}</span>
                          )}
                        </div>
                      </div>
                      <ExternalLink
                        className="text-muted-foreground size-4 shrink-0 transition-colors group-hover:text-primary"
                        aria-hidden
                      />
                    </CardContent>
                  </Card>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

function formatDoseRange(
  min: number | null,
  max: number | null,
  unit: string | null
): string | null {
  if (min == null && max == null) return null;
  const u = unit ?? "";
  if (min != null && max != null && min !== max) return `${min}–${max} ${u}`.trim();
  return `${min ?? max} ${u}`.trim();
}

function RankedCard({
  rank,
  slug,
  name,
  brand,
  form,
  description,
  priceVnd,
  tier,
  total,
  lab,
  ingredient,
  price,
  notes,
  perDoseLabel,
  byLabel,
  locale,
}: Readonly<{
  rank: number;
  slug: string;
  name: string;
  brand: string;
  form: string | null;
  description: string | null;
  priceVnd: number | null;
  tier: "S" | "A" | "B" | "C" | null;
  total: number | null;
  lab: number | null;
  ingredient: number | null;
  price: number | null;
  notes: string | null;
  perDoseLabel: string;
  byLabel: string;
  locale: "vi" | "en";
}>) {
  return (
    <Link
      href={`/supplements/${slug}`}
      className="group focus-visible:outline-none"
    >
      <Card className="hover:border-primary/40 hover:shadow-sm h-full transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-primary/10 text-primary inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums">
                #{rank}
              </span>
              <span className="text-muted-foreground">{byLabel} {brand}</span>
            </div>
            <h3 className="text-foreground line-clamp-2 text-sm font-medium leading-snug">
              {name}
            </h3>
          </div>
          {tier && (
            <QualityTierBadge tier={tier} total={total ?? undefined} size="sm" />
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {notes && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {notes}
            </p>
          )}
          {(lab != null || ingredient != null || price != null) && (
            <div className="flex flex-col gap-1.5">
              {lab != null && <ScoreRow label="Lab" value={lab} outOf={40} />}
              {ingredient != null && (
                <ScoreRow label="Ingredient" value={ingredient} outOf={30} />
              )}
              {price != null && <ScoreRow label="Price" value={price} outOf={30} />}
            </div>
          )}
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>
              {form}
              {form && priceVnd != null ? " · " : ""}
              {priceVnd != null ? `${formatVnd(priceVnd, locale)} ${perDoseLabel}` : ""}
            </span>
          </div>
          {description && (
            <p className="text-muted-foreground line-clamp-2 text-[11px] leading-relaxed">
              {description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function ScoreRow({
  label,
  value,
  outOf,
}: Readonly<{ label: string; value: number; outOf: number }>) {
  const rounded = Math.round(value);
  const pct = Math.max(0, Math.min(100, (value / outOf) * 100));
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground w-16 shrink-0 text-[10px] uppercase tracking-wide">
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
      <span className="text-muted-foreground w-9 shrink-0 text-right text-[10px] tabular-nums">
        {rounded}/{outOf}
      </span>
    </div>
  );
}
