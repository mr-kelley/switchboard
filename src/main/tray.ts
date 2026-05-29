import { Tray, Menu, nativeImage, type NativeImage, type MenuItemConstructorOptions } from 'electron';
import type { ConnectionManager } from './connection-manager';
import { TRAY_ICONS } from './tray-icons';

export interface TrayDeps {
  connectionManager: ConnectionManager;
  showWindow: () => void;
  focusAttention: () => void;
  quit: () => void;
}

export interface TrayHandle {
  refresh: () => void;
  destroy: () => void;
}

/** Pure: which embedded icon variant represents a given attention total. */
export function iconKeyForCount(total: number): string {
  if (total <= 0) return 'base';
  if (total >= 10) return '9+';
  return String(total);
}

/** Pure: tray tooltip text for a given attention total. */
export function tooltipForCount(total: number): string {
  if (total <= 0) return 'Switchboard';
  const noun = total === 1 ? 'session' : 'sessions';
  const verb = total === 1 ? 'needs' : 'need';
  return `Switchboard — ${total} ${noun} ${verb} attention`;
}

const imageCache = new Map<string, NativeImage>();
function iconForCount(total: number): NativeImage {
  const key = iconKeyForCount(total);
  let img = imageCache.get(key);
  if (!img) {
    img = nativeImage.createFromDataURL(TRAY_ICONS[key] ?? TRAY_ICONS.base);
    imageCache.set(key, img);
  }
  return img;
}

/**
 * Create the system tray. Returns null (without throwing) when no tray host is
 * available so the caller can fall back to quit-on-close. See tray-spec.md.
 */
export function createTray(deps: TrayDeps): TrayHandle | null {
  let tray: Tray;
  try {
    tray = new Tray(iconForCount(0));
  } catch {
    return null;
  }

  const refresh = (): void => {
    const summary = deps.connectionManager.getAttentionSummary();
    tray.setImage(iconForCount(summary.total));
    tray.setToolTip(tooltipForCount(summary.total));

    const template: MenuItemConstructorOptions[] = [
      { label: 'Show Switchboard', click: () => deps.showWindow() },
      { type: 'separator' },
    ];
    for (const d of summary.perDaemon) {
      const noun = d.sessionCount === 1 ? 'session' : 'sessions';
      const suffix = d.status === 'connected' ? '' : ` (${d.status})`;
      template.push({
        label: `${d.name}${suffix} — ${d.sessionCount} ${noun}, ${d.attentionCount} need attention`,
        enabled: false,
      });
    }
    template.push({ type: 'separator' }, { label: 'Quit', click: () => deps.quit() });
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };

  tray.on('click', () => {
    deps.showWindow();
    deps.focusAttention();
  });

  const unsubscribe = deps.connectionManager.onAttentionChange(refresh);
  refresh();

  return {
    refresh,
    destroy: () => {
      unsubscribe();
      tray.destroy();
    },
  };
}
