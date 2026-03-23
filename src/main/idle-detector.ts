import type { SessionStatus } from './session-manager';

const DEFAULT_PROMPT_PATTERN = /^[>❯$#]\s*$/m;
const IDLE_TIMEOUT_MS = 10_000;
const MIN_ACTIVITY_MS = 2_000;

interface SessionTracking {
  status: SessionStatus;
  idleTimer: ReturnType<typeof setTimeout> | null;
  firstOutputTime: number | null; // When output started flowing in current burst
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

    // Record first output time for activity duration tracking
    if (tracking.firstOutputTime === null) {
      tracking.firstOutputTime = now;
    }
    tracking.lastOutputTime = now;

    // Reset idle timer
    if (tracking.idleTimer) {
      clearTimeout(tracking.idleTimer);
    }

    // Check for prompt pattern
    const activityDuration = now - tracking.firstOutputTime;
    if (activityDuration >= MIN_ACTIVITY_MS && this.promptPattern.test(data)) {
      this.setStatus(sessionId, tracking, 'needs-attention');
      return;
    }

    // If was idle or needs-attention, transition to working on new output
    if (tracking.status !== 'working') {
      this.setStatus(sessionId, tracking, 'working');
    }

    // Set idle timer
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

    // Reset activity tracking — new input means new work cycle
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
