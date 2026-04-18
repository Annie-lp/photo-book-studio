'use strict';

// ============================================
// PhotoBook Studio - Renderer Logic
// ============================================

// Page size definitions (in pixels at 72dpi)
const PAGE_SIZES = {
  A5: { portrait: { w: 416, h: 595 }, landscape: { w: 595, h: 416 } },
  A4: { portrait: { w: 595, h: 842 }, landscape: { w: 842, h: 595 } },
  square: { portrait: { w: 600, h: 600 }, landscape: { w: 600, h: 600 } }
};

// State
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

const fabricCanvases = {};
let activeCanvas = null;

// ============================================
// Initialization
// ============================================

function init() {
  initFabric();
  setupToolbarEvents();
  setupPropertyEvents();
  setupLibraryEvents();
  setupKeyboardEvents();
  setupDragDropEvents();
  setupMenuEvents();
  setupContextMenu();
  addPage();
  updateStatus('就绪');
}

function initFabric() {
  const size = getCurrentPageSize();
  canvasEl = document.getElementById('fabric-canvas');
  wrapperEl = document.getElementById('canvas-wrapper');
  containerEl = document.getElementById('canvas-container');
  canvasEl.width = size.w;
  canvasEl.height = size.h;
  containerEl.style.width = size.w + 'px';
  containerEl.style.height = size.h + 'px';
}

// ============================================
// Page Management
// ============================================

function addPage() {
  const pageIndex = state.pages.length;
  const size = getCurrentPageSize();

  // Create a separate off-screen canvas for each page
  const offscreen = document.createElement('canvas');
  offscreen.width = size.w;
  offscreen.height = size.h;

  const fabricCanvas = new fabric.Canvas(offscreen, {
    width: size.w,
    height: size.h,
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
  });

  fabricCanvases[pageIndex] = fabricCanvas;
  state.pages.push({
    canvas: fabricCanvas,
    bgColor: '#ffffff',
    pageSize: 'A4',
    orientation: 'portrait',
    customSize: null,
  });

  setupCanvasEvents(fabricCanvas, pageIndex);
  renderPageThumbnails();
  switchToPage(pageIndex);
  saveState();
  return pageIndex;
}

function deletePage(index) {
  if (state.pages.length <= 1) {
    updateStatus('至少需要保留一页');
    return;
  }
  const fabricCanvas = fabricCanvases[index];
  if (fabricCanvas) { fabricCanvas.dispose(); delete fabricCanvases[index]; }
  state.pages.splice(index, 1);
  if (state.currentPageIndex >= state.pages.length) {
    state.currentPageIndex = state.pages.length - 1;
  }
  renderPageThumbnails();
  switchToPage(state.currentPageIndex);
  saveState();
  updateStatus(`已删除页面，当前共 ${state.pages.length} 页`);
}

function switchToPage(index) {
  if (activeCanvas) {
    activeCanvas.discardActiveObject();
    activeCanvas.renderAll();
  }
  activeCanvas = fabricCanvases[index];
  if (!activeCanvas) return;
  state.currentPageIndex = index;
  const size = getCurrentPageSize();
  canvasEl.width = size.w;
  canvasEl.height = size.h;
  renderActiveCanvasToDOM();
  applyZoom(state.zoom);
  renderPageThumbnails();
  updatePropertiesPanel();
  updateStatus(`第 ${index + 1} / ${state.pages.length} 页`);
}

function renderActiveCanvasToDOM() {
  if (!activeCanvas) return;
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.drawImage(activeCanvas.toCanvas(), 0, 0);
}

function renderPageThumbnails() {
  const container = document.getElementById('page-thumbnails');
  container.innerHTML = '';
  state.pages.forEach((page, index) => {
    const div = document.createElement('div');
    div.className = 'page-thumb' + (index === state.currentPageIndex ? ' active' : '');
    div.title = `第 ${index + 1} 页`;
    const tc = document.createElement('canvas');
    const scale = 136 / (page.canvas.width || 595);
    tc.width = page.canvas.width * scale;
    tc.height = page.canvas.height * scale;
    const tCtx = tc.getContext('2d');
    tCtx.fillStyle = page.bgColor || '#ffffff';
    tCtx.fillRect(0, 0, tc.width, tc.height);
    tCtx.drawImage(page.canvas.toCanvas(), 0, 0, tc.width, tc.height);
    div.appendChild(tc);
    const num = document.createElement('span');
    num.className = 'page-thumb-num';
    num.textContent = index + 1;
    div.appendChild(num);
    div.addEventListener('click', () => switchToPage(index));
    div.addEventListener('contextmenu', (e) => showPageContextMenu(e, index));
    container.appendChild(div);
  });
}

