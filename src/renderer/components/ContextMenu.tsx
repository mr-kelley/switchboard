import React, { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../state/preferences';

export interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  submenu?: MenuItem[];
  checked?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const { prefs } = usePreferences();
  const { uiColors } = prefs;
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '6px 14px',
    backgroundColor: 'transparent',
    color: uiColors.contextMenuText,
    border: 'none',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const run = (item: MenuItem) => {
    item.action?.();
    onClose();
  };

  return (
    <div
      ref={ref}
      data-testid="context-menu"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: uiColors.contextMenuBg,
        border: `1px solid ${uiColors.contextMenuBorder}`,
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 160,
        zIndex: 2000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{ position: 'relative' }}
          onMouseEnter={() => setOpenSubmenu(item.submenu ? i : null)}
        >
          <button
            data-testid={`context-menu-item-${i}`}
            onClick={() => {
              if (item.submenu) return; // parent toggles via hover only
              run(item);
            }}
            style={itemStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = uiColors.contextMenuHoverBg; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <span>{item.label}</span>
            {item.submenu ? (
              <span style={{ color: uiColors.appTextFaint, fontSize: 11, marginLeft: 16 }}>▸</span>
            ) : item.shortcut ? (
              <span style={{ color: uiColors.appTextFaint, fontSize: 11, marginLeft: 16 }}>{item.shortcut}</span>
            ) : null}
          </button>
          {item.submenu && openSubmenu === i && (
            <div
              data-testid={`context-submenu-${i}`}
              style={{
                position: 'absolute',
                top: -5,
                left: '100%',
                backgroundColor: uiColors.contextMenuBg,
                border: `1px solid ${uiColors.contextMenuBorder}`,
                borderRadius: 6,
                padding: '4px 0',
                minWidth: 140,
                zIndex: 2001,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              {item.submenu.map((sub, j) => (
                <button
                  key={j}
                  data-testid={`context-menu-subitem-${i}-${j}`}
                  onClick={() => run(sub)}
                  style={itemStyle}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = uiColors.contextMenuHoverBg; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  <span>{sub.checked ? `✓ ${sub.label}` : sub.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
