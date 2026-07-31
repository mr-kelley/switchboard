import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDataHome: string;
let origAppImage: string | undefined;
let origXdg: string | undefined;

async function fresh() {
  // desktop-install has no per-call state; re-import to keep tests isolated.
  const mod = await import('../../src/main/desktop-install');
  return mod;
}

beforeEach(() => {
  origAppImage = process.env.APPIMAGE;
  origXdg = process.env.XDG_DATA_HOME;
  delete process.env.APPIMAGE;
  tmpDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-di-'));
  process.env.XDG_DATA_HOME = tmpDataHome;
});

afterEach(async () => {
  if (origAppImage === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = origAppImage;
  if (origXdg === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = origXdg;
  // desktop-install fires update-desktop-database / gtk-update-icon-cache in
  // the background; retry cleanup so those subprocesses' writes don't race us.
  for (let i = 0; i < 3; i++) {
    try {
      fs.rmSync(tmpDataHome, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

const desktopPath = () => path.join(tmpDataHome, 'applications', 'switchboard.desktop');
const iconPath = (size: string) => path.join(tmpDataHome, 'icons', 'hicolor', `${size}x${size}`, 'apps', 'switchboard.png');

describe('desktop-install.getStatus', () => {
  it('reports unsupported when APPIMAGE is unset', async () => {
    const { getStatus } = await fresh();
    const s = getStatus();
    expect(s.supported).toBe(false);
    expect(s.appImagePath).toBe(null);
    expect(s.installed).toBe(false);
  });

  it('reports supported=true and installed=false when APPIMAGE is set but no file exists', async () => {
    process.env.APPIMAGE = '/tmp/fake-switchboard.AppImage';
    const { getStatus } = await fresh();
    const s = getStatus();
    expect(s.supported).toBe(true);
    expect(s.appImagePath).toBe('/tmp/fake-switchboard.AppImage');
    expect(s.installed).toBe(false);
  });
});

describe('desktop-install.install', () => {
  it('is a no-op when APPIMAGE is unset', async () => {
    const { install } = await fresh();
    const r = await install();
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('not-running-under-appimage');
    expect(fs.existsSync(desktopPath())).toBe(false);
  });

  it('creates the .desktop entry and hicolor icons when APPIMAGE is set', async () => {
    process.env.APPIMAGE = '/tmp/fake-switchboard.AppImage';
    const { install } = await fresh();
    const r = await install();
    expect(r.changed).toBe(true);
    expect(fs.existsSync(desktopPath())).toBe(true);
    for (const size of ['16', '32', '48', '64', '128', '256', '512']) {
      expect(fs.existsSync(iconPath(size))).toBe(true);
    }
  });

  it('writes Exec= with --no-sandbox and the current APPIMAGE path', async () => {
    process.env.APPIMAGE = '/tmp/fake-switchboard.AppImage';
    const { install } = await fresh();
    await install();
    const contents = fs.readFileSync(desktopPath(), 'utf8');
    expect(contents).toContain('Exec=/tmp/fake-switchboard.AppImage --no-sandbox %U');
    expect(contents).toContain('StartupWMClass=Switchboard');
    expect(contents).toContain('Icon=switchboard');
  });

  it('is idempotent on the second call with the same APPIMAGE', async () => {
    process.env.APPIMAGE = '/tmp/fake-switchboard.AppImage';
    const { install } = await fresh();
    const r1 = await install();
    expect(r1.changed).toBe(true);
    const r2 = await install();
    expect(r2.changed).toBe(false);
    expect(r2.reason).toBe('up-to-date');
  });

  it('rewrites the .desktop when APPIMAGE path changes', async () => {
    process.env.APPIMAGE = '/tmp/old.AppImage';
    const { install } = await fresh();
    await install();
    let contents = fs.readFileSync(desktopPath(), 'utf8');
    expect(contents).toContain('/tmp/old.AppImage');

    process.env.APPIMAGE = '/tmp/new.AppImage';
    const r = await install();
    expect(r.changed).toBe(true);
    contents = fs.readFileSync(desktopPath(), 'utf8');
    expect(contents).toContain('/tmp/new.AppImage');
    expect(contents).not.toContain('/tmp/old.AppImage');
  });
});

describe('desktop-install.uninstall', () => {
  it('returns removed=false when nothing is installed', async () => {
    const { uninstall } = await fresh();
    const r = await uninstall();
    expect(r.removed).toBe(false);
  });

  it('removes the .desktop entry and all icons', async () => {
    process.env.APPIMAGE = '/tmp/fake-switchboard.AppImage';
    const { install, uninstall } = await fresh();
    await install();
    expect(fs.existsSync(desktopPath())).toBe(true);
    const r = await uninstall();
    expect(r.removed).toBe(true);
    expect(fs.existsSync(desktopPath())).toBe(false);
    for (const size of ['16', '32', '48', '64', '128', '256', '512']) {
      expect(fs.existsSync(iconPath(size))).toBe(false);
    }
  });

  it('second uninstall reports nothing to remove', async () => {
    process.env.APPIMAGE = '/tmp/fake-switchboard.AppImage';
    const { install, uninstall } = await fresh();
    await install();
    await uninstall();
    const r = await uninstall();
    expect(r.removed).toBe(false);
  });
});
