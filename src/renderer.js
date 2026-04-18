}

function applyPageSize(sizeName) {
  const orientation = (document.getElementById('orientation-select') && document.getElementById('orientation-select').value) || 'portrait';
  const size = PAGE_SIZES[sizeName];
  if (!size) return;
  const dims = size[orientation] || size.portrait;
  applyCanvasSize(dims.w, dims.h, sizeName, null);
}

function applyCustomSize() {
  const w = parseInt(document.getElementById('page-custom-w')?.value) || 595;
  const h = parseInt(document.getElementById('page-custom-h')?.value) || 842;
  applyCanvasSize(w, h, 'custom', { w, h });
}

function applyCanvasSize(w, h, pageSize, customSize) {
  saveCurrentPage();
  fabricCanvas.clear();
  fabricCanvas.setWidth(w);
  fabricCanvas.setHeight(h);
  canvasEl.width = w;
  canvasEl.height = h;
  fabricCanvas.backgroundColor = (state.pages[state.currentPageIndex]?.bgColor) || '#ffffff';

  const page = state.pages[state.currentPageIndex];
  if (page && page.objects && page.objects.length > 0) {
    fabric.util.enlivenObjects(page.objects.map(o => JSON.parse(JSON.stringify(o))), (enlivened) => {
      enlivened.forEach(obj => { fabricCanvas.add(obj); });
      fabricCanvas.renderAll();
      renderCanvasToDOM();
    });
  } else {
    fabricCanvas.renderAll();
    renderCanvasToDOM();
  }

  if (state.pages[state.currentPageIndex]) {
    state.pages[state.currentPageIndex].pageSize = pageSize;
    state.pages[state.currentPageIndex].orientation = (document.getElementById('orientation-select') && document.getElementById('orientation-select').value) || 'portrait';
    state.pages[state.currentPageIndex].customSize = customSize;
    state.pages[state.currentPageIndex].bgColor = fabricCanvas.backgroundColor || '#ffffff';
  }

  applyZoom(state.zoom);
  renderPageThumbnails();
  saveState();
}

// ============================================
// Templates
// ============================================

function applyTemplate(templateName) {
  fabricCanvas.clear();
  const bgColor = state.pages[state.currentPageIndex]?.bgColor || '#ffffff';
  fabricCanvas.backgroundColor = bgColor;

  const W = fabricCanvas.width;
  const H = fabricCanvas.height;
  const PAD = W * 0.05;

  let zones = [];
  switch (templateName) {
    case '1-photo': zones = [{ x: PAD, y: PAD, w: W - PAD * 2, h: H - PAD * 2 }]; break;
    case '2-photo-v':
      zones = [
        { x: PAD, y: PAD, w: W - PAD * 2, h: (H - PAD * 3) / 2 },
        { x: PAD, y: PAD * 2 + (H - PAD * 3) / 2, w: W - PAD * 2, h: (H - PAD * 3) / 2 }
      ]; break;
    case '2-photo-h':
      zones = [
        { x: PAD, y: PAD, w: (W - PAD * 3) / 2, h: H - PAD * 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD, w: (W - PAD * 3) / 2, h: H - PAD * 2 }
      ]; break;
    case '3-photo':
      zones = [
        { x: PAD, y: PAD, w: (W - PAD * 3) / 2, h: H - PAD * 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD * 2 + (H - PAD * 3) / 2, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 }
      ]; break;
    case '4-photo':
      zones = [
        { x: PAD, y: PAD, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD, y: PAD * 2 + (H - PAD * 3) / 2, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD * 2 + (H - PAD * 3) / 2, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 }
      ]; break;
    case 'grid-3x3':
      const cellW = (W - PAD * 4) / 3;
      const cellH = (H - PAD * 4) / 3;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          zones.push({ x: PAD + col * (cellW + PAD), y: PAD + row * (cellH + PAD), w: cellW, h: cellH });
        }
      } break;
    default: return;
  }

  zones.forEach((zone, i) => {
    const rect = new fabric.Rect({
      left: zone.x, top: zone.y, width: zone.w, height: zone.h,
      fill: '#e8e8e8', stroke: '#bbbbbb', strokeWidth: 1, strokeDashArray: [5, 3],
      selectable: false, evented: false,
    });
    rect.isPlaceholder = true;
    rect.zoneIndex = i;
    rect.objectCaching = false;
    fabricCanvas.add(rect);

    const label = new fabric.Text(`区域 ${i + 1}\n双击缩略图添加`, {
      left: zone.x + zone.w / 2, top: zone.y + zone.h / 2,
      fontSize: Math.round(W * 0.018), fill: '#aaaaaa',
      originX: 'center', originY: 'center', textAlign: 'center',
      selectable: false, evented: false,
    });
    label.isPlaceholder = true;
    label.objectCaching = false;
    fabricCanvas.add(label);
  });

  fabricCanvas.renderAll();
  renderCanvasToDOM();
  scheduleSyncAndSave();
  updateStatus(`已应用模板: ${templateName}`);
}

