# Switchboard Performance Profile

Resource-usage measurements of Switchboard (Electron client + Node.js daemon) taken on a live
workstation, covering idle baseline, session-count scaling, and an active AI streaming workload.

Part of a series:

- **This report** — combined workstation (client + local daemon on the same host)
- [daemon-hardware-comparison.md](daemon-hardware-comparison.md) — daemon in isolation across
  host classes (workstations, servers, SBCs, VMs)

**TL;DR:** Switchboard's host footprint is small and stable. The daemon costs effectively nothing
(< 2% of one core even under load, ~130 MB RAM regardless of session count). The client's cost is
concentrated in UI rendering during output streaming — averaging ~14% of a single core with brief
peaks near 36%, about 0.6% of total CPU on the 24-core test machine. Memory is flat under load
with no signs of leaks.

## Test environment

| | |
|---|---|
| Switchboard version | 0.5.0-rc.14 (AppImage) |
| OS / kernel | Linux 7.0.0-28-generic |
| CPU | 24 logical cores |
| RAM | 32 GB |
| GPU | NVIDIA (graphics/compositing only — no local inference) |
| Test date | 2026-08-18 |

The AI model used for the workload test (Claude Fable 5) runs on a remote API service; the local
daemon only manages sessions and shuttles terminal I/O.

## Process footprint at rest

Single point-in-time snapshot of the full process tree with 15 sessions open, all idle:

| Process | RSS | Role |
|---|---:|---|
| `switchboard-daemon` (node) | ~134 MB | Session management, PTY/terminal I/O |
| Electron renderer | ~567 MB | Main UI |
| Electron GPU process | ~230 MB | Compositing |
| Electron main | ~170 MB | App shell |
| Network service + zygotes + wrapper | ~170 MB | Chromium plumbing |
| **Total** | **~1.2–1.3 GB** | |

## Finding 1 — Daemon memory is independent of session count

Daemon RSS/VMS sampled at 1 s intervals for ~30 s at each session count, all sessions idle. The
15-session row is 10 sessions against the local daemon plus 5 against daemons on other hosts;
remote daemons' resource usage is not counted here. All other rows are entirely local:

| Sessions | RSS | VMS |
|---:|---:|---:|
| 1 | 161–172 MB | 1218–1229 MB |
| 5 | 160–162 MB | 1217 MB |
| 10 | 161–162 MB | 1259 MB |
| 15 (10 local + 5 remote) | 162 MB | 1259 MB |

Going from 1 to 15 sessions moved virtual memory by roughly **40 MB total** and physical memory
not at all. Idle CPU and GPU were ~0% at every session count.

VMS on a Node process reflects V8's reserved address space, not resident memory — the ~1.2 GB
figure is normal and shared with every Node process on the host.

The at-rest snapshot table above shows the daemon at ~134 MB while this idle sampling table shows
~162 MB at the same session count; both are steady-state idle. The gap is single-snapshot vs.
30 s-windowed sampling — the daemon's RSS fluctuates within a ~30–40 MB band even when idle
(see also Finding 3).

## Finding 2 — Under an active AI workload, the daemon stays near zero; the client cost is rendering

Real-time CPU was measured per interval from `/proc/<pid>/stat` jiffy deltas (1 s samples,
134 samples) while a Claude Fable 5 prompt streamed output in one session, with 15 sessions open.
Percentages are of a **single core**:

| Component | Average | Peak |
|---|---:|---:|
| Daemon | 0.1% | 1.8% |
| Client (Electron tree) | 13.7% | 35.7% |
| **Combined** | **13.8%** | **35.7%** |

- Only 5 of 134 samples exceeded 30% of a core; none exceeded 50%.
- On the 24-core test machine, the combined average is **~0.6% of total CPU**.
- The client's usage tracks output streaming: the renderer and Chromium GPU process repaint as
  tokens arrive. The daemon is I/O-bound (network wait), not compute-bound.
- The combined peak (35.7%) equals the client peak, not the sum of the two peaks — the daemon's
  1.8% peak did not co-occur with the client's peak sample.

## Finding 3 — Memory is flat under load

