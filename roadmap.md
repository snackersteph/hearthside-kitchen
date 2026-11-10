# Inventory operations
- [x] Add individual resident and whole-card alternative approvals/rejections; test persistence and verify the page.
- [x] Move delivered-order View below ingredients, keep Confirm delivery visible, fold other actions and confirmed deletion into three dots; test and verify.
- [x] Rename vendor contact link and add delivered-order issue, replacement and rejection options that open vendor contact details; verify.
- [x] Combine incoming orders by vendor, remove incoming delivery confirmation and editing, and provide vendor links in read-only details; verify.
- [x] Remove pictured summary/warning; add Stock alert with vendor, estimated pricing, suggested quantities and delivery-aware ordering; verify persistence.
- [x] Forecast ingredient consumption over 7 or 14 days from the shared menu schedule.
- [x] Separate available stock from incoming deliveries and track approved orders.
- [x] Open order-only reviews from Inventory.
- [x] Test purchasing rules and verify approval-to-inventory flow.

## Resident section editing
- [x] Move confirmed resident deletion to the profile header and replace the global edit button with section-specific controls.
- [x] Verify section edits, saved values, cancellation, and mobile layout.

# Daily menu updates
- [x] Allow date-specific upcoming meal changes while keeping past menus view-only.
- [x] Make meal backgrounds very faint green, yellow, and blue.
- [x] Verify saved changes, forecast consistency, and past-menu restrictions.

# Advance meal approvals
- [x] Share full meal and resident-alternative views across today and upcoming dates.
- [x] Add date-specific alternative decisions and meal sign-off due one day before service; invalidate approvals after changes.
- [x] Highlight actionable approval and shortfall cards on Command Center.
- [x] Test advance approval rules and verify menu-to-approval flows.

# Meal review workflow
- [x] Put meal reviews first in deadline/service order, with rejection and alternative choices.
- [x] Allow future approved meals to be edited and require fresh approval after changes.
- [x] Link each menu meal to its exact review and remove the Command Center header approval button.
- [x] Test decision rules and verify the full workflow.

# Date-first menu workflow
- [x] Show the two-week date picker with daily approval status.
- [x] Open each date on a dedicated page with Breakfast, Lunch, and Dinner tabs.
- [x] Verify date navigation, meal switching, editing, and exact approval links.

# Dietary-focused approvals
- [x] Limit meal reviews to menus affected by resident dietary requirements.
- [x] Add dish dropdowns and remove the Service label while retaining dates.
- [x] Test filtering and verify saved changes and safe substitution choices.

# Alternatives-only approvals
- [x] Replace main meal cards with pending and approved resident alternatives.
- [x] Remove grey date badges and ask whether to remember approved alternatives.
- [x] Verify remembered choices, safety checks, date scope, and approval flows.

# Saved approvals and new entries
- [x] Automatically approve saved alternatives until resident food requirements change; reopen affected reviews after changes.
- [x] Add resident and ingredient creation dialogs using the existing fields and inventory columns.
- [x] Test safety rules and verify creation and renewed approval flows.

# Uploaded resident profiles
- [x] Replace sample residents with all 15 uploaded profiles and preserve the full care information.
- [x] Update existing saved records safely and list residents alphabetically by first name.
- [x] Verify profile details, saved updates, sorting, and dietary regression tests.
# Resident table and detail pages
- [x] Replace resident cards with the seven-column alphabetical table.
- [x] Open complete resident profiles on separate pages and preserve editing and creation.
- [x] Verify row navigation, full details, and mobile layout.

# Resident portraits and table typography
- [x] Add individual fictional portraits to rows and profile pages.
- [x] Enlarge and bold table headers and slightly strengthen resident names.
- [x] Verify portrait loading, navigation, and desktop/mobile layouts.

# Additional resident profiles
- [x] Add the five uploaded resident profiles with matching fictional portraits.

# Inventory catalog
- [x] Add inventory search and food sections with related items and photos.
- [x] Allow confirmed editing and deleting of inventory items.

# NutriSync brand
- [x] Rename the app to NutriSync with the slogan "SMART NUTRITION, CONNECTED CARE".
- [x] Add a temporary logo mark and use it in the sidebar and browser tab.

# Command Center action cards
- [x] Remove the agent team section from the Command Center.
- [x] Replace resident and conflict cards with approval, shortfall, incoming order and profile update cards.
- [x] Show an actionable state on every card and a peaceful state once its items are clear.
- [x] Turn Staff decisions into an observation board of resident reactions after meals.
- [x] Test card counts, profile update tracking, and observation review rules.

# Runtime crash fix
- [x] Pre-bundle every Radix library so Vite never re-optimizes mid-session and loads a second React copy.

# Inventory order tabs
- [x] Add Food stock, Delivered orders, and Incoming orders tabs.
- [x] Confirm deliveries once and edit incoming order details with synchronized stock forecasts.
- [x] Test order rules and verify editing, receipt, and persistence in the page.

# Command Center and resident meal history
- [x] Use very faint pink for action cards and very faint green for completed cards.
- [x] Add Delivered orders before Incoming ingredient orders and link both to the matching inventory tab.
- [x] Add resident-specific meal history using recorded dated menus and observations.
- [x] Test delivery counts and resident history; verify page navigation and layouts.

## Unique recipe photos
- [x] Generate one unique photo per recipe (135 total), saved as src/assets/dishes/<recipe-id>.jpg
- [x] Build src/lib/kitchen/recipe-photos.ts mapping recipe id -> photo, wired into recipes.tsx (card + detail), dishPhoto fallback for user-added recipes
- [x] Residents page: title "Residents", resident count in smaller font below the alphabet filter line

## Command Center snapshot and profile reviews
- [x] Add resident, recipe, daily consumption and estimated cost facts.
- [x] Rename Incoming orders and populate the demo with two due deliveries and three incoming orders.
- [x] Show old/new profile content and individually acknowledge updates; test and verify the flow.

## Menu calendar readability
- [x] Add an icon before "Past", make today's date stand out, and strengthen the to-approve and approved label contrast.
- [x] Simplify today's highlight to just the green circle around the date number (no cell border/fill).

## Agent Workspace redesign
- [x] Rebuild /dashboard as a Weekly Agent Workspace per uploaded spec: weekly controls, summary cards, agent cards, meal matrix, collaboration flow with handoff details, manager decisions, final weekly approval.
- [x] Simulated generation sequence; consistent state across all sections; verify in preview.

## Profile update diff styling
- [x] Remove the "Draft example" note and shorten labels to Previous/Updated.
- [x] Show old vs new content in colored panels (soft red struck-through vs soft green highlighted) with an arrow between.

## Dashboard naming and service links
- [x] Rename Command Center to "Kitchen Pulse" across sidebar, page title and back links.
- [x] Link each "Today's service" bar to that date's menu page on its own meal tab (breakfast/lunch/dinner).
