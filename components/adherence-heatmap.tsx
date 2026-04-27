/**
 * 12-week adherence heatmap. Server component — no interactivity.
 *
 * Rendered in CSS grid: rows = 7 days of the week, columns = 12 weeks.
 * Each cell's background is `bg-primary` with opacity scaled to the
 * day's adherence rate (or `bg-muted` if there were no scheduled doses
 * on that day).
 */
import { cn } from "@/lib/utils";

type Day = { date: string; total: number; taken: number };

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function AdherenceHeatmap({ days }: Readonly<{ days: Day[] }>) {
  // Group days by week (Monday-first). The `days` array is chronological;
  // we right-align so the most recent day lands in the bottom-right.
  const weeks: Day[][] = [];
  let week: Day[] = [];
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: `auto repeat(${weeks.length}, minmax(12px, 1fr))`,
        gridTemplateRows: "repeat(7, minmax(12px, 1fr))",
      }}
    >
      {WEEK_LABELS.map((label, row) => (
        <span
          key={label}
          style={{ gridRow: row + 1, gridColumn: 1 }}
          className="text-muted-foreground pr-1.5 text-[10px] leading-none"
        >
          {label}
        </span>
      ))}
      {weeks.flatMap((w, weekIdx) =>
        w.map((d, dayIdx) => {
          const rate = d.total > 0 ? d.taken / d.total : null;
          return (
            <div
              key={d.date}
              style={{ gridRow: dayIdx + 1, gridColumn: weekIdx + 2 }}
              className={cn(
                "aspect-square rounded-sm",
                rate == null && "bg-muted"
              )}
              title={
                rate == null
                  ? d.date
                  : `${d.date} — ${d.taken}/${d.total} (${Math.round(rate * 100)}%)`
              }
              aria-label={
                rate == null
                  ? d.date
                  : `${d.date}: ${Math.round(rate * 100)}% adherence`
              }
            >
              {rate != null && (
                <div
                  className="bg-primary h-full w-full rounded-sm"
                  style={{ opacity: 0.2 + 0.8 * rate }}
                  aria-hidden
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
