const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notebook', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  saveProjectAs: (data) => ipcRenderer.invoke('project:save-as', data),
  autosave: (data) => ipcRenderer.invoke('project:autosave', data),
  autosaveSync: (data) => ipcRenderer.send('project:autosave-sync', data),
  restore: () => ipcRenderer.invoke('project:restore'),
  exportImage: (data, extension) => ipcRenderer.invoke('project:export-image', data, extension),
  onMenu: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  windowAction: (action) => ipcRenderer.send('window:action', action),
});
