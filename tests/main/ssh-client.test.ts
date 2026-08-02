import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ssh from '../../src/main/ssh-client';

type ExecCall = { cmd: string; args: string[]; options: unknown };
let calls: ExecCall[] = [];
let mockImpl: (call: ExecCall) => { stdout: string; stderr: string } | Error = () => ({ stdout: '', stderr: '' });

beforeEach(() => {
  calls = [];
  mockImpl = () => ({ stdout: '', stderr: '' });
  ssh.__setRunner(async (cmd, args, options) => {
    const call = { cmd, args, options };
    calls.push(call);
    const result = mockImpl(call);
    if (result instanceof Error) throw result;
    return result;
  });
});

afterEach(() => {
  ssh.__setRunner(null);
});

const target = { host: 'server.example.com', user: 'ubuntu', port: 22 };

describe('ssh-client.test', () => {
  it('spawns ssh with the expected base options', async () => {
    await ssh.test(target);
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c.cmd).toBe('ssh');
    expect(c.args).toEqual([
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=8',
      '-o', 'ServerAliveInterval=10',
      '-o', 'ServerAliveCountMax=3',
      '-p', '22',
      'ubuntu@server.example.com',
      'true',
    ]);
  });

  it('appends identity file and IdentitiesOnly when provided', async () => {
    await ssh.test({ ...target, identityFile: '/home/x/.ssh/id_ed25519' });
    expect(calls[0].args).toContain('-i');
    expect(calls[0].args).toContain('/home/x/.ssh/id_ed25519');
    expect(calls[0].args).toContain('IdentitiesOnly=yes');
  });

  it('rejects invalid hostnames without spawning', async () => {
    await expect(ssh.test({ ...target, host: 'evil host; rm -rf /' })).rejects.toMatchObject({ kind: 'invalid-input' });
    expect(calls).toHaveLength(0);
  });

  it('rejects invalid usernames without spawning', async () => {
    await expect(ssh.test({ ...target, user: 'a b' })).rejects.toMatchObject({ kind: 'invalid-input' });
    expect(calls).toHaveLength(0);
  });

  it('rejects out-of-range ports without spawning', async () => {
    await expect(ssh.test({ ...target, port: 99999 })).rejects.toMatchObject({ kind: 'invalid-input' });
    expect(calls).toHaveLength(0);
  });
});

describe('ssh-client.classifyStderr', () => {
  it('classifies known error phrases', () => {
    expect(ssh.classifyStderr('Permission denied (publickey).')).toBe('auth-failed');
    expect(ssh.classifyStderr('Host key verification failed.')).toBe('host-key-mismatch');
    expect(ssh.classifyStderr("The authenticity of host 'x' can't be established")).toBe('host-key-unknown');
    expect(ssh.classifyStderr('ssh: connect to host x port 22: Connection refused')).toBe('unreachable');
    expect(ssh.classifyStderr('ssh: Could not resolve hostname xyz')).toBe('unreachable');
    expect(ssh.classifyStderr('Operation timed out')).toBe('timeout');
    expect(ssh.classifyStderr('something else entirely')).toBe('command-failed');
  });
});

describe('ssh-client.run', () => {
  it('passes the command as a single argv element', async () => {
    await ssh.run(target, 'node --version && systemctl --user is-system-running');
    const cmd = calls[0].args[calls[0].args.length - 1];
    expect(cmd).toBe('node --version && systemctl --user is-system-running');
  });

  it('classifies non-zero exit + auth-failed stderr correctly', async () => {
    mockImpl = () => {
      const err = new Error('command failed') as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      err.stdout = '';
      err.stderr = 'Permission denied (publickey).';
      err.code = 255;
      return err;
    };
    await expect(ssh.run(target, 'true')).rejects.toMatchObject({ kind: 'auth-failed', exitCode: 255 });
  });
});

describe('ssh-client.upload', () => {
  it('spawns scp with -P (uppercase) for port', async () => {
    await ssh.upload(target, '/tmp/a.tar.gz', '/tmp/b.tar.gz');
    expect(calls[0].cmd).toBe('scp');
    expect(calls[0].args).toContain('-P');
    expect(calls[0].args).toContain('22');
    expect(calls[0].args[calls[0].args.length - 2]).toBe('/tmp/a.tar.gz');
    expect(calls[0].args[calls[0].args.length - 1]).toBe('ubuntu@server.example.com:/tmp/b.tar.gz');
  });

  it('brackets bare IPv6 hosts in the scp destination', async () => {
    await ssh.upload({ ...target, host: '2001:db8::1' }, '/tmp/a', '/tmp/b');
    expect(calls[0].args[calls[0].args.length - 1]).toBe('ubuntu@[2001:db8::1]:/tmp/b');
  });

  it('leaves already-bracketed IPv6 hosts alone', async () => {
    await ssh.upload({ ...target, host: '[fe80::1]' }, '/tmp/a', '/tmp/b');
    expect(calls[0].args[calls[0].args.length - 1]).toBe('ubuntu@[fe80::1]:/tmp/b');
  });

  it('rejects paths with shell metacharacters', async () => {
    await expect(ssh.upload(target, '/tmp/a; rm b', '/tmp/x')).rejects.toMatchObject({ kind: 'invalid-input' });
  });
});
