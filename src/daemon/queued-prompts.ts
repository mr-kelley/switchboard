import * as fs from 'fs';
import * as path from 'path';

/**
 * Per-session queued prompts. Strict 0 or 1 per session.
 *
 * When a session transitions to needs-attention, the daemon fires the queued
 * prompt through the existing PTY input path (appending a \r) and clears the
 * queue. Persisted to disk so prompts survive daemon restarts.
 */
export class QueuedPrompts {
  private queue = new Map<string, string>();
  private filePath: string;

  constructor(sessionPersistPath: string) {
    // Live alongside sessions.json: /.../queued-prompts.json
    this.filePath = path.join(path.dirname(sessionPersistPath), 'queued-prompts.json');
    this.load();
  }

  /** Returns true if accepted; false if already queued (no overwrite). */
  tryQueue(sessionId: string, text: string): boolean {
    if (this.queue.has(sessionId)) return false;
    this.queue.set(sessionId, text);
    this.persist();
    return true;
  }

  /** Always succeeds. */
  clear(sessionId: string): void {
    if (!this.queue.has(sessionId)) return;
    this.queue.delete(sessionId);
    this.persist();
  }

  /** Read + remove in one call. Returns the text or null. */
  consume(sessionId: string): string | null {
    const text = this.queue.get(sessionId);
    if (!text) return null;
    this.queue.delete(sessionId);
    this.persist();
    return text;
  }

  get(sessionId: string): string | null {
    return this.queue.get(sessionId) ?? null;
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.queue);
  }

  removeSession(sessionId: string): void {
    if (!this.queue.has(sessionId)) return;
    this.queue.delete(sessionId);
    this.persist();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.length > 0) this.queue.set(k, v);
        }
      }
    } catch {
      // Corrupt or missing; start empty
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.snapshot(), null, 2), { mode: 0o600 });
    } catch {
      // Best-effort; runtime behavior doesn't depend on persistence success
    }
  }
}
