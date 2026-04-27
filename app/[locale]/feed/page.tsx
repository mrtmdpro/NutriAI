import { setRequestLocale, getTranslations } from "next-intl/server";
import { Play, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listArticles } from "@/lib/knowledge/search";
import { getCurrentUser } from "@/lib/auth";
import { asLocale } from "@/lib/i18n/locale-text";

export default async function FeedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const t = await getTranslations("Feed");

  const [articles, user] = await Promise.all([
    listArticles({ locale, limit: 24 }),
    getCurrentUser(),
  ]);

  // Sprint 4 will replace this slice with regimen-driven personalization.
  // For Sprint 3 we surface the latest 3 as a placeholder so the rail's
  // structure is visible in the design.
  const personalized = user ? articles.slice(0, 3) : [];

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {articles.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground px-6 py-16 text-center text-sm">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-10">
            {personalized.length > 0 && (
              <div>
                <h2 className="text-foreground mb-4 text-lg font-semibold tracking-tight">
                  {t("personalizedHeading")}
                </h2>
                <div className="-mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 pb-3 sm:mx-0 sm:gap-3 sm:overflow-visible sm:px-0">
                  {personalized.map((a) => (
                    <div
                      key={a.id}
                      className="mr-3 w-[280px] shrink-0 snap-start sm:mr-0 sm:w-auto sm:flex-1"
                    >
                      <ArticleCard
                        article={a}
                        watchLabel={t("watch")}
                        byLabel={t("by")}
                        videoLabel={t("video")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-foreground mb-4 text-lg font-semibold tracking-tight">
                {t("latestHeading")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((a) => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    watchLabel={t("watch")}
                    byLabel={t("by")}
                    videoLabel={t("video")}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function ArticleCard({
  article,
  watchLabel,
  byLabel,
  videoLabel,
}: Readonly<{
  article: {
    title: string;
    body: string;
    kol: string | null;
    videoUrl: string | null;
    publishedAt: string;
  };
  watchLabel: string;
  byLabel: string;
  videoLabel: string;
}>) {
  const inner = (
    <Card className="hover:border-primary/40 hover:shadow-sm h-full transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring">
      <CardContent className="flex h-full flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {article.videoUrl && (
            <Badge variant="outline" className="gap-1">
              <Play className="size-3" aria-hidden />
              {videoLabel}
            </Badge>
          )}
          {article.kol && (
            <span className="text-muted-foreground text-xs">
              {byLabel} {article.kol}
            </span>
          )}
        </div>
        <h3 className="text-foreground line-clamp-2 text-base font-medium leading-snug">
          {article.title}
        </h3>
        {article.body && (
          <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
            {article.body}
          </p>
        )}
        {article.videoUrl && (
          <div className="text-primary mt-auto inline-flex items-center gap-1 text-xs font-medium">
            {watchLabel}
            <ArrowRight
              className="size-3 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Article detail pages are scheduled for a later sprint. Until then,
  // only video articles get a real link target; text articles render
  // their preview without a "Read more" lie.
  if (article.videoUrl) {
    return (
      <a
        href={article.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group block focus-visible:outline-none"
      >
        {inner}
      </a>
    );
  }
  return <div className="group block">{inner}</div>;
}
