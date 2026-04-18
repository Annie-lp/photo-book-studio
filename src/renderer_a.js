  bind('btn-select', 'click', function() { setTool('select'); });
  bind('btn-text', 'click', function() { setTool('text'); addTextToCanvas(); });
  bind('btn-add-page', 'click', function() { addPage(); });
  bind('btn-add-page-panel', 'click', function() { addPage(); });
  bind('btn-delete-page', 'click', function() { deletePage(state.currentPageIndex); });
  bind('btn-undo', 'click', function() { undo(); });
  bind('btn-redo', 'click', function() { redo(); });
  var zs = document.getElementById('zoom-select');
  if (zs) zs.addEventListener('change', function(e) { applyZoom(parseFloat(e.target.value)); });
  var ts = document.getElementById('template-select');
  if (ts) ts.addEventListener('change', function(e) {
    if (e.target.value) { applyTemplate(e.target.value); e.target.value = ''; }
  });
  bind('btn-export-pdf', 'click', function() { exportToPdf(); });
  bind('btn-export-png', 'click', function() { exportCurrentPage('png'); });
}

function setTool(tool) {
  state.currentTool = tool;
  var bs = document.getElementById('btn-select');
  var bt = document.getElementById('btn-text');
  if (bs) bs.classList.toggle('active', tool === 'select');
  if (bt) bt.classList.toggle('active', tool === 'text');
  if (fabricCanvas) {
    fabricCanvas.selection = tool === 'select';
    fabricCanvas.defaultCursor = tool === 'text' ? 'text' : 'default';
  }
}

function applyZoom(zoom) {
  var z = Math.max(0.1, Math.min(4, zoom));
  state.zoom = z;
  fabricCanvas.setZoom(z);
  fabricCanvas.renderAll();
  var wrapper = document.getElementById('canvas-container');
  if (wrapper) {
    wrapper.style.width = (fabricCanvas.width * z) + 'px';
    wrapper.style.height = (fabricCanvas.height * z) + 'px';
  }
}

function saveState() {
  saveCurrentPage();
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }
  var snap = JSON.stringify({
    pages: state.pages.map(function(p) { return { objects: p.objects, bgColor: p.bgColor, pageSize: p.pageSize, orientation: p.orientation, customSize: p.customSize }; }),
    currentPage: state.currentPageIndex,
  });
  state.history.push(snap);
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

function restoreState(snap) {
  state.pages = snap.pages;
  if (snap.currentPage !== state.currentPageIndex) {
    state.currentPageIndex = snap.currentPage;
  }
  switchToPage(state.currentPageIndex);
  renderPageThumbnails();
}

function deleteSelectedObject() {
  var active = fabricCanvas.getActiveObject();
  if (!active) return;
  if (active.isPlaceholder) {
    fabricCanvas.getObjects().forEach(function(o) { if (o.isPlaceholder) fabricCanvas.remove(o); });
  }
  fabricCanvas.remove(active);
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  scheduleSyncAndSave();
  setStatus('已删除');
}

function setupLibraryEvents() {
  var bind = function(id, event, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  };

  bind('btn-import-images', 'click', function() {
    window.electronAPI.selectImages().then(function(paths) {
      if (paths && paths.length) importImages(paths);
    }).catch(function(err) { console.error('selectImages error:', err); setStatus('导入失败'); });
  });

  bind('btn-import-folder', 'click', function() {
    window.electronAPI.selectFolder().then(function(folder) {
      if (folder) {
        window.electronAPI.readImagesFromFolder(folder).then(function(paths) {
          if (paths && paths.length) importImages(paths);
        });
      }
    });
  });

  var dz = document.getElementById('image-drop-zone');
  if (dz) {
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', function() { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', function(e) {
      e.preventDefault();
      dz.classList.remove('drag-over');
      var files = Array.from(e.dataTransfer.files);
      var paths = files.map(function(f) { return f.path; }).filter(function(p) { return p; });
      if (paths.length) importImages(paths);
    });
  }
}

function setupDragDropEvents() {
  var el = document.getElementById('fabric-canvas');
  if (el) {
    el.addEventListener('dblclick', function() {
      if (state.selectedLibraryImage) addImageToCanvas(state.selectedLibraryImage.dataUrl);
    });
  }
}

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
    if (e.key === '+' || e.key === '=') applyZoom(state.zoom + 0.25);
    if (e.key === '-') applyZoom(state.zoom - 0.25);
  });
}

function setupMenuEvents() {
  if (typeof window.electronAPI === 'undefined') { console.error('electronAPI not found'); return; }
  window.electronAPI.onMenuImportImages(function() { window.electronAPI.selectImages().then(function(p) { if (p && p.length) importImages(p); }); });
  window.electronAPI.onMenuExportPdf(function() { exportToPdf(); });
  window.electronAPI.onMenuExportPng(function() { exportCurrentPage('png'); });
  window.electronAPI.onMenuUndo(function() { undo(); });
  window.electronAPI.onMenuRedo(function() { redo(); });
  window.electronAPI.onMenuDelete(function() { deleteSelectedObject(); });
  window.electronAPI.onMenuZoomIn(function() { applyZoom(state.zoom + 0.25); });
  window.electronAPI.onMenuZoomOut(function() { applyZoom(state.zoom - 0.25); });
  window.electronAPI.onMenuZoomReset(function() { applyZoom(1); });
}

