import {
  CalendarCheck,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Clock,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import {
  WEEK_STATUS_LABEL,
  type WeekStatus,
  type WeekStatusInfo,
} from "@/lib/kitchen/weekly-operations";
import { cn } from "@/lib/utils";

const WEEK_STATUS_STYLE: Record<WeekStatus, { badge: string; icon: LucideIcon }> = {
  "not-started": { badge: "bg-muted text-muted-foreground", icon: CircleDashed },
  planning: { badge: "bg-accent text-accent-foreground", icon: Sparkles },
  "needs-review": { badge: "bg-warning-soft text-warning", icon: ClipboardCheck },
  "menu-approved": { badge: "bg-success-soft text-success", icon: CheckCircle2 },
  purchasing: { badge: "bg-agent-inventory-soft text-agent-inventory", icon: ShoppingCart },
  "ready-for-service": { badge: "bg-success-soft text-success", icon: CalendarCheck },
  "in-service": { badge: "bg-primary text-primary-foreground", icon: UtensilsCrossed },
  completed: { badge: "bg-muted text-muted-foreground", icon: Clock },
};

/** Shared weekly status pill for the menu calendar, Kitchen Pulse and Agent Workspace. */
export function WeekStatusBadge({
  info,
  className,
  compact = false,
}: {
  info: Pick<WeekStatusInfo, "status" | "outstanding">;
  className?: string;
  compact?: boolean;
}) {
  const style = WEEK_STATUS_STYLE[info.status];
  const overdue = info.outstanding.length > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        style.badge,
        className,
      )}
    >
      <style.icon className="size-3 shrink-0" />
      {WEEK_STATUS_LABEL[info.status]}
      {overdue && (
        <span
          className={cn(
            "ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-1.5 text-destructive",
            compact && "px-1",
          )}
        >
          <TriangleAlert className="size-3" />
          {!compact && "Overdue"}
        </span>
      )}
    </span>
  );
}