// ============================================
// Canvas Events
// ============================================

function setupCanvasEvents(fabricCanvas, pageIndex) {
  fabricCanvas.on('selection:created', onSelectionChange);
  fabricCanvas.on('selection:updated', onSelectionChange);
  fabricCanvas.on('selection:cleared', onSelectionCleared);
  fabricCanvas.on('object:modified', onObjectModified);
  fabricCanvas.on('object:moving', renderActiveCanvasToDOM);
  fabricCanvas.on('object:scaling', renderActiveCanvasToDOM);
  fabricCanvas.on('object:rotating', renderActiveCanvasToDOM);
  fabricCanvas.on('after:render', () => {});
}

let syncTimeout = null;
function scheduleSyncAndSave() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    renderActiveCanvasToDOM();
    renderPageThumbnails();
    saveState();
  }, 150);
}

function onSelectionChange() { updatePropertiesPanel(); }
function onSelectionCleared() {
  hideAllPropSections();
  showPropSection('prop-page');
  showPropSection('prop-library');
}
function onObjectModified() { scheduleSyncAndSave(); }

// ============================================
// Image Library
// ============================================

async function importImages(filePaths) {
  updateStatus('正在加载图片...');
  let added = 0;
  for (const filePath of filePaths) {
    try {
      const dataUrl = await window.electronAPI.readImageAsDataUrl(filePath);
      if (!dataUrl) continue;
      const name = filePath.split(/[\\/]/).pop();
      state.imageLibrary.push({ id: state.nextImageId++, dataUrl, name });
      added++;
    } catch (e) { console.error('Failed to load:', filePath, e); }
  }
  renderImageLibrary();
  updateStatus(`已导入 ${added} 张图片，共 ${state.imageLibrary.length} 张`);
}

function renderImageLibrary() {
  const container = document.getElementById('image-thumbnails');
  container.innerHTML = '';
  state.imageLibrary.forEach(img => {
    const div = document.createElement('div');
    div.className = 'img-thumb';
    if (state.selectedLibraryImage && state.selectedLibraryImage.id === img.id) div.classList.add('selected');
    div.title = img.name;
    const imgEl = document.createElement('img');
    imgEl.src = img.dataUrl;
    imgEl.draggable = false;
    div.appendChild(imgEl);
    div.addEventListener('click', () => {
      state.selectedLibraryImage = img;
      renderImageLibrary();
    });
    div.addEventListener('dblclick', () => addImageToCanvas(img.dataUrl));
    container.appendChild(div);
  });
}

function addImageToCanvas(dataUrl, targetRect) {
  if (!activeCanvas) return;
  fabric.Image.fromURL(dataUrl, (img) => {
    if (!img) return;
    const maxW = activeCanvas.width * 0.7;
    const maxH = activeCanvas.height * 0.7;
    if (img.width > maxW || img.height > maxH) {
      img.scale(Math.min(maxW / img.width, maxH / img.height));
    }
    if (targetRect) {
      img.set({
        left: targetRect.left,
        top: targetRect.top,
        scaleX: targetRect.width / img.width,
        scaleY: targetRect.height / img.height,
      });
    } else {
      img.set({
        left: (activeCanvas.width - img.getScaledWidth()) / 2,
        top: (activeCanvas.height - img.getScaledHeight()) / 2,
      });
    }
    img.customId = state.nextObjectId++;
    // Remove placeholder if replacing
    if (targetRect && targetRect.linkedObject) {
      activeCanvas.remove(targetRect.linkedObject);
    }
    activeCanvas.add(img);
    activeCanvas.setActiveObject(img);
    activeCanvas.renderAll();
    scheduleSyncAndSave();
    updateStatus(`已添加 (${img.getScaledWidth().toFixed(0)}×${img.getScaledHeight().toFixed(0)}px)`);
  }, { crossOrigin: 'anonymous' });
}

