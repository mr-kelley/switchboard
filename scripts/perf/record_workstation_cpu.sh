#!/bin/bash
# Sample daemon vs. client CPU on a Switchboard workstation (client + local
# daemon). Thin driver over lib/sample_cpu.sh — kept as a one-command entry
# point so the combined-workstation report is reproducible without long
# invocations. See docs/performance/switchboard-performance.md.
#
# Usage: record_workstation_cpu.sh [duration_seconds] [interval_seconds]
# e.g. 150 seconds at 1 s resolution during an active streaming workload:
#   ./record_workstation_cpu.sh 150 1

DURATION="${1:-60}"
INTERVAL="${2:-1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/lib/sample_cpu.sh" \
    --group daemon='switchboard-daemon' \
    --group client='mount_Switch.*switchboard|Switchboard.*AppImage' \
    --duration "$DURATION" \
    --interval "$INTERVAL"
