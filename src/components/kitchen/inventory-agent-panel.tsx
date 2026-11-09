import { useMemo, useState } from "react";
import { Check, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgentAvatar, Tag } from "@/components/kitchen/agents";
import {
  findShortages,
  runInventoryAgent,
  type DraftPurchaseRequest,
  type InventoryAgentResult,
} from "@/lib/kitchen/inventory-agent";
import { runInventoryAgentFn } from "@/lib/kitchen/inventory-agent.functions";
import { useKitchen } from "@/lib/kitchen/store";
import type { AgentMessage, KitchenState } from "@/lib/kitchen/types";
import { cn } from "@/lib/utils";

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const TONE: Record<AgentMessage["tone"], string> = {
  alert: "border-warning bg-warning-soft",
  info: "border-agent-inventory bg-agent-inventory-soft",
  ok: "border-success bg-success-soft",
};

export type Decision = "approved" | "rejected";

/** Presentational: everything the agent produced, with approve/reject on each draft order. */
export function InventoryAgentResultView({
  result,
  state,
  openIngredients,
  decided,
  onApprove,
  onReject,
}: {
  result: InventoryAgentResult;
  state: KitchenState;
  /** Ingredients that are still short right now; a draft with none of these is out of date. */
  openIngredients: ReadonlySet<string>;
  decided: Record<string, Decision>;
  onApprove: (draft: DraftPurchaseRequest) => void;
  onReject: (draft: DraftPurchaseRequest) => void;
}) {
  const forMenu = result.messages.filter((m) => m.to === "menu");
  const activity = result.messages.filter((m) => m.to !== "menu");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {result.mode === "ai" ? <Tag tone="ok">AI agent</Tag> : <Tag tone="warn">Rules only</Tag>}
        <span className="font-medium">{result.summary}</span>
      </div>
      {result.mode === "rules" && (
        <p className="text-xs text-muted-foreground">
          {result.error
            ? `The AI agent was unavailable (${result.error}). `
            : "No AI key is configured. "}
          The same safety rules ran without AI: only eligible, on-time vendors are used.
        </p>
      )}

      {result.drafts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Draft orders for approval</h3>
          {result.drafts.map((draft) => {
            const decision = decided[draft.id];
            const stillNeeded = draft.lines.every((line) => openIngredients.has(line.ingredientId));
            return (
              <div
                key={draft.id}
                className="rounded-xl border bg-card p-4 shadow-soft"
                data-testid="draft-order"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {draft.vendorName} · ${draft.total.toFixed(2)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Tag>Delivery {dateLabel(draft.deliveryDate)}</Tag>
                      <Tag tone="ok">Vendor verified</Tag>
                      {draft.warnings.map((w) => (
                        <Tag key={w} tone="warn">
                          {w}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  {decision ? (
                    <Tag tone={decision === "approved" ? "ok" : "neutral"}>{decision}</Tag>
                  ) : !stillNeeded ? (
                    <Tag tone="neutral">No longer needed</Tag>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => onReject(draft)}>
                        <X /> Reject
                      </Button>
                      <Button size="sm" onClick={() => onApprove(draft)}>
                        <Check /> Approve order
                      </Button>
                    </div>
                  )}
                </div>
                <table className="mt-3 w-full max-w-lg text-sm">
                  <tbody className="divide-y">
                    {draft.lines.map((line) => (
                      <tr key={line.ingredientId}>
                        <td className="py-1.5">
                          {state.ingredients.find((i) => i.id === line.ingredientId)?.name ??
                            line.ingredientName}
                        </td>
                        <td className="py-1.5 text-right font-semibold">
                          {line.qty} {line.unit}
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          ${line.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {forMenu.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Handed to the Menu Agent ({forMenu.length})</h3>
          {forMenu.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </div>
      )}

      {activity.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Agent activity</h3>
          {activity.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: AgentMessage }) {
  return (
    <div className={cn("rounded-lg border-l-4 p-3 text-sm", TONE[message.tone])}>
      {message.text}
    </div>
  );
}

/** Runs the Inventory Agent on the current kitchen state and routes approvals through the existing purchase flow. */
export function InventoryAgentPanel() {
  const { state, dispatch } = useKitchen();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InventoryAgentResult | null>(null);
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const openIngredients = useMemo(
    () => new Set(findShortages(state, new Date()).map((s) => s.ingredientId)),
    [state],
  );

  async function run() {
    setRunning(true);
    setDecided({});
    try {
      setResult(await runInventoryAgentFn({ data: { state, now: new Date().toISOString() } }));
    } catch (e) {
      // Server unreachable: run the same deterministic rules in the browser so staff are never stuck.
      const next = await runInventoryAgent(state, { reference: new Date() });
      setResult({ ...next, error: e instanceof Error ? e.message : "server unreachable" });
    } finally {
      setRunning(false);
    }
  }

  function approve(draft: DraftPurchaseRequest) {
    const summary = `Approved ${draft.vendorName} order ($${draft.total.toFixed(2)})`;
    dispatch({
      type: "approvePurchase",
      proposalId: draft.id,
      lines: draft.lines.map((line) => ({
        ingredientId: line.ingredientId,
        shortage: line.qty,
        qty: line.qty,
      })),
      modified: false,
      summary,
      vendor: draft.vendorName,
      deliveryDate: draft.deliveryDate,
    });
    setDecided((d) => ({ ...d, [draft.id]: "approved" }));
    toast.success(summary);
  }

  function reject(draft: DraftPurchaseRequest) {
    const summary = `Rejected ${draft.vendorName} order ($${draft.total.toFixed(2)})`;
    dispatch({ type: "reject", proposalId: draft.id, kind: "purchase", summary });
    setDecided((d) => ({ ...d, [draft.id]: "rejected" }));
    toast(summary);
  }

  return (
    <section
      className="mb-6 rounded-xl border border-agent-inventory p-4"
      aria-label="Inventory Agent"
    >
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <AgentAvatar agent="inventory" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">Inventory Agent</div>
          <div className="text-muted-foreground">
            Finds shortages, checks vendor licenses and certifications, and drafts orders for your
            approval.
          </div>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {running ? "Working…" : result ? "Run again" : "Run Inventory Agent"}
        </Button>
      </div>
      {result && (
        <InventoryAgentResultView
          result={result}
          state={state}
          openIngredients={openIngredients}
          decided={decided}
          onApprove={approve}
          onReject={reject}
        />
      )}
    </section>
  );
}
