import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runInventoryAgent, type InventoryAgentResult } from "./inventory-agent";
import type { KitchenState } from "./types";

/**
 * Callable from the UI: runs the Inventory Agent on the current kitchen state.
 * The state lives in the browser (localStorage), so the client sends it along.
 * It is synthetic sample data, so only its basic shape is checked here.
 */
const input = z.object({
  state: z.custom<KitchenState>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      Array.isArray((value as KitchenState).ingredients) &&
      Array.isArray((value as KitchenState).residents) &&
      Array.isArray((value as KitchenState).history) &&
      typeof (value as KitchenState).plan === "object",
    "Invalid kitchen state",
  ),
  /** The browser's current time (ISO), so deadlines match what staff see. */
  now: z.string().datetime().optional(),
});

export const runInventoryAgentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<InventoryAgentResult> => {
    // Dynamic import keeps the SDK and API key out of the client bundle.
    const { createRunModel } = await import("./inventory-agent.server");
    const runModel = createRunModel();
    return runInventoryAgent(data.state, {
      reference: data.now ? new Date(data.now) : new Date(),
      ...(runModel ? { runModel } : {}),
    });
  });
