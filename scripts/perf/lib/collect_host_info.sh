#!/bin/bash
# Collect host information for a perf run and emit it as JSON.
#
# Best-effort across x86 hosts (with and without dmidecode), Raspberry Pi
# boards, and VMs. Fields that can't be captured come out as null with a
# note appended to the "notes" array — the script never fails, it just
# emits what it could observe.
#
# Anonymization: every emitted record carries `hostname` (real) AND
# `hostname_hash` (SHA-256 truncated to 16 hex). Reports that get published
# should reference the hash; the real hostname stays local to the operator.
#
# Sudo policy: fields requiring root access (dmidecode-based DIMM info) are
# collected only when --with-sudo is passed. Otherwise the script skips them
# with a note — no surprise password prompts during a timed run.
#
# Usage:
#   collect_host_info.sh [--with-sudo] [--output FILE]
#   collect_host_info.sh > host.json

set -euo pipefail

WITH_SUDO=0
OUTPUT_FILE=""

usage() {
    cat >&2 <<'EOF'
Usage: collect_host_info.sh [--with-sudo] [--output FILE]

Options:
  --with-sudo    Attempt dmidecode -t memory for DIMM type/speed (requires sudo password).
  --output FILE  Write JSON to FILE instead of stdout.
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --with-sudo) WITH_SUDO=1; shift ;;
        --output) [ $# -ge 2 ] || usage; OUTPUT_FILE="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done

NOTES=()
add_note() { NOTES+=("$1"); }

# Minimal JSON string escape: backslash, double-quote, newline, tab.
# Truncates at 500 chars to keep pathological values from bloating the file.
json_escape() {
    printf '%s' "$1" \
        | LC_ALL=C sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g' \
        | tr -d '\r\n' \
        | head -c 500
}

# Emit "field": "value" or "field": null. Handles unset/empty values.
json_str_field() {
    local key="$1" val="$2"
    if [ -z "$val" ]; then
        printf '    "%s": null' "$key"
    else
        printf '    "%s": "%s"' "$key" "$(json_escape "$val")"
    fi
}

# Emit "field": number or "field": null.
json_num_field() {
    local key="$1" val="$2"
    if [ -z "$val" ] || ! [[ "$val" =~ ^-?[0-9]+$ ]]; then
        printf '    "%s": null' "$key"
    else
        printf '    "%s": %s' "$key" "$val"
    fi
}

# Read a /sys/class/dmi/id/* file, return empty on failure. Some DMI fields
# are placeholders like "To Be Filled By O.E.M." or "None" — treat those as
# missing too so reports don't propagate garbage.
sysfs_dmi() {
    local field="$1"
    local val=""
    [ -r "/sys/class/dmi/id/$field" ] && val=$(cat "/sys/class/dmi/id/$field" 2>/dev/null || true)
    case "$val" in
        ""|"To Be Filled By O.E.M."|"To be filled by O.E.M."|"None"|"Default string"|"Not Specified") echo "" ;;
        *) echo "$val" ;;
    esac
}

# --- Hostname + hash ---
HN=$(hostname 2>/dev/null || echo "unknown")
HN_HASH=$(printf '%s' "$HN" | sha256sum 2>/dev/null | awk '{print substr($1, 1, 16)}')

CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- OS ---
OS_DISTRO=""
OS_KERNEL="$(uname -sr 2>/dev/null || echo "")"
OS_ARCH="$(uname -m 2>/dev/null || echo "")"
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    OS_DISTRO=$(. /etc/os-release; echo "${PRETTY_NAME:-${NAME:-}}")
fi

# --- Virt detection ---
VIRT_TYPE="none"
IS_CONTAINER="false"
if command -v systemd-detect-virt >/dev/null 2>&1; then
    # systemd-detect-virt exits 1 AND prints "none" when no virt is detected,
    # so the old `cmd || echo none` pattern captured both outputs and produced
    # "none\nnone" → JSON escape stripped the newline → "nonenone". Check exit
    # status separately from output to avoid the concat.
    if VIRT_OUT=$(systemd-detect-virt 2>/dev/null) && [ -n "$VIRT_OUT" ]; then
        VIRT_TYPE="$VIRT_OUT"
    else
        VIRT_TYPE="none"
    fi
    if systemd-detect-virt --container >/dev/null 2>&1; then
        IS_CONTAINER="true"
    fi
else
    add_note "systemd-detect-virt unavailable; virt fields best-effort"
fi

