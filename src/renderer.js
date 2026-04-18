'use strict';

// ============================================
// PhotoBook Studio - Renderer (Single Canvas)
// All page objects stored as JSON, rendered on one Fabric.js canvas.
// ============================================

const PAGE_SIZES = {
  A5: { portrait: { w: 416, h: 595 }, landscape: { w: 595, h: 416 } },
  A4: { portrait: { w: 595, h: 842 }, landscape: { w: 842, h: 595 } },
  square: { portrait: { w: 600, h: 600 }, landscape: { w: 600, h: 600 } }
};

const state = {
  pages: [],
  currentPageIndex: 0,
  currentTool: 'select',
  zoom: 1,
  selectedLibraryImage: null,
  history: [],
  historyIndex: -1,
  imageLibrary: [],
  nextImageId: 1,
  nextObjectId: 1,
};

let fabricCanvas = null;
let canvasEl, wrapperEl, containerEl;

// ============================================
// Initialization
// ============================================

function init() {
  canvasEl = document.getElementById('fabric-canvas');
  wrapperEl = document.getElementById('canvas-wrapper');
  containerEl = document.getElementById('canvas-container');

  const size = getCurrentPageSize();
  canvasEl.width = size.w;
  canvasEl.height = size.h;
  containerEl.style.width = size.w + 'px';
  containerEl.style.height = size.h + 'px';

  fabricCanvas = new fabric.Canvas('fabric-canvas', {
    width: size.w,
    height: size.h,
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    selection: true,
  });

  setupCanvasEvents(fabricCanvas);
  setupToolbarEvents();
  setupPropertyEvents();
  setupLibraryEvents();
  setupKeyboardEvents();
  setupDragDropEvents();
  setupMenuEvents();
  setupContextMenu();
  setupStatusBar();

  addPage();
  applyZoom(1);
  setStatus('就绪');
  console.log('[PhotoBook Studio] Init complete. fabric:', typeof fabric !== 'undefined' ? 'OK' : 'MISSING');
  console.log('[PhotoBook Studio] electronAPI:', typeof window.electronAPI !== 'undefined' ? 'OK' : 'MISSING');
}

// ============================================
// Canvas Events
// ============================================

function setupCanvasEvents(canvas) {
  canvas.on('selection:created', onSelectionChange);
  canvas.on('selection:updated', onSelectionChange);
  canvas.on('selection:cleared', onSelectionCleared);
  canvas.on('object:modified', onObjectModified);
  canvas.on('object:added', onObjectModified);
  canvas.on('object:removed', onObjectModified);
  canvas.on('text:changed', onObjectModified);
}

function onSelectionChange() { updatePropertiesPanel(); }

function onSelectionCleared() {
  hideAllPropSections();
  showPropSection('prop-page');
  showPropSection('prop-library');
}

function onObjectModified() {
  renderCanvasToDOM();
  scheduleSyncAndSave();
}

let syncTimeout = null;
function scheduleSyncAndSave() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(saveState, 200);
}

// ============================================
// Page Management
// ============================================

function addPage() {
  const size = getCurrentPageSize();
  state.pages.push({
    objects: [],
    bgColor: '#ffffff',
    pageSize: getSelectedPageSizeName(),
    orientation: getSelectedOrientation(),
    customSize: { w: size.w, h: size.h },
  });
  switchToPage(state.pages.length - 1);
  renderPageThumbnails();
  saveState();
  return state.pages.length - 1;
}

function deletePage(index) {
  if (state.pages.length <= 1) { setStatus('至少需要保留一页'); return; }
  state.pages.splice(index, 1);
  if (state.currentPageIndex >= state.pages.length) {
    state.currentPageIndex = state.pages.length - 1;
  }
  renderPageThumbnails();
  switchToPage(state.currentPageIndex);
  saveState();
  setStatus('已删除页面，当前共 ' + state.pages.length + ' 页');
}

