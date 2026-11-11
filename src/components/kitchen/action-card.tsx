import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ActionCard } from "@/lib/kitchen/overview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One compact Kitchen Pulse card, with its status stacked below the count on wider screens. */
export function ActionCardTile({ card, icon: Icon, reviewLabel, onReview }: { card: ActionCard; icon: LucideIcon; reviewLabel?: string | undefined; onReview?: (() => void) | undefined }) {
  const clear = card.value === 0;
  return (
    <div className={cn(
      "pulse-action rounded-xl border shadow-soft transition-colors",
      clear ? "border-success/25 bg-action-complete" : "border-destructive/20 bg-action-needed",
    )}>
      <div className="pulse-action-heading">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", clear ? "bg-success/15 text-success" : "bg-primary/12 text-primary")}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="pulse-action-label">{card.label}</span>
      </div>
      <div className={cn("pulse-action-value font-display font-semibold", clear && "text-success")}>{card.value}</div>
      <div className="pulse-action-status">
        {clear ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
            <CircleCheck className="h-3 w-3" />
            {card.clearLabel}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
            <TriangleAlert className="h-3 w-3" />
            Action needed
          </span>
        )}
      </div>
      <div className="pulse-action-controls">
        <Link to={card.to} search={card.inventoryView ? { view: card.inventoryView } : {}} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-primary hover:underline">
          {clear && card.inventoryView && card.inventoryView !== "alerts" ? "View orders" : card.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {!clear && onReview && (
          <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onReview}>
            {reviewLabel ?? "Mark reviewed"}
          </Button>
        )}
      </div>
    </div>
  );
}
