import { setRequestLocale, getTranslations } from "next-intl/server";
import { Search as SearchIcon, Filter } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SupplementCard } from "@/components/supplement-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { searchKnowledge } from "@/lib/knowledge/search";
import { asLocale } from "@/lib/i18n/locale-text";
import { getCategoryLabel, KNOWN_CATEGORIES } from "@/lib/i18n/categories";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  page?: string;
}>;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const category = sp.category ?? "all";
  const pageParam = sp.page ? Number(sp.page) : undefined;

  const t = await getTranslations("Search");
  const tSupp = await getTranslations("Supplement");
  const categoryLabel = await getCategoryLabel();

  const results = await searchKnowledge({
    query,
    locale,
    category: category === "all" ? undefined : category,
    page: pageParam,
  });

  const hasFilter = !!query || (category && category !== "all");

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-5">
            <div className="space-y-1.5">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("title")}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
                {t("subtitle")}
              </p>
            </div>

            <form
              method="get"
              className="flex flex-col gap-2 sm:flex-row"
              role="search"
            >
              {category && category !== "all" && (
                <input type="hidden" name="category" value={category} />
              )}
              <div className="relative flex-1">
                <SearchIcon
                  className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder={t("placeholder")}
                  className="h-11 pl-9"
                  aria-label={t("title")}
                />
              </div>
              <Button type="submit" size="lg">
                {t("submit")}
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Filter className="size-3.5" aria-hidden />
                {t("filters")}
              </span>
              <CategoryChip
                href={buildSearchHref(query, "all")}
                active={category === "all"}
                label={t("categoryAll")}
              />
              {KNOWN_CATEGORIES.filter((c) => c !== "unknown").map((cat) => (
                <CategoryChip
                  key={cat}
                  href={buildSearchHref(query, cat)}
                  active={category === cat}
                  label={categoryLabel(cat)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {results.hadConfigError ? (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
        ) : results.isEmpty ? (
          <EmptyState
            title={hasFilter ? t("noResultsTitle") : t("emptyTitle")}
            body={hasFilter ? t("noResultsBody") : t("emptyBody")}
          />
        ) : (
          <div className="flex flex-col gap-10">
            {results.supplements.length > 0 && (
              <div>
                <h2 className="text-foreground mb-4 text-lg font-semibold tracking-tight">
                  {t("supplementsHeading")}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.supplements.map((s) => (
                    <SupplementCard
                      key={s.id}
                      slug={s.slug}
                      name={s.name}
                      brand={s.brand}
                      form={s.form}
                      description={s.description}
                      priceVnd={s.price_vnd}
                      qualityTier={s.quality_tier}
                      qualityTotal={s.quality_total}
                      perDoseLabel={tSupp("perDose")}
                      byLabel={tSupp("by")}
                      locale={locale}
                    />
                  ))}
                </div>
              </div>
            )}

            {results.ingredients.length > 0 && (
              <div>
                <h2 className="text-foreground mb-4 text-lg font-semibold tracking-tight">
                  {t("ingredientsHeading")}
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {results.ingredients.map((i) => (
                    <Card key={i.id}>
                      <CardContent className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-foreground truncate text-sm font-medium">
                            {i.name}
                          </h3>
                          <Badge variant="outline" className="shrink-0">
                            {categoryLabel(i.category)}
                          </Badge>
                        </div>
                        {i.description && (
                          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                            {i.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function CategoryChip({
  href,
  active,
  label,
}: Readonly<{
  href: string;
  active: boolean;
  label: string;
}>) {
  return (
    <Button
      asChild
      variant={active ? "secondary" : "outline"}
      size="xs"
      className="h-7"
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function buildSearchHref(q: string, category: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category && category !== "all") params.set("category", category);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

function EmptyState({
  title,
  body,
}: Readonly<{ title: string; body: string }>) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground max-w-md text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}
