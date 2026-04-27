import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Leaf } from "lucide-react";
import { Link } from "@/i18n/navigation";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;

  // Already signed in? skip the form.
  const user = await getCurrentUser();
  if (user) {
    redirect({ href: next?.startsWith("/") ? next : "/dashboard", locale });
  }

  const t = await getTranslations("Auth");
  const tBrand = await getTranslations("Brand");

  return (
    <main className="bg-accent/30 flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <Link
            href="/"
            className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl"
            aria-label={tBrand("name")}
          >
            <Leaf className="size-5" aria-hidden />
          </Link>
          <div className="space-y-1.5">
            <h1 className="text-foreground text-xl font-semibold tracking-tight">
              {t("loginTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">{t("loginSubtitle")}</p>
          </div>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} initialError={error === "callback_failed"} />
        </CardContent>
      </Card>
    </main>
  );
}
