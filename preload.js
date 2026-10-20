const { contextBridge, ipcRenderer } = require('electron');

// Utilisé par les fenêtres transparentes (la traînée)
contextBridge.exposeInMainWorld('cursorBridge', {
  onCursor: (callback) => ipcRenderer.on('cursor', (_event, point) => callback(point)),
  onSettings: (callback) => ipcRenderer.on('settings', (_event, settings) => callback(settings))
});

// Utilisé par la fenêtre de réglages
contextBridge.exposeInMainWorld('settingsBridge', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (partial) => ipcRenderer.invoke('settings:set', partial),
  reset: () => ipcRenderer.invoke('settings:reset')
});
