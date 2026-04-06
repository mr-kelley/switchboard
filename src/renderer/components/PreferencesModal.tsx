import React, { useState, useEffect, useCallback } from 'react';
import { usePreferences } from '../state/preferences';
import { THEME_PRESETS } from '../../shared/themes';
import { DEFAULT_SHORTCUTS } from '../hooks/useKeyboardShortcuts';

function parseConnectionString(connStr: string): { host: string; port: number; token: string; fingerprint: string } | null {
  try {
    // switchboard://host:port?token=xxx&fingerprint=yyy
    const cleaned = connStr.trim().replace('switchboard://', 'https://');
    const url = new URL(cleaned);
    const host = url.hostname;
    const port = parseInt(url.port, 10);
    const token = url.searchParams.get('token') || '';
    const fingerprint = url.searchParams.get('fingerprint') || '';
    if (!host || !port || !token) return null;
    return { host, port, token, fingerprint };
  } catch {
    return null;
  }
}

interface DaemonStatus {
  id: string;
  name: string;
  status: string;
  sessionCount: number;
}

function DaemonSection({ uiColors, inputStyle, labelStyle }: {
  uiColors: Record<string, string>;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}): React.ReactElement {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3717');
  const [pairingCode, setPairingCode] = useState('');
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'code'>('idle');
  const [error, setError] = useState('');
  const [statuses, setStatuses] = useState<DaemonStatus[]>([]);

  const refreshStatuses = useCallback(async () => {
    try {
      const s = await window.switchboard.daemon.statuses();
      setStatuses(s);
    } catch {
      // Daemon API may not be available
    }
  }, []);

  useEffect(() => {
    refreshStatuses();
    const interval = setInterval(refreshStatuses, 3000);
    return () => clearInterval(interval);
  }, [refreshStatuses]);

  useEffect(() => {
    const unsubChallenge = window.switchboard.daemon.onPairChallenge(() => {
      setPhase('code');
    });
    const unsubSuccess = window.switchboard.daemon.onPairSuccess(() => {
      setPhase('idle');
      setHost('');
      setPort('3717');
      setPairingCode('');
      setError('');
      refreshStatuses();
    });
    const unsubFailed = window.switchboard.daemon.onPairFailed((reason: string) => {
      setPhase('idle');
      setError(`Pairing failed: ${reason}`);
    });
    return () => { unsubChallenge(); unsubSuccess(); unsubFailed(); };
  }, [refreshStatuses]);

  const handlePair = async () => {
    setError('');
    if (!host.trim()) {
      setError('Host is required');
      return;
    }
    const portNum = parseInt(port, 10);
    if (!portNum || portNum < 1 || portNum > 65535) {
      setError('Invalid port');
      return;
    }
    setPhase('waiting');
    try {
      await window.switchboard.daemon.pair(host.trim(), portNum, 'Switchboard Client');
    } catch (err) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  };

  const handleSubmitCode = () => {
    if (!pairingCode.trim()) {
      setError('Enter the 6-digit code from the daemon console');
      return;
    }
    window.switchboard.daemon.submitCode(pairingCode.trim());
    setPairingCode('');
  };

  const handleDisconnect = async (daemonId: string) => {
    await window.switchboard.daemon.disconnect(daemonId);
    refreshStatuses();
  };

  const handleConnect = async (daemonId: string) => {
    await window.switchboard.daemon.connect(daemonId);
    refreshStatuses();
  };

  const handleRemove = async (daemonId: string) => {
    await window.switchboard.daemon.remove(daemonId);
    refreshStatuses();
  };

  const statusColor = (status: string) => {
    if (status === 'connected') return uiColors.statusWorking;
    if (status === 'reconnecting' || status === 'connecting' || status === 'authenticating') return uiColors.statusIdle;
    return uiColors.statusDefault;
  };

  const btnStyle: React.CSSProperties = {
    padding: '2px 8px', fontSize: 11, backgroundColor: 'transparent',
    border: `1px solid ${uiColors.inputBorder}`, borderRadius: 3, cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: uiColors.appTextMuted, marginBottom: 12 }}>
        Connect to Switchboard daemons running on this machine or remote hosts.
      </div>

      {statuses.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Daemons</label>
          {statuses.map((d) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', marginBottom: 4,
              backgroundColor: uiColors.inputBg, borderRadius: 4,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: statusColor(d.status), flexShrink: 0,
              }} />
              <span style={{ flex: 1, fontSize: 13, color: uiColors.appText }}>{d.name}</span>
              <span style={{ fontSize: 11, color: uiColors.appTextMuted }}>{d.status} ({d.sessionCount} sessions)</span>
              {d.status === 'connected' ? (
                <button onClick={() => handleDisconnect(d.id)} style={{ ...btnStyle, color: uiColors.appTextMuted }}>Disconnect</button>
              ) : d.status === 'disconnected' ? (
                <>
                  <button onClick={() => handleConnect(d.id)} style={{ ...btnStyle, color: uiColors.appTextMuted }}>Connect</button>
                  <button onClick={() => handleRemove(d.id)} style={{ ...btnStyle, color: uiColors.errorText, borderColor: uiColors.errorText }}>Remove</button>
                </>
              ) : (
                <span style={{ fontSize: 11, color: uiColors.appTextFaint }}>...</span>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'idle' && (
        <>
          <label style={labelStyle}>Add Daemon</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="hostname or IP"
                style={inputStyle}
              />
            </div>
            <div style={{ width: 80 }}>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="3717"
                style={inputStyle}
              />
            </div>
          </div>
          <button
            onClick={handlePair}
            style={{
              padding: '6px 14px', backgroundColor: uiColors.buttonPrimaryBg,
              color: uiColors.buttonPrimaryText, border: 'none', borderRadius: 4,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Pair
          </button>
        </>
      )}

      {phase === 'waiting' && (
        <div style={{ fontSize: 13, color: uiColors.appTextMuted }}>
          Connecting to {host}:{port}...
        </div>
      )}

      {phase === 'code' && (
        <>
          <label style={labelStyle}>Pairing Code</label>
          <div style={{ fontSize: 12, color: uiColors.appTextMuted, marginBottom: 8 }}>
            A 6-digit code is displayed on the daemon's console. Enter it below.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              autoFocus
              style={{ ...inputStyle, width: 120, fontFamily: 'monospace', fontSize: 18, textAlign: 'center', letterSpacing: '0.2em' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitCode(); }}
            />
            <button
              onClick={handleSubmitCode}
              style={{
                padding: '6px 14px', backgroundColor: uiColors.buttonPrimaryBg,
                color: uiColors.buttonPrimaryText, border: 'none', borderRadius: 4,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Submit
            </button>
          </div>
        </>
      )}

      {error && (
        <div style={{ color: uiColors.errorText, fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Section = 'theme' | 'font' | 'backgrounds' | 'shortcuts' | 'terminal' | 'daemons';

export default function PreferencesModal({ isOpen, onClose }: PreferencesModalProps): React.ReactElement | null {
  const { prefs, updatePrefs, resetPrefs } = usePreferences();
  const { uiColors } = prefs;
  const [activeSection, setActiveSection] = useState<Section>('theme');

  if (!isOpen) return null;

  const sections: { key: Section; label: string }[] = [
    { key: 'theme', label: 'Theme' },
    { key: 'font', label: 'Font' },
    { key: 'backgrounds', label: 'Backgrounds' },
    { key: 'shortcuts', label: 'Shortcuts' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'daemons', label: 'Daemons' },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: uiColors.inputBg,
    color: uiColors.inputText,
    border: `1px solid ${uiColors.inputBorder}`,
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: uiColors.appTextMuted,
    marginBottom: 4,
  };

  const handleThemeChange = (themeName: string) => {
    const preset = THEME_PRESETS[themeName];
    if (preset) {
      updatePrefs({
        themeName,
        terminalColors: { ...preset.terminal },
        uiColors: { ...preset.ui },
      });
    }
  };

  const handleReset = () => {
    resetPrefs();
  };

  return (
    <div
      data-testid="prefs-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: uiColors.modalOverlayBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        data-testid="preferences-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: uiColors.modalBg,
          border: `1px solid ${uiColors.modalBorder}`,
          borderRadius: 8,
          width: 600,
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${uiColors.modalBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: uiColors.modalText, margin: 0 }}>
            Preferences
          </h2>
          <button
            data-testid="prefs-close-button"
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: uiColors.appTextMuted,
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            &#10005;
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Section nav */}
          <div style={{
            width: 140,
            padding: '12px 8px',
            borderRight: `1px solid ${uiColors.modalBorder}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            {sections.map((s) => (
              <button
                key={s.key}
                data-testid={`prefs-tab-${s.key}`}
                onClick={() => setActiveSection(s.key)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: activeSection === s.key ? uiColors.tabActiveBg : 'transparent',
                  color: activeSection === s.key ? uiColors.tabActiveText : uiColors.tabInactiveText,
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Section content */}
          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
            {activeSection === 'theme' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Theme Preset</label>
                  <select
                    data-testid="theme-select"
                    value={prefs.themeName}
                    onChange={(e) => handleThemeChange(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'font' && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Terminal Font Family</label>
                  <input
                    type="text"
                    value={prefs.terminalFontFamily}
                    onChange={(e) => updatePrefs({ terminalFontFamily: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Terminal Font Size</label>
                  <input
                    type="number"
                    min={8}
                    max={32}
                    value={prefs.terminalFontSize}
                    onChange={(e) => updatePrefs({ terminalFontSize: Math.min(32, Math.max(8, parseInt(e.target.value) || 14)) })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Terminal Line Height</label>
                  <input
                    type="number"
                    min={1.0}
                    max={2.0}
                    step={0.1}
                    value={prefs.terminalLineHeight}
                    onChange={(e) => updatePrefs({ terminalLineHeight: Math.min(2.0, Math.max(1.0, parseFloat(e.target.value) || 1.2)) })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>UI Font Family</label>
                  <input
                    type="text"
                    value={prefs.uiFontFamily}
                    onChange={(e) => updatePrefs({ uiFontFamily: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>UI Font Size</label>
                  <input
                    type="number"
                    min={10}
                    max={24}
                    value={prefs.uiFontSize}
                    onChange={(e) => updatePrefs({ uiFontSize: Math.min(24, Math.max(10, parseInt(e.target.value) || 13)) })}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {activeSection === 'backgrounds' && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Terminal Background Image</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={prefs.terminalBackgroundImage || ''}
                      onChange={(e) => updatePrefs({ terminalBackgroundImage: e.target.value || null })}
                      placeholder="/path/to/image.png"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={async () => {
                        const path = await window.switchboard.dialog.openFile();
                        if (path) updatePrefs({ terminalBackgroundImage: path });
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: uiColors.buttonBg,
                        color: uiColors.buttonText,
                        border: `1px solid ${uiColors.buttonBorder}`,
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Browse...
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Terminal Background Opacity ({prefs.terminalBackgroundOpacity.toFixed(1)})</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={prefs.terminalBackgroundOpacity}
                    onChange={(e) => updatePrefs({ terminalBackgroundOpacity: parseFloat(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Sidebar Background Image</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={prefs.sidebarBackgroundImage || ''}
                      onChange={(e) => updatePrefs({ sidebarBackgroundImage: e.target.value || null })}
                      placeholder="/path/to/image.png"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={async () => {
                        const path = await window.switchboard.dialog.openFile();
                        if (path) updatePrefs({ sidebarBackgroundImage: path });
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: uiColors.buttonBg,
                        color: uiColors.buttonText,
                        border: `1px solid ${uiColors.buttonBorder}`,
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Browse...
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'shortcuts' && (
              <div>
                <div style={{ fontSize: 12, color: uiColors.appTextMuted, marginBottom: 12 }}>
                  Current keyboard shortcut bindings. Edit via preferences.json for custom mappings.
                </div>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${uiColors.inputBorder}` }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: uiColors.appTextMuted }}>Action</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: uiColors.appTextMuted }}>Shortcut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries({ ...DEFAULT_SHORTCUTS, ...prefs.shortcuts }).map(([action, shortcut]) => (
                      <tr key={action} style={{ borderBottom: `1px solid ${uiColors.inputBorder}` }}>
                        <td style={{ padding: '6px 8px', color: uiColors.appText }}>{action}</td>
                        <td style={{ padding: '6px 8px', color: uiColors.appTextMuted, fontFamily: 'monospace' }}>{shortcut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSection === 'terminal' && prefs.customCssPath !== undefined && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Custom CSS Path</label>
                <input
                  type="text"
                  value={prefs.customCssPath || ''}
                  onChange={(e) => updatePrefs({ customCssPath: e.target.value || null })}
                  placeholder="/path/to/custom.css"
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: uiColors.appTextFaint, marginTop: 4 }}>
                  Load a custom CSS file for advanced visual customization.
                </div>
              </div>
            )}

            {activeSection === 'terminal' && (
              <div>
                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={prefs.cursorBlink}
                    onChange={(e) => updatePrefs({ cursorBlink: e.target.checked })}
                    id="cursor-blink"
                  />
                  <label htmlFor="cursor-blink" style={{ fontSize: 13, color: uiColors.appText }}>Cursor Blink</label>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Scrollback Lines</label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={prefs.scrollbackLines}
                    onChange={(e) => updatePrefs({ scrollbackLines: Math.min(100000, Math.max(0, parseInt(e.target.value) || 5000)) })}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {activeSection === 'daemons' && (
              <DaemonSection uiColors={uiColors} inputStyle={inputStyle} labelStyle={labelStyle} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${uiColors.modalBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            data-testid="prefs-reset-button"
            onClick={handleReset}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              color: uiColors.errorText,
              border: `1px solid ${uiColors.errorText}`,
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: uiColors.buttonPrimaryBg,
              color: uiColors.buttonPrimaryText,
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
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
