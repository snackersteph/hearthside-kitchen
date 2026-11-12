import type { KitchenState } from "./types";

/** One shared staff action, replayed in database order by every browser. */
export type SharedAction<A> = { id: number; key: string; action: A; at: number };

/**
 * Apply an action exactly as the browser that made it did: same clock for date logic and for
 * recorded decision times, so every device rebuilds the identical kitchen from the shared log.
 */
export function replayAt<A>(state: KitchenState, action: A, at: number, reduce: (s: KitchenState, a: A, ref: Date) => KitchenState): KitchenState {
  const realNow = Date.now;
  Date.now = () => at;
  try { return reduce(state, action, new Date(at)); } finally { Date.now = realNow; }
}

/** Confirmed log on top of the snapshot, then this browser's not-yet-confirmed actions. */
export function rebuild<A>(confirmed: KitchenState, pending: { action: A; at: number }[], reduce: (s: KitchenState, a: A, ref: Date) => KitchenState): KitchenState {
  return pending.reduce((s, p) => replayAt(s, p.action, p.at, reduce), confirmed);
}
