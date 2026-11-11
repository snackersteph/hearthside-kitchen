import { Link } from "@tanstack/react-router";
import { LayoutDashboard, UtensilsCrossed, Users, Boxes, ClipboardCheck, BookOpen, RotateCcw, Gauge, Store, MessagesSquare, MessageSquare, Radio } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { alternativeOverview, residentApprovalCount } from "./approval-rules";
import { useKitchen } from "@/lib/kitchen/store";
import { AGENTS, AgentAvatar } from "./agents";
import type { AgentId } from "@/lib/kitchen/types";
import logo from "@/assets/nutrisync-logo.png";
import { AccountMenu } from "@/components/account-menu";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Kitchen Pulse", icon: LayoutDashboard },
  { to: "/live-agents", label: "Live Agents", icon: Radio },
  { to: "/agent-room", label: "Agent Room", icon: MessagesSquare },
  { to: "/menu", label: "Daily Menu", icon: UtensilsCrossed },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/residents", label: "Residents", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/vendors", label: "Vendors", icon: Store },
  { to: "/approvals", label: "Approval Center", icon: ClipboardCheck },
] as const;
const MOBILE_NAV = [...NAV, { to: "/dashboard", label: "Dashboard", icon: Gauge }] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { state, analysis, dispatch } = useKitchen();
  const mealPending = (analysis.mealReviews ?? []).filter((r) => !r.approved).length;
  const residentsToApprove = useMemo(() => residentApprovalCount(alternativeOverview(state, new Date()).flatMap((d) => d.pending)), [state]);
  const pending = residentsToApprove + analysis.proposals.filter((p) => p.kind === "purchase").length;
  const busy: Record<AgentId, number> = {
    dietary: analysis.conflicts.length,
    menu: analysis.proposals.filter((p) => p.kind === "substitution").length + mealPending,
    inventory: analysis.proposals.filter((p) => p.kind === "purchase").length,
  };
  return (
    <div className="app-shell flex min-h-screen bg-background">
      <aside className="app-sidebar sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 pb-6 pt-7">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-md bg-card p-1" />
            <div className="min-w-0">
              <div className="font-display text-2xl font-semibold leading-none text-sidebar-foreground">NutriSync</div>
              <div className="mt-1.5 text-[9px] font-medium uppercase tracking-normal text-muted-foreground">SMART NUTRITION, CONNECTED CARE</div>
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
              className="app-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
          <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">Agents</div>
          <Link to="/dashboard" className="flex items-center gap-3 rounded-lg px-3 py-2 -mx-3 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
            <Gauge className="h-4 w-4" /><span className="flex-1">Dashboard</span>
          </Link>
          <Link to="/chat" className="app-nav-link -mx-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
            <MessageSquare className="h-4 w-4" /><span className="flex-1">Chat</span>
          </Link>
          {(Object.keys(AGENTS) as AgentId[]).map((id) => (
            <Link key={id} to="/agents/$agentId" params={{ agentId: id }} className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent" }}>
              <AgentAvatar agent={id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{AGENTS[id].name}</div>
                <div className="text-xs text-sidebar-foreground/55">{busy[id] ? `${busy[id]} open item${busy[id] > 1 ? "s" : ""}` : "Idle · all clear"}</div>
              </div>
              <span className={`h-2 w-2 rounded-full ${busy[id] ? "bg-sidebar-primary animate-pulse-dot" : "bg-success"}`} />
            </Link>
          ))}
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "reset" })} className="mt-2 gap-2 px-0 text-xs text-muted-foreground hover:text-sidebar-foreground">
            <RotateCcw className="h-3 w-3" /> Reset demo day
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b bg-sidebar px-3 py-2 md:hidden">
          {MOBILE_NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-sidebar-foreground/75" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>{n.label}</Link>
          ))}
        </nav>
        <div className="mx-auto flex w-full max-w-7xl justify-end px-5 pt-5 md:px-10"><AccountMenu /></div>
        <main className="app-main mx-auto w-full max-w-7xl flex-1 px-5 pb-8 pt-3 md:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="page-header mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-foreground">{title}</h1>
      </div>
      {children}
    </div>
  );
}
