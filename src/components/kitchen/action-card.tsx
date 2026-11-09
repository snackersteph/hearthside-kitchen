import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ActionCard } from "@/lib/kitchen/overview";
import { cn } from "@/lib/utils";

/** One Command Center card: loud and actionable while items remain, calm once they are cleared. */
export function ActionCardTile({ card, icon: Icon }: { card: ActionCard; icon: LucideIcon }) {
  const clear = card.value === 0;
  return (
    <div className={cn(
      "rounded-xl border p-5 shadow-soft transition-colors",
      clear ? "border-success/35 bg-success-soft/45" : "border-primary/45 bg-card ring-1 ring-primary/15",
    )}>
      <div className="flex items-center justify-between gap-2 text-sm font-medium">
        {card.label}
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", clear ? "bg-success/15 text-success" : "bg-primary/12 text-primary")}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={cn("mt-2 font-display text-4xl font-semibold", clear && "text-success")}>{card.value}</div>
      {clear ? (
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {card.clearLabel}
        </div>
      ) : (
        <Link to={card.to} className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5">
            <TriangleAlert className="h-3 w-3" />
            Action needed
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          </span>
          {card.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
