import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ActionCard } from "@/lib/kitchen/overview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One Command Center card: loud and actionable while items remain, calm once they are cleared.
 * Rows are fixed-height so every card in the row keeps the same vertical rhythm. */
export function ActionCardTile({ card, icon: Icon, reviewLabel, onReview }: { card: ActionCard; icon: LucideIcon; reviewLabel?: string | undefined; onReview?: (() => void) | undefined }) {
  const clear = card.value === 0;
  return (
    <div className={cn(
      "flex flex-col rounded-xl border p-5 shadow-soft transition-colors",
      clear ? "border-success/25 bg-action-complete" : "border-destructive/20 bg-action-needed",
    )}>
      <div className="flex h-16 items-start justify-between gap-2 text-sm font-medium">
        {card.label}
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", clear ? "bg-success/15 text-success" : "bg-primary/12 text-primary")}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={cn("mt-2 font-display text-4xl font-semibold", clear && "text-success")}>{card.value}</div>
      <div className="mt-2 flex flex-1 flex-col justify-end gap-2">
        <div className="flex min-h-8 items-center">
          {clear ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              <CircleCheck className="h-3 w-3" />
              {card.clearLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
              <TriangleAlert className="h-3 w-3" />
              Action needed
            </span>
          )}
        </div>
        <div className="flex min-h-8 items-center">
          {(
            <Link to={card.to} search={card.inventoryView ? { view: card.inventoryView } : {}} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              {clear && card.inventoryView ? "View orders" : card.actionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <div className="flex h-6 items-center justify-end">
          {!clear && onReview && (
            <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onReview}>
              {reviewLabel ?? "Mark reviewed"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
