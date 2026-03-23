import React, { useState } from 'react';
import type { SessionInfo } from '../../shared/types';

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: (session: SessionInfo) => void;
}

export default function NewSessionModal({ isOpen, onClose, onSessionCreated }: NewSessionModalProps): React.ReactElement | null {
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('');
  const [command, setCommand] = useState('claude');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    if (!cwd.trim()) {
      setError('Working directory is required');
      return;
    }

    setSubmitting(true);
    try {
      const session = await window.switchboard.pty.spawn({
        name: name.trim(),
        cwd: cwd.trim(),
        command: command.trim() || undefined,
      });
      onSessionCreated(session);
      // Reset form
      setName('');
      setCwd('');
      setCommand('claude');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#a6adc8',
    marginBottom: 4,
  };

  return (
    <div
      data-testid="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        data-testid="new-session-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1e1e2e',
          border: '1px solid #313244',
          borderRadius: 8,
          padding: 24,
          width: 400,
          maxWidth: '90vw',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#cdd6f4', marginBottom: 20 }}>
          New Session
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Project Name</label>
            <input
              data-testid="input-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Working Directory</label>
            <input
              data-testid="input-cwd"
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/home/user/projects/my-project"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Command (optional)</label>
            <input
              data-testid="input-command"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="claude"
              style={inputStyle}
            />
          </div>
          {error && (
            <div data-testid="modal-error" style={{ color: '#f38ba8', fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#a6adc8',
                border: '1px solid #45475a',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="submit-session"
              style={{
                padding: '8px 16px',
                backgroundColor: '#89b4fa',
                color: '#1e1e2e',
                border: 'none',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
