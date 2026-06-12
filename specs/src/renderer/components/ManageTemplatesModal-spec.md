---
title: Manage Templates Modal Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, ui, templates]
status: active
platform: claude-code
license: Apache-2.0
governs: src/renderer/components/ManageTemplatesModal.tsx
---

# Purpose
A small modal to view, edit, and delete saved session templates (`SwitchboardPreferences.sessionTemplates`). Reached from the "Manage templates…" link in the New Session modal.

# Scope

## Covers
- Listing existing templates (name, host, cwd, command).
- Editing a template's fields in place.
- Deleting a template.
- Persisting changes via `updatePrefs({ sessionTemplates })`.

## Does Not Cover
- Creating templates from scratch (done from the New Session modal via "Save as template").
- Spawning sessions (the New Session modal owns spawn).

# Inputs
- Props:
  ```typescript
  interface ManageTemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
  }
  ```
- Reads `prefs.sessionTemplates` and `prefs.uiColors` via `usePreferences()`.

# Outputs
- Calls `updatePrefs({ sessionTemplates })` on edit/delete.
- Renders nothing when `isOpen` is false.

# Responsibilities
- Render one row per template with editable `name`, `cwd`, and `command` fields and a read-only/host label.
- **Edit:** changes update the in-memory list; a Save action (or per-field commit) writes the full `sessionTemplates` array via `updatePrefs`.
- **Delete:** removes the template by `id` and persists.
- **Empty state:** when there are no templates, show an explanatory message.
- Dismiss on overlay click and on a Close/Done button.

# Edge Cases / Fault Handling
- Editing a name to empty: the row is still saved but flagged; an empty name is permitted (no hard validation) — consumers display "(unnamed)".
- Duplicate names are allowed (templates are keyed by `id`, not name).
- Deleting the last template returns to the empty state.

# Test Strategy
Unit tests in `tests/renderer/components/ManageTemplatesModal.test.tsx` (Vitest + Testing Library), mocking `usePreferences`:
- Renders a row per template.
- Empty state when no templates.
- Delete removes a template and calls `updatePrefs` with the shortened array.
- Editing a field and saving calls `updatePrefs` with the updated template.
- Does not render when closed.

# Completion Criteria
- List/edit/delete work and persist through `updatePrefs`.
- All tests pass; no regressions.