// ============================================
// Text Tool
// ============================================

function addTextToCanvas() {
  if (!activeCanvas) return;
  const text = new fabric.IText('双击编辑文字', {
    left: activeCanvas.width / 2 - 100,
    top: activeCanvas.height / 2 - 20,
    fontFamily: 'Arial',
    fontSize: 32,
    fill: '#333333',
    textAlign: 'center',
    originX: 'left',
    originY: 'top',
    objectCaching: false,
  });
  text.customId = state.nextObjectId++;
  activeCanvas.add(text);
  activeCanvas.setActiveObject(text);
  activeCanvas.renderAll();
  scheduleSyncAndSave();
  setTool('select');
}

// ============================================
// Properties Panel
// ============================================

function hideAllPropSections() {
  document.querySelectorAll('.prop-section').forEach(s => { s.style.display = 'none'; });
}
function showPropSection(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function updatePropertiesPanel() {
  hideAllPropSections();
  showPropSection('prop-page');
  showPropSection('prop-library');
  if (!activeCanvas) return;
  const active = activeCanvas.getActiveObject();
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
  document.getElementById('img-border-color').value = (obj.stroke && obj.stroke !== '#ffffff') ? obj.stroke : '#ffffff';
  document.getElementById('img-border-width').value = obj.strokeWidth || 0;
  const shadow = obj.shadow;
  document.getElementById('img-shadow-enable').checked = !!shadow;
  document.getElementById('shadow-options').style.display = shadow ? 'block' : 'none';
  if (shadow) {
    document.getElementById('img-shadow-x').value = shadow.offsetX || 4;
    document.getElementById('img-shadow-y').value = shadow.offsetY || 4;
    document.getElementById('img-shadow-blur').value = shadow.blur || 8;
    document.getElementById('img-shadow-color').value = shadow.color || '#000000';
  }
  const radius = obj.cornerRadius || 0;
  document.getElementById('img-corner-radius').value = radius;
  document.getElementById('corner-radius-val').textContent = radius;
  const opacity = Math.round((obj.opacity || 1) * 100);
  document.getElementById('img-opacity').value = opacity;
  document.getElementById('opacity-val').textContent = opacity + '%';
  document.getElementById('img-rotation').value = Math.round(obj.angle || 0);
}

function updateTextProps(obj) {
  document.getElementById('text-content').value = obj.text || '';
  document.getElementById('text-font').value = obj.fontFamily || 'Arial';
  document.getElementById('text-size').value = obj.fontSize || 24;
  document.getElementById('text-color').value = obj.fill || '#333333';
  document.getElementById('btn-text-bold').classList.toggle('active', obj.fontWeight === 'bold');
  document.getElementById('btn-text-italic').classList.toggle('active', obj.fontStyle === 'italic');
  document.getElementById('btn-text-underline').classList.toggle('active', obj.underline);
  const align = obj.textAlign || 'left';
  ['left', 'center', 'right'].forEach(a => {
    document.getElementById(`btn-align-${a}`).classList.toggle('active', align === a);
  });
}

// ============================================
// Property Events
// ============================================

function setupPropertyEvents() {
  // Image border
  document.getElementById('img-border-color').addEventListener('input', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj) { obj.set('stroke', e.target.value); activeCanvas.renderAll(); scheduleSyncAndSave(); }
  });
  document.getElementById('img-border-width').addEventListener('input', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj) { obj.set('strokeWidth', parseInt(e.target.value) || 0); activeCanvas.renderAll(); scheduleSyncAndSave(); }
  });

  // Shadow
  document.getElementById('img-shadow-enable').addEventListener('change', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (!obj) return;
    document.getElementById('shadow-options').style.display = e.target.checked ? 'block' : 'none';
    if (e.target.checked) {
      obj.setShadow(new fabric.Shadow({ offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.3)' }));
    } else {
      obj.setShadow(null);
    }
    activeCanvas.renderAll();
    scheduleSyncAndSave();
  });

  ['img-shadow-x', 'img-shadow-y', 'img-shadow-blur', 'img-shadow-color'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const obj = activeCanvas?.getActiveObject();
      if (obj) {
        obj.setShadow(new fabric.Shadow({
          offsetX: parseInt(document.getElementById('img-shadow-x').value) || 0,
          offsetY: parseInt(document.getElementById('img-shadow-y').value) || 0,
          blur: parseInt(document.getElementById('img-shadow-blur').value) || 0,
          color: document.getElementById('img-shadow-color').value
        }));
        activeCanvas.renderAll();
        scheduleSyncAndSave();
      }
    });
  });

  // Corner radius
  document.getElementById('img-corner-radius').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 0;
    document.getElementById('corner-radius-val').textContent = val;
    const obj = activeCanvas?.getActiveObject();
    if (obj && obj.type === 'image') {
      obj.cornerRadius = val;
      activeCanvas.renderAll();
      scheduleSyncAndSave();
    }
  });

  // Opacity
  document.getElementById('img-opacity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 100;
    document.getElementById('opacity-val').textContent = val + '%';
    const obj = activeCanvas?.getActiveObject();
    if (obj) { obj.set('opacity', val / 100); activeCanvas.renderAll(); scheduleSyncAndSave(); }
  });

  // Rotation
  document.getElementById('img-rotation').addEventListener('input', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj) { obj.set('angle', parseFloat(e.target.value) || 0); activeCanvas.renderAll(); scheduleSyncAndSave(); }
  });
  document.getElementById('btn-rotate-90').addEventListener('click', () => {
    const obj = activeCanvas?.getActiveObject();
    if (obj) {
      obj.set('angle', (obj.angle || 0) + 90);
      activeCanvas.renderAll();
      scheduleSyncAndSave();
      document.getElementById('img-rotation').value = Math.round(obj.angle);
    }
  });

  // Delete
  document.getElementById('btn-delete-object').addEventListener('click', deleteSelectedObject);
  document.getElementById('btn-delete-text').addEventListener('click', deleteSelectedObject);

  // Text content
  document.getElementById('text-content').addEventListener('input', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('text', e.target.value);
      activeCanvas.renderAll();
      scheduleSyncAndSave();
    }
  });
  document.getElementById('text-font').addEventListener('change', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fontFamily', e.target.value);
      activeCanvas.renderAll();
      scheduleSyncAndSave();
    }
  });
  document.getElementById('text-size').addEventListener('input', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fontSize', parseInt(e.target.value) || 24);
      activeCanvas.renderAll();
      scheduleSyncAndSave();
    }
  });
  document.getElementById('text-color').addEventListener('input', (e) => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fill', e.target.value);
      activeCanvas.renderAll();
      scheduleSyncAndSave();
    }
  });

  // Text style
  document.getElementById('btn-text-bold').addEventListener('click', () => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      const isBold = obj.fontWeight === 'bold';
      obj.set('fontWeight', isBold ? 'normal' : 'bold');
      activeCanvas.renderAll();
      scheduleSyncAndSave();
      document.getElementById('btn-text-bold').classList.toggle('active', !isBold);
    }
  });
  document.getElementById('btn-text-italic').addEventListener('click', () => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      const isItalic = obj.fontStyle === 'italic';
      obj.set('fontStyle', isItalic ? 'normal' : 'italic');
      activeCanvas.renderAll();
      scheduleSyncAndSave();
      document.getElementById('btn-text-italic').classList.toggle('active', !isItalic);
    }
  });
  document.getElementById('btn-text-underline').addEventListener('click', () => {
    const obj = activeCanvas?.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('underline', !obj.underline);
      activeCanvas.renderAll();
      scheduleSyncAndSave();
      document.getElementById('btn-text-underline').classList.toggle('active', obj.underline);
    }
  });

  // Text alignment
  ['left', 'center', 'right'].forEach(align => {
    document.getElementById(`btn-align-${align}`).addEventListener('click', () => {
      const obj = activeCanvas?.getActiveObject();
      if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('textAlign', align);
        activeCanvas.renderAll();
        scheduleSyncAndSave();
        ['left', 'center', 'right'].forEach(a => document.getElementById(`btn-align-${a}`).classList.remove('active'));
        document.getElementById(`btn-align-${align}`).classList.add('active');
      }
    });
  });

  // Page bg color
  document.getElementById('page-bg-color').addEventListener('input', (e) => {
    if (activeCanvas) {
      activeCanvas.setBackgroundColor(e.target.value, () => {
        activeCanvas.renderAll();
        if (state.pages[state.currentPageIndex]) state.pages[state.currentPageIndex].bgColor = e.target.value;
        scheduleSyncAndSave();
      });
    }
  });
  document.getElementById('btn-page-bg-transparent').addEventListener('click', () => {
    if (activeCanvas) {
      activeCanvas.setBackgroundColor(null, () => {
        activeCanvas.renderAll();
        if (state.pages[state.currentPageIndex]) state.pages[state.currentPageIndex].bgColor = null;
        scheduleSyncAndSave();
      });
    }
  });

  // Page size
  const pageSizeChanged = (val) => {
    document.getElementById('page-size-select').value = val;
    document.getElementById('page-size-prop').value = val;
    const showCustom = val === 'custom';
    document.getElementById('custom-size-group').style.display = showCustom ? 'block' : 'none';
    applyPageSize(val);
  };
  document.getElementById('page-size-select')?.addEventListener('change', (e) => pageSizeChanged(e.target.value));
  document.getElementById('page-size-prop')?.addEventListener('change', (e) => pageSizeChanged(e.target.value));

  const applyOrientation = (orientation) => {
    document.getElementById('btn-orient-portrait').classList.toggle('active', orientation === 'portrait');
    document.getElementById('btn-orient-landscape').classList.toggle('active', orientation === 'landscape');
    document.getElementById('orientation-select').value = orientation;
    const sizeName = getSelectedPageSizeName();
    if (sizeName === 'custom') {
      const w = parseInt(document.getElementById('page-custom-w').value) || 595;
      const h = parseInt(document.getElementById('page-custom-h').value) || 842;
      applyCanvasSize(orientation === 'landscape' ? h : w, orientation === 'landscape' ? w : h, 'custom', { w, h });
    } else {
      const size = PAGE_SIZES[sizeName];
      if (size) {
        const dims = size[orientation] || size.portrait;
        applyCanvasSize(dims.w, dims.h, sizeName, null);
      }
    }
  };
  document.getElementById('orientation-select')?.addEventListener('change', (e) => applyOrientation(e.target.value));
  document.getElementById('btn-orient-portrait')?.addEventListener('click', () => applyOrientation('portrait'));
  document.getElementById('btn-orient-landscape')?.addEventListener('click', () => applyOrientation('landscape'));
  document.getElementById('page-custom-w').addEventListener('input', applyCustomSize);
  document.getElementById('page-custom-h').addEventListener('input', applyCustomSize);
}

