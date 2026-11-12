import { BoardReturn, boardReturnSearch } from "@/components/kitchen/board-return";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";
import { Button } from "@/components/ui/button";
import { isDateKey, weekStartFor } from "@/lib/kitchen/weekly-schedule";

export const Route = createFileRoute("/dashboard")({
  // `week` is any date in a Monday–Sunday service week; it is snapped to that Monday.
  // `fromMenu` marks arrival from the menu calendar so a back link returns there.
  validateSearch: (search: Record<string, unknown>): { week?: string; fromMenu?: boolean; fromBoard?: string } => ({
    ...boardReturnSearch(search),
    ...(isDateKey(search["week"]) ? { week: weekStartFor(search["week"]) } : {}),
    ...(search["fromMenu"] === true || search["fromMenu"] === "true" ? { fromMenu: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Agent Workspace · NutriSync" },
      {
        name: "description",
        content:
          "See how your AI team collaborates to plan meals for the week: handoffs, decisions, and approvals.",
      },
      { property: "og:title", content: "Agent Workspace · NutriSync" },
      {
        property: "og:description",
        content:
          "See how your AI team collaborates to plan meals for the week: handoffs, decisions, and approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentWorkspacePage,
});

function AgentWorkspacePage() {
  // Unvalidated keys can pass through from the root route, so check the date again.
  const { week: raw, fromMenu } = Route.useSearch();
  const week = isDateKey(raw) ? weekStartFor(raw) : undefined;
  const navigate = useNavigate({ from: "/dashboard" });
  return (
    <>
      <BoardReturn />
      {fromMenu && (
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
          <Link to="/menu">
            <ArrowLeft className="size-4" />
            Back to calendar
          </Link>
        </Button>
      )}
      <AgentWorkspace
        week={week}
        onWeekChange={(next) => navigate({ search: (prev) => ({ ...prev, week: next }), replace: true })}
      />
    </>
  );
}
