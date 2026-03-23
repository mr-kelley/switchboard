/** API exposed by the preload script via contextBridge. */
export interface SwitchboardAPI {
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    switchboard: SwitchboardAPI;
  }
}
