import { cn } from "@/lib/utils";

const TIER_STYLES: Record<"A" | "B" | "C" | "D", string> = {
  A: "bg-primary/15 text-primary border-primary/30",
  B: "bg-accent text-accent-foreground border-border",
  C: "bg-muted text-muted-foreground border-border",
  D: "bg-muted/60 text-muted-foreground border-border",
};

export function EvidenceTierBadge({
  tier,
  className,
}: Readonly<{
  tier: "A" | "B" | "C" | "D";
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-wide",
        TIER_STYLES[tier],
        className
      )}
      aria-label={`Evidence tier ${tier}`}
    >
      {tier}
    </span>
  );
}