var ctxMenuEl = null;

function setupContextMenu() {
  document.addEventListener('contextmenu', function(e) {
    var target = e.target;
    if (target.id === 'fabric-canvas' || (target.closest && target.closest('#canvas-area'))) {
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
  ctxMenuEl.innerHTML =
    '<div class="context-menu-item" id="ctx-add-text">✍ 添加文字</div>' +
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
    window.electronAPI.selectImages().then(function(p) { if (p && p.length) importImages(p); hideContextMenu(); });
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
  ctxMenuEl.innerHTML =
    '<div class="context-menu-item" id="ctx-go-page">跳转到第 ' + (pageIndex + 1) + ' 页</div>' +
    (state.pages.length > 1 ? '<div class="context-menu-item" id="ctx-del-page">🗑 删除此页</div>' : '');
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = e.clientX + 'px';
  ctxMenuEl.style.top = e.clientY + 'px';

  var el = document.getElementById('ctx-go-page');
  if (el) el.addEventListener('click', function() { switchToPage(pageIndex); hideContextMenu(); });
  el = document.getElementById('ctx-del-page');
  if (el) el.addEventListener('click', function() { deletePage(pageIndex); hideContextMenu(); });
}

async function exportToPdf() {
  if (!state.pages.length) return;
  showLoading('正在导出 PDF...');
  try {
    saveCurrentPage();
    var JsPDF = window.jspdf.jsPDF;
    var firstPage = state.pages[0];
    var W = getPageSize(firstPage).w;
    var H = getPageSize(firstPage).h;
    var ori = W > H ? 'landscape' : 'portrait';
    var pdfFormat = 'a4';
    if (Math.abs(W / H - 1) < 0.05) pdfFormat = [Math.max(W, H) * 0.2646, Math.min(W, H) * 0.2646];
    var pdf = new JsPDF({ orientation: ori, unit: 'px', format: pdfFormat, hotfixes: ['px_scaling'] });

    for (var i = 0; i < state.pages.length; i++) {
      if (i > 0) pdf.addPage();
      var p = state.pages[i];
      var size = getPageSize(p);
      var tc = document.createElement('canvas');
      tc.width = size.w;
      tc.height = size.h;
      var tfc = new fabric.Canvas(tc, { width: size.w, height: size.h, backgroundColor: p.bgColor || '#ffffff' });

      if (p.objects && p.objects.length > 0) {
        await new Promise(function(resolve) {
          fabric.util.enlivenObjects(
            p.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }),
            function(enlivened) {
              enlivened.forEach(function(obj) { tfc.add(obj); });
              tfc.renderAll();
              resolve();
            }
          );
        });
      } else {
        tfc.renderAll();
      }

      var dataUrl = tc.toDataURL('image/jpeg', 0.95);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      tfc.dispose();
      setStatus('导出中... ' + (i + 1) + '/' + state.pages.length);
    }

    var name = 'PhotoBook_' + Date.now() + '.pdf';
    var savePath = await window.electronAPI.saveFile({ defaultName: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (savePath) {
      await window.electronAPI.writeFile({ filePath: savePath, data: pdf.output('arraybuffer'), encoding: 'arraybuffer' });
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
    var tc = document.createElement('canvas');
    tc.width = size.w;
    tc.height = size.h;
    var tfc = new fabric.Canvas(tc, { width: size.w, height: size.h, backgroundColor: page.bgColor || '#ffffff' });

    if (page.objects && page.objects.length > 0) {
      await new Promise(function(resolve) {
        fabric.util.enlivenObjects(
          page.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }),
          function(enlivened) {
            enlivened.forEach(function(obj) { tfc.add(obj); });
            tfc.renderAll();
            resolve();
          }
        );
      });
    } else {
      tfc.renderAll();
    }

    var name = 'PhotoBook_Page' + (state.currentPageIndex + 1) + '_' + Date.now() + '.' + format;
    var filters = format === 'png' ? [{ name: 'PNG', extensions: ['png'] }] : [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }];
    var savePath = await window.electronAPI.saveFile({ defaultName: name, filters: filters });
    if (savePath) {
      var mime = format === 'png' ? 'image/png' : 'image/jpeg';
      var qual = format === 'png' ? 1 : 0.95;
      var dataUrl = tc.toDataURL(mime, qual);
      await window.electronAPI.writeFile({ filePath: savePath, data: dataUrl, encoding: 'base64' });
      setStatus('已导出: ' + savePath);
    }
    tfc.dispose();
  } catch (err) {
    console.error('Export error:', err);
    setStatus('导出失败: ' + err.message);
  } finally {
    hideLoading();
  }
}

function showLoading(msg) {
  hideLoading();
  var ov = document.createElement('div');
  ov.id = 'loading-overlay';
  ov.innerHTML = '<div class="spinner"></div><div class="msg">' + msg + '</div>';
  document.body.appendChild(ov);
}

function hideLoading() {
  var old = document.getElementById('loading-overlay');
  if (old) old.remove();
}

function setStatus(text) {
  var el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

function setupStatusBar() { /* setStatus is standalone */ }

document.addEventListener('DOMContentLoaded', init);
