import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { TransportServer } from '../../src/daemon/transport';
import { serializeMessage, deserializeMessage, type ClientMessage, type DaemonMessage } from '../../src/shared/protocol';

/**
 * Transport tests are now mTLS-only. The fixtures under `tests/fixtures/tls/`
 * back both a trusted client (SAN=switchboard-test-client.example.internal,
 * signed by the fixture lab CA) and an unauthorized client signed by a
 * different CA — used to prove the daemon rejects unrelated chains.
 */

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'tls');

function readPem(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

describe('TransportServer (mTLS)', () => {
  let server: TransportServer;
  let port: number;
  const received: ClientMessage[] = [];

  beforeAll(async () => {
    port = 30000 + Math.floor(Math.random() * 10000);
    server = new TransportServer(
      {
        port,
        host: '127.0.0.1',
        tls: {
          cert: readPem('server.crt'),
          key: readPem('server.key'),
          ca: readPem('ca.crt'),
        },
        daemonId: 'test-daemon',
        hostname: 'test-host',
        version: '0.0.1',
      },
      (_conn, msg) => { received.push(msg); },
    );
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  function connectAuthorized(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
        cert: readPem('client.crt'),
        key: readPem('client.key'),
        ca: readPem('ca.crt'),
      });
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function awaitMessage(ws: WebSocket): Promise<DaemonMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('message timeout')), 3000);
      ws.once('message', (raw) => {
        clearTimeout(timer);
        try {
          resolve(deserializeMessage(raw.toString()) as DaemonMessage);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  it('sends an unsolicited auth:ok metadata message on connect', async () => {
    const ws = await connectAuthorized();
    const msg = await awaitMessage(ws);
    expect(msg.type).toBe('auth:ok');
    if (msg.type === 'auth:ok') {
      expect(msg.daemonId).toBe('test-daemon');
      expect(msg.hostname).toBe('test-host');
      expect(msg.version).toBe('0.0.1');
    }
    ws.close();
  });

  it('routes app messages through the message handler after handshake', async () => {
    const before = received.length;
    const ws = await connectAuthorized();
    await awaitMessage(ws); // consume unsolicited auth:ok
    ws.send(serializeMessage({ type: 'session:list', seq: 1 } as ClientMessage));
    // Give the router a moment to process.
    await new Promise((r) => setTimeout(r, 100));
    expect(received.length).toBeGreaterThan(before);
    expect(received[received.length - 1].type).toBe('session:list');
    ws.close();
  });

  it('answers ping with pong on the transport itself (no handler invoked)', async () => {
    const ws = await connectAuthorized();
    await awaitMessage(ws); // consume auth:ok
    ws.send(serializeMessage({ type: 'ping', seq: 99 } as ClientMessage));
    const reply = await awaitMessage(ws);
    expect(reply.type).toBe('pong');
    ws.close();
  });

  it('rejects a client whose cert is signed by a different CA', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
        cert: readPem('unauthorized-client.crt'),
        key: readPem('unauthorized-client.key'),
        ca: readPem('ca.crt'),
      });
      const timer = setTimeout(() => reject(new Error('expected TLS rejection did not arrive')), 3000);
      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        reject(new Error('handshake should have failed'));
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });

  it('rejects a client that presents no cert', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
        ca: readPem('ca.crt'),
        // no cert / key
      });
      const timer = setTimeout(() => reject(new Error('expected TLS rejection did not arrive')), 3000);
      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        reject(new Error('handshake should have failed'));
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
});