// ============================================
// Toolbar Events
// ============================================

function setupToolbarEvents() {
  document.getElementById('btn-select').addEventListener('click', () => setTool('select'));
  document.getElementById('btn-text').addEventListener('click', () => { setTool('text'); addTextToCanvas(); });
  document.getElementById('btn-add-page').addEventListener('click', addPage);
  document.getElementById('btn-add-page-panel').addEventListener('click', addPage);
  document.getElementById('btn-delete-page').addEventListener('click', () => deletePage(state.currentPageIndex));
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('zoom-select').addEventListener('change', (e) => applyZoom(parseFloat(e.target.value)));
  document.getElementById('template-select').addEventListener('change', (e) => {
    if (e.target.value) { applyTemplate(e.target.value); e.target.value = ''; }
  });
  document.getElementById('btn-export-pdf').addEventListener('click', exportToPdf);
  document.getElementById('btn-export-png').addEventListener('click', () => exportCurrentPage('png'));
}

function setTool(tool) {
  state.currentTool = tool;
  document.getElementById('btn-select').classList.toggle('active', tool === 'select');
  document.getElementById('btn-text').classList.toggle('active', tool === 'text');
  if (fabricCanvas) {
    fabricCanvas.selection = tool === 'select';
    fabricCanvas.defaultCursor = tool === 'text' ? 'text' : 'default';
  }
}

// ============================================
// Zoom
// ============================================

function applyZoom(zoom) {
  state.zoom = zoom;
  const size = getCurrentPageSize();
  canvasEl.style.transform = 'scale(' + zoom + ')';
  canvasEl.style.transformOrigin = 'top left';
  canvasEl.style.width = (size.w * zoom) + 'px';
  canvasEl.style.height = (size.h * zoom) + 'px';
  wrapperEl.style.minWidth = Math.max(800, size.w * zoom + 80) + 'px';
  wrapperEl.style.minHeight = Math.max(600, size.h * zoom + 80) + 'px';
  renderCanvasToDOM();
}

// ============================================
// History (Undo/Redo)
// ============================================

function saveState() {
  saveCurrentPage();
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }
  const snapshot = JSON.stringify({
    pages: state.pages.map(function(p) {
      return {
        objects: p.objects,
        bgColor: p.bgColor,
        pageSize: p.pageSize,
        orientation: p.orientation,
        customSize: p.customSize,
      };
    }),
    currentPage: state.currentPageIndex,
  });
  state.history.push(snapshot);
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 50) {
    state.history = state.history.slice(-30);
    state.historyIndex = state.history.length - 1;
  }
}

function undo() {
  if (state.historyIndex <= 0) { updateStatus('没有可撤销的记录'); return; }
  state.historyIndex--;
  restoreState(JSON.parse(state.history[state.historyIndex]));
  updateStatus('撤销');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) { updateStatus('没有可重做的记录'); return; }
  state.historyIndex++;
  restoreState(JSON.parse(state.history[state.historyIndex]));
  updateStatus('重做');
}

function restoreState(snapshot) {
  state.pages = snapshot.pages;
  if (snapshot.currentPage !== state.currentPageIndex) {
    state.currentPageIndex = snapshot.currentPage;
  }
  switchToPage(state.currentPageIndex);
  renderPageThumbnails();
}

// ============================================
// Delete
// ============================================

function deleteSelectedObject() {
  const active = fabricCanvas.getActiveObject();
  if (!active) return;
  if (active.isPlaceholder) {
    fabricCanvas.remove(active);
    const others = fabricCanvas.getObjects().filter(function(o) { return o.isPlaceholder && o !== active; });
    others.forEach(function(o) { fabricCanvas.remove(o); });
  }
  fabricCanvas.remove(active);
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  renderCanvasToDOM();
  scheduleSyncAndSave();
  updateStatus('已删除');
}

// ============================================
// Library Events
// ============================================

function setupLibraryEvents() {
  var btnImportImages = document.getElementById('btn-import-images');
  if (btnImportImages) {
    btnImportImages.addEventListener('click', function() {
      window.electronAPI.selectImages().then(function(paths) {
        if (paths && paths.length) importImages(paths);
      });
    });
  }
  var btnImportFolder = document.getElementById('btn-import-folder');
  if (btnImportFolder) {
    btnImportFolder.addEventListener('click', function() {
      window.electronAPI.selectFolder().then(function(folder) {
        if (folder) {
          window.electronAPI.readImagesFromFolder(folder).then(function(paths) {
            if (paths && paths.length) importImages(paths);
          });
        }
      });
    });
  }

  var dropZone = document.getElementById('image-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      var files = Array.from(e.dataTransfer.files);
      var paths = files.map(function(f) { return f.path; }).filter(function(p) { return p; });
      if (paths.length) importImages(paths);
    });
  }
}

