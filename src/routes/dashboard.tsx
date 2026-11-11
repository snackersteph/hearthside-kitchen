import { createFileRoute } from "@tanstack/react-router";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Agent Workspace · NutriSync" },
      { name: "description", content: "See how your AI team collaborates to plan meals for the week: handoffs, decisions, and approvals." },
      { property: "og:title", content: "Agent Workspace · NutriSync" },
      { property: "og:description", content: "See how your AI team collaborates to plan meals for the week: handoffs, decisions, and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentWorkspace,
});
