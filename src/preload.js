const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  selectImages: () => ipcRenderer.invoke('select-images'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readImagesFromFolder: (folderPath) => ipcRenderer.invoke('read-images-from-folder', folderPath),
  readImageAsDataUrl: (filePath) => ipcRenderer.invoke('read-image-as-data-url', filePath),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  writeFile: (opts) => ipcRenderer.invoke('write-file', opts),

  // Draft operations
  saveDraftToFile: (opts) => ipcRenderer.invoke('save-draft-to-file', opts),
  loadDraftFromFile: () => ipcRenderer.invoke('load-draft-from-file'),

  // Menu events
  onMenuNewProject: (cb) => ipcRenderer.on('menu-new-project', cb),
  onMenuSaveDraft: (cb) => ipcRenderer.on('menu-save-draft', cb),
  onMenuLoadDraft: (cb) => ipcRenderer.on('menu-load-draft', cb),
  onMenuImportImages: (cb) => ipcRenderer.on('menu-import-images', cb),
  onMenuExportPdf: (cb) => ipcRenderer.on('menu-export-pdf', cb),
  onMenuExportPng: (cb) => ipcRenderer.on('menu-export-png', cb),
  onMenuUndo: (cb) => ipcRenderer.on('menu-undo', cb),
  onMenuRedo: (cb) => ipcRenderer.on('menu-redo', cb),
  onMenuDelete: (cb) => ipcRenderer.on('menu-delete', cb),
  onMenuSelectAll: (cb) => ipcRenderer.on('menu-select-all', cb),
  onMenuZoomIn: (cb) => ipcRenderer.on('menu-zoom-in', cb),
  onMenuZoomOut: (cb) => ipcRenderer.on('menu-zoom-out', cb),
  onMenuZoomReset: (cb) => ipcRenderer.on('menu-zoom-reset', cb),
});
