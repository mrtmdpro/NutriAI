import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function LocaleNotFound() {
  const tCommon = await getTranslations("Common");

  return (
    <AppShell>
      <section className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              404
            </h1>
            <p className="text-muted-foreground text-sm">{tCommon("error")}</p>
            <Button asChild>
              <Link href="/">{tCommon("back")}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
