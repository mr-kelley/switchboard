import type { SessionStatus } from '../shared/protocol';

const DEFAULT_PROMPT_PATTERN = /[>❯$#]\s*$/m;
const IDLE_TIMEOUT_MS = 10_000;
const MIN_ACTIVITY_MS = 2_000;

interface SessionTracking {
  status: SessionStatus;
  idleTimer: ReturnType<typeof setTimeout> | null;
  firstOutputTime: number | null;
  lastOutputTime: number;
}

export class IdleDetector {
  private sessions = new Map<string, SessionTracking>();
  private promptPattern: RegExp;
  private onStatusChange: (sessionId: string, status: SessionStatus) => void;

  constructor(onStatusChange: (sessionId: string, status: SessionStatus) => void) {
    this.onStatusChange = onStatusChange;
    this.promptPattern = this.loadPromptPattern();
  }

  addSession(sessionId: string): void {
    this.sessions.set(sessionId, {
      status: 'working',
      idleTimer: null,
      firstOutputTime: null,
      lastOutputTime: Date.now(),
    });
  }

  removeSession(sessionId: string): void {
    const tracking = this.sessions.get(sessionId);
    if (tracking?.idleTimer) {
      clearTimeout(tracking.idleTimer);
    }
    this.sessions.delete(sessionId);
  }

  onOutput(sessionId: string, data: string): void {
    const tracking = this.sessions.get(sessionId);
    if (!tracking) return;

    const now = Date.now();

    if (tracking.firstOutputTime === null) {
      tracking.firstOutputTime = now;
    }
    tracking.lastOutputTime = now;

    if (tracking.idleTimer) {
      clearTimeout(tracking.idleTimer);
    }

    const activityDuration = now - tracking.firstOutputTime;
    if (activityDuration >= MIN_ACTIVITY_MS && this.promptPattern.test(data)) {
      this.setStatus(sessionId, tracking, 'needs-attention');
      return;
    }

    if (tracking.status !== 'working') {
      this.setStatus(sessionId, tracking, 'working');
    }

    tracking.idleTimer = setTimeout(() => {
      const t = this.sessions.get(sessionId);
      if (t && t.status !== 'needs-attention') {
        this.setStatus(sessionId, t, 'idle');
      }
    }, IDLE_TIMEOUT_MS);
  }

  onInput(sessionId: string): void {
    const tracking = this.sessions.get(sessionId);
    if (!tracking) return;

    tracking.firstOutputTime = null;

    if (tracking.status !== 'working') {
      this.setStatus(sessionId, tracking, 'working');
    }
  }

  getStatus(sessionId: string): SessionStatus | undefined {
    return this.sessions.get(sessionId)?.status;
  }

  private setStatus(sessionId: string, tracking: SessionTracking, status: SessionStatus): void {
    if (tracking.status === status) return;
    tracking.status = status;
    this.onStatusChange(sessionId, status);
  }

  private loadPromptPattern(): RegExp {
    const envPattern = process.env.SWITCHBOARD_PROMPT_PATTERN;
    if (envPattern) {
      try {
        return new RegExp(envPattern, 'm');
      } catch {
        // Invalid pattern — fall back to default
      }
    }
    return DEFAULT_PROMPT_PATTERN;
  }
}
