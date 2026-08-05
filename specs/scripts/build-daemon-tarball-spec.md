---
title: Daemon Tarball Build Specification (multi-arch)
version: 0.1.0
maintained_by: claude
domain_tags: [packaging, distribution, daemon, arm, raspberry-pi, ci]
status: draft
governs: scripts/build-daemon-tarball.sh, .github/workflows/release.yml
platform: claude-code
license: MIT
---

# Purpose
Define the contents, arch matrix, naming convention, and build ownership for the remote-installable daemon tarball. One tarball is produced per supported target architecture; the client bundles all supported tarballs and the remote provisioner selects the matching one at install time (see `specs/src/main/remote-provisioner-spec.md`).

This spec supersedes the implicit x64-only assumption of DEC-000009 and is governed by DEC-000012.

# Scope

## Covers
- The set of supported target architectures.
- Per-arch tarball contents and directory layout.
- Naming convention for tarball artifacts.
- Where the Node runtime and native `node-pty` build come from for each arch.
- Ownership of the build (local vs CI) and the CI matrix shape.

## Does Not Cover
- The provisioner's arch-detection logic — see `specs/src/main/remote-provisioner-spec.md`.
- The systemd unit written on the target — same.
- Client-app packaging (electron-builder) beyond the `extraResources` glob that carries the tarballs into the AppImage.
- Cert distribution or PKI concerns — see `specs/src/daemon/transport-mtls-spec.md`.

# Supported Architectures

Exactly three arches are built and shipped in v1:

| `uname -m` on target | Tarball ARCH slug | Node dist file | Typical hardware |
|----------------------|-------------------|----------------|------------------|
| `x86_64`             | `linux-x64`       | `node-v${N}-linux-x64.tar.xz`     | Intel/AMD desktops, VMs, cloud instances |
| `aarch64`            | `linux-arm64`     | `node-v${N}-linux-arm64.tar.xz`   | Raspberry Pi 4/5 (64-bit OS), Ampere, Apple silicon Linux VMs |
| `armv7l`             | `linux-armv7l`    | `node-v${N}-linux-armv7l.tar.xz`  | Raspberry Pi 2/3, Pi 4 running 32-bit OS |

**Out of scope for v1:** `armv6l` (Pi Zero / Pi 1 — official Node dropped support after v12; workload viability not yet studied), `i686`, `riscv64`, `ppc64le`, macOS/Windows targets. See DEC-000012 Option D.

Adding a new arch is a spec + DEC change, not just a script tweak — the matrix, the client bundle, and the provisioner lookup table must all move together.

# Tarball Layout
Contents are identical across arches; only the binary blobs differ.

```
switchboard-daemon/
  bin/node                                     # Node.js runtime for this arch (pinned via NODE_VERSION)
  dist/daemon/                                 # Compiled TS output (arch-agnostic JS)
  node_modules/ws/                             # Pure JS, arch-agnostic
  node_modules/node-pty/
    package.json
    lib/                                       # JS wrapper (arch-agnostic)
    build/Release/pty.node                     # Native addon compiled for THIS arch
  README-daemon.txt
```

The tarball is self-contained: no Node install required on the target, no npm install run at install time.

# Naming
- Versioned artifact (release + release asset): `switchboard-daemon-${VERSION}-${ARCH}.tar.gz` — e.g. `switchboard-daemon-0.6.0-linux-arm64.tar.gz`.
- Stable-name mirror inside the AppImage: `switchboard-daemon-${ARCH}.tar.gz` (no version) — so `extraResources` globs stably across version bumps.

`${VERSION}` is read from `package.json`; `${ARCH}` is the ARCH slug from the table above.

# Build Ownership

## Local build (developer / release candidate)
`scripts/build-daemon-tarball.sh` accepts an `ARCH` env var (default `linux-x64` for backward-compat with the pre-DEC-000012 flow). Invocation:

```
ARCH=linux-arm64 bash scripts/build-daemon-tarball.sh
```

