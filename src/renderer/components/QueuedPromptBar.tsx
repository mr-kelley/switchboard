import React, { useState, useEffect, useRef } from 'react';
import { usePreferences } from '../state/preferences';
import { useQueuedPrompts } from '../state/queued-prompts';

interface QueuedPromptBarProps {
  sessionId: string;
  onClose: () => void;
}

export default function QueuedPromptBar({ sessionId, onClose }: QueuedPromptBarProps): React.ReactElement {
  const { prefs } = usePreferences();
  const { state, queue, clear, clearRejection } = useQueuedPrompts();
  const queuedText = state.queued[sessionId] || null;
  const hasRejection =
    state.lastRejection !== null && state.lastRejection.sessionId === sessionId;
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!queuedText) inputRef.current?.focus();
  }, [queuedText]);

  useEffect(() => {
    // Clear any stale rejection when the bar opens
    if (hasRejection) {
      const t = setTimeout(() => clearRejection(), 4000);
      return () => clearTimeout(t);
    }
  }, [hasRejection, clearRejection]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    queue(sessionId, trimmed);
    setText('');
    onClose();
  };

  const handleClear = () => {
    clear(sessionId);
  };

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    gap: 4,
    backgroundColor: prefs.uiColors.inputBg,
    borderTop: `1px solid ${prefs.uiColors.inputBorder}`,
    padding: '6px 12px',
    alignItems: 'center',
  };

  return (
    <div
      data-testid={`queued-prompt-bar-${sessionId}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={containerStyle}
    >
      <span style={{ fontSize: 12, color: prefs.uiColors.appTextFaint, paddingRight: 8 }}>
        Queue:
      </span>
      {queuedText ? (
        <>
          <span
            data-testid={`queued-prompt-display-${sessionId}`}
            style={{
              flex: 1,
              fontFamily: prefs.terminalFontFamily,
              fontSize: 13,
              color: prefs.uiColors.inputText,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={queuedText}
          >
            {queuedText}
          </span>
          <button
            data-testid={`queued-prompt-clear-${sessionId}`}
            onClick={handleClear}
            style={{
              backgroundColor: 'transparent',
              color: prefs.uiColors.appTextMuted,
              border: `1px solid ${prefs.uiColors.buttonBorder}`,
              borderRadius: 3,
              padding: '3px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            data-testid={`queued-prompt-input-${sessionId}`}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Queue a prompt to send when ready…"
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: prefs.uiColors.inputText,
              fontSize: 13,
              outline: 'none',
              fontFamily: prefs.terminalFontFamily,
            }}
          />
          <button
            data-testid={`queued-prompt-submit-${sessionId}`}
            onClick={submit}
            style={{
              backgroundColor: prefs.uiColors.buttonPrimaryBg,
              color: prefs.uiColors.buttonPrimaryText,
              border: 'none',
              borderRadius: 3,
              padding: '3px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Queue
          </button>
        </>
      )}
      {hasRejection && state.lastRejection && (
        <span
          data-testid={`queued-prompt-error-${sessionId}`}
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: prefs.uiColors.errorText,
          }}
        >
          {state.lastRejection.reason}
        </span>
      )}
    </div>
  );
}
