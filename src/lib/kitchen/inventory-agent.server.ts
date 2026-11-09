import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { RunModel } from "./inventory-agent";

/** Server-only: holds the API key and the SDK. Never import this from client code. */

export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";

/**
 * Returns a model runner backed by the Claude API, or undefined when no API key is
 * configured (the agent then runs its deterministic rules instead).
 *
 * Env: ANTHROPIC_API_KEY (required for AI mode), INVENTORY_AGENT_MODEL (optional override).
 */
export function createRunModel(): RunModel | undefined {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return undefined;
  const client = new Anthropic({ apiKey });
  const model = process.env["INVENTORY_AGENT_MODEL"] || DEFAULT_AGENT_MODEL;

  return async ({ system, prompt, tools }) => {
    const finalMessage = await client.beta.messages.toolRunner({
      model,
      max_tokens: 8000,
      system,
      output_config: { effort: "medium" },
      tools: tools as unknown as BetaRunnableTool[],
      messages: [{ role: "user", content: prompt }],
      max_iterations: 16,
    });
    if (finalMessage.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (finalMessage.stop_reason === "max_tokens")
      throw new Error("The model ran out of room before finishing.");
    return finalMessage.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
  };
}
