# Switchboard Daemon — Hardware Comparison

Resource-usage measurements of the Switchboard daemon across different host classes
(workstations, servers, SBCs, VMs). Focuses on the daemon in isolation — the client is driven
from a separate workstation and its resource use is not measured here.

Part of a series:

- [switchboard-performance.md](switchboard-performance.md) — combined workstation (Switchboard client + local daemon)
- **This report** — daemon in isolation across host classes
- [terminal-emulator-comparison.md](terminal-emulator-comparison.md) — Switchboard's client cost vs. other terminal emulators

**Status:** scaffold. Findings will be filled in as fleet data lands. See
[Reproducing](#reproducing) below to contribute a run from your own host.

## What this report is for

Switchboard's daemon is meant to be lightweight enough to run on hardware ranging from a
low-end Raspberry Pi up through server-class boxes. This report answers, per host class:

- What's the idle memory floor?
- How does memory and CPU scale with connected session count?
- How much extra cost does an active session (e.g. streaming Claude Fable 5 output) add?
- What's the practical session-count ceiling before the daemon becomes the bottleneck?

The daemon is a pure Node.js process. It manages mTLS-authenticated WebSocket sessions from
Switchboard clients and shuttles PTY I/O between them and the underlying shells. It doesn't
render anything — that's the client's job — so its cost should be dominated by socket I/O and
per-session bookkeeping, not compute.

## Test setup

Two hosts, one operator:

```
┌──────────────────┐               ┌──────────────────────┐
│  Workstation     │──── mTLS ────▶│  Target host         │
│  Switchboard     │  N WSS conns  │  switchboard-daemon  │
│  client          │               │                      │
└──────────────────┘               │  run_daemon_only.sh  │
   drives workload                 │  → sample_cpu.csv    │
                                   │  → sample_mem.csv    │
                                   │  → host.json         │
                                   └──────────────────────┘
```

The workstation's client opens N connections to the target host's daemon and, optionally,
triggers a workload in one session (Claude CLI streaming output, `npm ci`, etc.). The target
host runs `scripts/perf/run_daemon_only.sh`, which samples the daemon's CPU/memory for the
scenario's duration and dumps the results into `perf-runs/<date>/<hostname_hash>/<scenario>/`.

Client side (workload) is not measured by this report — this is a daemon-only view.

## Scenarios covered per host

Each host in the fleet is expected to run the following scenarios so results are comparable:

| Scenario | Client-side setup | Duration |
|---|---|---|
| `0sessions_idle` | No client connected | 60s |
| `1session_idle` | 1 session connected, shell at prompt | 60s |
| `5sessions_idle` | 5 sessions, all at shell prompts | 60s |
| `10sessions_idle` | 10 sessions, all at shell prompts | 60s |
| `15sessions_idle` | 15 sessions, all at shell prompts (or as many as the host supports) | 60s |
| `15sessions_1inference` | 15 sessions; one runs the canonical Claude CLI prompt (see below) | 150s |
| `1session_realwork` | 1 session; runs the "real work" workload (VS Code `npm ci`) | 150s |

The canonical Claude CLI prompt (for repeatability across runs):

> *Write a 500-word article about the history of terminal emulators, from teletype machines through modern GPU-accelerated terminals. Structure with 3–4 headers.*

The "real work" workload:

> `git clone --depth 1 https://github.com/microsoft/vscode` then `cd vscode && npm ci`

For repeatable results, run Claude CLI in an anonymous throwaway session; see
[switchboard-performance.md](switchboard-performance.md) for the recipe.

## Host inventory (populated as data arrives)

| Host class | Hash | CPU | Cores | RAM | Notes |
|---|---|---|---|---|---|
| _(no runs yet)_ | | | | | |

Each row's `hash` links to that host's per-scenario findings. The real hostname is not published —
`host.json` in each run directory carries both, but reports only reference the hash.

## Findings

_To be populated as fleet coverage grows. Findings will be organized by host class (workstation,
server, SBC, VM) and within each class by scenario, following the [Findings pattern in
switchboard-performance.md](switchboard-performance.md#finding-1--daemon-memory-is-independent-of-session-count)._

Anticipated sections once data lands:

- Finding — daemon RSS floor by host class
- Finding — RSS-per-session scaling coefficient
- Finding — CPU cost of an active session vs. an idle one
- Finding — session-count ceiling on low-end hardware (Pi Zero, Pi 3)

## Reproducing

Two modes: **automated** (recommended) via the workstation-side orchestrator, or **manual**
if you want fine-grained control over one scenario.

### Automated — one command per host

The orchestrator opens N sessions from your workstation over mTLS, kicks off the sampler on
the target over SSH, and rsyncs the resulting CSVs back into your local `perf-runs/`. Uses
the shipped workload scripts for target-side execution (Claude CLI is already installed on
every daemon host in the primary use case).

Requirements on the **workstation** (where you run the orchestrator):

- Passwordless SSH to each daemon host (`ssh HOST hostname` should just work).
- Client TLS bundle at `~/.switchboard/tls/`.
- Node.js in `PATH`, with the switchboard repo cloned and `npm install` completed (the
  session driver needs the `ws` package).

Requirements on the **target** (each daemon host):

- Running `switchboard-daemon` (`systemctl --user status switchboard-daemon`).
- `bash`, `awk`, `pgrep`, `getconf`, `hostname`, `sha256sum` — universal on any modern
  Linux distro.
- `claude` CLI in `PATH` for the inference scenario, `git` + `npm` for the realwork
  scenario. Skip those with `--skip 15sessions_1inference,1session_realwork` if a target
  lacks them (or use `--only-idle` for a lean-host pass).

**Full 7-scenario suite against one host:**

```bash
./scripts/perf/orchestrate_daemon_fleet.sh --host pi5.example.lan [--with-sudo]
```

Pushes the perf scripts to `~/.cache/switchboard-perf` on the target, runs each scenario in
sequence, and pulls results back to `perf-runs/<YYYY-MM-DD>/<hostname_hash>/<scenario>/` on
your workstation.

**One scenario directly** (useful when re-running a single failure):

```bash
./scripts/perf/orchestrate_daemon_scenario.sh \
    --host pi5.example.lan \
    --scenario 5sessions_idle \
    --sessions 5 \
    --duration 60
```

### Manual — sampler only

Skip the orchestrator and run just the target-side sampler when you want to drive sessions
from the client UI by hand:

1. From the workstation client, prepare the number of sessions the scenario calls for (open,
   wait for them to connect, but don't fire any workload yet).
2. If the scenario includes a workload, queue it in one session but don't press Enter.
3. SSH to the target host and run:

   ```bash
   cd ~/gits/switchboard   # or wherever the repo lives
   ./scripts/perf/run_daemon_only.sh \
       --scenario <name-from-the-table> \
       --duration <seconds> \
       [--with-sudo]        # pass to capture DIMM info via dmidecode
   ```

4. When the script prints "Starting CPU + memory samplers…", switch to the workstation and fire
   the workload (if any).
5. Wait for the timer. CSVs and `host.json` land in
   `perf-runs/<YYYY-MM-DD>/<hostname_hash>/<scenario>/`.

**Contributing a run:**

- Attach the entire per-scenario directory to a PR or issue. It's safe to share — `host.json`
  contains the real hostname alongside the hash, so redact that field if you don't want it
  published, or delete `host.json` and paste the relevant CPU/board/memory fields into your PR
  description instead.

## Methodology and caveats

- CPU and memory sampling: same math and cadence as
  [switchboard-performance.md](switchboard-performance.md#methodology-and-caveats) — this report
  uses the same underlying `scripts/perf/lib/sample_cpu.sh` and `scripts/perf/lib/sample_mem.sh`.
- PID snapshot at startup: the samplers pick up the daemon PID once. If the daemon is restarted
  during a run (unusual), samples after that point will drop to zero. Restart the scenario.
- Memory columns: `rss_kb`, `vms_kb`, `threads`, `fds` per group per interval. RSS is the
  resident (physical) footprint; VMS is address-space reservation (typically ~1.2 GB for any
  Node process — see the note in the workstation report).
- Workload is driven from a remote client over mTLS; per-session network cost isn't broken out.
  For host classes where network is the bottleneck (very low-end SBCs, high-session-count
  scenarios), that will show up as CPU spent in kernel/syscall time rather than in the daemon's
  user-space code.
- Client resource use is deliberately not measured here. It varies by workstation and is
  covered by the combined-workstation report.
- Anonymization: `hostname_hash` is SHA-256(hostname) truncated to 16 hex chars. It's stable
  across runs on the same host (so a host's history stays linkable) but doesn't reveal the real
  name.
