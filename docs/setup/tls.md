# TLS Setup for Switchboard

Switchboard's daemon and client authenticate to each other with **mutual TLS**. The daemon
needs a server certificate; the client needs its own client certificate; both are signed by
the same CA and both sides verify against it. There is no dev-mode shortcut — this applies
even when the daemon and client are on the same machine (see [Security model](../../README.md#security-model)).

If you already have a lab CA and have issued yourself server and client certs, skip to
[File layout](#file-layout) and place the files. Otherwise, this guide walks you through
generating a self-signed CA of your own with `openssl` and issuing the two certificates you
need.

## File layout

Everything lives under `~/.switchboard/tls/` (override with `SWITCHBOARD_TLS_DIR`):

| File | Owner | Purpose |
|---|---|---|
| `ca.crt` | shared | CA root — trust anchor for both the daemon (verifying clients) and the client (verifying the daemon) |
| `server.crt` | daemon | Server leaf cert — presented by the daemon at handshake |
| `server.key` | daemon | Server private key — matches `server.crt`; mode `0600` |
| `client.crt` | client | Client leaf cert — presented by Switchboard at handshake |
| `client.key` | client | Client private key — matches `client.crt`; mode `0600` |

Directory mode: `0700`. Any missing file makes either the daemon refuse to start or the
client refuse to connect — the failure message names the specific path so you know what to
fix.

## Bootstrap from scratch (single-machine)

Suitable for a personal setup where you're the only operator. Produces a working local
daemon + client. Same certs also authenticate you to any remote daemons you provision later
against the same CA.

### 1 · Pick an identity for your client

The client's cert carries an FQDN-shaped identity in its SAN (Subject Alternative Name).
Any daemon you connect to reads that identity from your cert at handshake and uses it as
your username. Pick something meaningful:

```bash
CLIENT_IDENTITY="switchboard.$(hostname).local"    # e.g. switchboard.cloud0.local
```

DNS naming rules apply — letters, digits, hyphens, dots. No `@`, no spaces.

### 2 · Generate a personal CA

```bash
mkdir -p ~/switchboard-ca && cd ~/switchboard-ca

openssl req -x509 -newkey rsa:4096 -sha256 -nodes -days 3650 \
    -keyout ca.key -out ca.crt \
    -subj "/CN=switchboard-personal-ca"
```

**Keep `ca.key` somewhere safe.** It stays in `~/switchboard-ca/` — not in
`~/.switchboard/tls/` — so a compromise of the daemon does not expose it. You only need
`ca.key` when issuing new certs (adding a remote daemon, rotating a compromised key, etc.).

### 3 · Issue the daemon's server cert

```bash
openssl req -new -newkey rsa:4096 -nodes \
    -keyout server.key -out server.csr \
    -subj "/CN=localhost"

openssl x509 -req -in server.csr \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out server.crt -days 365 -sha256 \
    -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1")
```

The SAN entries let the client verify the daemon whether it connects via `localhost`,
`127.0.0.1`, or `::1`. If your local daemon binds to a different host, add its DNS name /
IP to the SAN list.

### 4 · Issue your client cert

```bash
openssl req -new -newkey rsa:4096 -nodes \
    -keyout client.key -out client.csr \
    -subj "/CN=$CLIENT_IDENTITY"

openssl x509 -req -in client.csr \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out client.crt -days 365 -sha256 \
    -extfile <(printf "subjectAltName=DNS:$CLIENT_IDENTITY")
```

### 5 · Install the certs

```bash
mkdir -p ~/.switchboard/tls
chmod 700 ~/.switchboard/tls

cp ca.crt server.crt server.key client.crt client.key ~/.switchboard/tls/
chmod 600 ~/.switchboard/tls/server.key ~/.switchboard/tls/client.key
chmod 644 ~/.switchboard/tls/{ca,server,client}.crt

rm -f server.csr client.csr ca.srl    # byproducts; not needed
```

At this point `~/.switchboard/tls/` has all five files at the right modes. `ca.key` stays
back in `~/switchboard-ca/`.

## Verification

Start the daemon:

```bash
systemctl --user start switchboard-daemon
# or, without systemd:
switchboard-daemon                                  # if you installed it standalone
```

Check the log:

```bash
journalctl --user -u switchboard-daemon -n 20
```

You should see a `[tls] listening on :::3717` line. If certs were missing or malformed,
the log names the specific file and reason instead.

Launch Switchboard. Preferences → Daemons should show the localhost daemon as **connected**.
Create a session; if it opens a shell, mTLS is working end-to-end.

## Adding a remote daemon

**You do not need a new client cert** for every remote daemon. Your one `client.crt` /
`client.key` pair authenticates you to any daemon that trusts the same CA.

Each remote daemon needs its own `server.crt` / `server.key` (with a SAN matching the
hostname/IP the client will connect to) plus a copy of `ca.crt`. The `Preferences → Daemons
→ Add daemon` flow handles this for you: given SSH access to the target and a signing key
(usually pre-arranged as part of your CA setup), it generates the server cert, uploads
`server.crt`, `server.key`, and `ca.crt` to the target's `~/.switchboard/tls/`, and installs
the daemon as a `systemd --user` service.

If you're bootstrapping a remote daemon manually (without the flow), repeat step 3 with the
target's hostname in the SAN, then `scp` the three files to that host's `~/.switchboard/tls/`.

## Rotation

- CA cert (`ca.crt`) — regenerating replaces the trust anchor. All existing server + client
  certs become untrusted. Only do this if the CA key is compromised.
- Client cert (`client.crt` / `client.key`) — regenerate every year or two. Reuse the same
  `CLIENT_IDENTITY` so your identity stays stable across daemons.
- Server cert (`server.crt` / `server.key` on each daemon host) — regenerate similarly. The
  daemon reloads on restart; a rolling replace is fine.

Certs use RSA-4096 by default here. To match your lab's convention (e.g. ECDSA P-256, or
smaller RSA), adjust `-newkey rsa:4096` — the layout and identity rules are unchanged.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Daemon exits with `TLS file missing: .../server.crt` | The specific file isn't present or isn't readable. Check the path and mode. |
| Client shows daemon status "TLS handshake failed" | Client cert / key mismatch, or CA mismatch. Re-verify `ca.crt` is the same file on both sides. |
| Client shows `certificate has expired` | Regenerate whichever end has aged out. |
| Daemon logs `peer connected without a usable SAN DNS identity` | Client cert has no `subjectAltName = DNS:...` extension. Re-issue with the `-extfile` step from §4. |
| `Hostname/IP does not match certificate's altnames` | Server cert's SAN doesn't include the address the client is connecting to. Add it and re-issue. |

## What NOT to use

The repo ships `scripts/gen-test-certs.sh`, which generates a fixture bundle for the unit
and integration tests. **It is test-only.** The private keys are committed to the repo on
purpose so CI runs deterministically — those keys have no security value. Do not use them
for a real setup.
