import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QualityTierBadge } from "@/components/quality-tier-badge";
import {
  getArticleBySlug,
  listSupplementsByIngredientSlug,
} from "@/lib/knowledge/search";
import { asLocale } from "@/lib/i18n/locale-text";
import { formatVnd, formatDate } from "@/lib/format";
import type { Metadata } from "next";

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
  const article = await getArticleBySlug({ slug, locale: asLocale(rawLocale) });
  if (!article) return {};
  return {
    title: article.title,
    description: article.body.slice(0, 160).replace(/[#*_\[\]]/g, "").trim(),
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { locale: rawLocale, slug } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const article = await getArticleBySlug({ slug, locale });
  if (!article) notFound();

  const ranked = article.ingredientSlug
    ? await listSupplementsByIngredientSlug({
        ingredientSlugPrefix: article.ingredientSlug,
        locale,
      })
    : [];

  const t = await getTranslations("Article");
  const tCommon = await getTranslations("Common");

  return (
    <AppShell>
      <section className="bg-accent/20 border-border border-b">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <Button asChild variant="ghost" size="xs" className="mb-3 self-start">
            <Link href="/feed">← {tCommon("back")}</Link>
          </Button>
          <div className="flex flex-col gap-3">
            {article.ingredientName && article.ingredientSlug && (
              <Badge variant="outline" className="w-fit">
                <Link href={`/search?q=${encodeURIComponent(article.ingredientSlug)}`}>
                  {article.ingredientName}
                </Link>
              </Badge>
            )}
            <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
              {article.title}
            </h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
              {article.kol && (
                <span>
                  {t("by")} <span className="text-foreground font-medium">{article.kol}</span>
                </span>
              )}
              {article.publishedAt && (
                <span>
                  · {t("publishedAt")} {formatDate(article.publishedAt, locale)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <article
          className="text-foreground prose-styled max-w-none text-base leading-relaxed"
        >
          <Markdown remarkPlugins={[remarkGfm]}>{article.body}</Markdown>
        </article>
      </section>

      {article.ingredientSlug && (
        <section className="bg-accent/30 border-border border-y">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <div className="mb-6 flex flex-col gap-1">
              <h2 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("rankingHeading", {
                  ingredient: article.ingredientName ?? article.ingredientSlug,
                })}
              </h2>
              <p className="text-muted-foreground max-w-2xl text-sm">
                {t("rankingSubtitle")}
              </p>
            </div>

            {ranked.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground px-6 py-10 text-center text-sm">
                  {t("rankingEmpty")}
                </CardContent>
              </Card>
            ) : (
              <ol className="grid gap-3 md:grid-cols-2">
                {ranked.map((s, idx) => (
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

            <div className="mt-6 text-center">
              <Button asChild variant="outline">
                <Link href={`/search?q=${encodeURIComponent(article.ingredientSlug)}`}>
                  {t("viewAllByIngredient", {
                    ingredient: article.ingredientName ?? article.ingredientSlug,
                  })}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
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
              {lab != null && (
                <ScoreRow label="Lab" value={lab} outOf={40} />
              )}
              {ingredient != null && (
                <ScoreRow label="Ingredient" value={ingredient} outOf={30} />
              )}
              {price != null && (
                <ScoreRow label="Price" value={price} outOf={30} />
              )}
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
