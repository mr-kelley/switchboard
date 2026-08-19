#!/bin/bash
# Run one terminal-emulator perf scenario on this workstation.
#
# Spawns N shells across the chosen emulator (each in its own window for
# gnome-terminal / kitty / terminology / cool-retro-term; as tabs in a
# single client window for Switchboard, driven manually by the operator).
# One session optionally runs an active workload; the rest sit idle. CPU
# and memory samplers record the emulator's process group for the
# scenario duration.
#
# Windows are the measurement axis for non-Switchboard emulators because
# it's the lowest-common-denominator model that works for all of them
# (Cool Retro Term has no scriptable tab support). See the report for
# the framing rationale:
#   docs/performance/terminal-emulator-comparison.md
#
# Usage:
#   run_emulator_comparison.sh --emulator NAME --scenario NAME --sessions N \
#                              [--workload NAME] [--duration SECONDS] \
#                              [--interval SECONDS] [--with-sudo]
#
# --emulator     switchboard | gnome-terminal | kitty | terminology | cool-retro-term
# --workload     idle_shell (default) | active_claude_inference | active_vscode_npm_ci
# --scenario     Free-form label used as a directory name (e.g. 15sessions_1inference).
#                Must be [a-zA-Z0-9_-]+.
# --sessions N   How many concurrent shells (windows or tabs) to open.
# --duration N   Sampling window in seconds (default 60).
# --interval N   Sampling period in seconds (default 1).
# --with-sudo    Pass through to collect_host_info.sh for DIMM detail.
#
# The active workload (if any) fires in ONE session — the last one spawned.
# Other sessions run idle_shell.sh. If --workload is idle_shell, every
# session is idle.
#
# Output: perf-runs/<YYYY-MM-DD>/<hostname_hash>/emulator-<name>/<scenario>/
#           host.json
#           sample_cpu.csv
#           sample_mem.csv

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
WORKLOAD_DIR="$SCRIPT_DIR/workloads"

EMULATOR=""
SCENARIO=""
SESSIONS=""
WORKLOAD="idle_shell"
DURATION=60
INTERVAL=1
WITH_SUDO=""
OUTPUT_BASE="${PERF_RUNS_DIR:-$PWD/perf-runs}"

usage() {
    cat >&2 <<'EOF'
Usage: run_emulator_comparison.sh --emulator NAME --scenario NAME --sessions N \
                                  [--workload NAME] [--duration SECONDS] \
                                  [--interval SECONDS] [--with-sudo]

Required:
  --emulator NAME    switchboard | gnome-terminal | kitty | terminology | cool-retro-term
  --scenario NAME    Directory label; [a-zA-Z0-9_-]+
  --sessions N       Number of concurrent shells.

Options:
  --workload NAME    idle_shell (default) | active_claude_inference | active_vscode_npm_ci
                     For active workloads, the LAST spawned session runs the workload;
                     the rest run idle_shell.
  --duration N       Sampling window (default: 60).
  --interval N       Sampling period (default: 1).
  --with-sudo        Pass through to collect_host_info.sh for DIMM detail.

Environment:
  PERF_RUNS_DIR      Base directory for output (default: $PWD/perf-runs).
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --emulator)  [ $# -ge 2 ] || usage; EMULATOR="$2"; shift 2 ;;
        --scenario)  [ $# -ge 2 ] || usage; SCENARIO="$2"; shift 2 ;;
        --sessions)  [ $# -ge 2 ] || usage; SESSIONS="$2"; shift 2 ;;
        --workload)  [ $# -ge 2 ] || usage; WORKLOAD="$2"; shift 2 ;;
        --duration)  [ $# -ge 2 ] || usage; DURATION="$2"; shift 2 ;;
        --interval)  [ $# -ge 2 ] || usage; INTERVAL="$2"; shift 2 ;;
        --with-sudo) WITH_SUDO="--with-sudo"; shift ;;
        -h|--help)   usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done

