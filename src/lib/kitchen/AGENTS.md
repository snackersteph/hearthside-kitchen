# Order presentation
- Showcase stock replenishment is a one-time versioned migration using eleven days of shared dietary-aware demand; only stored quantities increase, preserving incoming orders and later stock edits.
- Group incoming orders by vendor for read-only display without changing source delivery dates or stock; forecasts still need the original delivery schedule.
- Use verified vendor destinations when known and explicitly labeled website searches otherwise; never guess a supplier's identity.

# Resident alternative decisions
- Calendar badges and Approval Center use alternativeOverview and residentApprovalCount to share dated resident meal-decision totals through the accessible future range, deduplicated by date, meal and resident.
- Alternative rejections are dated, resident/meal/main-dish scoped and signed against dietary requirements; partial decisions must not suppress other residents or return rejected suggestions to forecasts.
# Agent profiles
- Agent descriptions and configuration values are staff-editable through state.agentEdits so edits survive reloads; fall back to the built-in text until staff save their own.
# Shared state and purchasing
- Kitchen state is shared by all visitors: KitchenProvider replays an append-only database action log over a single snapshot (replayAt pins the action's clock) with realtime catch-up; localStorage is only a cache/first-seed, so reducer actions must stay deterministic and JSON-serializable.
- Weekly purchasing is derived by weeklyPurchasePlan (src/lib/kitchen/weekly-purchasing.ts) only from an approved weekly menu; requests carry serviceWeekId, approve through the existing approvePurchase/reject actions, and orders for a week are reserved for it. Shortfalls respect ingredient shelf life (own value, then labelled catalog assumption, else flagged), stock changes only on receipt, and menu changes withdraw the draft until re-approval.
