---
title: Idle Detector Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, idle-detection]
status: active
governs: src/main/idle-detector.ts
---

# Purpose
Monitor PTY output streams to detect session status transitions: working (green), idle (yellow), and needs-attention (red). Uses configurable prompt pattern matching and timers.

# Behavior

## State Machine
Each session has three states:
- **working**: PTY output is actively flowing.
- **idle**: No output for 10 seconds, and prompt pattern has NOT been detected.
- **needs-attention**: Prompt pattern detected after at least 2 seconds of activity.

## Transitions
- `working → idle`: 10 seconds of no output, prompt not detected.
- `working → needs-attention`: prompt pattern detected after ≥2s of prior activity.
- `idle → working`: any new PTY output.
- `needs-attention → working`: any new user input sent to PTY.

## Prompt Pattern
- Default regex: `/^[>❯$#]\s*$/m` — matches common shell prompts and Claude Code's prompt.
- Configurable via `SWITCHBOARD_PROMPT_PATTERN` environment variable (parsed as RegExp).
- Pattern is tested against each chunk of PTY output data.

## Integration
- `IdleDetector` is instantiated with a callback for status changes.
- `onOutput(sessionId, data)`: called when PTY emits data. Resets timers, tests prompt pattern.
- `onInput(sessionId)`: called when user sends input. Resets to working.
- `addSession(sessionId)`: begins tracking a new session.
- `removeSession(sessionId)`: stops tracking and clears timers.

## Timer Management
- Each session has an idle timer (10s timeout).
- Timer is reset on each output event.
- Timer fires → transition to idle (if not already needs-attention).

# Exports
- `IdleDetector` class

# Test Strategy
- Unit test: output data sets status to working.
- Unit test: no output for 10s transitions to idle.
- Unit test: prompt pattern detection sets needs-attention.
- Unit test: user input resets from needs-attention to working.
- Unit test: custom prompt pattern works.
- Unit test: rapid output resets idle timer.
