import { setRequestLocale, getTranslations } from "next-intl/server";
import { Filter, ArrowRight, ShoppingBag } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAllIngredients } from "@/lib/knowledge/search";
import { asLocale } from "@/lib/i18n/locale-text";
import { getCategoryLabel, KNOWN_CATEGORIES } from "@/lib/i18n/categories";

type SearchParams = Promise<{ category?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Ingredients");
  return { title: t("title"), description: t("subtitle") };
}

export default async function IngredientsIndexPage({
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
  const category = sp.category ?? "all";

  const t = await getTranslations("Ingredients");
  const categoryLabel = await getCategoryLabel();

  const ingredients = await listAllIngredients({
    locale,
    category: category === "all" ? undefined : category,
  });

  // Group by category, alphabetical within. Categories with zero
  // entries are skipped.
  const byCategory = new Map<string, typeof ingredients>();
  for (const ing of ingredients) {
    const list = byCategory.get(ing.category) ?? [];
    list.push(ing);
    byCategory.set(ing.category, list);
  }

  const totalCount = ingredients.length;
  const withPageCount = ingredients.filter((i) => i.hasPage).length;

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("title")}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
                {t("subtitle")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("countSummary", { total: totalCount, withPage: withPageCount })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Filter className="size-3.5" aria-hidden />
                {t("filters")}
              </span>
              <CategoryChip
                href="/ingredients"
                active={category === "all"}
                label={t("categoryAll")}
              />
              {KNOWN_CATEGORIES.filter((c) => c !== "unknown").map((cat) => (
                <CategoryChip
                  key={cat}
                  href={`/ingredients?category=${cat}`}
                  active={category === cat}
                  label={categoryLabel(cat)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {ingredients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-muted-foreground text-sm">{t("empty")}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/ingredients">{t("clearFilter")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-10">
            {Array.from(byCategory.entries()).map(([cat, list]) => (
              <div key={cat}>
                <h2 className="text-foreground mb-4 text-lg font-semibold tracking-tight">
                  {categoryLabel(cat)}
                  <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
                    {list.length}
                  </span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((ing) => (
                    <IngredientCard
                      key={ing.slug}
                      slug={ing.slug}
                      name={ing.name}
                      categoryLabel={categoryLabel(ing.category)}
                      description={ing.description}
                      imageUrl={ing.imageUrl}
                      hasPage={ing.hasPage}
                      productsLabel={t("products", { count: ing.productCount })}
                      readMoreLabel={t("readMore")}
                    />
                  ))}
                </div>
              </div>
            ))}
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
}: Readonly<{ href: string; active: boolean; label: string }>) {
  return (
    <Button
      asChild
      variant={active ? "default" : "outline"}
      size="xs"
      className="rounded-full"
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function IngredientCard({
  slug,
  name,
  categoryLabel,
  description,
  imageUrl,
  hasPage,
  productsLabel,
  readMoreLabel,
}: Readonly<{
  slug: string;
  name: string;
  categoryLabel: string;
  description: string | null;
  imageUrl: string | null;
  hasPage: boolean;
  productsLabel: string;
  readMoreLabel: string;
}>) {
  return (
    <Link
      href={`/ingredients/${slug}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="hover:border-primary/40 hover:shadow-sm h-full overflow-hidden transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring">
        {imageUrl ? (
          <div className="bg-accent/30 relative aspect-[16/9] w-full overflow-hidden">
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover transition-transform group-hover:scale-[1.02]"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            />
          </div>
        ) : (
          // Cards without authored illustrations get a tinted placeholder
          // panel so the grid stays visually rhythmic. Tinted by
          // category for subtle differentiation.
          <div
            className="bg-accent/40 flex aspect-[16/9] w-full items-center justify-center"
            aria-hidden
          >
            <span className="text-muted-foreground/40 select-none text-3xl font-semibold tracking-tight">
              {name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <CardContent className="flex flex-col gap-2.5 py-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-foreground group-hover:text-primary line-clamp-2 text-base font-medium leading-snug transition-colors">
              {name}
            </h3>
            <Badge variant="outline" className="shrink-0">
              {categoryLabel}
            </Badge>
          </div>
          {description && (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
              {description}
            </p>
          )}
          <div className="text-muted-foreground mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <ShoppingBag className="size-3" aria-hidden />
              {productsLabel}
            </span>
            {hasPage && (
              <span className="text-primary inline-flex items-center gap-1 font-medium">
                {readMoreLabel}
                <ArrowRight
                  className="size-3 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
