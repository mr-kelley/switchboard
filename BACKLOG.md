# Backlog — Switchboard

Undelivered features and enhancements, organized by origin. Items here are candidates for future sprints — inclusion in the backlog does not guarantee implementation.

Last reconciled against: NORTHSTAR.md, ROADMAP.md, STATE.md — 2026-03-26.

---

## Deferred from v2 (Flow)

These features were in NORTHSTAR.md's v2 vision but were not included in the Flow milestone sprints. The ROADMAP was rescoped to focus on preferences, customization, and polish instead.

| # | Feature | Description | NORTHSTAR ref |
|---|---------|-------------|---------------|
| B-01 | Queued prompts | Per-session input area to pre-stage the next prompt; fire it when the session needs attention | v2 — Flow |
| B-02 | System tray integration | Tray icon with badge showing count of sessions awaiting input; click to focus app | v2 — Flow |
| B-03 | Session templates | Save a working directory + command as a named template; spin up new sessions from templates | v2 — Flow |
| B-04 | Session groups | Organize sessions into named groups (e.g. by project) with collapsible sidebar headers | v2 — Flow |

---

## Planned for v3 (Intelligence)

These features are defined in both NORTHSTAR.md and ROADMAP.md as the Intelligence milestone.

| # | Feature | Description | NORTHSTAR ref |
|---|---------|-------------|---------------|
| B-05 | Status inference | Richer heuristic-based session states: blocked, errored, completed successfully — displayed as labels alongside the status dot | v3 — Intelligence |
| B-06 | Session timeline | Per-session log of prompt/response cycles with timestamps; lightweight activity history | v3 — Intelligence |
| B-07 | Cross-session notes | Optional "project notes" pane per session — scratchpad for decisions, next steps, open questions | v3 — Intelligence |
| B-08 | Notification routing | Per-session notification preferences; mark sessions as high priority or silent | v3 — Intelligence |
| B-09 | Plugin API | Expose session lifecycle events (session-ready, session-working, output-received) for third-party integrations | v3 — Intelligence |

---

## Notes

- B-01 through B-04 were deprioritized during Flow planning in favor of preferences infrastructure, GUI customization, and UX polish. They remain valid enhancements aligned with the Northstar vision.
- B-01 (queued prompts) directly supports the v2 success metric: "process a needs-attention session and submit the next prompt without touching the mouse." Keyboard shortcuts (Sprint 09) partially address this but queued prompts would complete it.
- B-02 (system tray) is a natural complement to the existing notification system (Sprint 06).
- Prioritization and sprint assignment are TBD — this backlog feeds into future milestone planning.
