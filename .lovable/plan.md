# Resident observation log

- Add a resident-specific **Log observation** form using the existing meal-reaction fields.
- Add **Edit** for each entry, preserving the resident and original creation time.
- Save prior versions whenever an entry is edited or reviewed, and show them in a **History** dialog.
- Add search across dates, meals, dishes, observation text, and status, with an empty-result state.
- Reuse shared kitchen actions so new entries and edits appear across browsers and devices.

## Technical notes

Extend the observation data model with prior-version snapshots, add a validated edit action to the existing reducer, and reuse the current observation dialog for create/edit. Add focused reducer/search tests and verify the complete flow in the preview.
