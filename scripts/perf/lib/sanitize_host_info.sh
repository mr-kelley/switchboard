#!/bin/bash
# Emit a shareable copy of a host.json with the raw `hostname` field
# stripped. `hostname_hash` and every other field pass through.
#
# collect_host_info.sh records both `hostname` (raw) and `hostname_hash`
# (SHA-256 truncated to 16 hex) in the JSON. The raw hostname is there
# for local convenience — reviewing an old run and matching a hash to a
# machine you actually recognize. Before attaching a host.json to a PR,
# issue, or paste, run this to produce a version safe to share.
#
# The operation is idempotent — running it on already-sanitized input
# is a no-op.
#
# Usage:
#   sanitize_host_info.sh <input>                    # stripped JSON to stdout
#   sanitize_host_info.sh <input> --output <file>    # write to file
#   cat host.json | sanitize_host_info.sh            # stdin
#
# Uses jq when available (robust across future JSON shape changes) and
# falls back to a grep filter matched to the current emitter format
# (see scripts/perf/lib/collect_host_info.sh — 2-space indent, one
# field per line, `hostname` never the last field before the closing
# brace so removing it won't leave a trailing comma).

set -euo pipefail

INPUT=""
OUTPUT_FILE=""

usage() {
    cat >&2 <<'EOF'
Usage: sanitize_host_info.sh [INPUT] [--output FILE]

Strips the raw `hostname` field from a host.json produced by
collect_host_info.sh, preserving everything else. INPUT defaults to
stdin. Output goes to stdout unless --output is passed.
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --output) [ $# -ge 2 ] || usage; OUTPUT_FILE="$2"; shift 2 ;;
        -h|--help) usage ;;
        -*) echo "error: unknown flag: $1" >&2; usage ;;
        *) [ -z "$INPUT" ] || { echo "error: multiple inputs given" >&2; usage; }
           INPUT="$1"; shift ;;
    esac
done

if [ -z "$INPUT" ]; then
    SRC=$(mktemp)
    trap 'rm -f "$SRC"' EXIT
    cat > "$SRC"
elif [ ! -r "$INPUT" ]; then
    echo "error: cannot read input: $INPUT" >&2
    exit 1
else
    SRC="$INPUT"
fi

if command -v jq >/dev/null 2>&1; then
    STRIPPED=$(jq 'del(.hostname)' < "$SRC")
else
    # Fallback matched to collect_host_info.sh's emitter format.
    STRIPPED=$(grep -v '^  "hostname":' < "$SRC")
fi

if [ -n "$OUTPUT_FILE" ]; then
    printf '%s\n' "$STRIPPED" > "$OUTPUT_FILE"
    echo "Wrote sanitized host info to $OUTPUT_FILE" >&2
else
    printf '%s\n' "$STRIPPED"
fi