// ============================================
// Page Size & Orientation
// ============================================

function getCurrentPageSize() {
  const page = state.pages[state.currentPageIndex];
  if (!page) return { w: 595, h: 842 };
  if (page.customSize) return page.customSize;
  const sizeName = page.pageSize || 'A4';
  const orientation = page.orientation || 'portrait';
  const base = PAGE_SIZES[sizeName];
  return base ? (base[orientation] || base.portrait) : { w: 595, h: 842 };
}

function getSelectedPageSizeName() {
  return document.getElementById('page-size-select')?.value || document.getElementById('page-size-prop')?.value || 'A4';
}

function applyPageSize(sizeName) {
  if (!activeCanvas) return;
  const orientation = document.getElementById('orientation-select')?.value || 'portrait';
  const size = PAGE_SIZES[sizeName];
  if (!size) return;
  const dims = size[orientation] || size.portrait;
  applyCanvasSize(dims.w, dims.h, sizeName, null);
}

function applyCustomSize() {
  const w = parseInt(document.getElementById('page-custom-w').value) || 595;
  const h = parseInt(document.getElementById('page-custom-h').value) || 842;
  applyCanvasSize(w, h, 'custom', { w, h });
}

function applyCanvasSize(w, h, pageSize, customSize) {
  if (!activeCanvas) return;
  const objects = activeCanvas.getObjects();
  const serialized = objects.map(obj => obj.toObject(['customId', 'cornerRadius']));

  activeCanvas.setWidth(w);
  activeCanvas.setHeight(h);
  canvasEl.width = w;
  canvasEl.height = h;

  fabric.util.enlivenObjects(serialized, (enlivened) => {
    enlivened.forEach(item => activeCanvas.add(item));
    activeCanvas.renderAll();
    if (state.pages[state.currentPageIndex]) {
      state.pages[state.currentPageIndex].pageSize = pageSize;
      state.pages[state.currentPageIndex].orientation = document.getElementById('orientation-select')?.value || 'portrait';
      state.pages[state.currentPageIndex].customSize = customSize;
    }
    applyZoom(state.zoom);
    renderActiveCanvasToDOM();
    renderPageThumbnails();
    saveState();
  });
}