function switchToPage(index) {
  saveCurrentPage();
  state.currentPageIndex = index;
  const page = state.pages[index];

  fabricCanvas.clear();
  fabricCanvas.backgroundColor = page.bgColor || '#ffffff';

  fabric.util.enlivenObjects(
    page.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }),
    function(enlivened) {
      enlivened.forEach(function(obj) { fabricCanvas.add(obj); });
      fabricCanvas.renderAll();
      renderCanvasToDOM();
    }
  );

  const size = getPageSize(page);
  resizeCanvas(size.w, size.h);
  renderPageThumbnails();
  updatePropertiesPanel();
  setStatus('第 ' + (index + 1) + ' / ' + state.pages.length + ' 页');
}

function saveCurrentPage() {
  const page = state.pages[state.currentPageIndex];
  if (!page || !fabricCanvas) return;
  page.objects = fabricCanvas.getObjects().map(function(obj) {
    return obj.toObject(['customId', 'cornerRadius', 'isPlaceholder', 'zoneIndex']);
  });
  page.bgColor = fabricCanvas.backgroundColor || '#ffffff';
}

function getPageSize(page) {
  if (page.customSize) return page.customSize;
  var sizeName = page.pageSize || 'A4';
  var orientation = page.orientation || 'portrait';
  var base = PAGE_SIZES[sizeName];
  return base ? (base[orientation] || base.portrait) : { w: 595, h: 842 };
}

function getCurrentPageSize() {
  var page = state.pages[state.currentPageIndex];
  if (!page) return { w: 595, h: 842 };
  return getPageSize(page);
}

function getSelectedPageSizeName() {
  var el = document.getElementById('page-size-select');
  return el ? el.value : 'A4';
}

function getSelectedOrientation() {
  var el = document.getElementById('orientation-select');
  return el ? el.value : 'portrait';
}

function resizeCanvas(w, h) {
  fabricCanvas.setWidth(w);
  fabricCanvas.setHeight(h);
  canvasEl.width = w;
  canvasEl.height = h;
  applyZoom(state.zoom);
  renderCanvasToDOM();
}

function renderCanvasToDOM() {
  if (!fabricCanvas) return;
  var tempCanvas = fabricCanvas.toCanvas();
  var ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.drawImage(tempCanvas, 0, 0);
}

function renderPageThumbnails() {
  var container = document.getElementById('page-thumbnails');
  if (!container) return;
  container.innerHTML = '';

  state.pages.forEach(function(page, index) {
    var div = document.createElement('div');
    div.className = 'page-thumb' + (index === state.currentPageIndex ? ' active' : '');
    div.title = '第 ' + (index + 1) + ' 页';

    var size = getPageSize(page);
    var scale = 136 / Math.max(size.w, size.h);
    var tc = document.createElement('canvas');
    tc.width = size.w * scale;
    tc.height = size.h * scale;
    var tCtx = tc.getContext('2d');
    tCtx.fillStyle = page.bgColor || '#ffffff';
    tCtx.fillRect(0, 0, tc.width, tc.height);

    // Render thumbnail content
    (function(idx, p, w, h, s) {
      var tempFC = new fabric.Canvas(tc, { width: w, height: h, backgroundColor: p.bgColor || '#ffffff' });
      if (p.objects && p.objects.length > 0) {
        fabric.util.enlivenObjects(p.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }), function(enlivened) {
          enlivened.forEach(function(obj) {
            obj.scaleX = (obj.scaleX || 1) * s;
            obj.scaleY = (obj.scaleY || 1) * s;
            obj.left = (obj.left || 0) * s;
            obj.top = (obj.top || 0) * s;
            if (obj.fontSize) obj.fontSize = obj.fontSize * s;
            tempFC.add(obj);
          });
          tempFC.renderAll();
          tCtx.clearRect(0, 0, w, h);
          tCtx.drawImage(tempFC.toCanvas(), 0, 0);
          tempFC.dispose();
        });
      } else {
        tempFC.renderAll();
        tCtx.drawImage(tempFC.toCanvas(), 0, 0);
        tempFC.dispose();
      }
    })(index, page, tc.width, tc.height, scale);

    div.appendChild(tc);
    var num = document.createElement('span');
    num.className = 'page-thumb-num';
    num.textContent = index + 1;
    div.appendChild(num);
    div.addEventListener('click', function() { switchToPage(index); });
    div.addEventListener('contextmenu', function(e) { showPageContextMenu(e, index); });
    container.appendChild(div);
  });
}

