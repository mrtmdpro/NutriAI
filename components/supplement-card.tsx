import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { QualityTierBadge } from "@/components/quality-tier-badge";
import { formatVnd } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export function SupplementCard({
  slug,
  name,
  brand,
  form,
  description,
  priceVnd,
  qualityTier,
  qualityTotal,
  perDoseLabel,
  byLabel,
  locale,
}: Readonly<{
  slug: string;
  name: string;
  brand: string;
  form: string | null;
  description: string | null;
  priceVnd: number | null;
  qualityTier: "S" | "A" | "B" | "C" | null;
  qualityTotal: number | null;
  perDoseLabel: string;
  byLabel: string;
  locale: Locale;
}>) {
  let metaSummary = form ?? "";
  if (priceVnd != null) {
    const price = `${formatVnd(priceVnd, locale)} ${perDoseLabel}`;
    metaSummary = metaSummary ? `${metaSummary} · ${price}` : price;
  }

  return (
    <Link
      href={`/supplements/${slug}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="hover:border-primary/40 hover:shadow-sm h-full transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">
                {byLabel} {brand}
              </p>
              <h3 className="text-foreground mt-0.5 line-clamp-2 text-sm font-medium leading-snug">
                {name}
              </h3>
            </div>
            {qualityTier && (
              <QualityTierBadge
                tier={qualityTier}
                total={qualityTotal ?? undefined}
                size="sm"
              />
            )}
          </div>

          {description && (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
              {description}
            </p>
          )}

          <div className="text-muted-foreground mt-auto flex items-center justify-between text-xs">
            <span className="truncate">{metaSummary}</span>
            <ArrowRight
              className="text-primary size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