// ============================================
// Templates
// ============================================

function applyTemplate(templateName) {
  if (!activeCanvas) return;
  activeCanvas.clear();
  const bgColor = state.pages[state.currentPageIndex]?.bgColor || '#ffffff';
  activeCanvas.backgroundColor = bgColor;

  const W = activeCanvas.width;
  const H = activeCanvas.height;
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
    activeCanvas.add(rect);

    const label = new fabric.Text(`区域 ${i + 1}\n拖入图片`, {
      left: zone.x + zone.w / 2, top: zone.y + zone.h / 2,
      fontSize: 14, fill: '#aaaaaa', originX: 'center', originY: 'center', textAlign: 'center',
      selectable: false, evented: false,
    });
    label.isPlaceholder = true;
    activeCanvas.add(label);
  });

  activeCanvas.renderAll();
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
  if (activeCanvas) {
    activeCanvas.selection = tool === 'select';
    activeCanvas.defaultCursor = tool === 'text' ? 'text' : 'default';
  }
}

// ============================================
// Zoom
// ============================================

function applyZoom(zoom) {
  state.zoom = zoom;
  if (!activeCanvas) return;
  const size = getCurrentPageSize();
  canvasEl.style.transform = `scale(${zoom})`;
  canvasEl.style.transformOrigin = 'top left';
  canvasEl.style.width = (size.w * zoom) + 'px';
  canvasEl.style.height = (size.h * zoom) + 'px';
  wrapperEl.style.minWidth = (size.w * zoom + 80) + 'px';
  wrapperEl.style.minHeight = (size.h * zoom + 80) + 'px';
  renderActiveCanvasToDOM();
}

