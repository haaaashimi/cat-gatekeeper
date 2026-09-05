const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Timer controls
  getTimerStatus: () => ipcRenderer.invoke('get-timer-status'),
  pauseTimer: () => ipcRenderer.send('pause-timer'),
  resumeTimer: () => ipcRenderer.send('resume-timer'),
  resetTimer: () => ipcRenderer.send('reset-timer'),

  // Break actions
  dismissBreak: () => ipcRenderer.send('dismiss-break'),
  snoozeBreak: () => ipcRenderer.send('snooze-break'),

  // File dialogs
  selectVideo: () => ipcRenderer.invoke('select-video'),

  // Resource paths
  getResourcePath: (resource) => ipcRenderer.invoke('get-resource-path', resource),

  // App updates (electron-updater)
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdaterState: () => ipcRenderer.invoke('get-updater-state'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),

  onUpdaterEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('updater-event', handler);
    return () => ipcRenderer.removeListener('updater-event', handler);
  },

  // Event listeners - returned cleanup function
  onTimerTick: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('timer-tick', handler);
    return () => ipcRenderer.removeListener('timer-tick', handler);
  },

  onBreakStart: (callback) => {
    const handler = (_event, duration) => callback(duration);
    ipcRenderer.on('break-start', handler);
    return () => ipcRenderer.removeListener('break-start', handler);
  },

  onBreakEnd: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('break-end', handler);
    return () => ipcRenderer.removeListener('break-end', handler);
  },

  onSettingsChanged: (callback) => {
    const handler = (_event, settings) => callback(settings);
    ipcRenderer.on('settings-changed', handler);
    return () => ipcRenderer.removeListener('settings-changed', handler);
  }
});
