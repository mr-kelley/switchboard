#!/usr/bin/env node
// Opens N sessions to a switchboard-daemon over mTLS, optionally fires
// a workload command in session 1, and holds until interrupted.
//
// Removes the manual click-open latency between sessions that the perf
// harness's timing depends on: all N sessions open in parallel from a
// single WSS connection and are ready in well under a second even for
// N=15. Prints "READY" to stderr once every requested session has been
// confirmed by the daemon.
//
// Reads the client cert bundle from SWITCHBOARD_TLS_DIR or
// ~/.switchboard/tls/ (matches the client's convention exactly). Needs
// the `ws` package, resolved from node_modules relative to the script's
// own path — run from a switchboard repo checkout with `npm install`
// completed.
//
// Usage:
//   node session_driver.js --host HOST --port PORT --count N
//                          [--workload "CMD"] [--workload-delay SECONDS]
//                          [--tls-dir PATH] [--session-name-prefix PREFIX]
//
// Signals:
//   SIGINT/SIGTERM triggers clean shutdown: session:close is sent for
//   every open session, then the WS closes and the process exits 0
//   (130 on SIGINT).
//
// Output:
//   stderr — progress lines prefixed with [session_driver]
//   stdout — nothing (this is a hold-forever coordination tool)
//
// Exit codes:
//   0   clean shutdown
//   1   fatal error (missing certs, WS failure, spawn timeout, etc.)
//   130 SIGINT

const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const args = parseArgs();

function parseArgs() {
    const out = {
        host: null,
        port: 3717,
        count: null,
        workload: null,
        workloadDelay: 5,
        tlsDir: null,
        sessionNamePrefix: 'perf',
        spawnTimeoutMs: 30000,
        authTimeoutMs: 10000,
    };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const nx = () => argv[++i];
        switch (a) {
            case '--host': out.host = nx(); break;
            case '--port': out.port = Number(nx()); break;
            case '--count': out.count = Number(nx()); break;
            case '--workload': out.workload = nx(); break;
            case '--workload-delay': out.workloadDelay = Number(nx()); break;
            case '--tls-dir': out.tlsDir = nx(); break;
            case '--session-name-prefix': out.sessionNamePrefix = nx(); break;
            case '-h':
            case '--help': usage(0);
            default: die(`unknown arg: ${a}`);
        }
    }
    if (!out.host) die('--host is required');
    if (out.count === null || !Number.isFinite(out.count) || out.count < 0) {
        die('--count is required (integer >= 0)');
    }
    return out;
}

function usage(code) {
    process.stderr.write(
        'Usage: session_driver.js --host HOST --port PORT --count N ' +
        '[--workload "CMD"] [--workload-delay SECONDS] [--tls-dir PATH] ' +
        '[--session-name-prefix PREFIX]\n'
    );
    process.exit(code);
}

function log(msg) { process.stderr.write(`[session_driver] ${msg}\n`); }
function die(msg) { process.stderr.write(`[session_driver] error: ${msg}\n`); process.exit(1); }

// --- Load TLS bundle (matches client's loader in connection-manager.ts) ---
const tlsDir = args.tlsDir || process.env.SWITCHBOARD_TLS_DIR || path.join(os.homedir(), '.switchboard', 'tls');
let bundle;
try {
    bundle = {
        cert: fs.readFileSync(path.join(tlsDir, 'client.crt'), 'utf-8'),
        key: fs.readFileSync(path.join(tlsDir, 'client.key'), 'utf-8'),
        ca: fs.readFileSync(path.join(tlsDir, 'ca.crt'), 'utf-8'),
    };
} catch (err) {
    die(`cannot load TLS bundle from ${tlsDir}: ${err.message}`);
}

// --- Connect ---
function bracketHost(h) { return (h.includes(':') && !h.startsWith('[')) ? `[${h}]` : h; }
const url = `wss://${bracketHost(args.host)}:${args.port}`;
log(`connecting to ${url} (${args.count} sessions requested)`);

const ws = new WebSocket(url, { cert: bundle.cert, key: bundle.key, ca: bundle.ca });