[ -n "$EMULATOR" ] && [ -n "$SCENARIO" ] && [ -n "$SESSIONS" ] || {
    echo "error: --emulator, --scenario, and --sessions are required" >&2
    usage
}
[[ "$SCENARIO" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "error: --scenario must match [a-zA-Z0-9_-]+ (got: $SCENARIO)" >&2; exit 2; }
[[ "$SESSIONS" =~ ^[0-9]+$ ]] && [ "$SESSIONS" -ge 0 ] || { echo "error: --sessions must be a non-negative integer (got: $SESSIONS)" >&2; exit 2; }

WORKLOAD_PATH="$WORKLOAD_DIR/$WORKLOAD.sh"
IDLE_PATH="$WORKLOAD_DIR/idle_shell.sh"
[ -x "$WORKLOAD_PATH" ] || { echo "error: workload script not found or not executable: $WORKLOAD_PATH" >&2; exit 2; }
[ -x "$IDLE_PATH" ] || { echo "error: idle workload script not found: $IDLE_PATH" >&2; exit 2; }

# --- Emulator dispatch ---
# For each emulator we define:
#   - EMULATOR_BIN:      binary name to look up in PATH
#   - EMULATOR_PGREP:    pgrep -f regex matching the emulator's process
#                        group (server + windows), used by samplers
#   - LAUNCH_CMD (fn):   spawns one window running the given workload
#   - CAN_TRACK_PID:     "yes" or "no". "no" means the launcher fork-exits
#                        (gnome-terminal) so we can't kill by PID; the
#                        operator gets a message asking to close windows.

CAN_TRACK_PID="yes"
EMULATOR_BIN=""
EMULATOR_PGREP=""

launch_cmd() {
    local workload="$1"
    case "$EMULATOR" in
        gnome-terminal)
            gnome-terminal --window -- "$workload" &
            ;;
        kitty)
            kitty -e "$workload" &
            ;;
        terminology)
            terminology -e "$workload" &
            ;;
        cool-retro-term)
            cool-retro-term -e "$workload" &
            ;;
        *)
            echo "error: launch_cmd called with unhandled emulator: $EMULATOR" >&2
            return 1
            ;;
    esac
}

case "$EMULATOR" in
    switchboard)
        EMULATOR_BIN=""   # not spawned by us
        EMULATOR_PGREP='mount_Switch.*switchboard|Switchboard.*AppImage'
        ;;
    gnome-terminal)
        EMULATOR_BIN="gnome-terminal"
        EMULATOR_PGREP='gnome-terminal-server'
        CAN_TRACK_PID="no"
        ;;
    kitty)
        EMULATOR_BIN="kitty"
        EMULATOR_PGREP='/kitty$| kitty '
        ;;
    terminology)
        EMULATOR_BIN="terminology"
        EMULATOR_PGREP='terminology'
        ;;
    cool-retro-term)
        EMULATOR_BIN="cool-retro-term"
        EMULATOR_PGREP='cool-retro-term'
        ;;
    *)
        echo "error: --emulator must be one of: switchboard, gnome-terminal, kitty, terminology, cool-retro-term (got: $EMULATOR)" >&2
        exit 2
        ;;
esac

# Verify the binary exists for the emulators we spawn.
if [ -n "$EMULATOR_BIN" ] && ! command -v "$EMULATOR_BIN" >/dev/null 2>&1; then
    echo "error: emulator binary '$EMULATOR_BIN' not found in PATH" >&2
    echo "install it or pick a different --emulator" >&2
    exit 1
fi

# --- Output dir ---
HN_HASH=$(hostname | sha256sum | awk '{print substr($1, 1, 16)}')
DATE_DIR=$(date +%Y-%m-%d)
OUT_DIR="$OUTPUT_BASE/$DATE_DIR/$HN_HASH/emulator-$EMULATOR/$SCENARIO"
mkdir -p "$OUT_DIR"

echo "=== Switchboard emulator-comparison perf run ==="
echo "Emulator:  $EMULATOR"
echo "Scenario:  $SCENARIO"
echo "Sessions:  $SESSIONS"
echo "Workload:  $WORKLOAD (fires in the last session; others are idle_shell)"
echo "Duration:  ${DURATION}s at ${INTERVAL}s intervals"
echo "Output:    $OUT_DIR"
echo ""

# --- Host info ---
echo "-> Capturing host info..."
"$LIB_DIR/collect_host_info.sh" $WITH_SUDO --output "$OUT_DIR/host.json"

# --- Session spawn ---
LAUNCHED_PIDS=()

if [ "$EMULATOR" = "switchboard" ]; then
    cat <<EOF

