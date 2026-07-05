(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const PHOTO_AUTHOR_MAX = 10;
  const PHOTO_AUTHOR_PLACEHOLDER = 'シフト　名前';
  const PEN_COLOR = '#e53935';
  const PEN_SIZE = 6;

  const els = {
    headerStoreName: $('#header-store-name'),
    btnLayoutEdit: $('#btn-layout-edit'),
    btnEditMode: $('#btn-edit-mode'),
    btnReset: $('#btn-reset'),
    gridLayout: $('#grid-layout'),
    editHint: $('#edit-hint'),
    layoutHint: $('#layout-hint'),
    folderOverlay: $('#folder-overlay'),
    btnFolderBack: $('#btn-folder-back'),
    folderTitle: $('#folder-title'),
    btnRenameShelf: $('#btn-rename-shelf'),
    shelfChecked: $('#shelf-checked'),
    photoGrid: $('#photo-grid'),
    photoInputCamera: $('#photo-input-camera'),
    photoInputAlbum: $('#photo-input-album'),
    nameDialog: $('#name-dialog'),
    nameDialogTitle: $('#name-dialog-title'),
    shelfNameInput: $('#shelf-name-input'),
    btnNameCancel: $('#btn-name-cancel'),
    btnNameOk: $('#btn-name-ok'),
    deleteShelfDialog: $('#delete-shelf-dialog'),
    btnDeleteShelfCancel: $('#btn-delete-shelf-cancel'),
    btnDeleteShelfOk: $('#btn-delete-shelf-ok'),
    resetDialog: $('#reset-dialog'),
    btnResetCancel: $('#btn-reset-cancel'),
    btnResetOk: $('#btn-reset-ok'),
    storeSetupDialog: $('#store-setup-dialog'),
    storeNameInput: $('#store-name-input'),
    btnStoreSetupOk: $('#btn-store-setup-ok'),
    photoViewer: $('#photo-viewer'),
    viewerImage: $('#viewer-image'),
    btnViewerClose: $('#btn-viewer-close'),
    btnViewerDelete: $('#btn-viewer-delete'),
    viewerAuthorInput: $('#viewer-author-input'),
    btnViewerSaveAuthor: $('#btn-viewer-save-author'),
    btnViewerEdit: $('#btn-viewer-edit'),
    photoDeleteConfirm: $('#photo-delete-confirm'),
    btnViewerDeleteCancel: $('#btn-viewer-delete-cancel'),
    btnViewerDeleteOk: $('#btn-viewer-delete-ok'),
    photoEditor: $('#photo-editor'),
    btnEditorBack: $('#btn-editor-back'),
    btnEditorSave: $('#btn-editor-save'),
    editorCanvas: $('#editor-canvas'),
  };

  let state = {
    grid: null,
    editMode: false,
    layoutEditMode: false,
    shelfMap: {},
    photoCounts: {},
    currentShelfId: null,
    photoUrlById: {},
    viewingPhotoId: null,
    nameDialogCallback: null,
    pendingDeleteSlotKey: null,
    editor: {
      open: false,
      isDrawing: false,
      img: null,
      photoId: null,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      undoStack: [],
    },
  };

  async function init() {
    registerServiceWorker();
    bindEvents();
    state.grid = await DB.getGridLayout();
    await DB.syncShelvesFromGrid(state.grid);
    updateHeader();
    await refresh();
    renderGrid();
    if (!(await DB.getStoreName())) {
      els.storeSetupDialog.hidden = false;
      els.storeNameInput.focus();
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=1').catch(() => {});
    }
  }

  async function refresh() {
    const shelves = await DB.getAllShelves();
    state.shelfMap = {};
    for (const shelf of shelves) {
      state.shelfMap[shelf.slotKey] = shelf;
    }
    state.photoCounts = await DB.getPhotoCounts();
    updateShelfCells();
  }

  function updateHeader() {
    DB.getStoreName().then((name) => {
      const display = name || '店舗名未設定';
      els.headerStoreName.textContent = display;
      document.title = `${display} 棚清掃`;
    });
  }

  function bindEvents() {
    els.btnLayoutEdit.addEventListener('click', toggleLayoutEditMode);
    els.btnEditMode.addEventListener('click', toggleEditMode);
    els.btnFolderBack.addEventListener('click', closeFolder);
    els.folderOverlay.addEventListener('click', (e) => {
      if (e.target === els.folderOverlay) closeFolder();
    });
    els.shelfChecked.addEventListener('change', handleCheckChange);
    els.photoInputCamera.addEventListener('change', handlePhotoUpload);
    els.photoInputAlbum.addEventListener('change', handlePhotoUpload);
    els.btnRenameShelf.addEventListener('click', handleRenameShelf);
    els.btnNameCancel.addEventListener('click', closeNameDialog);
    els.btnNameOk.addEventListener('click', confirmNameDialog);
    els.shelfNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmNameDialog();
    });
    els.btnDeleteShelfCancel.addEventListener('click', () => {
      els.deleteShelfDialog.hidden = true;
      state.pendingDeleteSlotKey = null;
    });
    els.btnDeleteShelfOk.addEventListener('click', confirmDeleteShelf);
    els.btnReset.addEventListener('click', () => { els.resetDialog.hidden = false; });
    els.btnResetCancel.addEventListener('click', () => { els.resetDialog.hidden = true; });
    els.btnResetOk.addEventListener('click', handleReset);
    els.btnStoreSetupOk.addEventListener('click', handleStoreSetup);
    els.storeNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleStoreSetup();
    });
    els.btnViewerClose.addEventListener('click', closePhotoViewer);
    els.btnViewerDelete.addEventListener('click', showDeleteConfirm);
    els.btnViewerDeleteCancel.addEventListener('click', hideDeleteConfirm);
    els.btnViewerDeleteOk.addEventListener('click', handleDeletePhoto);
    els.btnViewerSaveAuthor.addEventListener('click', handleSaveViewerAuthor);
    els.btnViewerEdit.addEventListener('click', openPhotoEditor);
    els.viewerAuthorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveViewerAuthor();
      }
    });
    els.btnEditorBack.addEventListener('click', cancelPhotoEditor);
    els.btnEditorSave.addEventListener('click', savePhotoEdits);
    els.editorCanvas.addEventListener('pointerdown', onEditorPointerDown);
    els.editorCanvas.addEventListener('pointermove', onEditorPointerMove);
    els.editorCanvas.addEventListener('pointerup', onEditorPointerUp);
    els.editorCanvas.addEventListener('pointercancel', onEditorPointerUp);
  }

  async function handleStoreSetup() {
    const name = els.storeNameInput.value.trim();
    if (!name) {
      els.storeNameInput.focus();
      return;
    }
    await DB.setStoreName(name);
    els.storeSetupDialog.hidden = true;
    updateHeader();
  }

  function toggleLayoutEditMode() {
    if (state.editMode) toggleEditMode();
    state.layoutEditMode = !state.layoutEditMode;
    els.btnLayoutEdit.setAttribute('aria-pressed', String(state.layoutEditMode));
    els.layoutHint.hidden = !state.layoutEditMode;
    document.body.classList.toggle('layout-edit-mode', state.layoutEditMode);
    renderGrid();
  }

  function toggleEditMode() {
    if (state.layoutEditMode) toggleLayoutEditMode();
    state.editMode = !state.editMode;
    els.btnEditMode.setAttribute('aria-pressed', String(state.editMode));
    els.editHint.hidden = !state.editMode;
    document.body.classList.toggle('edit-mode', state.editMode);
  }

  function renderGrid() {
    const root = els.gridLayout;
    root.innerHTML = '';
    root.style.setProperty('--cols', state.grid.cols || DB.DEFAULT_COLS);

    for (const block of state.grid.blocks) {
      root.appendChild(createShelfCell(block));
    }

    if (state.layoutEditMode) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-add-shelf';
      addBtn.setAttribute('aria-label', '棚を追加');
      addBtn.textContent = '+';
      addBtn.addEventListener('click', addShelfBlock);
      root.appendChild(addBtn);
    }

    updateShelfCells();
  }

  function createShelfCell(block) {
    const shelf = state.shelfMap[block.slotKey];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'shelf-cell';
    el.dataset.slotKey = block.slotKey;
    const name = shelf?.name || block.defaultName;
    el.innerHTML = `
      <span class="shelf-cell__label">${escapeHtml(name)}</span>
      <span class="shelf-cell__badge"></span>
      <span class="shelf-cell__check">✓</span>
    `;
    el.addEventListener('click', () => onShelfClick(block));
    return el;
  }

  function onShelfClick(block) {
    const shelf = state.shelfMap[block.slotKey];
    if (!shelf) return;

    if (state.layoutEditMode) {
      state.pendingDeleteSlotKey = block.slotKey;
      els.deleteShelfDialog.hidden = false;
      return;
    }

    if (state.editMode) {
      showNameDialog('棚の名称を変更', shelf.name, async (name) => {
        if (!name || name === shelf.name) return;
        shelf.name = name;
        block.defaultName = name;
        await DB.updateShelf(shelf);
        await DB.setGridLayout(state.grid);
        await refresh();
        renderGrid();
      });
      return;
    }

    openFolder(shelf.id);
  }

  async function addShelfBlock() {
    const nextNum = state.grid.blocks.length + 1;
    const slotKey = `g-${Date.now()}`;
    state.grid.blocks.push({ slotKey, defaultName: String(nextNum) });
    state.grid.version += 1;
    await DB.setGridLayout(state.grid);
    await DB.syncShelvesFromGrid(state.grid);
    await refresh();
    renderGrid();
  }

  async function confirmDeleteShelf() {
    const slotKey = state.pendingDeleteSlotKey;
    els.deleteShelfDialog.hidden = true;
    state.pendingDeleteSlotKey = null;
    if (!slotKey || state.grid.blocks.length <= 1) return;

    state.grid.blocks = state.grid.blocks.filter((b) => b.slotKey !== slotKey);
    state.grid.version += 1;
    await DB.setGridLayout(state.grid);
    await DB.syncShelvesFromGrid(state.grid);
    await refresh();
    renderGrid();
  }

  function updateShelfCells() {
    document.querySelectorAll('.shelf-cell[data-slot-key]').forEach((el) => {
      const slotKey = el.dataset.slotKey;
      const shelf = state.shelfMap[slotKey];
      if (!shelf) return;

      const count = state.photoCounts[shelf.id] || 0;
      el.classList.toggle('shelf-cell--done', shelf.checked);
      el.classList.toggle('shelf-cell--has-photos', count > 0);

      const badge = el.querySelector('.shelf-cell__badge');
      if (badge) {
        badge.textContent = count > 0 ? count : '';
        badge.hidden = count === 0;
      }

      const label = el.querySelector('.shelf-cell__label');
      if (label) label.textContent = shelf.name;
    });
  }

  async function openFolder(shelfId) {
    state.currentShelfId = shelfId;
    const shelf = await DB.getShelf(shelfId);
    if (!shelf) return;
    els.folderTitle.textContent = shelf.name;
    els.shelfChecked.checked = shelf.checked;
    els.folderOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    await renderPhotos(shelfId);
  }

  function closeFolder() {
    els.folderOverlay.hidden = true;
    document.body.style.overflow = '';
    state.currentShelfId = null;
    revokeAllPhotoUrls();
    refresh();
  }

  function getPhotoObjectUrl(photoId, blob) {
    if (state.photoUrlById[photoId]) return state.photoUrlById[photoId];
    const url = URL.createObjectURL(blob);
    state.photoUrlById[photoId] = url;
    return url;
  }

  function revokePhotoUrl(photoId) {
    const url = state.photoUrlById[photoId];
    if (!url) return;
    URL.revokeObjectURL(url);
    delete state.photoUrlById[photoId];
  }

  function replacePhotoObjectUrl(photoId, newBlob) {
    revokePhotoUrl(photoId);
    return getPhotoObjectUrl(photoId, newBlob);
  }

  function revokeAllPhotoUrls() {
    Object.keys(state.photoUrlById).forEach((id) => revokePhotoUrl(Number(id)));
  }

  async function renderPhotos(shelfId) {
    const photos = await DB.getPhotosByShelf(shelfId);
    const currentIds = new Set(photos.map((p) => p.id));
    for (const id of Object.keys(state.photoUrlById)) {
      if (!currentIds.has(Number(id))) revokePhotoUrl(Number(id));
    }

    els.photoGrid.innerHTML = '';
    if (photos.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'folder-empty';
      empty.textContent = 'まだ写真がありません';
      els.photoGrid.appendChild(empty);
      return;
    }

    photos.sort((a, b) => a.createdAt - b.createdAt);
    for (const photo of photos) {
      const url = getPhotoObjectUrl(photo.id, photo.blob);
      const item = document.createElement('div');
      item.className = 'photo-item';
      const date = new Date(photo.createdAt);
      const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const author = photo.author || '';
      const authorHtml = author
        ? `<span class="photo-item__author">${escapeHtml(author)}</span>`
        : '<span class="photo-item__author photo-item__author--empty">名前未入力</span>';
      item.innerHTML = `
        <img src="${url}" alt="清掃写真">
        <div class="photo-item__footer">
          ${authorHtml}
          <span class="photo-item__time">${timeStr}</span>
        </div>
      `;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPhotoViewer(photo.id);
      });
      els.photoGrid.appendChild(item);
    }
  }

  function closePhotoViewer() {
    els.viewerAuthorInput.blur();
    els.photoViewer.hidden = true;
    hideDeleteConfirm();
    state.viewingPhotoId = null;
    els.viewerImage.removeAttribute('src');
    els.viewerAuthorInput.value = '';
    els.viewerAuthorInput.readOnly = false;
    document.body.classList.remove('photo-viewer-open');
  }

  function openPhotoViewerElement() {
    els.photoViewer.hidden = false;
    document.body.classList.add('photo-viewer-open');
  }

  function showDeleteConfirm() { els.photoDeleteConfirm.hidden = false; }
  function hideDeleteConfirm() { els.photoDeleteConfirm.hidden = true; }

  async function handleCheckChange() {
    if (!state.currentShelfId) return;
    const shelf = await DB.getShelf(state.currentShelfId);
    shelf.checked = els.shelfChecked.checked;
    await DB.updateShelf(shelf);
    await refresh();
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file || !state.currentShelfId) return;
    const photoId = await DB.addPhoto(state.currentShelfId, file);
    e.target.value = '';
    state.photoCounts = await DB.getPhotoCounts();
    updateShelfCells();
    await renderPhotos(state.currentShelfId);
    await openPhotoViewer(photoId);
  }

  async function openPhotoViewer(photoId) {
    const photo = await DB.getPhoto(photoId);
    if (!photo) return;
    state.viewingPhotoId = photoId;
    els.viewerImage.src = getPhotoObjectUrl(photoId, photo.blob);
    hideDeleteConfirm();
    openPhotoViewerElement();
    els.viewerAuthorInput.value = '';
    els.viewerAuthorInput.placeholder = PHOTO_AUTHOR_PLACEHOLDER;
    const author = photo.author || '';
    if (author) {
      els.viewerAuthorInput.readOnly = false;
      els.viewerAuthorInput.value = author;
    } else {
      els.viewerAuthorInput.readOnly = true;
      requestAnimationFrame(() => {
        if (state.viewingPhotoId !== photoId) return;
        els.viewerAuthorInput.readOnly = false;
        els.viewerAuthorInput.focus();
      });
    }
  }

  function handleRenameShelf() {
    if (!state.currentShelfId) return;
    DB.getShelf(state.currentShelfId).then((shelf) => {
      showNameDialog('棚の名称を変更', shelf.name, async (name) => {
        if (!name || name === shelf.name) return;
        shelf.name = name;
        const block = state.grid.blocks.find((b) => b.slotKey === shelf.slotKey);
        if (block) block.defaultName = name;
        await DB.updateShelf(shelf);
        await DB.setGridLayout(state.grid);
        els.folderTitle.textContent = name;
        await refresh();
        renderGrid();
      });
    });
  }

  async function handleSaveViewerAuthor() {
    if (!state.viewingPhotoId) return;
    const photo = await DB.getPhoto(state.viewingPhotoId);
    if (!photo) return;
    photo.author = els.viewerAuthorInput.value.trim().slice(0, PHOTO_AUTHOR_MAX);
    await DB.updatePhoto(photo);
    const shelfId = state.currentShelfId;
    closePhotoViewer();
    requestAnimationFrame(() => {
      if (shelfId) renderPhotos(shelfId);
    });
  }

  async function handleDeletePhoto() {
    if (!state.viewingPhotoId) return;
    await DB.deletePhoto(state.viewingPhotoId);
    closePhotoViewer();
    if (state.currentShelfId) {
      state.photoCounts = await DB.getPhotoCounts();
      updateShelfCells();
      await renderPhotos(state.currentShelfId);
    }
  }

  async function openPhotoEditor() {
    if (!state.viewingPhotoId) return;
    const photoId = state.viewingPhotoId;
    const photo = await DB.getPhoto(photoId);
    if (!photo) return;
    const img = await loadImage(getPhotoObjectUrl(photoId, photo.blob));
    state.editor.open = true;
    state.editor.photoId = photoId;
    state.editor.img = img;
    state.editor.undoStack = [];
    closePhotoViewer();
    els.photoEditor.hidden = false;
    document.body.style.overflow = 'hidden';
    layoutEditorCanvas();
    drawEditorBase();
    pushEditorUndo();
  }

  function cancelPhotoEditor() {
    const photoId = state.editor.photoId;
    closePhotoEditor();
    if (photoId) openPhotoViewer(photoId);
  }

  function closePhotoEditor() {
    els.photoEditor.hidden = true;
    document.body.style.overflow = '';
    state.editor.open = false;
    state.editor.isDrawing = false;
    state.editor.img = null;
    state.editor.photoId = null;
    state.editor.undoStack = [];
  }

  function layoutEditorCanvas() {
    const canvas = els.editorCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = state.editor.img;
    if (!img) return;
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    state.editor.scale = scale;
    state.editor.offsetX = (rect.width - img.naturalWidth * scale) / 2;
    state.editor.offsetY = (rect.height - img.naturalHeight * scale) / 2;
  }

  function drawEditorBase() {
    const canvas = els.editorCanvas;
    const ctx = canvas.getContext('2d');
    const img = state.editor.img;
    if (!ctx || !img) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, state.editor.offsetX, state.editor.offsetY, img.naturalWidth * state.editor.scale, img.naturalHeight * state.editor.scale);
  }

  function pushEditorUndo() {
    const canvas = els.editorCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    try {
      const data = ctx.getImageData(0, 0, Math.floor(rect.width), Math.floor(rect.height));
      state.editor.undoStack.push(data);
      if (state.editor.undoStack.length > 20) state.editor.undoStack.shift();
    } catch { /* ignore */ }
  }

  function getCanvasPoint(e) {
    const rect = els.editorCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onEditorPointerDown(e) {
    if (!state.editor.open || (e.button !== undefined && e.button !== 0)) return;
    els.editorCanvas.setPointerCapture(e.pointerId);
    const p = getCanvasPoint(e);
    state.editor.isDrawing = true;
    const ctx = els.editorCanvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = PEN_SIZE;
    ctx.strokeStyle = PEN_COLOR;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  }

  function onEditorPointerMove(e) {
    if (!state.editor.open || !state.editor.isDrawing) return;
    const p = getCanvasPoint(e);
    const ctx = els.editorCanvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    e.preventDefault();
  }

  function onEditorPointerUp() {
    if (!state.editor.open || !state.editor.isDrawing) return;
    state.editor.isDrawing = false;
    const ctx = els.editorCanvas.getContext('2d');
    if (ctx) ctx.closePath();
    pushEditorUndo();
  }

  async function savePhotoEdits() {
    if (!state.editor.open || !state.editor.photoId) return;
    const photoId = state.editor.photoId;
    const photo = await DB.getPhoto(photoId);
    if (!photo) { closePhotoEditor(); return; }
    const canvas = els.editorCanvas;
    const img = state.editor.img;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = Math.max(1, img.naturalWidth);
    out.height = Math.max(1, img.naturalHeight);
    const octx = out.getContext('2d');
    if (!octx) return;
    const sx = state.editor.offsetX;
    const sy = state.editor.offsetY;
    const sw = img.naturalWidth * state.editor.scale;
    const sh = img.naturalHeight * state.editor.scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(Math.floor(sx), Math.floor(sy), Math.max(1, Math.floor(sw)), Math.max(1, Math.floor(sh)));
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.floor(sw));
    tmp.height = Math.max(1, Math.floor(sh));
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.putImageData(imageData, 0, 0);
    octx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, out.width, out.height);
    const newBlob = await canvasToBlob(out, 'image/jpeg', 0.9);
    if (!newBlob) return;
    photo.blob = newBlob;
    await DB.updatePhoto(photo);
    replacePhotoObjectUrl(photoId, newBlob);
    if (state.currentShelfId) {
      state.photoCounts = await DB.getPhotoCounts();
      updateShelfCells();
      await renderPhotos(state.currentShelfId);
    }
    closePhotoEditor();
    await openPhotoViewer(photoId);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      try { canvas.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); }
    });
  }

  function showNameDialog(title, defaultValue, callback) {
    els.nameDialogTitle.textContent = title;
    els.shelfNameInput.value = defaultValue;
    state.nameDialogCallback = callback;
    els.nameDialog.hidden = false;
    setTimeout(() => { els.shelfNameInput.focus(); els.shelfNameInput.select(); }, 100);
  }

  function closeNameDialog() {
    els.nameDialog.hidden = true;
    state.nameDialogCallback = null;
  }

  function confirmNameDialog() {
    const name = els.shelfNameInput.value.trim();
    if (!name) { els.shelfNameInput.focus(); return; }
    const cb = state.nameDialogCallback;
    closeNameDialog();
    if (cb) cb(name);
  }

  async function handleReset() {
    els.resetDialog.hidden = true;
    await DB.resetAll();
    closeFolder();
    await refresh();
    renderGrid();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
