# Switchboard vs. Other Terminal Emulators

How Switchboard's client-side cost stacks against other Linux terminal emulators when running
the same "N concurrent shells" workload. Purpose: give users an honest picture of what
Switchboard is and is not compared to alternatives they might already use.

**Status:** scaffold. Findings will be filled in as workstation data is collected.

Part of a series:

- [switchboard-performance.md](switchboard-performance.md) — combined workstation (Switchboard client + local daemon)
- [daemon-hardware-comparison.md](daemon-hardware-comparison.md) — daemon in isolation across host classes
- **This report** — Switchboard's client-side vs. other terminal emulators, same host

## What this report is for

Switchboard's client is a Chromium-based Electron app with xterm.js + WebGL rendering. That's a
very different architecture from a native GTK/VTE terminal (gnome-terminal), a native GPU-
accelerated terminal (kitty), an EFL/Enlightenment-based one (Terminology), or a heavily
styled QML terminal (Cool Retro Term). This report measures the concrete resource cost
differences on the same workstation, under the same workload, using the same measurement code.

Not a beauty contest. Not a marketing pitch. If Switchboard is more expensive on some axis,
that data lands here too.

## Measurement axis

**"N concurrent shells."** For non-Switchboard emulators, that's N separate emulator windows
spawned via the CLI (`gnome-terminal --window`, `kitty`, `terminology`, `cool-retro-term`).
For Switchboard, that's N tabs in one client window (its native session model — nobody runs
one Switchboard app per session).

Why windows-first for the others:

- **Windows is the lowest common denominator** — Cool Retro Term has no scriptable tab support;
  Terminology's differs by build; kitty is either.
- **For gnome-terminal, windows and tabs measure identically** (client/server architecture:
  all windows attach to one `gnome-terminal-server`). It's invariant.
- **For kitty specifically, windows-mode reflects a real usage pattern** (`kitty` spawned from
  a tiling WM) but not the only one. A follow-up scenario measures kitty single-instance with
  tabs to show the delta — see below.

The tradeoff: **windows-mode measurements are not a proxy for tabs-mode of the same terminal**.
The report always names the mode. A kitty user who lives inside one kitty with N tabs will see
lower per-session cost than the kitty-windows numbers here suggest.

## Scenarios per emulator

Same measurement recipe run against each emulator:

| Scenario | Sessions | Workload | Duration |
|---|---:|---|---:|
| `0sessions` | 0 | — (emulator not running) | 30s |
| `1session_idle` | 1 | `idle_shell` | 60s |
| `5sessions_idle` | 5 | `idle_shell` | 60s |
| `10sessions_idle` | 10 | `idle_shell` | 60s |
| `15sessions_idle` | 15 | `idle_shell` | 60s |
| `15sessions_1inference` | 15 | `active_claude_inference` (1 session) | 150s |
| `1session_realwork` | 1 | `active_vscode_npm_ci` | 150s |
| `5sessions_1realwork` | 5 | `active_vscode_npm_ci` (1 session) | 150s |

The active workload always fires in the LAST spawned session; the rest run `idle_shell`.

**Optional supplementary scenario for kitty only:**

| Scenario | Sessions | How | Purpose |
|---|---:|---|---|
| `kitty_tabs_15sessions_idle` | 15 | Single kitty, 15 tabs opened via `kitty @ launch --type=tab` | Isolate "spawn window vs. open tab" cost |

The delta between `kitty` (windows) and `kitty_tabs_*` at the same session count IS the
window-vs-tab cost for that emulator. Same information applies conceptually to gnome-terminal,
but its client/server architecture already makes windows and tabs identical.

## Emulators covered

| Emulator | Session model in this test | Renderer | Notes |
|---|---|---|---|
| Switchboard | 1 client window, N tabs | Chromium + xterm.js + WebGL | Its native model — nobody runs one instance per session |
| gnome-terminal | N windows OR N tabs (measurement identical) | GTK + VTE | Server model; all windows attach to one `gnome-terminal-server` |
| kitty | N windows (default `kitty` invocations) | OpenGL, native | Also supports single-instance + tabs; see supplementary scenario |
| Terminology | N windows | EFL / Enlightenment | Idiomatic for its ecosystem; tab support is build-dependent |
| Cool Retro Term | N windows | QML with heavy shader effects | No scriptable tab support; a stress test for GPU-heavy renderer patterns |

