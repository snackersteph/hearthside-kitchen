import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";
import { GEN_STEPS, INITIAL_WORKSPACE, type SubstitutionId, type WorkspaceState } from "@/lib/kitchen/weekly-plan";

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
  component: DashboardPage,
});

function DashboardPage() {
  const [ws, setWs] = useState<WorkspaceState>(INITIAL_WORKSPACE);

  // Simulated generation: advance one step at a time until the plan needs review.
  useEffect(() => {
    if (ws.status !== "generating") return;
    if (ws.genStep >= GEN_STEPS) {
      setWs((s) => ({ ...s, status: "needs-review" }));
      return;
    }
    const timer = window.setTimeout(() => setWs((s) => ({ ...s, genStep: s.genStep + 1 })), 800);
    return () => window.clearTimeout(timer);
  }, [ws.status, ws.genStep]);

  const generate = () =>
    setWs((s) => ({ ...INITIAL_WORKSPACE, weekOffset: s.weekOffset, status: "generating", genStep: 1 }));

  const changeWeek = (offset: number) =>
    setWs({ ...INITIAL_WORKSPACE, weekOffset: offset });

  const approveDecision = (id: SubstitutionId) =>
    setWs((s) => ({ ...s, decisions: { ...s.decisions, [id]: { ...s.decisions[id], state: "approved" } } }));

  const requestAnother = (id: SubstitutionId) => {
    setWs((s) => ({ ...s, decisions: { ...s.decisions, [id]: { ...s.decisions[id], state: "revalidating" } } }));
    window.setTimeout(() => {
      setWs((s) => {
        const d = s.decisions[id];
        if (d.state !== "revalidating") return s;
        return {
          ...s,
          decisions: { ...s.decisions, [id]: { proposalIndex: (d.proposalIndex + 1) % 2, state: "pending" } },
        };
      });
    }, 1500);
  };

  const approveWeekly = () => setWs((s) => ({ ...s, status: "approved" }));

  return (
    <AgentWorkspace
      ws={ws}
      onGenerate={generate}
      onWeekChange={changeWeek}
      onApproveDecision={approveDecision}
      onRequestAnother={requestAnother}
      onApproveWeekly={approveWeekly}
    />
  );
}
