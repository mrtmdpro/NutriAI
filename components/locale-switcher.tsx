"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LABELS: Record<Locale, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

export function LocaleSwitcher() {
  const t = useTranslations("Nav");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const search = searchParams.toString();
  const href = search ? `${pathname}?${search}` : pathname;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          aria-label={t("language")}
        >
          <Globe className="size-4" aria-hidden />
          <span className="hidden text-xs sm:inline">{LABELS[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((next) => (
          <DropdownMenuItem
            key={next}
            onSelect={() =>
              startTransition(() => {
                router.replace(href, { locale: next });
              })
            }
            data-active={next === locale}
          >
            {LABELS[next]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