// ============================================
// Canvas Drop Events
// ============================================

function setupDragDropEvents() {
  if (canvasEl) {
    canvasEl.addEventListener('dblclick', function() {
      var img = state.selectedLibraryImage;
      if (img) addImageToCanvas(img.dataUrl);
    });
  }
}

// ============================================
// Keyboard Events
// ============================================

function setupKeyboardEvents() {
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelectedObject(); }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 'a') {
        e.preventDefault();
        fabricCanvas.discardActiveObject();
        var objs = fabricCanvas.getObjects().filter(function(o) { return !o.isPlaceholder; });
        if (objs.length > 0) {
          var sel = new fabric.ActiveSelection(objs, { canvas: fabricCanvas });
          fabricCanvas.setActiveObject(sel);
          fabricCanvas.renderAll();
        }
      }
    }
    if (e.key === 'v') setTool('select');
    if (e.key === 't') { setTool('text'); addTextToCanvas(); }
    if (e.key === '+' || e.key === '=') applyZoom(Math.min(4, state.zoom + 0.25));
    if (e.key === '-') applyZoom(Math.max(0.1, state.zoom - 0.25));
  });
}

// ============================================
// Menu Events
// ============================================

function setupMenuEvents() {
  window.electronAPI.onMenuImportImages(function() {
    window.electronAPI.selectImages().then(function(paths) {
      if (paths && paths.length) importImages(paths);
    });
  });
  window.electronAPI.onMenuExportPdf(function() { exportToPdf(); });
  window.electronAPI.onMenuExportPng(function() { exportCurrentPage('png'); });
  window.electronAPI.onMenuUndo(function() { undo(); });
  window.electronAPI.onMenuRedo(function() { redo(); });
  window.electronAPI.onMenuDelete(function() { deleteSelectedObject(); });
  window.electronAPI.onMenuZoomIn(function() { applyZoom(Math.min(4, state.zoom + 0.25)); });
  window.electronAPI.onMenuZoomOut(function() { applyZoom(Math.max(0.1, state.zoom - 0.25)); });
  window.electronAPI.onMenuZoomReset(function() { applyZoom(1); });
}

// ============================================
// Context Menu
// ============================================

var ctxMenuEl = null;

function setupContextMenu() {
  document.addEventListener('contextmenu', function(e) {
    if (e.target === canvasEl || (e.target && e.target.closest && e.target.closest('#canvas-area'))) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY);
    }
  });
  document.addEventListener('click', function() { hideContextMenu(); });
}

function showContextMenu(x, y) {
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'context-menu';
  ctxMenuEl.innerHTML = '<div class="context-menu-item" id="ctx-add-text">\u270d\ufe0f 添加文字</div>' +
    '<div class="context-menu-item" id="ctx-add-page">\U0001f4c4 添加页面</div>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-item" id="ctx-import">\U0001f4c2 导入图片</div>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-item" id="ctx-delete-page">\U0001f5d1 删除当前页</div>';
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = x + 'px';
  ctxMenuEl.style.top = y + 'px';

  var el;
  el = document.getElementById('ctx-add-text');
  if (el) el.addEventListener('click', function() { addTextToCanvas(); hideContextMenu(); });
  el = document.getElementById('ctx-add-page');
  if (el) el.addEventListener('click', function() { addPage(); hideContextMenu(); });
  el = document.getElementById('ctx-import');
  if (el) el.addEventListener('click', function() {
    window.electronAPI.selectImages().then(function(paths) {
      if (paths && paths.length) importImages(paths);
      hideContextMenu();
    });
  });
  el = document.getElementById('ctx-delete-page');
  if (el) el.addEventListener('click', function() { deletePage(state.currentPageIndex); hideContextMenu(); });
}

function hideContextMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}

function showPageContextMenu(e, pageIndex) {
  e.preventDefault();
  e.stopPropagation();
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'context-menu';
  var html = '<div class="context-menu-item" id="ctx-go-page">跳转到第 ' + (pageIndex + 1) + ' 页</div>';
  if (state.pages.length > 1) {
    html += '<div class="context-menu-item" id="ctx-del-page">\U0001f5d1 删除此页</div>';
  }
  ctxMenuEl.innerHTML = html;
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = e.clientX + 'px';
  ctxMenuEl.style.top = e.clientY + 'px';

  var el = document.getElementById('ctx-go-page');
  if (el) el.addEventListener('click', function() { switchToPage(pageIndex); hideContextMenu(); });
  el = document.getElementById('ctx-del-page');
  if (el) el.addEventListener('click', function() { deletePage(pageIndex); hideContextMenu(); });
}