// ============================================
// History (Undo/Redo)
// ============================================

function saveState() {
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }
  const pageData = state.pages.map(page => ({
    objects: page.canvas.getObjects().map(obj => obj.toObject(['customId', 'cornerRadius', 'isPlaceholder', 'zoneIndex'])),
    bgColor: page.bgColor,
    pageSize: page.pageSize,
    orientation: page.orientation,
    customSize: page.customSize,
  }));
  state.history.push({ pages: pageData, currentPage: state.currentPageIndex });
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 50) {
    state.history = state.history.slice(-30);
    state.historyIndex = state.history.length - 1;
  }
}

function undo() {
  if (state.historyIndex <= 0) { updateStatus('没有可撤销的记录'); return; }
  state.historyIndex--;
  restoreState(state.history[state.historyIndex]);
  updateStatus('撤销');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) { updateStatus('没有可重做的记录'); return; }
  state.historyIndex++;
  restoreState(state.history[state.historyIndex]);
  updateStatus('重做');
}

function restoreState(snapshot) {
  snapshot.pages.forEach((pageData, i) => {
    const fabricCanvas = fabricCanvases[i];
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = pageData.bgColor || '#ffffff';
    fabric.util.enlivenObjects(pageData.objects, (enlivened) => {
      enlivened.forEach(obj => {
        obj.customId = obj.customId;
        fabricCanvas.add(obj);
      });
      fabricCanvas.renderAll();
      if (state.pages[i]) {
        state.pages[i].bgColor = pageData.bgColor;
        state.pages[i].pageSize = pageData.pageSize;
        state.pages[i].orientation = pageData.orientation;
        state.pages[i].customSize = pageData.customSize;
      }
    });
  });
  if (state.currentPageIndex !== snapshot.currentPage) {
    switchToPage(snapshot.currentPage);
  } else {
    renderActiveCanvasToDOM();
    renderPageThumbnails();
  }
}

// ============================================
// Delete
// ============================================

function deleteSelectedObject() {
  if (!activeCanvas) return;
  const active = activeCanvas.getActiveObject();
  if (!active) return;
  if (active.isPlaceholder) {
    activeCanvas.remove(active);
    // Also remove the label
    const label = activeCanvas.getObjects().find(o => o.isPlaceholder && o !== active);
    if (label) activeCanvas.remove(label);
  }
  activeCanvas.remove(active);
  activeCanvas.discardActiveObject();
  activeCanvas.renderAll();
  scheduleSyncAndSave();
  updateStatus('已删除');
}