// ============================================
// Image Library
// ============================================

async function importImages(filePaths) {
  setStatus('正在加载图片...');
  var added = 0;
  for (var i = 0; i < filePaths.length; i++) {
    var filePath = filePaths[i];
    try {
      var dataUrl = await window.electronAPI.readImageAsDataUrl(filePath);
      if (!dataUrl) continue;
      var name = filePath.split(/[\\/]/).pop();
      state.imageLibrary.push({ id: state.nextImageId++, dataUrl: dataUrl, name: name });
      added++;
    } catch (e) {
      console.error('Failed to load image:', filePath, e);
    }
  }
  renderImageLibrary();
  setStatus('已导入 ' + added + ' 张图片，共 ' + state.imageLibrary.length + ' 张');
}

function renderImageLibrary() {
  var container = document.getElementById('image-thumbnails');
  if (!container) return;
  container.innerHTML = '';
  state.imageLibrary.forEach(function(img) {
    var div = document.createElement('div');
    div.className = 'img-thumb';
    if (state.selectedLibraryImage && state.selectedLibraryImage.id === img.id) {
      div.classList.add('selected');
    }
    div.title = img.name;
    var imgEl = document.createElement('img');
    imgEl.src = img.dataUrl;
    imgEl.draggable = false;
    div.appendChild(imgEl);
    div.addEventListener('click', function() {
      state.selectedLibraryImage = img;
      renderImageLibrary();
    });
    div.addEventListener('dblclick', function() {
      addImageToCanvas(img.dataUrl);
    });
    container.appendChild(div);
  });
}

function addImageToCanvas(dataUrl) {
  if (!fabricCanvas) return;
  fabric.Image.fromURL(dataUrl, function(img) {
    if (!img) return;
    var maxW = fabricCanvas.width * 0.7;
    var maxH = fabricCanvas.height * 0.7;
    if (img.width > maxW || img.height > maxH) {
      img.scale(Math.min(maxW / img.width, maxH / img.height));
    }
    img.set({
      left: (fabricCanvas.width - img.getScaledWidth()) / 2,
      top: (fabricCanvas.height - img.getScaledHeight()) / 2,
    });
    img.customId = state.nextObjectId++;
    img.objectCaching = false;
    fabricCanvas.add(img);
    fabricCanvas.setActiveObject(img);
    fabricCanvas.renderAll();
    renderCanvasToDOM();
    scheduleSyncAndSave();
    setStatus('已添加 (' + img.getScaledWidth().toFixed(0) + '×' + img.getScaledHeight().toFixed(0) + 'px)');
  }, { crossOrigin: 'anonymous' });
}

// ============================================
// Text Tool
// ============================================

function addTextToCanvas() {
  if (!fabricCanvas) return;
  var fontSize = Math.max(12, Math.round(fabricCanvas.height * 0.04));
  var text = new fabric.IText('双击编辑文字', {
    left: fabricCanvas.width / 2 - 100,
    top: fabricCanvas.height / 2 - 20,
    fontFamily: 'Arial',
    fontSize: fontSize,
    fill: '#333333',
    textAlign: 'center',
    originX: 'left',
    originY: 'top',
    objectCaching: false,
  });
  text.customId = state.nextObjectId++;
  fabricCanvas.add(text);
  fabricCanvas.setActiveObject(text);
  fabricCanvas.renderAll();
  renderCanvasToDOM();
  scheduleSyncAndSave();
  setTool('select');
  setStatus('已添加文字，双击编辑');
}

// ============================================
// Properties Panel
// ============================================

