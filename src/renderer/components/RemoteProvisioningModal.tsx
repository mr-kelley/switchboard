import React, { useEffect, useState } from 'react';
import { usePreferences } from '../state/preferences';
import type {
  RemoteProvisionStepState,
  RemoteProvisionStepId,
} from '../../shared/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'form' | 'running' | 'success' | 'failed';

const STATUS_GLYPH: Record<RemoteProvisionStepState['status'], string> = {
  pending: '○',
  active: '●',
  done: '✓',
  failed: '✗',
};

export default function RemoteProvisioningModal({ isOpen, onClose }: Props): React.ReactElement | null {
  const { prefs } = usePreferences();
  const { uiColors } = prefs;
  const [phase, setPhase] = useState<Phase>('form');
  const [host, setHost] = useState('');
  const [user, setUser] = useState('');
  const [port, setPort] = useState('22');
  const [identityFile, setIdentityFile] = useState('');
  const [daemonName, setDaemonName] = useState('');
  const [serverCertPath, setServerCertPath] = useState('');
  const [serverKeyPath, setServerKeyPath] = useState('');
  const [caCertPath, setCaCertPath] = useState('');
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<RemoteProvisionStepState[]>([]);

  // Subscribe to progress updates whenever the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const unsub = (window as any).switchboard.remoteProvision.onProgress(
      (state: RemoteProvisionStepState[]) => setSteps(state),
    );
    return unsub;
  }, [isOpen]);

  // Reset form state when the modal opens fresh.
  useEffect(() => {
    if (!isOpen) return;
    setPhase('form');
    setError('');
    setSteps([]);
  }, [isOpen]);

  if (!isOpen) return null;

  const startProvision = async (retryStep?: RemoteProvisionStepId): Promise<void> => {
    setPhase('running');
    setError('');
    try {
      if (retryStep) {
        await (window as any).switchboard.remoteProvision.retryFrom(retryStep);
      } else {
        await (window as any).switchboard.remoteProvision.start({
          target: {
            host: host.trim(),
            user: user.trim(),
            port: parseInt(port, 10) || 22,
            identityFile: identityFile.trim() || undefined,
          },
          daemonName: daemonName.trim() || undefined,
          daemonPort: 3717,
          certs: {
            serverCertPath: serverCertPath.trim(),
            serverKeyPath: serverKeyPath.trim(),
            caCertPath: caCertPath.trim(),
          },
        });
      }
      setPhase('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('failed');
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!host.trim() || !user.trim()) {
      setError('Host and user are required');
      return;
    }
    if (!serverCertPath.trim() || !serverKeyPath.trim() || !caCertPath.trim()) {
      setError('Server cert, server key, and CA cert paths are all required (lab-CA-issued for this target).');
      return;
    }
    void startProvision();
  };

  const handleCancel = async (): Promise<void> => {
    if (phase === 'running') {
      await (window as any).switchboard.remoteProvision.cancel();
    }
    onClose();
  };

  const failedStep = steps.find((s) => s.status === 'failed');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px',
    backgroundColor: uiColors.inputBg, color: uiColors.inputText,
    border: `1px solid ${uiColors.inputBorder}`, borderRadius: 4,
    fontSize: 13, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: uiColors.appTextMuted, marginBottom: 4,
  };
  const btn: React.CSSProperties = {
    padding: '6px 14px', fontSize: 13,
    backgroundColor: 'transparent', border: `1px solid ${uiColors.inputBorder}`,
    borderRadius: 4, color: uiColors.appText, cursor: 'pointer',
  };
  const primaryBtn: React.CSSProperties = {
    ...btn, backgroundColor: uiColors.buttonPrimaryBg,
    borderColor: uiColors.buttonPrimaryBg, color: uiColors.buttonPrimaryText,
  };

  return (
    <div
      data-testid="modal-overlay"
      onClick={handleCancel}
      style={{
        position: 'fixed', inset: 0, backgroundColor: uiColors.modalOverlayBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        data-testid="remote-provisioning-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: uiColors.modalBg, border: `1px solid ${uiColors.modalBorder}`,
          borderRadius: 8, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: uiColors.modalText, marginBottom: 20 }}>
          Provision remote daemon
        </h2>

        {phase === 'form' && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Host</label>
              <input
                data-testid="input-host" value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="server.example.com or 10.0.0.5"
                style={inputStyle} autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>User</label>
                <input data-testid="input-user" value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="username" style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Port</label>
                <input data-testid="input-port" value={port}
                  onChange={(e) => setPort(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>SSH identity file (optional)</label>
              <input data-testid="input-identity" value={identityFile}
                onChange={(e) => setIdentityFile(e.target.value)}
                placeholder="defaults to your SSH agent (~/.ssh/id_ed25519)"
                style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Daemon name (optional)</label>
              <input data-testid="input-daemon-name" value={daemonName}
                onChange={(e) => setDaemonName(e.target.value)}
                placeholder="shown in sidebar; defaults to hostname"
                style={inputStyle} />
            </div>

            <div style={{ borderTop: `1px solid ${uiColors.inputBorder}`, paddingTop: 14, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: uiColors.appTextMuted, marginBottom: 10, lineHeight: 1.5 }}>
                Lab-CA-issued TLS bundle for the target. Cert must carry the target's FQDN in SAN.
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Server cert path</label>
                <input data-testid="input-server-cert" value={serverCertPath}
                  onChange={(e) => setServerCertPath(e.target.value)}
                  placeholder="/path/to/server.crt" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Server key path</label>
                <input data-testid="input-server-key" value={serverKeyPath}
                  onChange={(e) => setServerKeyPath(e.target.value)}
                  placeholder="/path/to/server.key" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>CA cert path</label>
                <input data-testid="input-ca-cert" value={caCertPath}
                  onChange={(e) => setCaCertPath(e.target.value)}
                  placeholder="/path/to/ca.crt" style={inputStyle} />
              </div>
            </div>

            {error && (
              <div data-testid="modal-error" style={{ color: uiColors.errorText, fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={btn}>Cancel</button>
              <button type="submit" data-testid="submit-provision" style={primaryBtn}>Install</button>
            </div>
            <div style={{ fontSize: 11, color: uiColors.appTextMuted, marginTop: 14, lineHeight: 1.5 }}>
              Requires: SSH access, <code>systemd --user</code> on the target, and the three PEM files above (the daemon runtime is bundled in the tarball).
            </div>
          </form>
        )}

        {phase !== 'form' && (
          <>
            {steps.length === 0 && phase === 'running' && (
              <div style={{ color: uiColors.appTextMuted, fontSize: 13, marginBottom: 12 }}>
                Starting…
              </div>
            )}
            {error && (
              <div
                data-testid="modal-error"
                style={{
                  padding: '8px 10px', marginBottom: 12,
                  backgroundColor: uiColors.inputBg, borderRadius: 4,
                  color: uiColors.errorText, fontSize: 12, wordBreak: 'break-word',
                }}
              >
                {error}
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              {steps.map((s) => (
                <div key={s.id} data-testid={`step-${s.id}`} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '6px 0', fontSize: 13, color: uiColors.appText,
                }}>
                  <span style={{
                    fontFamily: 'monospace', width: 16, textAlign: 'center',
                    color: s.status === 'done' ? uiColors.buttonPrimaryBg :
                           s.status === 'failed' ? uiColors.errorText :
                           s.status === 'active' ? uiColors.buttonPrimaryBg :
                           uiColors.appTextMuted,
                  }}>{STATUS_GLYPH[s.status]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ opacity: s.status === 'pending' ? 0.5 : 1 }}>{s.label}</div>
                    {s.message && (
                      <div style={{ fontSize: 11, color: uiColors.appTextMuted, marginTop: 2 }}>
                        {s.message}
                      </div>
                    )}
                    {s.status === 'failed' && s.errorDetail && (
                      <div style={{ fontSize: 11, color: uiColors.errorText, marginTop: 2, wordBreak: 'break-word' }}>
                        {s.errorKind ? `[${s.errorKind}] ` : ''}{s.errorDetail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {phase === 'running' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleCancel} style={btn}>Cancel</button>
              </div>
            )}

            {phase === 'success' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 13, color: uiColors.buttonPrimaryBg, alignSelf: 'center' }}>
                  Daemon installed. It will appear in the sidebar once the mTLS handshake completes.
                </div>
                <button data-testid="done-button" onClick={onClose} style={primaryBtn}>Done</button>
              </div>
            )}

            {phase === 'failed' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {failedStep ? (
                  <button
                    data-testid="retry-button"
                    onClick={() => void startProvision(failedStep.id)}
                    style={primaryBtn}
                  >Retry from “{failedStep.label}”</button>
                ) : (
                  <button
                    data-testid="restart-button"
                    onClick={() => void startProvision()}
                    style={primaryBtn}
                  >Retry from start</button>
                )}
                <button onClick={onClose} style={btn}>Close</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
