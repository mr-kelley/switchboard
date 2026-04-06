import * as fs from 'fs';
import * as path from 'path';

export interface SavedSession {
  name: string;
  cwd: string;
  command: string;
}

interface StoreData {
  sessions: SavedSession[];
}

export class SessionStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  load(): SavedSession[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data: StoreData = JSON.parse(raw);
      if (!Array.isArray(data.sessions)) {
        return [];
      }
      return data.sessions.filter(
        (s) => typeof s.name === 'string' && typeof s.cwd === 'string' && typeof s.command === 'string'
      );
    } catch {
      return [];
    }
  }

  save(sessions: SavedSession[]): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: StoreData = { sessions };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      console.warn('Failed to persist session metadata');
    }
  }
}
