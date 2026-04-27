"use client";

import { useTransition, useOptimistic } from "react";
import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logIntake, unlogIntake } from "@/lib/adherence/actions";

/**
 * One-tap intake toggle. Optimistic update keeps the UI snappy; the
 * Server Action revalidates the dashboard so the real value shows up
 * after navigation.
 */
export function IntakeToggle({
  itemId,
  scheduledFor,
  initialTaken,
}: Readonly<{
  itemId: string;
  scheduledFor: string;
  initialTaken: boolean;
}>) {
  const t = useTranslations("Dashboard");
  const [isPending, startTransition] = useTransition();
  const [optimisticTaken, setOptimisticTaken] = useOptimistic(
    initialTaken,
    (_state, next: boolean) => next
  );

  function onClick() {
    startTransition(async () => {
      const next = !optimisticTaken;
      setOptimisticTaken(next);
      const result = next
        ? await logIntake({ itemId, scheduledFor })
        : await unlogIntake({ itemId, scheduledFor });
      if (!result.ok) {
        // Revert on failure. The optimistic value is reset when the
        // transition concludes; we don't need to manually reset since
        // the revalidatePath will hydrate the canonical state.
      }
    });
  }

  return (
    <Button
      type="button"
      variant={optimisticTaken ? "secondary" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={optimisticTaken}
    >
      {optimisticTaken ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Circle className="size-4" aria-hidden />
      )}
      {optimisticTaken ? t("logUndo") : t("logTaken")}
    </Button>
  );
}
