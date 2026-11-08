# Project rules
- Agent logic (Dietary/Menu/Inventory) lives in the pure `analyze()` in src/lib/kitchen/engine.ts; proposals are derived from state, so pages never store them — keeps agents sharing one context and re-running on every change.
- Staff decisions are the only persisted actions (history + overrides + onOrder), stored in localStorage via KitchenProvider until a backend is added.
- Engine rules are covered by src/test/kitchen-engine.test.ts; update it when safety rules change.
- Menu and inventory use the shared schedule helpers; analyze derives horizon demand and purchasing requests so forecasts cannot diverge from the displayed sample rotation.
- Date-specific future main dishes are staff decisions stored in KitchenState.scheduledPlans; the shared schedule resolves them before the sample rotation so editing one day changes only that day's forecast.
- Approved purchases remain incoming until explicitly received; dated order lines support delivery-aware forecasts without treating unreceived stock as available today.
- Preserve Kitchen context identity through Vite hot updates so mounted providers and refreshed consumers cannot split into different contexts.

- Meal views, resident alternatives and forecasts use analyzeMenuDay with date-scoped decisions; whole-meal sign-off checks a plan/profile signature and the day-before deadline so future approvals cannot affect another service or survive changes.
- KitchenProvider renders operational pages only after the browser calendar is available and refreshes its clock each minute to avoid server/browser timezone mismatches in deadlines.
- Whole-meal rejections are signature-scoped staff decisions; replacing the plan reopens review, while service-day approved meals are locked in the review editor.
- Menu review links carry service date and meal search filters so pending and approved reviews resolve to the exact service.
