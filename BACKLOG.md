# Backlog — Switchboard

Undelivered features and enhancements, organized by milestone. Items here are candidates for future sprints — inclusion in the backlog does not guarantee implementation.

Last reconciled against: NORTHSTAR.md, ROADMAP.md, GitHub Issues — 2026-04-06.

---

## v3 — Daemon (foundation)

The daemon milestone is new infrastructure, not a collection of individual features. Its deliverables are defined in ROADMAP.md. These GitHub Issues are directly addressed by the daemon architecture:

| Issue | Title | How addressed |
|-------|-------|---------------|
| #21 | Session persistence across app restarts | Solved by design — daemon owns sessions; they survive client restarts |
| #22 | Cross-device session sync and tunneling | Solved by design — reconnect from any client to the same daemon |

---

## v4 — Flow II (client UX)

Deferred from the original v2 vision. These are client-side features that enhance the UX on top of the daemon architecture.

| Issue | Feature | Description | Side |
|-------|---------|-------------|------|
| #2 | Queued prompts | Pre-stage the next prompt per session; fire when session needs attention | Client |
| #3 | System tray integration | Tray icon with badge showing count of sessions awaiting input across all daemons | Client |
| #4 | Session templates | Save host + directory + command as a named template for one-click session creation | Client |
| #5 | Session groups | Organize sessions by host, project, or custom grouping with collapsible sidebar headers | Client |
| #9 | Notification routing | Per-session notification preferences: high priority, normal, silent | Client |

---

## v5 — Intelligence (daemon-side)

These features run on the daemon where the PTY output stream lives. The daemon has the data; the client renders the insights.

| Issue | Feature | Description | Side |
|-------|---------|-------------|------|
| #6 | Status inference | Richer heuristic-based session states: blocked, errored, completed successfully | Daemon |
| #7 | Session timeline | Per-session log of prompt/response cycles with timestamps; persisted on daemon | Daemon |
| #8 | Cross-session notes | Per-session scratchpad stored on daemon; follows the session across clients | Daemon |
| #10 | Plugin API | Expose session lifecycle events from daemon for third-party integrations | Daemon |

---

## Notes

- The original backlog items B-01 through B-09 have been mapped to GitHub Issues #2–#10 and reassigned to milestones based on the daemon architecture decision (DEC-000001).
- Issues #21 and #22 (filed by collaborator LachrymaGhost) are solved structurally by the daemon milestone — no separate implementation needed.
- v4 (Flow II) and v5 (Intelligence) both depend on v3 (Daemon) but are independent of each other and could be worked in parallel.
- Bug issues (#13, #14, #15, #16, #20) are assigned to LachrymaGhost and tracked separately.