## Findings

_To be populated as workstation runs come in. Findings organized per scenario, comparing all
emulators side by side using the same measurement code. Anticipated headline questions:_

- What's each emulator's memory floor for 0 sessions?
- What's the per-session RSS increment on the median idle scenario?
- Under an active streaming workload, how does per-emulator CPU compare?
- Does any emulator degrade non-linearly (e.g. hits a wall past N=10)?
- For kitty specifically: what's the windows-vs-tabs delta?

## Reproducing

Requirements on the workstation:

- All emulators you want to test, installed and on `PATH`.
- Switchboard running (for the `--emulator switchboard` case).
- `claude` CLI in `PATH` if running the `active_claude_inference` workload.
- `git` and `npm` if running the `active_vscode_npm_ci` workload.

**Per scenario, per emulator:**

```bash
./scripts/perf/run_emulator_comparison.sh \
    --emulator gnome-terminal \
    --scenario 15sessions_idle \
    --sessions 15 \
    --duration 60
```

For an active workload scenario, add `--workload`:

```bash
./scripts/perf/run_emulator_comparison.sh \
    --emulator kitty \
    --scenario 15sessions_1inference \
    --sessions 15 \
    --workload active_claude_inference \
    --duration 150
```

For Switchboard, the driver waits for manual setup — you open the sessions in the client,
press ENTER, and it starts sampling.

Output lands at `perf-runs/<YYYY-MM-DD>/<hostname_hash>/emulator-<emulator>/<scenario>/`.

### The anonymous Claude CLI recipe

`workloads/active_claude_inference.sh` runs Claude CLI in a scratch cwd under `/tmp/sb-perf-run-XXXXXX`
and cleans up both the scratch dir and its `~/.claude/projects/-tmp-sb-perf-run-...` entry when it
exits. Nothing about the run persists to your auto-memory or session history. Auth in
`~/.claude/` proper is untouched. See the script for the exact recipe.

### The canonical Claude prompt

Baked into `active_claude_inference.sh`:

> *Write a 500-word article about the history of terminal emulators, from teletype machines through modern GPU-accelerated terminals. Structure with 3-4 headers.*

Fixed so run-to-run drift is small. If you change the prompt, note it in the report — findings
are only comparable across runs of the same prompt.

## Methodology and caveats

- Uses the same underlying `scripts/perf/lib/sample_cpu.sh` and `lib/sample_mem.sh` as the
  other reports in the series. Same math, same cadence.
- PID snapshot at startup — a renderer or utility process spawned mid-run doesn't get counted.
  Emulators with stable process trees (gnome-terminal, kitty windows, Terminology, CRT) are
  fine. Switchboard is fine too for the short scenarios here.
- **Not measured here:** per-emulator startup latency, first-paint time, keyboard-echo
  latency, tearing, subjective "feel." Those want different tooling.
- **Not fair comparisons:**
  - Cool Retro Term's shader effects are the point of that emulator — its higher GPU/CPU cost
    isn't a bug. Compare it to the others knowing that.
  - kitty in windows mode is one legitimate usage pattern, not the only one. See the
    supplementary tabs scenario.
- **GPU sampling** is `nvidia-smi` system-wide (NVIDIA hosts only) — an upper bound that
  includes any other desktop activity. Not per-process. Skipped entirely if `nvidia-smi` isn't
  present.
- **Workload variance:** the `active_claude_inference` prompt produces bounded-but-not-identical
  output run-to-run (model latency, token count jitter). Enough for headline comparisons; not
  precise enough for sub-percent claims. `active_vscode_npm_ci` is bounded by network + disk;
  first run downloads a shallow VS Code clone, subsequent runs use `npm ci` freshly so results
  don't drift as `package-lock.json` moves.
- **Anonymization:** hostname hashed via SHA-256 truncated to 16 hex; hostname_hash lives in
  `host.json` alongside the real name so operators can navigate their own tree, but published
  reports reference only the hash.
