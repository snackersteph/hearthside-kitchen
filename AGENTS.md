# Project rules
- Agent logic (Dietary/Menu/Inventory) lives in the pure `analyze()` in src/lib/kitchen/engine.ts; proposals are derived from state, so pages never store them — keeps agents sharing one context and re-running on every change.
- Staff decisions are the only persisted actions (history + overrides + onOrder), stored in localStorage via KitchenProvider until a backend is added.
- Engine rules are covered by src/test/kitchen-engine.test.ts; update it when safety rules change.
- Menu and inventory use the shared schedule helpers; analyze derives horizon demand and purchasing requests so forecasts cannot diverge from the displayed sample rotation.
- Approved purchases remain incoming until explicitly received; dated order lines support delivery-aware forecasts without treating unreceived stock as available today.
- Preserve Kitchen context identity through Vite hot updates so mounted providers and refreshed consumers cannot split into different contexts.
