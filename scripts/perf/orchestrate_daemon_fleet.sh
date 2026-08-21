#!/bin/bash
# Run the full daemon-only scenario suite (7 scenarios) against one target
# host. One command per host in the fleet.
#
# Scenarios (matches docs/performance/daemon-hardware-comparison.md):
#   0sessions_idle          — no sessions; daemon baseline
#   1session_idle           — 1 idle session
#   5sessions_idle          — 5 idle sessions
#   10sessions_idle         — 10 idle sessions
#   15sessions_idle         — 15 idle sessions
#   15sessions_1inference   — 15 sessions; one runs canonical Claude prompt
#   1session_realwork       — 1 session; runs VS Code npm ci workload
#
# The two workload scenarios invoke the shipped workload scripts on the
# target (bundled and shipped over by orchestrate_daemon_scenario.sh):
#   scripts/perf/workloads/active_claude_inference.sh — needs `claude` on target
#   scripts/perf/workloads/active_vscode_npm_ci.sh    — needs `git` + `npm`
#
# On lean hosts, use --skip realwork (or --only-idle) to skip scenarios
# whose target-side tools you don't have.
#
# Usage:
#   orchestrate_daemon_fleet.sh --host HOST [--port 3717] [--with-sudo]
#                               [--skip SCENARIO[,SCENARIO...]]
#                               [--only-idle]
#                               [--sessions-max N]
#
# Env:
#   PERF_INFERENCE_DURATION   (default 150) — seconds for the inference scenario
#   PERF_REALWORK_DURATION    (default 240) — seconds for the realwork scenario
#   PERF_IDLE_DURATION        (default 60)  — seconds for idle scenarios

set -euo pipefail

HOST=""
PORT=3717
TARGET_USER=""
WITH_SUDO=""
SKIP=""
ONLY_IDLE=0
SESSIONS_MAX=15

IDLE_DUR="${PERF_IDLE_DURATION:-60}"
INFER_DUR="${PERF_INFERENCE_DURATION:-150}"
WORK_DUR="${PERF_REALWORK_DURATION:-240}"

usage() {
    cat >&2 <<'EOF'
Usage: orchestrate_daemon_fleet.sh --host HOST [--port 3717] [--user USER]
                                   [--with-sudo] [--skip NAME[,NAME...]]
                                   [--only-idle] [--sessions-max N]

Runs all 7 daemon-only scenarios against one target host. Sessions are
opened from this workstation over mTLS; the target only runs the sampler.
Results rsync back into ./perf-runs/.

--user USER: SSH in as USER (defaults to current user). Set this to the
account the daemon runs as — otherwise cross-user /proc reads silently
return zero for the daemon FDs (Linux mode-0700 fd dir).
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --user) TARGET_USER="$2"; shift 2 ;;
        --with-sudo) WITH_SUDO="--with-sudo"; shift ;;
        --skip) SKIP="$2"; shift 2 ;;
        --only-idle) ONLY_IDLE=1; shift ;;
        --sessions-max) SESSIONS_MAX="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done
[ -n "$HOST" ] || { echo "error: --host required" >&2; usage; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Scenario table: name|sessions|duration|workload_ref
# workload_ref is empty (idle) or a script path shipped to the target's scratch.
declare -a SCENARIOS=(
    "0sessions_idle|0|$IDLE_DUR|"
    "1session_idle|1|$IDLE_DUR|"
    "5sessions_idle|5|$IDLE_DUR|"
    "10sessions_idle|10|$IDLE_DUR|"
    "15sessions_idle|15|$IDLE_DUR|"
    "15sessions_1inference|15|$INFER_DUR|bash scripts/perf/workloads/active_claude_inference.sh"
    "1session_realwork|1|$WORK_DUR|bash scripts/perf/workloads/active_vscode_npm_ci.sh"
)

should_skip() {
    local name="$1"
    if [ "$ONLY_IDLE" = "1" ] && [[ "$name" != *"_idle" ]]; then return 0; fi
    if [ -z "$SKIP" ]; then return 1; fi
    IFS=',' read -ra SKIPS <<< "$SKIP"
    for s in "${SKIPS[@]}"; do
        [ "$s" = "$name" ] && return 0
    done
    return 1
}

echo "=== fleet run on $HOST ==="
echo "Sessions cap:       $SESSIONS_MAX"
echo "Idle duration:      ${IDLE_DUR}s"
echo "Inference duration: ${INFER_DUR}s"
echo "Realwork duration:  ${WORK_DUR}s"
echo "Skip:               ${SKIP:-<none>}${ONLY_IDLE:+ (plus --only-idle)}"
echo ""

TOTAL_START=$(date +%s)

for entry in "${SCENARIOS[@]}"; do
    IFS='|' read -r name sessions duration workload <<< "$entry"

    if [ "$sessions" -gt "$SESSIONS_MAX" ]; then
        echo "-> skipping $name: needs $sessions sessions, cap is $SESSIONS_MAX"
        continue
    fi
    if should_skip "$name"; then
        echo "-> skipping $name (per --skip / --only-idle)"
        continue
    fi

    echo ""
    echo "############################################"
    echo "# $name"
    echo "############################################"

    ARGS=(--host "$HOST" --port "$PORT" --scenario "$name" --sessions "$sessions" --duration "$duration")
    [ -n "$TARGET_USER" ] && ARGS+=(--user "$TARGET_USER")
    [ -n "$WITH_SUDO" ] && ARGS+=("$WITH_SUDO")
    [ -n "$workload" ] && ARGS+=(--workload "$workload")

    if ! "$SCRIPT_DIR/orchestrate_daemon_scenario.sh" "${ARGS[@]}"; then
        echo ""
        echo "!!! $name failed — continuing to next scenario"
    fi
done

TOTAL_ELAPSED=$(( $(date +%s) - TOTAL_START ))
echo ""
echo "=== fleet run complete on $HOST — ${TOTAL_ELAPSED}s total ==="