let seq = 0;
const nextSeq = () => ++seq;
const spawnedSessions = [];              // {id, name, index}
const pendingSpawns = new Map();         // index -> {resolve, reject}
let shuttingDown = false;

const authTimer = setTimeout(() => {
    die(`no auth:ok received within ${args.authTimeoutMs}ms`);
}, args.authTimeoutMs);

const spawnTimer = setTimeout(() => {
    if (pendingSpawns.size > 0) {
        die(`spawn timeout after ${args.spawnTimeoutMs}ms — ${pendingSpawns.size}/${args.count} sessions still pending`);
    }
}, args.spawnTimeoutMs);

ws.on('open', () => log('WebSocket open, awaiting auth:ok'));

ws.on('error', (err) => { if (!shuttingDown) die(`WebSocket error: ${err.message}`); });

ws.on('close', (code, reason) => {
    if (!shuttingDown) die(`WebSocket closed unexpectedly (${code}) ${reason ? reason.toString() : ''}`);
});

ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.type) {
        case 'auth:ok':
            clearTimeout(authTimer);
            log(`daemon: ${msg.hostname} v${msg.version} (${msg.daemonId})`);
            spawnAll();
            break;
        case 'session:created': {
            // Match by session name. session:created's own `seq` is the daemon's
            // outbound counter, not the spawn request's, so name is the reliable
            // key. Names are unique per run: <prefix>-<index>.
            const idx = parseSessionIndex(msg.session.name);
            if (idx == null) return;
            const p = pendingSpawns.get(idx);
            if (!p) return;
            pendingSpawns.delete(idx);
            spawnedSessions.push({ id: msg.session.id, name: msg.session.name, index: idx });
            log(`session ${idx} created: ${msg.session.id.substring(0, 8)}`);
            p.resolve();
            break;
        }
        case 'error':
            log(`daemon error: ${msg.code}: ${msg.message}`);
            break;
        default:
            // Ignore session:data/status/closed streams during the hold phase.
            break;
    }
});

function parseSessionIndex(name) {
    if (!name.startsWith(args.sessionNamePrefix + '-')) return null;
    const tail = name.substring(args.sessionNamePrefix.length + 1);
    if (!/^\d+$/.test(tail)) return null;
    return Number(tail);
}

function spawnAll() {
    if (args.count === 0) { onReady(); return; }
    log(`spawning ${args.count} sessions...`);
    const promises = [];
    for (let i = 0; i < args.count; i++) {
        const name = `${args.sessionNamePrefix}-${i}`;
        promises.push(new Promise((resolve, reject) => {
            pendingSpawns.set(i, { resolve, reject });
        }));
        ws.send(JSON.stringify({
            type: 'session:spawn',
            seq: nextSeq(),
            name,
            cwd: os.homedir(),
        }));
    }
    Promise.all(promises).then(onReady).catch((err) => die(`spawn failed: ${err}`));
}

function onReady() {
    clearTimeout(spawnTimer);
    log(`READY (${spawnedSessions.length} sessions open)`);
    if (args.workload && spawnedSessions.length > 0) {
        setTimeout(() => {
            const target = spawnedSessions[0];
            log(`firing workload in ${target.name} after ${args.workloadDelay}s delay`);
            ws.send(JSON.stringify({
                type: 'session:input',
                seq: nextSeq(),
                sessionId: target.id,
                data: args.workload + '\n',
            }));
        }, args.workloadDelay * 1000);
    } else if (args.workload) {
        log('workload requested but no sessions open — skipping');
    }
}

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, closing ${spawnedSessions.length} sessions`);
    for (const s of spawnedSessions) {
        try {
            ws.send(JSON.stringify({
                type: 'session:close',
                seq: nextSeq(),
                sessionId: s.id,
            }));
        } catch { /* best-effort */ }
    }
    setTimeout(() => {
        try { ws.close(1000, 'session_driver shutdown'); } catch { /* ignore */ }
        process.exit(signal === 'SIGINT' ? 130 : 0);
    }, 500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
