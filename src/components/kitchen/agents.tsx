import { ShieldCheck, ChefHat, PackageSearch, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentId } from "@/lib/kitchen/types";

export const AGENTS: Record<AgentId, { name: string; role: string; icon: typeof ShieldCheck; text: string; bg: string; soft: string; border: string }> = {
  dietary: { name: "Dietary Agent", role: "The Safety Specialist", icon: ShieldCheck, text: "text-agent-dietary", bg: "bg-agent-dietary", soft: "bg-agent-dietary-soft", border: "border-agent-dietary" },
  menu: { name: "Menu Agent", role: "The Planner", icon: ChefHat, text: "text-agent-menu", bg: "bg-agent-menu", soft: "bg-agent-menu-soft", border: "border-agent-menu" },
  inventory: { name: "Inventory Agent", role: "The Procurement Specialist", icon: PackageSearch, text: "text-agent-inventory", bg: "bg-agent-inventory", soft: "bg-agent-inventory-soft", border: "border-agent-inventory" },
};

export function AgentAvatar({ agent, size = "md" }: { agent: AgentId | "staff"; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5";
  if (agent === "staff")
    return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", dim)}><UserCheck className={icon} /></span>;
  const a = AGENTS[agent];
  const Icon = a.icon;
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-primary-foreground", a.bg, dim)}><Icon className={icon} /></span>;
}

export function AgentChip({ agent }: { agent: AgentId | "staff" }) {
  if (agent === "staff") return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">Staff</span>;
  const a = AGENTS[agent];
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", a.soft, a.text)}>{a.name.replace(" Agent", "")}</span>;
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" | "ok" | "warn" }) {
  const t = { neutral: "bg-muted text-muted-foreground", danger: "bg-danger-soft text-destructive", ok: "bg-success-soft text-success", warn: "bg-warning-soft text-accent-foreground" }[tone];
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize", t)}>{children}</span>;
}

export const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;
export const MEAL_TIME = { breakfast: "7:30 AM", lunch: "12:00 PM", dinner: "5:30 PM" } as const;
