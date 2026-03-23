import React, { useEffect, useRef } from 'react';

interface MenuItem {
  label: string;
  action: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="context-menu"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: '#313244',
        border: '1px solid #45475a',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 160,
        zIndex: 2000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          data-testid={`context-menu-item-${i}`}
          onClick={() => {
            item.action();
            onClose();
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: '6px 14px',
            backgroundColor: 'transparent',
            color: '#cdd6f4',
            border: 'none',
            fontSize: 13,
            textAlign: 'left',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#45475a'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