# --- CPU ---
CPU_MODEL=""
CPU_VENDOR=""
CPU_CORES_PHYS=""
CPU_CORES_LOG=""
CPU_MAX_FREQ_MHZ=""
CPU_L3_KB=""

if command -v lscpu >/dev/null 2>&1; then
    LSCPU=$(LC_ALL=C lscpu 2>/dev/null || true)
    CPU_MODEL=$(echo "$LSCPU" | awk -F':[ \t]+' '/^Model name/ {print $2; exit}')
    CPU_VENDOR=$(echo "$LSCPU" | awk -F':[ \t]+' '/^Vendor ID/ {print $2; exit}')
    CPU_CORES_LOG=$(echo "$LSCPU" | awk -F':[ \t]+' '/^CPU\(s\)/ {print $2; exit}')
    # Sockets * Cores per socket = physical cores
    sockets=$(echo "$LSCPU" | awk -F':[ \t]+' '/^Socket\(s\)/ {print $2; exit}')
    cps=$(echo "$LSCPU" | awk -F':[ \t]+' '/^Core\(s\) per socket/ {print $2; exit}')
    if [ -n "$sockets" ] && [ -n "$cps" ]; then
        CPU_CORES_PHYS=$(( sockets * cps ))
    fi
    # Max frequency: lscpu reports MHz like "3800.0000"; round to int.
    freq_raw=$(echo "$LSCPU" | awk -F':[ \t]+' '/^CPU max MHz/ {print $2; exit}')
    if [ -n "$freq_raw" ]; then
        CPU_MAX_FREQ_MHZ=$(printf '%.0f' "$freq_raw" 2>/dev/null || echo "")
    fi
    l3_raw=$(echo "$LSCPU" | awk -F':[ \t]+' '/^L3 cache/ {print $2; exit}')
    if [ -n "$l3_raw" ]; then
        # e.g. "32 MiB (1 instance)" or "16384 KiB"
        val=$(echo "$l3_raw" | awk '{print $1}')
        unit=$(echo "$l3_raw" | awk '{print $2}')
        case "$unit" in
            MiB|MB) CPU_L3_KB=$(( val * 1024 )) ;;
            KiB|KB|kB) CPU_L3_KB=$val ;;
        esac
    fi
else
    add_note "lscpu unavailable; CPU fields via /proc/cpuinfo fallback"
    CPU_MODEL=$(grep -m1 '^model name' /proc/cpuinfo 2>/dev/null | awk -F': ' '{print $2}')
    CPU_CORES_LOG=$(grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "")
fi

# Pi boards report CPU model differently and have a distinct Revision line;
# capture the Pi model when present.
PI_MODEL=""
if [ -r /proc/device-tree/model ]; then
    # /proc/device-tree/model has a trailing NUL byte; strip it.
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo "")
fi

# --- Memory total (always) ---
MEM_TOTAL_KB=""
if [ -r /proc/meminfo ]; then
    MEM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo "")
fi

