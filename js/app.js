(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const PHOTO_AUTHOR_MAX = 10;
  const PHOTO_AUTHOR_PLACEHOLDER = 'シフト　名前';
  const LAST_AUTHOR_KEY = 'lastPhotographer';

  const els = {
    btnEditMode: $('#btn-edit-mode'),
    btnReset: $('#btn-reset'),
    storeLayout: $('#store-layout'),
    editHint: $('#edit-hint'),
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
    resetDialog: $('#reset-dialog'),
    btnResetCancel: $('#btn-reset-cancel'),
    btnResetOk: $('#btn-reset-ok'),
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
    btnEditorCancel: $('#btn-editor-cancel'),
    btnEditorSave: $('#btn-editor-save'),
    btnEditorUndo: $('#btn-editor-undo'),
    btnEditorClear: $('#btn-editor-clear'),
    editorSize: $('#editor-size'),
    editorCanvas: $('#editor-canvas'),
    editorTextDialog: $('#editor-text-dialog'),
    editorTextInput: $('#editor-text-input'),
    btnEditorTextCancel: $('#btn-editor-text-cancel'),
    btnEditorTextOk: $('#btn-editor-text-ok'),
  };

  let state = {
    editMode: false,
    shelfMap: {},
    photoCounts: {},
    currentShelfId: null,
    photoUrlById: {},
    viewingPhotoId: null,
    nameDialogCallback: null,

    editor: {
      open: false,
      tool: 'pen',
      color: '#e53935',
      size: 6,
      isDrawing: false,
      img: null,
      photoId: null,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      undoStack: [],
      textTarget: null, // {x,y} in canvas coords
    },
  };

  async function init() {
    registerServiceWorker();
    bindEvents();
    await ensureShelves();
    await refresh();
    renderStoreLayout();
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=24').catch(() => {});
    }
  }

  async function ensureShelves() {
    const version = await DB.getLayoutVersion();
    if (version !== LAYOUT_TEMPLATE.version) {
      const shelves = await DB.getAllShelves();
      for (const shelf of shelves) {
        await DB.deleteShelf(shelf.id);
      }
      await DB.seedShelvesFromTemplate();
      await DB.setLayoutVersion(LAYOUT_TEMPLATE.version);
    } else {
      await DB.seedShelvesFromTemplate();
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

  function bindEvents() {
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

    els.btnReset.addEventListener('click', () => {
      els.resetDialog.hidden = false;
    });
    els.btnResetCancel.addEventListener('click', () => { els.resetDialog.hidden = true; });
    els.btnResetOk.addEventListener('click', handleReset);

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

    els.btnEditorCancel.addEventListener('click', closePhotoEditor);
    els.btnEditorSave.addEventListener('click', savePhotoEdits);
    els.btnEditorUndo.addEventListener('click', editorUndo);
    els.btnEditorClear.addEventListener('click', editorClear);
    els.editorSize.addEventListener('input', () => {
      state.editor.size = Number(els.editorSize.value) || 6;
    });

    document.querySelectorAll('.editor-tool').forEach((btn) => {
      btn.addEventListener('click', () => selectEditorTool(btn.dataset.tool));
    });
    document.querySelectorAll('.editor-color').forEach((btn) => {
      btn.addEventListener('click', () => selectEditorColor(btn.dataset.color));
    });

    els.editorCanvas.addEventListener('pointerdown', onEditorPointerDown);
    els.editorCanvas.addEventListener('pointermove', onEditorPointerMove);
    els.editorCanvas.addEventListener('pointerup', onEditorPointerUp);
    els.editorCanvas.addEventListener('pointercancel', onEditorPointerUp);

    els.btnEditorTextCancel.addEventListener('click', closeEditorTextDialog);
    els.btnEditorTextOk.addEventListener('click', confirmEditorText);
  }

  function toggleEditMode() {
    state.editMode = !state.editMode;
    els.btnEditMode.setAttribute('aria-pressed', String(state.editMode));
    els.editHint.hidden = !state.editMode;
    document.body.classList.toggle('edit-mode', state.editMode);
  }

  // --- Store Layout Rendering ---

  function renderStoreLayout() {
    const root = els.storeLayout;
    root.innerHTML = '';

    const floor = document.createElement('div');
    floor.className = 'store-floor';

    const chilled = createZoneCell('chilled', 'チルド');
    chilled.classList.add('store-entrance');
    floor.appendChild(chilled);

    const body = document.createElement('div');
    body.className = 'store-body';

    const walkin = createZoneCell('walkin', 'ウォークイン');
    const main = document.createElement('div');
    main.className = 'store-main';
    const register = createZoneCell('register', 'レジ');

    for (const row of LAYOUT_TEMPLATE.rows) {
      main.appendChild(createShelfRow(row));
    }

    body.appendChild(walkin);
    body.appendChild(main);
    body.appendChild(register);
    floor.appendChild(body);

    const bookshelf = createZoneCell('bookshelf', '本棚', true);
    floor.appendChild(bookshelf);

    root.appendChild(floor);
    updateShelfCells();
  }

  function createZoneCell(zone, fallbackLabel, horizontal) {
    const slotKey = zone;
    const shelf = state.shelfMap[slotKey];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `shelf-cell shelf-cell--zone shelf-cell--${zone}`;
    if (horizontal) el.classList.add('shelf-cell--horizontal');
    el.dataset.slotKey = slotKey;
    el.innerHTML = `
      <span class="shelf-cell__label">${escapeHtml(shelf?.name || fallbackLabel)}</span>
      <span class="shelf-cell__badge"></span>
      <span class="shelf-cell__check">✓</span>
    `;
    bindShelfCell(el, slotKey);
    return el;
  }

  function createShelfRow(row) {
    const rowEl = document.createElement('div');
    rowEl.className = 'shelf-row';
    rowEl.dataset.rowId = row.id;

    const label = document.createElement('div');
    label.className = 'shelf-row__label';
    label.textContent = row.label;
    rowEl.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'shelf-row__grid';
    grid.style.setProperty('--cols', row.gridCols);

    for (const cell of row.cells) {
      const tier = cell.rowStart ? 'full' : (cell.row === 1 ? 'top' : 'bottom');
      grid.appendChild(createShelfCell(cell.slotKey, cell.defaultName, tier, {
        col: cell.col,
        colSpan: cell.colSpan,
        row: cell.row,
        rowStart: cell.rowStart,
        rowEnd: cell.rowEnd,
        freezer: cell.freezer,
      }));
    }

    rowEl.appendChild(grid);
    return rowEl;
  }

  function createShelfCell(slotKey, fallbackName, tier, gridPos) {
    const shelf = state.shelfMap[slotKey];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'shelf-cell';
    if (tier === 'full') el.classList.add('shelf-cell--full');
    if (tier === 'top') el.classList.add('shelf-cell--top');
    if (tier === 'bottom') el.classList.add('shelf-cell--bottom');
    if (gridPos?.freezer) el.classList.add('shelf-cell--freezer');
    el.dataset.slotKey = slotKey;

    if (gridPos) {
      if (gridPos.colSpan && gridPos.colSpan > 1) {
        el.style.gridColumn = `${gridPos.col} / span ${gridPos.colSpan}`;
      } else {
        el.style.gridColumn = String(gridPos.col);
      }
      if (gridPos.rowEnd) {
        el.style.gridRow = `${gridPos.rowStart} / ${gridPos.rowEnd}`;
      } else {
        el.style.gridRow = String(gridPos.row);
      }
    }

    const name = shelf?.name || fallbackName;
    const shortName = shortenName(name);
    el.innerHTML = `
      <span class="shelf-cell__label">${escapeHtml(shortName)}</span>
      <span class="shelf-cell__badge"></span>
      <span class="shelf-cell__check">✓</span>
    `;
    bindShelfCell(el, slotKey);
    return el;
  }

  function shortenName(name) {
    return name;
  }

  function bindShelfCell(el, slotKey) {
    el.addEventListener('click', () => {
      const shelf = state.shelfMap[slotKey];
      if (!shelf) return;
      if (state.editMode) {
        showNameDialog('棚の名称を変更', shelf.name, async (name) => {
          if (!name || name === shelf.name) return;
          shelf.name = name;
          await DB.updateShelf(shelf);
          await refresh();
        });
      } else {
        openFolder(shelf.id);
      }
    });
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
      if (label && !el.classList.contains('shelf-cell--zone')) {
        label.textContent = shortenName(shelf.name);
      } else if (label) {
        label.textContent = shelf.name;
      }
    });
  }

  // --- Folder View ---

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
    if (state.photoUrlById[photoId]) {
      return state.photoUrlById[photoId];
    }
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
      if (!currentIds.has(Number(id))) {
        revokePhotoUrl(Number(id));
      }
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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    els.photoViewer.hidden = true;
    els.photoViewer.setAttribute('hidden', '');
    els.photoViewer.setAttribute('aria-hidden', 'true');
    els.photoViewer.classList.add('photo-viewer--closed');
    hideDeleteConfirm();
    state.viewingPhotoId = null;
    els.viewerImage.removeAttribute('src');
    els.viewerAuthorInput.value = '';
    els.viewerAuthorInput.readOnly = false;
    document.body.classList.remove('photo-viewer-open');
  }

  function openPhotoViewerElement() {
    els.photoViewer.classList.remove('photo-viewer--closed');
    els.photoViewer.removeAttribute('hidden');
    els.photoViewer.hidden = false;
    els.photoViewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('photo-viewer-open');
  }

  function showDeleteConfirm() {
    els.photoDeleteConfirm.hidden = false;
  }

  function hideDeleteConfirm() {
    els.photoDeleteConfirm.hidden = true;
  }

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
      // iOSが前回入力を自動入力するのを防ぐ
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
        await DB.updateShelf(shelf);
        els.folderTitle.textContent = name;
        await refresh();
      });
    });
  }

  async function handleSaveViewerAuthor() {
    if (!state.viewingPhotoId) return;
    const photo = await DB.getPhoto(state.viewingPhotoId);
    if (!photo) return;

    const author = els.viewerAuthorInput.value.trim().slice(0, PHOTO_AUTHOR_MAX);
    photo.author = author;
    await DB.updatePhoto(photo);
    if (author) localStorage.setItem(LAST_AUTHOR_KEY, author);

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

  // --- Photo Editor (draw/text/shapes) ---

  async function openPhotoEditor() {
    if (!state.viewingPhotoId) return;
    const photoId = state.viewingPhotoId;
    const photo = await DB.getPhoto(photoId);
    if (!photo) return;

    const imgUrl = getPhotoObjectUrl(photoId, photo.blob);
    const img = await loadImage(imgUrl);

    state.editor.open = true;
    state.editor.photoId = photoId;
    state.editor.img = img;
    state.editor.undoStack = [];
    state.editor.tool = 'pen';
    state.editor.color = '#e53935';
    state.editor.size = Number(els.editorSize.value) || 6;
    syncEditorToolButtons();
    syncEditorColorButtons();

    closePhotoViewer(); // iOSの重なり/入力バグ回避
    els.photoEditor.hidden = false;
    document.body.style.overflow = 'hidden';

    layoutEditorCanvas();
    drawEditorBase();
    pushEditorUndo(); // 初期状態
  }

  function closePhotoEditor() {
    els.photoEditor.hidden = true;
    document.body.style.overflow = '';
    state.editor.open = false;
    state.editor.isDrawing = false;
    state.editor.img = null;
    state.editor.photoId = null;
    state.editor.undoStack = [];
    closeEditorTextDialog();
  }

  function selectEditorTool(tool) {
    state.editor.tool = tool || 'pen';
    syncEditorToolButtons();
  }

  function selectEditorColor(color) {
    state.editor.color = color || '#e53935';
    syncEditorColorButtons();
  }

  function syncEditorToolButtons() {
    document.querySelectorAll('.editor-tool').forEach((btn) => {
      const pressed = btn.dataset.tool === state.editor.tool;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
  }

  function syncEditorColorButtons() {
    document.querySelectorAll('.editor-color').forEach((btn) => {
      const pressed = btn.dataset.color === state.editor.color;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      btn.style.background = btn.dataset.color;
    });
  }

  function layoutEditorCanvas() {
    const canvas = els.editorCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // compute image fit in CSS pixels space
    const cssW = rect.width;
    const cssH = rect.height;
    const img = state.editor.img;
    if (!img) return;
    const scale = Math.min(cssW / img.naturalWidth, cssH / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    state.editor.scale = scale;
    state.editor.offsetX = (cssW - drawW) / 2;
    state.editor.offsetY = (cssH - drawH) / 2;
  }

  function drawEditorBase() {
    const canvas = els.editorCanvas;
    const ctx = canvas.getContext('2d');
    const img = state.editor.img;
    if (!ctx || !img) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(
      img,
      state.editor.offsetX,
      state.editor.offsetY,
      img.naturalWidth * state.editor.scale,
      img.naturalHeight * state.editor.scale,
    );
  }

  function pushEditorUndo() {
    const canvas = els.editorCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    try {
      const data = ctx.getImageData(0, 0, Math.floor(rect.width), Math.floor(rect.height));
      state.editor.undoStack.push(data);
      if (state.editor.undoStack.length > 25) state.editor.undoStack.shift();
    } catch {
      // ignore (iOS memory edge cases)
    }
  }

  function editorUndo() {
    const canvas = els.editorCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (state.editor.undoStack.length <= 1) return;
    state.editor.undoStack.pop();
    const prev = state.editor.undoStack[state.editor.undoStack.length - 1];
    if (!prev) return;
    ctx.putImageData(prev, 0, 0);
  }

  function editorClear() {
    drawEditorBase();
    pushEditorUndo();
  }

  function getCanvasPoint(e) {
    const canvas = els.editorCanvas;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }

  function onEditorPointerDown(e) {
    if (!state.editor.open) return;
    if (e.button !== undefined && e.button !== 0) return;
    els.editorCanvas.setPointerCapture(e.pointerId);
    const p = getCanvasPoint(e);
    state.editor.isDrawing = true;
    state.editor.startX = p.x;
    state.editor.startY = p.y;
    state.editor.lastX = p.x;
    state.editor.lastY = p.y;

    if (state.editor.tool === 'pen' || state.editor.tool === 'eraser') {
      const ctx = els.editorCanvas.getContext('2d');
      if (!ctx) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = state.editor.size;
      if (state.editor.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = state.editor.color;
      }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    }
  }

  function onEditorPointerMove(e) {
    if (!state.editor.open) return;
    if (!state.editor.isDrawing) return;
    const p = getCanvasPoint(e);
    const ctx = els.editorCanvas.getContext('2d');
    if (!ctx) return;

    if (state.editor.tool === 'pen' || state.editor.tool === 'eraser') {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      state.editor.lastX = p.x;
      state.editor.lastY = p.y;
      e.preventDefault();
      return;
    }
  }

  function onEditorPointerUp(e) {
    if (!state.editor.open) return;
    if (!state.editor.isDrawing) return;
    state.editor.isDrawing = false;

    const p = getCanvasPoint(e);
    const ctx = els.editorCanvas.getContext('2d');
    if (!ctx) return;

    if (state.editor.tool === 'pen' || state.editor.tool === 'eraser') {
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
      pushEditorUndo();
      return;
    }

    if (state.editor.tool === 'arrow') {
      drawArrow(ctx, state.editor.startX, state.editor.startY, p.x, p.y, state.editor.color, state.editor.size);
      pushEditorUndo();
      return;
    }

    if (state.editor.tool === 'circle') {
      drawCircle(ctx, state.editor.startX, state.editor.startY, p.x, p.y, state.editor.color, state.editor.size);
      pushEditorUndo();
      return;
    }

    if (state.editor.tool === 'text') {
      state.editor.textTarget = { x: p.x, y: p.y };
      openEditorTextDialog();
      return;
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, size) {
    const headLen = Math.max(8, size * 2.2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCircle(ctx, x1, y1, x2, y2, color, size) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function openEditorTextDialog() {
    els.editorTextInput.value = '';
    els.editorTextDialog.hidden = false;
    setTimeout(() => {
      els.editorTextInput.focus();
    }, 50);
  }

  function closeEditorTextDialog() {
    els.editorTextDialog.hidden = true;
    state.editor.textTarget = null;
  }

  function confirmEditorText() {
    const t = state.editor.textTarget;
    if (!t) {
      closeEditorTextDialog();
      return;
    }
    const text = (els.editorTextInput.value || '').trim().slice(0, 20);
    closeEditorTextDialog();
    if (!text) return;

    const ctx = els.editorCanvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = state.editor.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 4;
    ctx.font = `700 ${Math.max(14, Math.round(state.editor.size * 3))}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", Meiryo, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.strokeText(text, t.x + 2, t.y + 2);
    ctx.fillText(text, t.x + 2, t.y + 2);
    ctx.restore();
    pushEditorUndo();
  }

  async function savePhotoEdits() {
    if (!state.editor.open || !state.editor.photoId) return;
    const photoId = state.editor.photoId;
    const photo = await DB.getPhoto(photoId);
    if (!photo) {
      closePhotoEditor();
      return;
    }

    const canvas = els.editorCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // export: crop to drawn image area (avoid black margins)
    const img = state.editor.img;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.floor(img.naturalWidth));
    out.height = Math.max(1, Math.floor(img.naturalHeight));
    const octx = out.getContext('2d');
    if (!octx) return;

    // draw from visible canvas into original resolution
    // mapping: (cssX - offsetX) / scale => imgX
    const sx = state.editor.offsetX;
    const sy = state.editor.offsetY;
    const sw = img.naturalWidth * state.editor.scale;
    const sh = img.naturalHeight * state.editor.scale;

    // read pixels from editor canvas area corresponding to image area
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(
      Math.floor(sx),
      Math.floor(sy),
      Math.max(1, Math.floor(sw)),
      Math.max(1, Math.floor(sh)),
    );

    // put into temp canvas at same pixel size (css pixels). then scale to natural
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

    // refresh urls and UI
    const newUrl = replacePhotoObjectUrl(photoId, newBlob);
    if (state.currentShelfId) {
      state.photoCounts = await DB.getPhotoCounts();
      updateShelfCells();
      await renderPhotos(state.currentShelfId);
    }
    closePhotoEditor();
    // reopen viewer with updated photo
    await openPhotoViewer(photoId);
    els.viewerImage.src = newUrl;
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
      try {
        canvas.toBlob((b) => resolve(b), type, quality);
      } catch {
        resolve(null);
      }
    });
  }

  function showNameDialog(title, defaultValue, callback) {
    els.nameDialogTitle.textContent = title;
    els.shelfNameInput.value = defaultValue;
    state.nameDialogCallback = callback;
    els.nameDialog.hidden = false;
    setTimeout(() => {
      els.shelfNameInput.focus();
      els.shelfNameInput.select();
    }, 100);
  }

  function closeNameDialog() {
    els.nameDialog.hidden = true;
    state.nameDialogCallback = null;
  }

  function confirmNameDialog() {
    const name = els.shelfNameInput.value.trim();
    if (!name) {
      els.shelfNameInput.focus();
      return;
    }
    const cb = state.nameDialogCallback;
    closeNameDialog();
    if (cb) cb(name);
  }

  async function handleReset() {
    els.resetDialog.hidden = true;
    await DB.resetAll();
    closeFolder();
    await refresh();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