function hideAllPropSections() {
  var sections = document.querySelectorAll('.prop-section');
  for (var i = 0; i < sections.length; i++) {
    sections[i].style.display = 'none';
  }
}

function showPropSection(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function updatePropertiesPanel() {
  hideAllPropSections();
  showPropSection('prop-page');
  showPropSection('prop-library');
  if (!fabricCanvas) return;
  var active = fabricCanvas.getActiveObject();
  if (!active) return;
  if (active.type === 'image') {
    showPropSection('prop-image');
    updateImageProps(active);
  } else if (active.type === 'i-text' || active.type === 'text') {
    showPropSection('prop-text');
    updateTextProps(active);
  }
}

function updateImageProps(obj) {
  var el;
  el = document.getElementById('img-border-color');
  if (el) el.value = (obj.stroke && obj.stroke !== '#ffffff') ? obj.stroke : '#ffffff';
  el = document.getElementById('img-border-width');
  if (el) el.value = obj.strokeWidth || 0;
  var shadow = obj.shadow;
  el = document.getElementById('img-shadow-enable');
  if (el) el.checked = !!shadow;
  el = document.getElementById('shadow-options');
  if (el) el.style.display = shadow ? 'block' : 'none';
  if (shadow) {
    ['img-shadow-x', 'img-shadow-y', 'img-shadow-blur'].forEach(function(id) {
      el = document.getElementById(id);
      if (el) el.value = shadow[id === 'img-shadow-x' ? 'offsetX' : id === 'img-shadow-y' ? 'offsetY' : 'blur'] || 4;
    });
    el = document.getElementById('img-shadow-color');
    if (el) el.value = shadow.color || '#000000';
  }
  var radius = obj.cornerRadius || 0;
  el = document.getElementById('img-corner-radius');
  if (el) { el.value = radius; }
  el = document.getElementById('corner-radius-val');
  if (el) el.textContent = radius;
  var opacity = Math.round((obj.opacity || 1) * 100);
  el = document.getElementById('img-opacity');
  if (el) { el.value = opacity; }
  el = document.getElementById('opacity-val');
  if (el) el.textContent = opacity + '%';
  el = document.getElementById('img-rotation');
  if (el) el.value = Math.round(obj.angle || 0);
}

function updateTextProps(obj) {
  var el;
  el = document.getElementById('text-content');
  if (el) el.value = obj.text || '';
  el = document.getElementById('text-font');
  if (el) el.value = obj.fontFamily || 'Arial';
  el = document.getElementById('text-size');
  if (el) el.value = obj.fontSize || 24;
  el = document.getElementById('text-color');
  if (el) el.value = obj.fill || '#333333';
  el = document.getElementById('btn-text-bold');
  if (el) el.classList.toggle('active', obj.fontWeight === 'bold');
  el = document.getElementById('btn-text-italic');
  if (el) el.classList.toggle('active', obj.fontStyle === 'italic');
  el = document.getElementById('btn-text-underline');
  if (el) el.classList.toggle('active', obj.underline);
  var align = obj.textAlign || 'left';
  ['left', 'center', 'right'].forEach(function(a) {
    el = document.getElementById('btn-align-' + a);
    if (el) el.classList.toggle('active', align === a);
  });
}

// ============================================
// Property Events
// ============================================

function setupPropertyEvents() {
  // Image border
  document.getElementById('img-border-color').addEventListener('input', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj) { obj.set('stroke', e.target.value); fabricCanvas.renderAll(); renderCanvasToDOM(); scheduleSyncAndSave(); }
  });
  document.getElementById('img-border-width').addEventListener('input', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj) { obj.set('strokeWidth', parseInt(e.target.value) || 0); fabricCanvas.renderAll(); renderCanvasToDOM(); scheduleSyncAndSave(); }
  });

  // Shadow
  document.getElementById('img-shadow-enable').addEventListener('change', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (!obj) return;
    var shadowOptions = document.getElementById('shadow-options');
    if (shadowOptions) shadowOptions.style.display = e.target.checked ? 'block' : 'none';
    if (e.target.checked) {
      obj.setShadow(new fabric.Shadow({ offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.3)' }));
    } else {
      obj.setShadow(null);
    }
    fabricCanvas.renderAll();
    renderCanvasToDOM();
    scheduleSyncAndSave();
  });

  ['img-shadow-x', 'img-shadow-y', 'img-shadow-blur', 'img-shadow-color'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function() {
      var obj = fabricCanvas.getActiveObject();
      if (obj) {
        var ox = parseInt(document.getElementById('img-shadow-x').value) || 0;
        var oy = parseInt(document.getElementById('img-shadow-y').value) || 0;
        var blur = parseInt(document.getElementById('img-shadow-blur').value) || 0;
        var color = document.getElementById('img-shadow-color').value;
        obj.setShadow(new fabric.Shadow({ offsetX: ox, offsetY: oy, blur: blur, color: color }));
        fabricCanvas.renderAll();
        renderCanvasToDOM();
        scheduleSyncAndSave();
      }
    });
  });

  // Corner radius
  document.getElementById('img-corner-radius').addEventListener('input', function(e) {
    var val = parseInt(e.target.value) || 0;
    var lbl = document.getElementById('corner-radius-val');
    if (lbl) lbl.textContent = val;
    var obj = fabricCanvas.getActiveObject();
    if (obj && obj.type === 'image') { obj.cornerRadius = val; fabricCanvas.renderAll(); renderCanvasToDOM(); scheduleSyncAndSave(); }
  });

  // Opacity
  document.getElementById('img-opacity').addEventListener('input', function(e) {
    var val = parseInt(e.target.value) || 100;
    var lbl = document.getElementById('opacity-val');
    if (lbl) lbl.textContent = val + '%';
    var obj = fabricCanvas.getActiveObject();
    if (obj) { obj.set('opacity', val / 100); fabricCanvas.renderAll(); renderCanvasToDOM(); scheduleSyncAndSave(); }
  });

  // Rotation
  document.getElementById('img-rotation').addEventListener('input', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj) { obj.set('angle', parseFloat(e.target.value) || 0); fabricCanvas.renderAll(); renderCanvasToDOM(); scheduleSyncAndSave(); }
  });
  document.getElementById('btn-rotate-90').addEventListener('click', function() {
    var obj = fabricCanvas.getActiveObject();
    if (obj) {
      obj.set('angle', (obj.angle || 0) + 90);
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
      var el = document.getElementById('img-rotation');
      if (el) el.value = Math.round(obj.angle);
    }
  });

  // Delete
  document.getElementById('btn-delete-object').addEventListener('click', deleteSelectedObject);
  document.getElementById('btn-delete-text').addEventListener('click', deleteSelectedObject);

  // Text content
  document.getElementById('text-content').addEventListener('input', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('text', e.target.value);
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
    }
  });
  document.getElementById('text-font').addEventListener('change', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fontFamily', e.target.value);
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
    }
  });
  document.getElementById('text-size').addEventListener('input', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fontSize', parseInt(e.target.value) || 24);
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
    }
  });
  document.getElementById('text-color').addEventListener('input', function(e) {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fill', e.target.value);
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
    }
  });

  // Text style
  document.getElementById('btn-text-bold').addEventListener('click', function() {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      var isBold = obj.fontWeight === 'bold';
      obj.set('fontWeight', isBold ? 'normal' : 'bold');
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
      this.classList.toggle('active', !isBold);
    }
  });
  document.getElementById('btn-text-italic').addEventListener('click', function() {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      var isItalic = obj.fontStyle === 'italic';
      obj.set('fontStyle', isItalic ? 'normal' : 'italic');
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
      this.classList.toggle('active', !isItalic);
    }
  });
  document.getElementById('btn-text-underline').addEventListener('click', function() {
    var obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('underline', !obj.underline);
      fabricCanvas.renderAll();
      renderCanvasToDOM();
      scheduleSyncAndSave();
      this.classList.toggle('active', obj.underline);
    }
  });

  // Text alignment
  ['left', 'center', 'right'].forEach(function(align) {
    document.getElementById('btn-align-' + align).addEventListener('click', function() {
      var obj = fabricCanvas.getActiveObject();
      if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('textAlign', align);
        fabricCanvas.renderAll();
        renderCanvasToDOM();
        scheduleSyncAndSave();
        ['left', 'center', 'right'].forEach(function(a) {
          var btn = document.getElementById('btn-align-' + a);
          if (btn) btn.classList.remove('active');
        });
        this.classList.add('active');
      }
    });
  });

  // Page bg color
  document.getElementById('page-bg-color').addEventListener('input', function(e) {
    if (fabricCanvas) {
      fabricCanvas.setBackgroundColor(e.target.value, function() {
        fabricCanvas.renderAll();
        renderCanvasToDOM();
        if (state.pages[state.currentPageIndex]) state.pages[state.currentPageIndex].bgColor = e.target.value;
        scheduleSyncAndSave();
      });
    }
  });
  document.getElementById('btn-page-bg-transparent').addEventListener('click', function() {
    if (fabricCanvas) {
      fabricCanvas.setBackgroundColor(null, function() {
        fabricCanvas.renderAll();
        renderCanvasToDOM();
        if (state.pages[state.currentPageIndex]) state.pages[state.currentPageIndex].bgColor = null;
        scheduleSyncAndSave();
      });
    }
  });

  // Page size
  var pageSizeChanged = function(val) {
    ['page-size-select', 'page-size-prop'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = val;
    });
    var customGroup = document.getElementById('custom-size-group');
    if (customGroup) customGroup.style.display = val === 'custom' ? 'block' : 'none';
    applyPageSize(val);
  };
  document.getElementById('page-size-select') && document.getElementById('page-size-select').addEventListener('change', function(e) { pageSizeChanged(e.target.value); });
  document.getElementById('page-size-prop') && document.getElementById('page-size-prop').addEventListener('change', function(e) { pageSizeChanged(e.target.value); });

  var applyOrientationFn = function(orientation) {
    var portrait = document.getElementById('btn-orient-portrait');
    var landscape = document.getElementById('btn-orient-landscape');
    if (portrait) portrait.classList.toggle('active', orientation === 'portrait');
    if (landscape) landscape.classList.toggle('active', orientation === 'landscape');
    var orientSel = document.getElementById('orientation-select');
    if (orientSel) orientSel.value = orientation;
    var sizeName = getSelectedPageSizeName();
    if (sizeName === 'custom') {
      var w = parseInt((document.getElementById('page-custom-w') || {}).value) || 595;
      var h = parseInt((document.getElementById('page-custom-h') || {}).value) || 842;
      applyCanvasSize(orientation === 'landscape' ? h : w, orientation === 'landscape' ? w : h, 'custom', { w: w, h: h });
    } else {
      var size = PAGE_SIZES[sizeName];
      if (size) {
        var dims = size[orientation] || size.portrait;
        applyCanvasSize(dims.w, dims.h, sizeName, null);
      }
    }
  };

  document.getElementById('orientation-select') && document.getElementById('orientation-select').addEventListener('change', function(e) { applyOrientationFn(e.target.value); });
  document.getElementById('btn-orient-portrait') && document.getElementById('btn-orient-portrait').addEventListener('click', function() { applyOrientationFn('portrait'); });
  document.getElementById('btn-orient-landscape') && document.getElementById('btn-orient-landscape').addEventListener('click', function() { applyOrientationFn('landscape'); });
  document.getElementById('page-custom-w') && document.getElementById('page-custom-w').addEventListener('input', applyCustomSize);
  document.getElementById('page-custom-h') && document.getElementById('page-custom-h').addEventListener('input', applyCustomSize);
}