// ============================================
// Library Events
// ============================================

function setupLibraryEvents() {
  document.getElementById('btn-import-images').addEventListener('click', async () => {
    const paths = await window.electronAPI.selectImages();
    if (paths && paths.length) importImages(paths);
  });
  document.getElementById('btn-import-folder').addEventListener('click', async () => {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      const paths = await window.electronAPI.readImagesFromFolder(folder);
      if (paths && paths.length) importImages(paths);
    }
  });

  // Drop zone
  const dropZone = document.getElementById('image-drop-zone');
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map(f => f.path).filter(p => p);
    if (paths.length) importImages(paths);
  });
}

// ============================================
// Canvas Drop Events (drop onto canvas)
// ============================================

function setupDragDropEvents() {
  const canvasArea = document.getElementById('canvas-area');

  // Canvas-level drop for library images
  canvasEl.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  canvasEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const img = state.selectedLibraryImage;
    if (!img) return;
    const rect = canvasEl.getBoundingClientRect();
    const zoom = state.zoom;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    addImageToCanvasAt(x, y);
  });

  // Double-click on canvas to add selected image
  canvasEl.addEventListener('dblclick', () => {
    const img = state.selectedLibraryImage;
    if (img) addImageToCanvas(img.dataUrl);
  });
}

function addImageToCanvasAt(x, y) {
  if (!activeCanvas || !state.selectedLibraryImage) return;
  fabric.Image.fromURL(state.selectedLibraryImage.dataUrl, (img) => {
    if (!img) return;
    const maxW = activeCanvas.width * 0.5;
    const maxH = activeCanvas.height * 0.5;
    if (img.width > maxW || img.height > maxH) img.scale(Math.min(maxW / img.width, maxH / img.height));
    img.set({ left: x - img.getScaledWidth() / 2, top: y - img.getScaledHeight() / 2 });
    img.customId = state.nextObjectId++;
    activeCanvas.add(img);
    activeCanvas.setActiveObject(img);
    activeCanvas.renderAll();
    scheduleSyncAndSave();
  }, { crossOrigin: 'anonymous' });
}

// ============================================
// Keyboard Events
// ============================================

function setupKeyboardEvents() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelectedObject();
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 'a') {
        if (activeCanvas) {
          e.preventDefault();
          activeCanvas.discardActiveObject();
          const sel = new fabric.ActiveSelection(activeCanvas.getObjects().filter(o => !o.isPlaceholder), { canvas: activeCanvas });
          activeCanvas.setActiveObject(sel);
          activeCanvas.renderAll();
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
  window.electronAPI.onMenuImportImages(async () => {
    const paths = await window.electronAPI.selectImages();
    if (paths && paths.length) importImages(paths);
  });
  window.electronAPI.onMenuExportPdf(() => exportToPdf());
  window.electronAPI.onMenuExportPng(() => exportCurrentPage('png'));
  window.electronAPI.onMenuUndo(() => undo());
  window.electronAPI.onMenuRedo(() => redo());
  window.electronAPI.onMenuDelete(() => deleteSelectedObject());
  window.electronAPI.onMenuZoomIn(() => applyZoom(Math.min(4, state.zoom + 0.25)));
  window.electronAPI.onMenuZoomOut(() => applyZoom(Math.max(0.1, state.zoom - 0.25)));
  window.electronAPI.onMenuZoomReset(() => applyZoom(1));
}

// ============================================
// Context Menu
// ============================================

let ctxMenuEl = null;

function setupContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    if (e.target === canvasEl || e.target.closest('#canvas-area')) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY);
    }
  });
  document.addEventListener('click', () => hideContextMenu());
}

