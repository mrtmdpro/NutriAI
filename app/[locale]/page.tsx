import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  Search,
  ArrowRight,
  FlaskConical,
  Bell,
  RefreshCw,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <AppShell>
      <section className="relative overflow-hidden">
        <div className="bg-accent/40 absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <div className="flex flex-col items-center text-center gap-6">
            <h1 className="text-foreground text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-balance text-base sm:text-lg">
              {t("heroSubtitle")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild size="lg">
                <Link href="/search">
                  <Search className="size-4" aria-hidden />
                  {t("ctaSearch")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/pricing">
                  {t("ctaPricing")}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          <ValueProp
            icon={<FlaskConical className="text-primary size-5" aria-hidden />}
            title={t("valueProp1Title")}
            body={t("valueProp1Body")}
          />
          <ValueProp
            icon={<Bell className="text-primary size-5" aria-hidden />}
            title={t("valueProp2Title")}
            body={t("valueProp2Body")}
          />
          <ValueProp
            icon={<RefreshCw className="text-primary size-5" aria-hidden />}
            title={t("valueProp3Title")}
            body={t("valueProp3Body")}
          />
        </div>
      </section>
    </AppShell>
  );
}

function ValueProp({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-card border-border flex flex-col gap-3 rounded-xl border p-5">
      <div className="bg-accent flex size-9 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-foreground text-base font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