function applyPageSize(sizeName) {
  var orientation = (document.getElementById('orientation-select') || {}).value || 'portrait';
  var size = PAGE_SIZES[sizeName];
  if (!size) return;
  var dims = size[orientation] || size.portrait;
  applyCanvasSize(dims.w, dims.h, sizeName, null);
}

function applyCustomSize() {
  var w = parseInt((document.getElementById('page-custom-w') || {}).value) || 595;
  var h = parseInt((document.getElementById('page-custom-h') || {}).value) || 842;
  applyCanvasSize(w, h, 'custom', { w: w, h: h });
}

function applyCanvasSize(w, h, pageSize, customSize) {
  saveCurrentPage();
  fabricCanvas.clear();
  fabricCanvas.setWidth(w);
  fabricCanvas.setHeight(h);
  canvasEl.width = w;
  canvasEl.height = h;
  fabricCanvas.backgroundColor = (state.pages[state.currentPageIndex] || {}).bgColor || '#ffffff';

  var page = state.pages[state.currentPageIndex];
  if (page && page.objects && page.objects.length > 0) {
    fabric.util.enlivenObjects(page.objects.map(function(o) { return JSON.parse(JSON.stringify(o)); }), function(enlivened) {
      enlivened.forEach(function(obj) { fabricCanvas.add(obj); });
      fabricCanvas.renderAll();
      renderCanvasToDOM();
    });
  } else {
    fabricCanvas.renderAll();
    renderCanvasToDOM();
  }

  if (state.pages[state.currentPageIndex]) {
    state.pages[state.currentPageIndex].pageSize = pageSize;
    state.pages[state.currentPageIndex].orientation = (document.getElementById('orientation-select') || {}).value || 'portrait';
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
  fabricCanvas.backgroundColor = (state.pages[state.currentPageIndex] || {}).bgColor || '#ffffff';
  var W = fabricCanvas.width;
  var H = fabricCanvas.height;
  var PAD = W * 0.05;
  var zones = [];

  switch (templateName) {
    case '1-photo':
      zones = [{ x: PAD, y: PAD, w: W - PAD * 2, h: H - PAD * 2 }];
      break;
    case '2-photo-v':
      zones = [
        { x: PAD, y: PAD, w: W - PAD * 2, h: (H - PAD * 3) / 2 },
        { x: PAD, y: PAD * 2 + (H - PAD * 3) / 2, w: W - PAD * 2, h: (H - PAD * 3) / 2 }
      ];
      break;
    case '2-photo-h':
      zones = [
        { x: PAD, y: PAD, w: (W - PAD * 3) / 2, h: H - PAD * 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD, w: (W - PAD * 3) / 2, h: H - PAD * 2 }
      ];
      break;
    case '3-photo':
      zones = [
        { x: PAD, y: PAD, w: (W - PAD * 3) / 2, h: H - PAD * 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD * 2 + (H - PAD * 3) / 2, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 }
      ];
      break;
    case '4-photo':
      zones = [
        { x: PAD, y: PAD, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD, y: PAD * 2 + (H - PAD * 3) / 2, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 },
        { x: PAD * 2 + (W - PAD * 3) / 2, y: PAD * 2 + (H - PAD * 3) / 2, w: (W - PAD * 3) / 2, h: (H - PAD * 3) / 2 }
      ];
      break;
    case 'grid-3x3':
      var cellW = (W - PAD * 4) / 3;
      var cellH = (H - PAD * 4) / 3;
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          zones.push({ x: PAD + col * (cellW + PAD), y: PAD + row * (cellH + PAD), w: cellW, h: cellH });
        }
      }
      break;
    default:
      return;
  }

  zones.forEach(function(zone, i) {
    var rect = new fabric.Rect({
      left: zone.x, top: zone.y, width: zone.w, height: zone.h,
      fill: '#e8e8e8', stroke: '#bbbbbb', strokeWidth: 1, strokeDashArray: [5, 3],
      selectable: false, evented: false,
    });
    rect.isPlaceholder = true;    rect.zoneIndex = i;
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
