import React from 'react';
import type { SessionTemplate } from '../../shared/types';
import { usePreferences } from '../state/preferences';

interface ManageTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageTemplatesModal({ isOpen, onClose }: ManageTemplatesModalProps): React.ReactElement | null {
  const { prefs, updatePrefs } = usePreferences();
  const { uiColors } = prefs;
  const templates = prefs.sessionTemplates ?? [];

  if (!isOpen) return null;

  const update = (next: SessionTemplate[]) => updatePrefs({ sessionTemplates: next });

  const editField = (id: string, field: keyof SessionTemplate, value: string) => {
    update(templates.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const remove = (id: string) => {
    update(templates.filter((t) => t.id !== id));
  };

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px',
    backgroundColor: uiColors.inputBg,
    color: uiColors.inputText,
    border: `1px solid ${uiColors.inputBorder}`,
    borderRadius: 4,
    fontSize: 12,
    outline: 'none',
  };

  return (
    <div
      data-testid="manage-templates-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: uiColors.modalOverlayBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <div
        data-testid="manage-templates-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: uiColors.modalBg,
          border: `1px solid ${uiColors.modalBorder}`,
          borderRadius: 8,
          padding: 24,
          width: 520,
          maxWidth: '92vw',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: uiColors.modalText, marginBottom: 16 }}>
          Manage Templates
        </h2>

        {templates.length === 0 ? (
          <div data-testid="templates-empty" style={{ fontSize: 13, color: uiColors.appTextFaint, marginBottom: 16 }}>
            No templates yet. Create one from the New Session dialog with “Save as template”.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {templates.map((t) => (
              <div
                key={t.id}
                data-testid={`template-row-${t.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr auto',
                  gap: 6,
                  alignItems: 'center',
                  paddingBottom: 8,
                  borderBottom: `1px solid ${uiColors.modalBorder}`,
                }}
              >
                <input
                  aria-label="name"
                  value={t.name}
                  placeholder="(unnamed)"
                  onChange={(e) => editField(t.id, 'name', e.target.value)}
                  style={inputStyle}
                />
                <input
                  aria-label="cwd"
                  value={t.cwd}
                  placeholder="cwd"
                  onChange={(e) => editField(t.id, 'cwd', e.target.value)}
                  style={inputStyle}
                />
                <input
                  aria-label="command"
                  value={t.command ?? ''}
                  placeholder="command"
                  onChange={(e) => editField(t.id, 'command', e.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  data-testid={`delete-template-${t.id}`}
                  onClick={() => remove(t.id)}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: 'transparent',
                    color: uiColors.errorText,
                    border: `1px solid ${uiColors.buttonBorder}`,
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: uiColors.buttonPrimaryBg,
              color: uiColors.buttonPrimaryText,
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