Over a ~2-minute streaming workload, daemon RSS moved **+9 MB net** with a total observed
fluctuation of ~46 MB, returning to baseline afterward. No unbounded growth was observed in any
test.

## Finding 4 — GPU load is modest and spiky

GPU utilization during streaming averaged **~12%**, with brief spikes to ~50% during heavy
repaints, and idled at 0% between them. Numbers are system-wide via `nvidia-smi` — Switchboard's
share is an upper bound that includes any other GPU activity on the desktop at the time.

## Methodology and caveats

- Real-time CPU was computed from `/proc/<pid>/stat` utime+stime deltas divided by measured
  wall-clock time — the same math `top` uses. Lifetime-average tools (`ps aux %CPU`,
  argument-less `pidstat`) were avoided after they proved misleading for long-running daemons.
- Daemon and client were identified by command line (`switchboard-daemon` vs. the AppImage
  Electron tree) so unrelated processes matching "switchboard" by name were excluded from totals.
- The monitor script snapshots the daemon and client PID lists once at startup. If a renderer,
  utility, or session helper is spawned mid-run, its CPU won't be counted. For the ~2 min
  streaming workload used here the process set was stable, but longer runs or workloads that
  churn sessions should refresh the PID list.
- GPU utilization was measured system-wide via `nvidia-smi`, so those figures are an upper bound
  that includes other desktop activity.
- The 15-session tests ran 10 sessions against the local daemon and 5 against daemons on other
  hosts; remote daemons' resource usage was not measured here.
- No baseline was measured against a bare terminal emulator (e.g. `gnome-terminal`, `kitty`)
  streaming a comparable token rate. The "~14% of one core during streaming" figure therefore
  stands in isolation — the renderer cost is what a Chromium-based UI pays to repaint at that
  rate, but we don't yet have a same-workload comparison against a non-Electron baseline.
  Follow-up work.
- Single machine, single run per scenario, release-candidate build (0.5.0-rc.14) — figures are
  indicative, not benchmarks.

## Reproducing

The measurement driver (`scripts/perf/run_workstation_combined.sh`) captures host info once,
then samples daemon-and-client CPU and memory in parallel for the run duration. Output is
filed automatically under `perf-runs/<YYYY-MM-DD>/<hostname_hash>/workstation-combined/<scenario>/`
alongside `host.json`, `sample_cpu.csv`, `sample_mem.csv`, and per-sampler logs. This matches
the layout used by the daemon-only and emulator-comparison drivers so all runs across the
series file the same way.

**Requirements**

- Linux with `/proc/<pid>/stat` (any modern distro).
- `bash`, `awk`, `pgrep`, `getconf` — all part of a default install.
- Switchboard running from the AppImage (the client PID matcher looks for the AppImage mount).

**Steps**

1. Launch Switchboard and open the number of sessions you want to measure. Wait for them to be
   fully connected and idle.
2. If you're measuring a workload, arrange to trigger it in one session (e.g. queue a prompt in
   an AI-shell session) but don't fire it yet.