// ============================================
// Export
// ============================================

async function exportToPdf() {
  if (!state.pages.length) return;
  showLoading('正在导出 PDF...');

  try {
    saveCurrentPage();
    var _a = window.jspdf, jsPDF = _a.jsPDF;
    var firstPage = state.pages[0];
    var W = getPageSize(firstPage).w;
    var H = getPageSize(firstPage).h;
    var isLandscape = W > H;
    var orientation = isLandscape ? 'landscape' : 'portrait';

    var pdfFormat = 'a4';
    if (Math.abs(W / H - 1) < 0.05) {
      pdfFormat = [Math.max(W, H) * 0.2646, Math.min(W, H) * 0.2646];
    }

    var pdf = new jsPDF({ orientation: orientation, unit: 'px', format: pdfFormat, hotfixes: ['px_scaling'] });

    for (var i = 0; i < state.pages.length; i++) {
      if (i > 0) pdf.addPage();

      var p = state.pages[i];
      var size = getPageSize(p);

      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = size.w;
      tempCanvas.height = size.h;
      var tempFC = new fabric.Canvas(tempCanvas, {
        width: size.w, height: size.h,
        backgroundColor: p.bgColor || '#ffffff',
      });

      if (p.objects && p.objects.length > 0) {
        await new Promise(function(resolve) {
          fabric.util.enlivenObjects(p.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }), function(enlivened) {
            enlivened.forEach(function(obj) { tempFC.add(obj); });
            tempFC.renderAll();
            resolve();
          });
        });
      } else {
        tempFC.renderAll();
      }

      var dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
      var pdfW = pdf.internal.pageSize.getWidth();
      var pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfW, pdfH);
      tempFC.dispose();
      updateStatus('导出中... ' + (i + 1) + '/' + state.pages.length);
    }

    var defaultName = 'PhotoBook_' + Date.now() + '.pdf';
    var savePath = await window.electronAPI.saveFile({
      defaultName: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (savePath) {
      var pdfData = pdf.output('arraybuffer');
      await window.electronAPI.writeFile({ filePath: savePath, data: pdfData, encoding: 'arraybuffer' });
      updateStatus('PDF 已导出: ' + savePath);
    }
  } catch (err) {
    console.error('PDF export error:', err);
    updateStatus('导出 PDF 失败: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function exportCurrentPage(format) {
  showLoading('正在导出...');
  try {
    saveCurrentPage();
    var page = state.pages[state.currentPageIndex];
    var size = getPageSize(page);

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = size.w;
    tempCanvas.height = size.h;
    var tempFC = new fabric.Canvas(tempCanvas, {
      width: size.w, height: size.h,
      backgroundColor: page.bgColor || '#ffffff',
    });

    if (page.objects && page.objects.length > 0) {
      await new Promise(function(resolve) {
        fabric.util.enlivenObjects(page.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }), function(enlivened) {
          enlivened.forEach(function(obj) { tempFC.add(obj); });
          tempFC.renderAll();
          resolve();
        });
      });
    } else {
      tempFC.renderAll();
    }

    var defaultName = 'PhotoBook_Page' + (state.currentPageIndex + 1) + '_' + Date.now() + '.' + format;
    var filters = format === 'png'
      ? [{ name: 'PNG', extensions: ['png'] }]
      : [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }];

    var savePath = await window.electronAPI.saveFile({ defaultName: defaultName, filters: filters });
    if (savePath) {
      var mime = format === 'png' ? 'image/png' : 'image/jpeg';
      var quality = format === 'png' ? 1 : 0.95;
      var dataUrl = tempCanvas.toDataURL(mime, quality);
      await window.electronAPI.writeFile({ filePath: savePath, data: dataUrl, encoding: 'base64' });
      updateStatus('已导出: ' + savePath);
    }
    tempFC.dispose();
  } catch (err) {
    console.error('Export error:', err);
    updateStatus('导出失败: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ============================================
// Loading Overlay
// ============================================

function showLoading(msg) {
  hideLoading();
  var overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div><div class="msg">' + msg + '</div>';
  document.body.appendChild(overlay);
}

function hideLoading() {
  var old = document.getElementById('loading-overlay');
  if (old) old.remove();
}

// ============================================
// Status Bar
// ============================================

function updateStatus(text) {
  var el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

// ============================================
// Start
// ============================================

document.addEventListener('DOMContentLoaded', init);