# --- Memory DIMMs (sudo dmidecode) ---
DIMMS_JSON="null"
if [ "$WITH_SUDO" = "1" ]; then
    if command -v dmidecode >/dev/null 2>&1; then
        # Try sudo -n first (fail if password prompt would be needed) to avoid stalling a timed run.
        DMI_OUT=$(sudo -n dmidecode -t memory 2>/dev/null || true)
        if [ -z "$DMI_OUT" ]; then
            add_note "dmidecode -t memory returned empty (sudo -n may have required a password, or the host has no populated DMI memory entries)"
        else
            # Parse "Memory Device" blocks. Each block has Size, Type, Speed, Manufacturer.
            # Skip "No Module Installed" slots.
            DIMMS_JSON=$(echo "$DMI_OUT" | awk '
                BEGIN { RS=""; ORS=""; first=1 }
                /Memory Device/ && !/No Module Installed/ {
                    size=""; type=""; speed=""; mfr=""
                    n=split($0, lines, "\n")
                    for (i=1; i<=n; i++) {
                        line=lines[i]
                        gsub(/^[ \t]+/, "", line)
                        if (line ~ /^Size:/ && line !~ /No Module Installed/) { sub(/^Size:[ \t]*/, "", line); size=line }
                        else if (line ~ /^Type:/ && line !~ /^Type Detail/) { sub(/^Type:[ \t]*/, "", line); type=line }
                        else if (line ~ /^Speed:/) { sub(/^Speed:[ \t]*/, "", line); speed=line }
                        else if (line ~ /^Manufacturer:/) { sub(/^Manufacturer:[ \t]*/, "", line); mfr=line }
                    }
                    if (size == "" || size == "No Module Installed") next
                    if (!first) print ","; first=0
                    printf "{\"size\":\"%s\",\"type\":\"%s\",\"speed\":\"%s\",\"manufacturer\":\"%s\"}", size, type, speed, mfr
                }
                END { if (first) print "" }
            ')
            if [ -n "$DIMMS_JSON" ]; then
                DIMMS_JSON="[$DIMMS_JSON]"
            else
                DIMMS_JSON="null"
                add_note "dmidecode -t memory produced no populated slots"
            fi
        fi
    else
        add_note "dmidecode not installed; memory DIMM detail skipped"
    fi
else
    add_note "memory DIMM detail skipped (--with-sudo not provided)"
fi

# --- Storage ---
STORAGE_JSON="null"
if command -v lsblk >/dev/null 2>&1; then
    # -d: whole disks only, -n: no header, -b: bytes, -o: fields
    LSBLK_OUT=$(lsblk -dnb -o NAME,TYPE,MODEL,SIZE,ROTA 2>/dev/null | awk '$2 == "disk"' || true)
    if [ -n "$LSBLK_OUT" ]; then
        STORAGE_JSON=$(echo "$LSBLK_OUT" | awk '
            BEGIN { ORS=""; first=1 }
            {
                name=$1; type=$2
                # size in bytes is $NF-1, rota is $NF. Model can contain spaces.
                rota=$NF; size=$(NF-1)
                model=""
                for (i=3; i<=NF-2; i++) { if (i>3) model=model " "; model=model $i }
                gsub(/\\/, "\\\\", model); gsub(/"/, "\\\"", model)
                size_gb = size / (1024 * 1024 * 1024)
                kind = (rota == "1") ? "hdd" : "ssd"
                if (!first) print ","; first=0
                printf "{\"name\":\"%s\",\"model\":\"%s\",\"size_gb\":%.1f,\"type\":\"%s\"}", name, model, size_gb, kind
            }
        ')
        [ -n "$STORAGE_JSON" ] && STORAGE_JSON="[$STORAGE_JSON]" || STORAGE_JSON="null"
    fi
else
    add_note "lsblk unavailable; storage list not captured"
fi

# --- GPU ---
GPU_JSON="null"
if command -v nvidia-smi >/dev/null 2>&1; then
    NV_OUT=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || true)
    if [ -n "$NV_OUT" ]; then
        GPU_JSON=$(echo "$NV_OUT" | awk '
            BEGIN { ORS=""; first=1 }
            NF {
                gsub(/^[ \t]+|[ \t]+$/, "")
                model=$0
                gsub(/\\/, "\\\\", model); gsub(/"/, "\\\"", model)
                if (!first) print ","; first=0
                printf "{\"vendor\":\"NVIDIA\",\"model\":\"%s\",\"source\":\"nvidia-smi\"}", model
            }
        ')
        [ -n "$GPU_JSON" ] && GPU_JSON="[$GPU_JSON]" || GPU_JSON="null"
    fi
fi
if [ "$GPU_JSON" = "null" ] && command -v lspci >/dev/null 2>&1; then
    # Generic fallback: VGA-compatible or 3D controller entries.
    LSPCI_OUT=$(lspci 2>/dev/null | grep -E 'VGA compatible|3D controller' || true)
    if [ -n "$LSPCI_OUT" ]; then
        GPU_JSON=$(echo "$LSPCI_OUT" | awk -F': ' '
            BEGIN { ORS=""; first=1 }
            {
                model=$2
                # Vendor extraction: walk tokens until we hit a corporate
                # suffix (Corporation, Corp, Inc, Ltd, GmbH — the standard
                # vendor-DB terminators in pciutils output) or run out of
                # room. Handles single-word ("NVIDIA Corporation"),
                # comma-embedded ("Red Hat, Inc."), and long-form
                # ("Advanced Micro Devices, Inc.") vendors.
                n=split(model, w, " ")
                vendor=""
                for (i=1; i<=n; i++) {
                    vendor = (i==1) ? w[i] : vendor " " w[i]
                    if (w[i] ~ /^(Corporation|Corp\.?,?|Inc\.?,?|Ltd\.?,?|GmbH,?)$/) break
                    if (i >= 5) break
                }
                gsub(/\\/, "\\\\", model); gsub(/"/, "\\\"", model)
                gsub(/\\/, "\\\\", vendor); gsub(/"/, "\\\"", vendor)
                if (!first) print ","; first=0
                printf "{\"vendor\":\"%s\",\"model\":\"%s\",\"source\":\"lspci\"}", vendor, model
            }
        ')
        [ -n "$GPU_JSON" ] && GPU_JSON="[$GPU_JSON]" || GPU_JSON="null"
    fi
fi

# --- Board (motherboard) ---
BOARD_VENDOR=""
BOARD_PRODUCT=""
BOARD_VERSION=""
BOARD_BIOS_VERSION=""
BOARD_SOURCE="sysfs"

if [ -n "$PI_MODEL" ]; then
    # Raspberry Pi: no DMI, use device tree.
    BOARD_VENDOR="Raspberry Pi Foundation"
    BOARD_PRODUCT="$PI_MODEL"
    BOARD_SOURCE="device-tree"
else
    BOARD_VENDOR=$(sysfs_dmi board_vendor)
    BOARD_PRODUCT=$(sysfs_dmi board_name)
    BOARD_VERSION=$(sysfs_dmi board_version)
    BOARD_BIOS_VERSION=$(sysfs_dmi bios_version)
fi

# --- Node ---
NODE_VERSION=""
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version 2>/dev/null || echo "")
fi

# --- Assemble notes JSON ---
NOTES_JSON="[]"
if [ ${#NOTES[@]} -gt 0 ]; then
    NOTES_JSON="["
    for i in "${!NOTES[@]}"; do
        [ "$i" -gt 0 ] && NOTES_JSON="$NOTES_JSON,"
        NOTES_JSON="$NOTES_JSON\"$(json_escape "${NOTES[$i]}")\""
    done
    NOTES_JSON="$NOTES_JSON]"
fi

# --- Emit ---
JSON_TMP=$(mktemp)
{
    printf '{\n'
    printf '  "captured_at": "%s",\n' "$CAPTURED_AT"
    printf '  "hostname": "%s",\n' "$(json_escape "$HN")"
    printf '  "hostname_hash": "sha256:%s",\n' "$HN_HASH"
    printf '  "os": {\n'
    json_str_field "distro" "$OS_DISTRO";   printf ',\n'
    json_str_field "kernel" "$OS_KERNEL";   printf ',\n'
    json_str_field "architecture" "$OS_ARCH"; printf '\n'
    printf '  },\n'
    printf '  "virt": {\n'
    json_str_field "type" "$VIRT_TYPE";     printf ',\n'
    printf '    "is_container": %s\n' "$IS_CONTAINER"
    printf '  },\n'
    printf '  "cpu": {\n'
    json_str_field "model" "$CPU_MODEL";                printf ',\n'
    json_str_field "vendor" "$CPU_VENDOR";              printf ',\n'
    json_num_field "cores_physical" "$CPU_CORES_PHYS";  printf ',\n'
    json_num_field "cores_logical" "$CPU_CORES_LOG";    printf ',\n'
    json_num_field "max_freq_mhz" "$CPU_MAX_FREQ_MHZ";  printf ',\n'
    json_num_field "cache_l3_kb" "$CPU_L3_KB";          printf '\n'
    printf '  },\n'
    printf '  "memory": {\n'
    json_num_field "total_kb" "$MEM_TOTAL_KB"; printf ',\n'
    printf '    "dimms": %s\n' "$DIMMS_JSON"
    printf '  },\n'
    printf '  "storage": %s,\n' "$STORAGE_JSON"
    printf '  "gpu": %s,\n' "$GPU_JSON"
    printf '  "board": {\n'
    json_str_field "vendor" "$BOARD_VENDOR";               printf ',\n'
    json_str_field "product" "$BOARD_PRODUCT";             printf ',\n'
    json_str_field "version" "$BOARD_VERSION";             printf ',\n'
    json_str_field "bios_version" "$BOARD_BIOS_VERSION";   printf ',\n'
    json_str_field "source" "$BOARD_SOURCE";               printf '\n'
    printf '  },\n'
    if [ -z "$NODE_VERSION" ]; then
        printf '  "node_version": null,\n'
    else
        printf '  "node_version": "%s",\n' "$(json_escape "$NODE_VERSION")"
    fi
    printf '  "notes": %s\n' "$NOTES_JSON"
    printf '}\n'
} > "$JSON_TMP"

if [ -n "$OUTPUT_FILE" ]; then
    mv "$JSON_TMP" "$OUTPUT_FILE"
    echo "Wrote host info to $OUTPUT_FILE" >&2
else
    cat "$JSON_TMP"
    rm -f "$JSON_TMP"
fi
