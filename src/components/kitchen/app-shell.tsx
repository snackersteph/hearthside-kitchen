import { Link } from "@tanstack/react-router";
import { LayoutDashboard, UtensilsCrossed, Users, Boxes, ClipboardCheck, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { AGENTS, AgentAvatar } from "./agents";
import type { AgentId } from "@/lib/kitchen/types";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard },
  { to: "/menu", label: "Daily Menu", icon: UtensilsCrossed },
  { to: "/residents", label: "Residents", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/approvals", label: "Approval Center", icon: ClipboardCheck },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { analysis, dispatch } = useKitchen();
  const mealPending = (analysis.mealReviews ?? []).filter((r) => !r.approved).length;
  const pending = analysis.proposals.length + mealPending;
  const busy: Record<AgentId, number> = {
    dietary: analysis.conflicts.length,
    menu: analysis.proposals.filter((p) => p.kind === "substitution").length + mealPending,
    inventory: analysis.proposals.filter((p) => p.kind === "purchase").length,
  };
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-6 pb-6 pt-7">
          <div className="font-display text-2xl font-semibold leading-none">Hearth</div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-sidebar-foreground/60">Kitchen Command</div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {n.to === "/approvals" && pending > 0 && (
                <span className="rounded-full bg-sidebar-primary px-2 py-0.5 text-xs font-bold text-sidebar-primary-foreground">{pending}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 border-t border-sidebar-border px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-sidebar-foreground/50">Agents online</div>
          {(Object.keys(AGENTS) as AgentId[]).map((id) => (
            <div key={id} className="flex items-center gap-3">
              <AgentAvatar agent={id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{AGENTS[id].name}</div>
                <div className="text-xs text-sidebar-foreground/55">{busy[id] ? `${busy[id]} open item${busy[id] > 1 ? "s" : ""}` : "Idle · all clear"}</div>
              </div>
              <span className={`h-2 w-2 rounded-full ${busy[id] ? "bg-sidebar-primary animate-pulse-dot" : "bg-success"}`} />
            </div>
          ))}
          <button onClick={() => dispatch({ type: "reset" })} className="mt-2 flex items-center gap-2 text-xs text-sidebar-foreground/55 hover:text-sidebar-foreground">
            <RotateCcw className="h-3 w-3" /> Reset demo day
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b bg-sidebar px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-sidebar-foreground/75" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>{n.label}</Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
        <h1 className="mt-1 text-3xl font-semibold text-foreground md:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}