Manual setup required (Switchboard is measured tabs-in-one-window, its
native session model):

  1. Open Switchboard and connect $SESSIONS sessions.
  2. If --workload is not idle_shell, prepare the following command in
     ONE session but do NOT run it yet:
       $WORKLOAD_PATH
  3. Press ENTER here when the sessions are connected.
  4. When the sampler prints "Starting samplers...", switch to Switchboard
     and run the workload in the prepared session.

EOF
    read -r -p "Press ENTER to continue..." _
elif [ "$SESSIONS" -gt 0 ]; then
    echo "-> Spawning $SESSIONS $EMULATOR window(s)..."
    for i in $(seq 1 "$SESSIONS"); do
        if [ "$i" -eq "$SESSIONS" ] && [ "$WORKLOAD" != "idle_shell" ]; then
            launch_cmd "$WORKLOAD_PATH"
        else
            launch_cmd "$IDLE_PATH"
        fi
        # Capture PID from the most recent background job. For emulators
        # where the launcher fork-exits, this PID dies quickly — recorded
        # for interest but not usable for cleanup.
        LAUNCHED_PIDS+=("$!")
    done
    # Give windows a moment to appear + shells a moment to reach their
    # steady state before we start sampling.
    sleep 3
fi

# --- Samplers (in parallel) ---
echo "-> Starting samplers (${DURATION}s)..."

# For Switchboard we track the whole client tree (matches the workstation
# report). For every other emulator we track just its process group.
if [ "$EMULATOR" = "switchboard" ]; then
    GROUP_ARGS=(--group "client=$EMULATOR_PGREP")
else
    GROUP_ARGS=(--group "emulator=$EMULATOR_PGREP")
fi

"$LIB_DIR/sample_cpu.sh" \
    "${GROUP_ARGS[@]}" \
    --duration "$DURATION" \
    --interval "$INTERVAL" \
    --output "$OUT_DIR/sample_cpu.csv" > "$OUT_DIR/sample_cpu.log" 2>&1 &
CPU_PID=$!

"$LIB_DIR/sample_mem.sh" \
    "${GROUP_ARGS[@]}" \
    --duration "$DURATION" \
    --interval "$INTERVAL" \
    --output "$OUT_DIR/sample_mem.csv" > "$OUT_DIR/sample_mem.log" 2>&1 &
MEM_PID=$!

# --- Cleanup handler ---
cleanup() {
    kill "$CPU_PID" "$MEM_PID" 2>/dev/null || true
    if [ "$EMULATOR" != "switchboard" ] && [ "$CAN_TRACK_PID" = "yes" ]; then
        for pid in "${LAUNCHED_PIDS[@]}"; do
            kill "$pid" 2>/dev/null || true
        done
    fi
    # Belt: even for track-able emulators, `sleep 86400` from idle_shell
    # may have orphaned if the launcher used its own child. Kill any
    # `sleep 86400` sitting under our workload path.
    pkill -f "$IDLE_PATH" 2>/dev/null || true
}
trap 'cleanup; echo "cancelled." >&2; exit 130' INT TERM

wait "$CPU_PID"
wait "$MEM_PID"

echo ""
echo "=== Run complete ==="
echo "  host.json      $(wc -c < "$OUT_DIR/host.json") bytes"
echo "  sample_cpu.csv $(wc -l < "$OUT_DIR/sample_cpu.csv") rows"
echo "  sample_mem.csv $(wc -l < "$OUT_DIR/sample_mem.csv") rows"
echo ""

# --- Post-run cleanup ---
if [ "$EMULATOR" = "switchboard" ]; then
    echo "Switchboard sessions were opened manually — close them from the client when ready."
elif [ "$CAN_TRACK_PID" = "no" ]; then
    echo "Note: $EMULATOR launcher fork-exits, so this script cannot kill its windows by PID."
    echo "Closing shells by killing any lingering $(basename "$IDLE_PATH") / $(basename "$WORKLOAD_PATH") processes..."
    pkill -f "$IDLE_PATH" 2>/dev/null || true
    pkill -f "$WORKLOAD_PATH" 2>/dev/null || true
    echo "If any windows remain, close them manually."
else
    echo "-> Closing $SESSIONS spawned $EMULATOR window(s)..."
    for pid in "${LAUNCHED_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    pkill -f "$IDLE_PATH" 2>/dev/null || true
fi

echo ""
echo "Files in $OUT_DIR:"
ls -la "$OUT_DIR"
