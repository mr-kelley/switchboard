import React from 'react';

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
  } as React.CSSProperties,
  sidebar: {
    width: 220,
    minWidth: 220,
    backgroundColor: '#252536',
    borderRight: '1px solid #313244',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,
  sidebarHeader: {
    padding: '16px 14px 12px',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#a6adc8',
  } as React.CSSProperties,
  sidebarContent: {
    flex: 1,
    padding: '0 8px',
    fontSize: 13,
    color: '#6c7086',
  } as React.CSSProperties,
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    height: 44,
    minHeight: 44,
    backgroundColor: '#1e1e2e',
    borderBottom: '1px solid #313244',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
  } as React.CSSProperties,
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,
  newSessionButton: {
    backgroundColor: '#45475a',
    color: '#cdd6f4',
    border: 'none',
    borderRadius: 4,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'not-allowed',
    opacity: 0.5,
  } as React.CSSProperties,
  terminalArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6c7086',
    fontSize: 14,
  } as React.CSSProperties,
};

export default function App(): React.ReactElement {
  return (
    <div style={styles.container} data-testid="app-container">
      <div style={styles.sidebar} data-testid="sidebar">
        <div style={styles.sidebarHeader}>Sessions</div>
        <div style={styles.sidebarContent}>No sessions yet</div>
      </div>
      <div style={styles.main}>
        <div style={styles.header} data-testid="header">
          <span style={styles.headerTitle}>Switchboard</span>
          <button style={styles.newSessionButton} disabled>
            + New Session
          </button>
        </div>
        <div style={styles.terminalArea} data-testid="terminal-area">
          Terminal
        </div>
      </div>
    </div>
  );
}
