import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { DESKTOP_ICONS } from './app-icon';

const APP_ID = 'switchboard';
const ICON_SIZES = Object.keys(DESKTOP_ICONS);

export interface DesktopIntegrationStatus {
  /** true when running inside an AppImage ($APPIMAGE set) */
  supported: boolean;
  /** true when a .desktop file already exists at desktopPath */
  installed: boolean;
  /** absolute path of the AppImage on disk, if supported */
  appImagePath: string | null;
  /** canonical target path for the .desktop file */
  desktopPath: string;
}

export interface InstallResult {
  changed: boolean;
  reason: string;
}

export interface UninstallResult {
  removed: boolean;
}

function homeShare(...parts: string[]): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.local', 'share');
  return path.join(base, ...parts);
}

function desktopFilePath(): string {
  return homeShare('applications', `${APP_ID}.desktop`);
}

function iconFilePath(size: string): string {
  return homeShare('icons', 'hicolor', `${size}x${size}`, 'apps', `${APP_ID}.png`);
}

function appImagePath(): string | null {
  const p = process.env.APPIMAGE;
  return p && p.length > 0 ? p : null;
}

function buildDesktopFile(appImage: string): string {
  return [
    '[Desktop Entry]',
    'Name=Switchboard',
    `Exec=${appImage} --no-sandbox %U`,
    'Terminal=false',
    'Type=Application',
    `Icon=${APP_ID}`,
    'StartupWMClass=Switchboard',
    'Comment=A Slack-style multi-session terminal manager for AI coding workflows',
    'Categories=Development;',
    'Keywords=terminal;shell;pty;',
    'MimeType=x-scheme-handler/switchboard;',
    '',
  ].join('\n');
}

function readExec(desktopContent: string): string | null {
  const match = desktopContent.split('\n').find((l) => l.startsWith('Exec='));
  return match ? match.slice('Exec='.length) : null;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

function refreshCaches(): void {
  const opts = { timeout: 5000 };
  execFile('update-desktop-database', [homeShare('applications')], opts, () => {
    // best-effort; missing binary is fine (icons still take effect next login)
  });
  execFile('gtk-update-icon-cache', ['-f', '-t', homeShare('icons', 'hicolor')], opts, () => {
    // best-effort
  });
}

export function getStatus(): DesktopIntegrationStatus {
  const app = appImagePath();
  const dp = desktopFilePath();
  return {
    supported: app !== null,
    installed: fs.existsSync(dp),
    appImagePath: app,
    desktopPath: dp,
  };
}

/**
 * Install (or update) the .desktop entry and hicolor icons. Idempotent: when
 * the on-disk Exec= already points at the current $APPIMAGE, does nothing.
 * Returns `changed=false` on no-op, `changed=true` on write. Never throws —
 * failures are logged and reported via reason.
 */
export async function install(): Promise<InstallResult> {
  const app = appImagePath();
  if (!app) return { changed: false, reason: 'not-running-under-appimage' };

  const dp = desktopFilePath();
  const desired = `${app} --no-sandbox %U`;

  if (fs.existsSync(dp)) {
    try {
      const existing = fs.readFileSync(dp, 'utf8');
      if (readExec(existing) === desired) {
        return { changed: false, reason: 'up-to-date' };
      }
    } catch {
      // fall through and rewrite
    }
  }

  try {
    fs.mkdirSync(path.dirname(dp), { recursive: true });
    fs.writeFileSync(dp, buildDesktopFile(app), { mode: 0o644 });

    for (const size of ICON_SIZES) {
      const ip = iconFilePath(size);
      fs.mkdirSync(path.dirname(ip), { recursive: true });
      fs.writeFileSync(ip, decodeDataUrl(DESKTOP_ICONS[size]), { mode: 0o644 });
    }

    refreshCaches();
    return { changed: true, reason: fs.existsSync(dp) ? 'updated' : 'created' };
  } catch (err) {
    console.error('desktop-install: write failed:', err);
    return { changed: false, reason: `error: ${(err as Error).message}` };
  }
}

/**
 * Remove the .desktop entry and hicolor icons. Safe to call when nothing is
 * installed. Never throws.
 */
export async function uninstall(): Promise<UninstallResult> {
  let removed = false;
  const dp = desktopFilePath();
  try {
    if (fs.existsSync(dp)) {
      fs.unlinkSync(dp);
      removed = true;
    }
  } catch (err) {
    console.error('desktop-install: unlink .desktop failed:', err);
  }
  for (const size of ICON_SIZES) {
    const ip = iconFilePath(size);
    try {
      if (fs.existsSync(ip)) {
        fs.unlinkSync(ip);
        removed = true;
      }
    } catch (err) {
      console.error(`desktop-install: unlink icon ${size} failed:`, err);
    }
  }
  if (removed) refreshCaches();
  return { removed };
}