function showContextMenu(x, y) {
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'context-menu';
  ctxMenuEl.innerHTML = `
    <div class="context-menu-item" id="ctx-add-text">✍ 添加文字</div>
    <div class="context-menu-item" id="ctx-add-page">📄 添加页面</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" id="ctx-import">📂 导入图片</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" id="ctx-delete-page">🗑 删除当前页</div>
  `;
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = x + 'px';
  ctxMenuEl.style.top = y + 'px';

  document.getElementById('ctx-add-text').addEventListener('click', () => { addTextToCanvas(); hideContextMenu(); });
  document.getElementById('ctx-add-page').addEventListener('click', () => { addPage(); hideContextMenu(); });
  document.getElementById('ctx-import').addEventListener('click', async () => {
    const paths = await window.electronAPI.selectImages();
    if (paths && paths.length) importImages(paths);
    hideContextMenu();
  });
  document.getElementById('ctx-delete-page').addEventListener('click', () => { deletePage(state.currentPageIndex); hideContextMenu(); });
}

function hideContextMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}

function showPageContextMenu(e, pageIndex) {
  e.preventDefault();
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'context-menu';
  ctxMenuEl.innerHTML = `
    <div class="context-menu-item" id="ctx-go-page">跳转到第 ${pageIndex + 1} 页</div>
    ${state.pages.length > 1 ? '<div class="context-menu-item" id="ctx-del-page">🗑 删除此页</div>' : ''}
  `;
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = e.clientX + 'px';
  ctxMenuEl.style.top = e.clientY + 'px';

  document.getElementById('ctx-go-page').addEventListener('click', () => { switchToPage(pageIndex); hideContextMenu(); });
  const delBtn = document.getElementById('ctx-del-page');
  if (delBtn) delBtn.addEventListener('click', () => { deletePage(pageIndex); hideContextMenu(); });
}

// ============================================
// Export
// ============================================

async function exportToPdf() {
  if (!state.pages.length) return;
  showLoading('正在导出 PDF...');

  try {
    const page = state.pages[0];
    const W = page.canvas.width;
    const H = page.canvas.height;

    const { jsPDF } = window.jspdf;
    const isLandscape = W > H;
    const orientation = isLandscape ? 'landscape' : 'portrait';
    // Determine PDF page size based on canvas aspect ratio
    let pdfFormat = 'a4';
    if (Math.abs(W / H - 1) < 0.05) pdfFormat = [Math.max(W, H) * 0.2646, Math.min(W, H) * 0.2646];

    const pdf = new jsPDF({ orientation, unit: 'px', format: pdfFormat, hotfixes: ['px_scaling'] });

    for (let i = 0; i < state.pages.length; i++) {
      if (i > 0) pdf.addPage();

      const p = state.pages[i];
      const tempCanvas = p.canvas.toCanvas();

      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfW, pdfH);
      updateStatus(`导出中... ${i + 1}/${state.pages.length}`);
    }

    const defaultName = `PhotoBook_${Date.now()}.pdf`;
    const savePath = await window.electronAPI.saveFile({ defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (savePath) {
      const pdfData = pdf.output('arraybuffer');
      await window.electronAPI.writeFile({ filePath: savePath, data: pdfData, encoding: 'arraybuffer' });
      updateStatus(`PDF 已导出: ${savePath}`);
    }
  } catch (err) {
    console.error('PDF export error:', err);
    updateStatus('导出 PDF 失败: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function exportCurrentPage(format) {
  if (!activeCanvas) return;
  showLoading('正在导出...');

  try {
    const tempCanvas = activeCanvas.toCanvas();
    const defaultName = `PhotoBook_Page${state.currentPageIndex + 1}_${Date.now()}.${format}`;
    const filters = format === 'png'
      ? [{ name: 'PNG', extensions: ['png'] }]
      : [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }];

    const savePath = await window.electronAPI.saveFile({ defaultName, filters });
    if (savePath) {
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'png' ? 1 : 0.95;
      const dataUrl = tempCanvas.toDataURL(mime, quality);
      await window.electronAPI.writeFile({ filePath: savePath, data: dataUrl, encoding: 'base64' });
      updateStatus(`已导出: ${savePath}`);
    }
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
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `<div class="spinner"></div><div class="msg">${msg}</div>`;
  document.body.appendChild(overlay);
}

function hideLoading() {
  const old = document.getElementById('loading-overlay');
  if (old) old.remove();
}

// ============================================
// Status Bar
// ============================================

function updateStatus(text) {
  document.getElementById('status-text').textContent = text;
}

// ============================================
// Start
// ============================================

document.addEventListener('DOMContentLoaded', init);
