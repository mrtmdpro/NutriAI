import { cn } from "@/lib/utils";

const TIER_STYLES: Record<"S" | "A" | "B" | "C", string> = {
  // Single accent color = single hue. Vary lightness for tier rank.
  S: "bg-primary text-primary-foreground",
  A: "bg-primary/80 text-primary-foreground",
  B: "bg-primary/60 text-primary-foreground",
  C: "bg-muted text-muted-foreground",
};

export function QualityTierBadge({
  tier,
  total,
  size = "md",
}: Readonly<{
  tier: "S" | "A" | "B" | "C";
  total?: number;
  size?: "sm" | "md";
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        TIER_STYLES[tier],
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      )}
      aria-label={`Quality tier ${tier}`}
    >
      <span>{tier}</span>
      {typeof total === "number" && (
        <span className="opacity-80 tabular-nums">
          · {Math.round(total)}
        </span>
      )}
    </span>
  );
}
