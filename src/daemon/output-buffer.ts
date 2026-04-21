import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB per replay chunk

export class OutputBuffer {
  private data: string[] = [];
  private totalBytes = 0;
  private maxLines: number;
  private persistPath: string | null;
  private dirty = false;

  constructor(maxLines: number, persistPath?: string) {
    this.maxLines = maxLines;
    this.persistPath = persistPath || null;

    if (this.persistPath) {
      this.loadFromDisk();
    }
  }

  append(chunk: string): void {
    // Split into lines, preserving escape sequences
    const lines = chunk.split('\n');

    for (const line of lines) {
      this.data.push(line);
      this.totalBytes += Buffer.byteLength(line, 'utf-8');
    }

    // Evict oldest lines if over capacity
    while (this.data.length > this.maxLines) {
      const removed = this.data.shift()!;
      this.totalBytes -= Buffer.byteLength(removed, 'utf-8');
    }

    this.dirty = true;
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }

  getLineCount(): number {
    return this.data.length;
  }

  /**
   * Generate replay chunks of approximately chunkSize bytes each.
   * Returns an iterator of string chunks.
   */
  *replayChunks(chunkSize: number = DEFAULT_CHUNK_SIZE): Generator<string> {
    let current = '';
    let currentBytes = 0;

    for (let i = 0; i < this.data.length; i++) {
      const line = this.data[i];
      const sep = i < this.data.length - 1 ? '\n' : '';
      const piece = line + sep;
      const pieceBytes = Buffer.byteLength(piece, 'utf-8');

      if (currentBytes + pieceBytes > chunkSize && current.length > 0) {
        yield current;
        current = piece;
        currentBytes = pieceBytes;
      } else {
        current += piece;
        currentBytes += pieceBytes;
      }
    }

    if (current.length > 0) {
      yield current;
    }
  }

  /**
   * Get all buffered data as a single string.
   */
  getAll(): string {
    return this.data.join('\n');
  }

  clear(): void {
    this.data = [];
    this.totalBytes = 0;
    this.dirty = true;
    if (this.persistPath && fs.existsSync(this.persistPath)) {
      try {
        fs.unlinkSync(this.persistPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  persistToDisk(): void {
    if (!this.persistPath || !this.dirty) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.persistPath, this.data.join('\n'), 'utf-8');
      this.dirty = false;
    } catch {
      console.warn(`Failed to persist output buffer to ${this.persistPath}`);
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf-8');
      if (raw.length > 0) {
        const lines = raw.split('\n');
        this.data = lines;
        this.totalBytes = Buffer.byteLength(raw, 'utf-8');
        // Evict if loaded data exceeds capacity
        while (this.data.length > this.maxLines) {
          const removed = this.data.shift()!;
          this.totalBytes -= Buffer.byteLength(removed, 'utf-8');
        }
      }
    } catch {
      // Ignore load errors — start with empty buffer
    }
  }
}
