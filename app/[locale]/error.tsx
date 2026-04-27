"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LocaleError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const t = useTranslations("Common");

  useEffect(() => {
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 sm:px-6">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h1 className="text-foreground text-xl font-semibold tracking-tight">
            {t("error")}
          </h1>
          {error.digest && (
            <p className="text-muted-foreground font-mono text-xs">
              {error.digest}
            </p>
          )}
          <Button onClick={reset}>{t("retry")}</Button>
        </CardContent>
      </Card>
    </main>
  );
}
