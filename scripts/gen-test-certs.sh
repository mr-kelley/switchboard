#!/usr/bin/env bash
# Regenerate the TLS fixture bundle under tests/fixtures/tls/.
#
# These fixtures back the daemon + client mTLS unit and integration tests.
# They have NO security value — the private keys are checked into the repo
# on purpose so CI is deterministic. Never use them outside tests.
#
# Only re-run this script when you need to change the fixture identities,
# the SAN entries, or add/remove a fixture. Committed fixture bytes should
# remain stable otherwise so test diffs stay small.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/tests/fixtures/tls"
DAYS=3650

mkdir -p "$OUT"

# ---- Trusted lab-CA fixture ------------------------------------------------

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days "$DAYS" \
  -keyout "$OUT/ca.key" \
  -out    "$OUT/ca.crt" \
  -subj   "/CN=switchboard-test-lab-ca" \
  >/dev/null 2>&1

# ---- Server cert (signed by lab CA) ---------------------------------------

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$OUT/server.key" \
  -out    "$OUT/server.csr" \
  -subj   "/CN=switchboard-test-server" \
  >/dev/null 2>&1

cat > "$OUT/server.ext" <<'EOF'
subjectAltName = DNS:localhost, DNS:switchboard-test-server, IP:127.0.0.1, IP:::1
EOF

openssl x509 -req -in "$OUT/server.csr" \
  -CA "$OUT/ca.crt" -CAkey "$OUT/ca.key" -CAcreateserial \
  -out "$OUT/server.crt" -days "$DAYS" -sha256 \
  -extfile "$OUT/server.ext" \
  >/dev/null 2>&1

# ---- Authorized client cert (signed by lab CA, SAN in allowlist) ----------

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$OUT/client.key" \
  -out    "$OUT/client.csr" \
  -subj   "/CN=switchboard-test-client" \
  >/dev/null 2>&1

cat > "$OUT/client.ext" <<'EOF'
subjectAltName = DNS:switchboard-test-client.example.internal
EOF

openssl x509 -req -in "$OUT/client.csr" \
  -CA "$OUT/ca.crt" -CAkey "$OUT/ca.key" -CAcreateserial \
  -out "$OUT/client.crt" -days "$DAYS" -sha256 \
  -extfile "$OUT/client.ext" \
  >/dev/null 2>&1

# ---- Unauthorized-CA client cert (signed by a DIFFERENT CA) ---------------
# Used to prove the daemon rejects any cert not chaining to our lab CA.

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days "$DAYS" \
  -keyout "$OUT/other-ca.key" \
  -out    "$OUT/other-ca.crt" \
  -subj   "/CN=switchboard-test-OTHER-ca" \
  >/dev/null 2>&1

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$OUT/unauthorized-client.key" \
  -out    "$OUT/unauthorized-client.csr" \
  -subj   "/CN=switchboard-test-unauthorized-client" \
  >/dev/null 2>&1

cat > "$OUT/unauthorized-client.ext" <<'EOF'
subjectAltName = DNS:unauthorized.example.internal
EOF

openssl x509 -req -in "$OUT/unauthorized-client.csr" \
  -CA "$OUT/other-ca.crt" -CAkey "$OUT/other-ca.key" -CAcreateserial \
  -out "$OUT/unauthorized-client.crt" -days "$DAYS" -sha256 \
  -extfile "$OUT/unauthorized-client.ext" \
  >/dev/null 2>&1

# ---- Cleanup intermediate files -------------------------------------------

rm -f "$OUT"/*.csr "$OUT"/*.ext "$OUT"/*.srl "$OUT/other-ca.key"

# Lock down private keys.
chmod 600 "$OUT"/*.key
chmod 644 "$OUT"/*.crt

ls -la "$OUT"
