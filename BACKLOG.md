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

## v6 — Fleet (daemon management across hosts)

Features for installing, updating, and monitoring daemons across multiple servers without manual SSH work. Depends on the v3 Daemon architecture; independent of v4 (Flow II) and v5 (Intelligence).

| Issue | Feature | Description | Side |
|-------|---------|-------------|------|
| TBD | Remote daemon provisioning | Client installs and starts a daemon on a remote host over SSH, reads the 6-digit pairing code from the SSH channel, and completes the handshake automatically | Client + remote |
| TBD | Remote daemon upgrade | Push a newer daemon version to a paired host and restart the service | Client + remote |
| TBD | Fleet status view | Single pane showing daemon version, health, and session count across all paired hosts | Client |
| TBD | Connection-details management | Securely store SSH host/user/key references so re-provisioning or re-pairing does not require re-entry | Client |

---

## Notes

- The original backlog items B-01 through B-09 have been mapped to GitHub Issues #2–#10 and reassigned to milestones based on the daemon architecture decision (DEC-000001).
- Issues #21 and #22 (filed by collaborator LachrymaGhost) are solved structurally by the daemon milestone — no separate implementation needed.
- v4 (Flow II) and v5 (Intelligence) both depend on v3 (Daemon) but are independent of each other and could be worked in parallel.
- v6 (Fleet) also depends on v3 (Daemon) and is independent of v4 and v5; remote provisioning surfaced during the Flow II live-test session (2026-05-29) when the user noted the existing pairing flow assumes a pre-installed daemon.
- Issue numbers for v6 entries are TBD — to be filed by the user (GitHub Issues governance permits Claude to read/close but not create issues).
- Bug issues (#13, #14, #15, #16, #20) are assigned to LachrymaGhost and tracked separately.
