import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";
import { isDateKey, weekStartFor } from "@/lib/kitchen/weekly-schedule";

export const Route = createFileRoute("/dashboard")({
  // `week` is any date in a Monday–Sunday service week; it is snapped to that Monday.
  validateSearch: (search: Record<string, unknown>): { week?: string } =>
    isDateKey(search["week"]) ? { week: weekStartFor(search["week"]) } : {},
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
  const { week: raw } = Route.useSearch();
  const week = isDateKey(raw) ? weekStartFor(raw) : undefined;
  const navigate = useNavigate({ from: "/dashboard" });
  return (
    <AgentWorkspace
      week={week}
      onWeekChange={(next) => navigate({ search: { week: next }, replace: true })}
    />
  );
}
