import { setRequestLocale, getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/rag/rate-limit";
import { PRICING } from "@/lib/payments/sepay";
import { formatVnd } from "@/lib/format";
import { asLocale } from "@/lib/i18n/locale-text";
import { cn } from "@/lib/utils";

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = asLocale(rawLocale);

  const user = await getCurrentUser();
  const plan = user ? await getUserPlan(user.id) : "free";
  const t = await getTranslations("Pricing");
  const tFeatures = await getTranslations("Pricing.features");

  const freeFeatures = [
    tFeatures("search"),
    tFeatures("qualityIndex"),
    tFeatures("feed"),
    tFeatures("tracking"),
    tFeatures("chatLimited"),
    tFeatures("analyticsBasic"),
  ];
  const proFeatures = [
    tFeatures("search"),
    tFeatures("qualityIndex"),
    tFeatures("feed"),
    tFeatures("tracking"),
    tFeatures("chatUnlimited"),
    tFeatures("analyticsAdvanced"),
    tFeatures("priority"),
  ];

  return (
    <AppShell>
      <section className="bg-accent/30 border-border border-b">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm sm:text-base">
            {t("subtitle")}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <PricingCard
            current={plan === "free"}
            highlight={false}
            title={t("free")}
            blurb={t("freeBlurb")}
            priceLabel={formatVnd(0, locale)}
            cadence={t("perMonth")}
            features={freeFeatures}
            currentLabel={t("currentPlan")}
            cta={null}
          />
          <PricingCard
            current={plan === "pro"}
            highlight
            title={t("pro")}
            blurb={t("proBlurb")}
            priceLabel={formatVnd(PRICING.monthly.vnd, locale)}
            cadence={t("perMonth")}
            features={proFeatures}
            currentLabel={t("currentPlan")}
            secondaryNote={`${formatVnd(PRICING.yearly.vnd, locale)} ${t("perYear")} · ${t("annualSavings")}`}
            footnote={t("viaSepay")}
            cta={
              plan === "pro" ? (
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link href="/account/billing">{t("ctaPro")}</Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="w-full">
                  <Link
                    href={
                      user ? "/account/billing?upgrade=1" : "/login?next=/account/billing?upgrade=1"
                    }
                  >
                    {t("ctaUpgrade")}
                  </Link>
                </Button>
              )
            }
          />
        </div>
      </section>
    </AppShell>
  );
}

function PricingCard({
  current,
  highlight,
  title,
  blurb,
  priceLabel,
  cadence,
  features,
  currentLabel,
  secondaryNote,
  footnote,
  cta,
}: Readonly<{
  current: boolean;
  highlight: boolean;
  title: string;
  blurb: string;
  priceLabel: string;
  cadence: string;
  features: string[];
  currentLabel: string;
  secondaryNote?: string;
  footnote?: string;
  cta: React.ReactNode;
}>) {
  return (
    <Card
      className={cn(
        "h-full",
        highlight && "border-primary/40 ring-primary/20 ring-1"
      )}
    >
      <CardHeader className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-lg font-semibold">{title}</h2>
          {current && <Badge variant="secondary">{currentLabel}</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">{blurb}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-foreground text-3xl font-semibold tabular-nums">
            {priceLabel}
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              {cadence}
            </span>
          </p>
          {secondaryNote && (
            <p className="text-muted-foreground mt-1 text-xs">
              {secondaryNote}
            </p>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {features.map((feat) => (
            <li
              key={feat}
              className="text-foreground flex items-start gap-2 text-sm"
            >
              <Check
                className="text-primary mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
        {cta}
        {footnote && (
          <p className="text-muted-foreground text-center text-xs">
            {footnote}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
