    rect.zoneIndex = i;
    rect.objectCaching = false;
    fabricCanvas.add(rect);

    var label = new fabric.Text('区域 ' + (i + 1) + '\n双击缩略图添加', {
      left: zone.x + zone.w / 2, top: zone.y + zone.h / 2,
      fontSize: Math.max(10, Math.round(W * 0.018)),
      fill: '#aaaaaa',
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
  setStatus('已应用模板: ' + templateName);
}

// ============================================
// Toolbar Events
// ============================================

function setupToolbarEvents() {
  var btn;
  btn = document.getElementById('btn-select');
  if (btn) btn.addEventListener('click', function() { setTool('select'); });
  btn = document.getElementById('btn-text');
  if (btn) btn.addEventListener('click', function() { setTool('text'); addTextToCanvas(); });
  btn = document.getElementById('btn-add-page');
  if (btn) btn.addEventListener('click', function() { addPage(); });
  btn = document.getElementById('btn-add-page-panel');
  if (btn) btn.addEventListener('click', function() { addPage(); });
  btn = document.getElementById('btn-delete-page');
  if (btn) btn.addEventListener('click', function() { deletePage(state.currentPageIndex); });
  btn = document.getElementById('btn-undo');
  if (btn) btn.addEventListener('click', function() { undo(); });
  btn = document.getElementById('btn-redo');
  if (btn) btn.addEventListener('click', function() { redo(); });
  var zoomSel = document.getElementById('zoom-select');
  if (zoomSel) zoomSel.addEventListener('change', function(e) { applyZoom(parseFloat(e.target.value)); });
  var tmplSel = document.getElementById('template-select');
  if (tmplSel) tmplSel.addEventListener('change', function(e) {
    if (e.target.value) { applyTemplate(e.target.value); e.target.value = ''; }
  });
  btn = document.getElementById('btn-export-pdf');
  if (btn) btn.addEventListener('click', function() { exportToPdf(); });
  btn = document.getElementById('btn-export-png');
  if (btn) btn.addEventListener('click', function() { exportCurrentPage('png'); });
}

function setTool(tool) {
  state.currentTool = tool;
  var btnSelect = document.getElementById('btn-select');
  var btnText = document.getElementById('btn-text');
  if (btnSelect) btnSelect.classList.toggle('active', tool === 'select');
  if (btnText) btnText.classList.toggle('active', tool === 'text');
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
  var size = getCurrentPageSize();
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
  var snapshot = JSON.stringify({
    pages: state.pages.map(function(p) { return { objects: p.objects, bgColor: p.bgColor, pageSize: p.pageSize, orientation: p.orientation, customSize: p.customSize }; }),
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
  if (state.historyIndex <= 0) { setStatus('没有可撤销的记录'); return; }
  state.historyIndex--;
  restoreState(JSON.parse(state.history[state.historyIndex]));
  setStatus('撤销');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) { setStatus('没有可重做的记录'); return; }
  state.historyIndex++;
  restoreState(JSON.parse(state.history[state.historyIndex]));
  setStatus('重做');
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
  var active = fabricCanvas.getActiveObject();
  if (!active) return;
  if (active.isPlaceholder) {
    fabricCanvas.getObjects().forEach(function(o) { if (o.isPlaceholder) fabricCanvas.remove(o); });
  }
  fabricCanvas.remove(active);
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  renderCanvasToDOM();
  scheduleSyncAndSave();
  setStatus('已删除');
}

// ============================================
// Library Events
// ============================================

function setupLibraryEvents() {
  var btn = document.getElementById('btn-import-images');
  if (btn) {
    btn.addEventListener('click', function() {
      if (typeof window.electronAPI !== 'undefined') {
        window.electronAPI.selectImages().then(function(paths) {
          if (paths && paths.length) importImages(paths);
        }).catch(function(err) {
          console.error('selectImages error:', err);
          setStatus('导入失败');
        });
      } else {
        console.error('electronAPI not available');
        setStatus('electronAPI 不可用');
      }
    });
  }
  btn = document.getElementById('btn-import-folder');
  if (btn) {
    btn.addEventListener('click', function() {
      if (typeof window.electronAPI !== 'undefined') {
        window.electronAPI.selectFolder().then(function(folder) {
          if (folder) {
            window.electronAPI.readImagesFromFolder(folder).then(function(paths) {
              if (paths && paths.length) importImages(paths);
            });
          }
        });
      }
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
// Drag & Drop on Canvas
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
// Keyboard
// ============================================

function setupKeyboardEvents() {
  document.addEventListener('keydown', function(e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedObject(); }
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
// Menu Events (from main process)
// ============================================

function setupMenuEvents() {
  if (typeof window.electronAPI === 'undefined') { console.error('electronAPI not found'); return; }
  window.electronAPI.onMenuImportImages(function() {
    window.electronAPI.selectImages().then(function(paths) { if (paths && paths.length) importImages(paths); });
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
    var target = e.target;
    if (target === canvasEl || (target && target.closest && target.closest('#canvas-area'))) {
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
  ctxMenuEl.innerHTML = '<div class="context-menu-item" id="ctx-add-text">✍ 添加文字</div>' +
    '<div class="context-menu-item" id="ctx-add-page">📄 添加页面</div>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-item" id="ctx-import">📂 导入图片</div>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-item" id="ctx-delete-page">🗑 删除当前页</div>';
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
  ctxMenuEl.innerHTML = '<div class="context-menu-item" id="ctx-go-page">跳转到第 ' + (pageIndex + 1) + ' 页</div>' +
    (state.pages.length > 1 ? '<div class="context-menu-item" id="ctx-del-page">🗑 删除此页</div>' : '');
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = e.clientX + 'px';
  ctxMenuEl.style.top = e.clientY + 'px';
  var el;
  el = document.getElementById('ctx-go-page');
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
    var JsPDF = window.jspdf.jsPDF;
    var firstPage = state.pages[0];
    var W = getPageSize(firstPage).w;
    var H = getPageSize(firstPage).h;
    var orientation = W > H ? 'landscape' : 'portrait';
    var pdfFormat = 'a4';
    if (Math.abs(W / H - 1) < 0.05) pdfFormat = [Math.max(W, H) * 0.2646, Math.min(W, H) * 0.2646];
    var pdf = new JsPDF({ orientation: orientation, unit: 'px', format: pdfFormat, hotfixes: ['px_scaling'] });

    for (var i = 0; i < state.pages.length; i++) {
      if (i > 0) pdf.addPage();
      var p = state.pages[i];
      var size = getPageSize(p);
      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = size.w;
      tempCanvas.height = size.h;
      var tempFC = new fabric.Canvas(tempCanvas, { width: size.w, height: size.h, backgroundColor: p.bgColor || '#ffffff' });

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
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      tempFC.dispose();
      setStatus('导出中... ' + (i + 1) + '/' + state.pages.length);
    }

    var defaultName = 'PhotoBook_' + Date.now() + '.pdf';
    var savePath = await window.electronAPI.saveFile({ defaultName: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (savePath) {
      var pdfData = pdf.output('arraybuffer');
      await window.electronAPI.writeFile({ filePath: savePath, data: pdfData, encoding: 'arraybuffer' });
      setStatus('PDF 已导出: ' + savePath);
    }
  } catch (err) {
    console.error('PDF export error:', err);
    setStatus('导出 PDF 失败: ' + err.message);
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
    var tempFC = new fabric.Canvas(tempCanvas, { width: size.w, height: size.h, backgroundColor: page.bgColor || '#ffffff' });

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
    var filters = format === 'png' ? [{ name: 'PNG', extensions: ['png'] }] : [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }];
    var savePath = await window.electronAPI.saveFile({ defaultName: defaultName, filters: filters });
    if (savePath) {
      var mime = format === 'png' ? 'image/png' : 'image/jpeg';
      var quality = format === 'png' ? 1 : 0.95;
      var dataUrl = tempCanvas.toDataURL(mime, quality);
      await window.electronAPI.writeFile({ filePath: savePath, data: dataUrl, encoding: 'base64' });
      setStatus('已导出: ' + savePath);
    }
    tempFC.dispose();
  } catch (err) {
    console.error('Export error:', err);
    setStatus('导出失败: ' + err.message);
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

function setStatus(text) {
  var el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

// ============================================
// Start
// ============================================

document.addEventListener('DOMContentLoaded', init);
