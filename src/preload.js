const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectImages: () => ipcRenderer.invoke('select-images'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readImagesFromFolder: (folderPath) => ipcRenderer.invoke('read-images-from-folder', folderPath),
  readImageAsDataUrl: (filePath) => ipcRenderer.invoke('read-image-as-data-url', filePath),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  writeFile: (opts) => ipcRenderer.invoke('write-file', opts),

  onMenuImportImages: (cb) => ipcRenderer.on('menu-import-images', cb),
  onMenuExportPdf: (cb) => ipcRenderer.on('menu-export-pdf', cb),
  onMenuExportPng: (cb) => ipcRenderer.on('menu-export-png', cb),
  onMenuUndo: (cb) => ipcRenderer.on('menu-undo', cb),
  onMenuRedo: (cb) => ipcRenderer.on('menu-redo', cb),
  onMenuDelete: (cb) => ipcRenderer.on('menu-delete', cb),
  onMenuZoomIn: (cb) => ipcRenderer.on('menu-zoom-in', cb),
  onMenuZoomOut: (cb) => ipcRenderer.on('menu-zoom-out', cb),
  onMenuZoomReset: (cb) => ipcRenderer.on('menu-zoom-reset', cb),
});