3. From the repo checkout, start the driver with a scenario label matching what you're
   running. Output tree is created under `perf-runs/` by default (`PERF_RUNS_DIR=/some/path`
   env var overrides).

   ```bash
   ./scripts/perf/run_workstation_combined.sh --scenario 15sessions_idle --duration 60
   # active-workload example (see step 2 for the anonymous-Claude recipe):
   ./scripts/perf/run_workstation_combined.sh --scenario 15sessions_1inference --duration 150
   # add --with-sudo to capture DIMM detail in host.json
   ```

   Scenario names must be `[a-zA-Z0-9_-]+`; they become directory names. Recommended
   convention: `<N>sessions_<K>inference` (e.g. `15sessions_5inference`) or
   `<N>sessions_idle`. See [Scenarios](#scenarios) below for the canonical set.

4. Fire the workload (if any) within the first few seconds of the run, so the whole streaming
   window falls inside the sample.
5. The output directory is printed on completion. It contains:
   - `host.json` — CPU / board / memory / storage / GPU / OS / virt / Node version snapshot,
     captured once at run start
   - `sample_cpu.csv` — `timestamp, daemon_cpu_percent, client_cpu_percent, total_cpu_percent`
     per interval (percent of one core; can exceed 100 for multi-threaded groups)
   - `sample_mem.csv` — `timestamp, daemon_rss_kb, daemon_vms_kb, daemon_threads, daemon_fds,
     client_rss_kb, client_vms_kb, client_threads, client_fds` per interval
   - `sample_cpu.log` / `sample_mem.log` — sampler stderr, useful if either sampler misbehaves

### Scenarios

Canonical scenarios for the workstation-combined test. Runs with these names file into
consistent directories across operators and produce comparable numbers.

| Scenario | Sessions | Active inferences | Duration | Purpose |
|---|---:|---:|---:|---|
| `0sessions_idle` | 0 | 0 | 30s | Client-alone floor |
| `1session_idle` | 1 | 0 | 60s | Single-session baseline |
| `5sessions_idle` | 5 | 0 | 60s | Session-count scaling |
| `10sessions_idle` | 10 | 0 | 60s | Session-count scaling |
| `15sessions_idle` | 15 | 0 | 60s | Session-count scaling |
| `15sessions_1inference` | 15 | 1 | 150s | Single active inference (Finding 2 replication) |
| `15sessions_5inference` | 15 | 5 | 180s | Ceiling sweep — 5 parallel inferences |
| `15sessions_10inference` | 15 | 10 | 240s | Ceiling sweep — 10 parallel inferences |
| `15sessions_15inference` | 15 | 15 | 300s | Ceiling sweep — every session firing |
| `1session_realwork` | 1 | — (`npm ci` in one session) | 150s | Non-AI real-work workload |

Extend the sweep past 15 sessions if your hardware and the ceiling signals below permit — the
scenario name `<N>sessions_<K>inference` is open-ended.

**Parallel-inference ceiling sweep — operator flow**

For `Nsessions_Kinference` with K > 1: in each of K different Switchboard sessions, prepare the
anonymous-Claude recipe from step 2 pasted in but NOT fired. When `run_workstation_combined.sh`
prints "Starting CPU + memory samplers...", switch to Switchboard and fire the K prompts
within a few seconds of each other. Human-triggered sync jitter (~2–3s across K terminals)
is small relative to the sampling window.

**Ceiling signals**

The sweep is considered "at ceiling" when any of the following holds for ≥10 s of sustained
sampling:

- **Client saturation:** `client_cpu_percent` divided by (available logical cores × 100)
  is > 50%. On a 24-core box that's a sustained 1200% (i.e. 12 cores worth).
- **Daemon saturation:** same threshold applied to `daemon_cpu_percent`. Very unlikely — the
  daemon is I/O-bound — but worth watching.
- **Per-inference wall-time regression:** any single K > 1 inference takes > 2× the wall time
  observed for the same prompt at K = 1. Signals either local (renderer scheduling) or remote
  (API backend rate-limit) contention.
- **Hard failure:** OOM, dropped daemon connection, or any prompt erroring out.

These thresholds are guidelines; adjust per host and note the choice alongside your findings.

**Important caveat — PIDs are snapshotted at startup**

The script matches daemon and client processes with `pgrep` once, before the sampling loop
begins. If Switchboard spawns a new renderer, utility process, or session helper during the run,
its CPU won't be counted, and totals will under-report. In practice, over a ~2 min run with an
already-warm client the process set is stable, but for longer runs or workloads that open and
close sessions, either restart the monitor when the process set changes or extend the script to
refresh the PID list each interval.

**Other things to know**

- The historical Findings 1 and 3 numbers came from a `ps` snapshot loop run in parallel with
  a CPU-only monitor — the current driver captures RSS/VMS/threads/FDs inline via
  `sample_mem.sh`, so `sample_mem.csv` is the direct source for those columns in any new run.
- GPU numbers came from `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits`
  sampled at 1 s intervals; those are system-wide, not per-process. Not yet integrated into
  the driver — if you want GPU alongside CPU/mem, run `nvidia-smi` in a parallel `while` loop
  writing to `<output-dir>/gpu.csv`.
- The `perf-runs/` tree is gitignored so real hostnames in `host.json` never reach the repo.
  Contributors publish findings by pasting sanitized numbers into the report; the raw tree
  stays on the operator's disk.
