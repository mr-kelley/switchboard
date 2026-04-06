import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OutputBuffer } from '../../src/daemon/output-buffer';

describe('OutputBuffer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-buf-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends data and tracks line count', () => {
    const buf = new OutputBuffer(1000);
    buf.append('line1\nline2\nline3');
    expect(buf.getLineCount()).toBe(3);
  });

  it('tracks total bytes', () => {
    const buf = new OutputBuffer(1000);
    buf.append('hello');
    expect(buf.getTotalBytes()).toBeGreaterThan(0);
  });

  it('evicts oldest lines when over capacity', () => {
    const buf = new OutputBuffer(5);
    buf.append('a\nb\nc\nd\ne\nf\ng\nh');
    expect(buf.getLineCount()).toBe(5);
    // Oldest lines should be evicted
    const all = buf.getAll();
    expect(all).not.toContain('a\n');
  });

  it('getAll returns all buffered data joined by newlines', () => {
    const buf = new OutputBuffer(1000);
    buf.append('line1\nline2');
    expect(buf.getAll()).toBe('line1\nline2');
  });

  it('clear empties the buffer', () => {
    const buf = new OutputBuffer(1000);
    buf.append('data');
    buf.clear();
    expect(buf.getLineCount()).toBe(0);
    expect(buf.getTotalBytes()).toBe(0);
  });

  it('generates replay chunks of bounded size', () => {
    const buf = new OutputBuffer(1000);
    // Add enough data to produce multiple chunks
    const line = 'x'.repeat(100) + '\n';
    for (let i = 0; i < 100; i++) {
      buf.append(line);
    }
    const chunks = [...buf.replayChunks(500)];
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be approximately <= 500 bytes (may slightly exceed due to line boundaries)
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk, 'utf-8')).toBeLessThan(1000); // generous margin
    }
  });

  it('replay of empty buffer yields no chunks', () => {
    const buf = new OutputBuffer(1000);
    const chunks = [...buf.replayChunks()];
    expect(chunks).toHaveLength(0);
  });

  it('persists to disk and loads back', () => {
    const filePath = path.join(tmpDir, 'test.buf');
    const buf1 = new OutputBuffer(1000, filePath);
    buf1.append('line1\nline2\nline3');
    buf1.persistToDisk();

    const buf2 = new OutputBuffer(1000, filePath);
    expect(buf2.getLineCount()).toBe(3);
    expect(buf2.getAll()).toBe('line1\nline2\nline3');
  });

  it('clear removes the persist file', () => {
    const filePath = path.join(tmpDir, 'test.buf');
    const buf = new OutputBuffer(1000, filePath);
    buf.append('data');
    buf.persistToDisk();
    expect(fs.existsSync(filePath)).toBe(true);

    buf.clear();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('handles loading from nonexistent file gracefully', () => {
    const filePath = path.join(tmpDir, 'nonexistent.buf');
    const buf = new OutputBuffer(1000, filePath);
    expect(buf.getLineCount()).toBe(0);
  });

  it('evicts on load when file exceeds capacity', () => {
    const filePath = path.join(tmpDir, 'big.buf');
    fs.writeFileSync(filePath, 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj', 'utf-8');
    const buf = new OutputBuffer(5, filePath);
    expect(buf.getLineCount()).toBe(5);
  });
});