The script:
1. Verifies `dist/daemon/` exists (built by `npm run build:daemon` — arch-agnostic).
2. Verifies `node_modules/node-pty/build/Release/pty.node` matches the target ARCH via `file` (e.g. `ARM aarch64` for arm64). Refuses to run if the local node-pty build is for a different arch — cross-arch node-pty must come from a prior build step (see §CI).
3. Downloads (and caches under `.cache/node/v${NODE_VERSION}-${ARCH}/bin/node`) the Node binary for the target ARCH from `https://nodejs.org/dist/v${NODE_VERSION}/`.
4. Assembles the tarball per §Tarball Layout.
5. Writes both the versioned and stable-name copies to `release/`.

## CI build (release)
GitHub Actions runs one job per ARCH in a matrix on tag push. Per §DEC-000012, this is the authoritative multi-arch build path — the only one that ships all three tarballs to a release.

**Matrix strategy (illustrative — final shape in `.github/workflows/release.yml`):**
- `linux-x64` — `ubuntu-latest` runner, native `npm install` compiles node-pty for x64.
- `linux-arm64` — `ubuntu-24.04-arm` runner (or `ubuntu-latest-arm` on availability), native `npm install`.
- `linux-armv7l` — `ubuntu-latest` runner with QEMU set up via `docker/setup-qemu-action`, then `docker run --platform linux/arm/v7` to compile node-pty and stage the tarball. Cross-compile via toolchain is an acceptable alternative if the QEMU emulation proves too slow.

Each job:
1. Checks out the repo.
2. Sets up Node (matching `NODE_VERSION`) — the CI Node is the *build* runtime; the *shipped* Node binary is the one downloaded inside the tarball script.
3. `npm install` (compiles node-pty for the runner's arch).
4. `npm run build:daemon`.
5. `ARCH=<slug> bash scripts/build-daemon-tarball.sh`.
6. Uploads `release/switchboard-daemon-${VERSION}-${ARCH}.tar.gz` as a workflow artifact.

A final job collects all three artifacts and attaches them to the GitHub Release.

The `dist:appimage` script (or its CI equivalent) downloads all three artifacts before running electron-builder, so `extraResources` sees `release/switchboard-daemon-linux-{x64,arm64,armv7l}.tar.gz` present.

# Failure Modes

- **Wrong-arch node-pty** — script refuses to run with a clear message naming the observed vs expected magic string.
- **Cached Node binary of the wrong arch** — same guard as node-pty (verify with `file` after download).
- **Node dist unreachable** — the download step surfaces the curl error verbatim; no retry loop (CI job re-runs are the recovery path).
- **Missing `dist/daemon/`** — script exits non-zero telling the caller to run `npm run build:daemon` first.
- **CI matrix job failure** — the release-attach job MUST fail if any single-arch build failed. Partial releases (e.g. x64 only) are not allowed; a client that expects three tarballs and gets one is worse than a client that saw no release land.

# Test Strategy
The build script is executable configuration, not a code module — testing is by execution + artifact inspection, not unit tests. Verification steps:

- **Per-arch smoke:** on each supported arch (via CI matrix), extract the produced tarball, run `./bin/node --version` inside it and assert it matches `NODE_VERSION`.
- **`node-pty` load check:** in each tarball, `./bin/node -e "require('./node_modules/node-pty')"` succeeds without a dlopen/ABI error.
- **Wrong-arch guard:** locally, set `ARCH=linux-arm64` on an x64 dev box without a prior arm64 node-pty build and confirm the script exits with the arch-mismatch error.
- **Provisioner integration:** covered in `specs/src/main/remote-provisioner-spec.md`'s test strategy — the provisioner's arch-detection tests are the consumer of this spec.

# Completion Criteria
- All three tarballs are produced by one `git tag` push through the CI matrix, attached to the GitHub Release, and present inside the client AppImage under `extraResources`.
- The DEC-000012 verification list (five items in `outcome.notes`) is exercised end-to-end.
- `scripts/build-daemon-tarball.sh` runs unchanged for `ARCH=linux-x64` — no behavior regression for existing x64 users.
