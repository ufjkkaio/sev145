(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const PHOTO_AUTHOR_MAX = 10;
  const PHOTO_AUTHOR_PLACEHOLDER = 'シフト　名前';
  const LAST_AUTHOR_KEY = 'lastPhotographer';
  const STORE_NUMBER = '528089';

  const els = {
    appRoot: $('#app'),
    authGate: $('#auth-gate'),
    authError: $('#auth-error'),
    authPanelHome: $('#auth-panel-home'),
    authPanelLogin: $('#auth-panel-login'),
    authPanelQr: $('#auth-panel-qr'),
    authLoginNumber: $('#auth-login-number'),
    authLoginPass: $('#auth-login-pass'),
    authQrFile: $('#auth-qr-file'),
    btnEditMode: $('#btn-edit-mode'),
    btnReset: $('#btn-reset'),
    storeLayout: $('#store-layout'),
    editHint: $('#edit-hint'),
    folderOverlay: $('#folder-overlay'),
    folder: $('.folder'),
    btnFolderBack: $('#btn-folder-back'),
    folderTitle: $('#folder-title'),
    btnRenameShelf: $('#btn-rename-shelf'),
    btnSelectPhotos: $('#btn-select-photos'),
    photoSelectBar: $('#photo-select-bar'),
    photoSelectCount: $('#photo-select-count'),
    btnSelectAll: $('#btn-select-all'),
    btnSelectMove: $('#btn-select-move'),
    btnSelectDelete: $('#btn-select-delete'),
    btnSelectCancel: $('#btn-select-cancel'),
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
    btnViewerMove: $('#btn-viewer-move'),
    photoDeleteConfirm: $('#photo-delete-confirm'),
    btnViewerDeleteCancel: $('#btn-viewer-delete-cancel'),
    btnViewerDeleteOk: $('#btn-viewer-delete-ok'),

    photoEditor: $('#photo-editor'),
    btnEditorBack: $('#btn-editor-back'),
    btnEditorSave: $('#btn-editor-save'),
    editorCanvas: $('#editor-canvas'),

    moveShelfDialog: $('#move-shelf-dialog'),
    moveShelfDialogTitle: $('#move-shelf-dialog-title'),
    moveShelfDialogHint: $('#move-shelf-dialog-hint'),
    moveShelfList: $('#move-shelf-list'),
    btnMoveShelfCancel: $('#btn-move-shelf-cancel'),
  };

  let state = {
    editMode: false,
    shelfMap: {},
    photoCounts: {},
    currentShelfId: null,
    photoUrlById: {},
    viewingPhotoId: null,
    nameDialogCallback: null,
    moveShelfMode: null,
    pendingMovePhotoId: null,
    photoSelectMode: false,
    selectedPhotoIds: new Set(),
    folderPhotoCount: 0,

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

  const PEN_COLOR = '#e53935';
  const PEN_SIZE = 6;

  function getActiveLayout() {
    return LAYOUT_TEMPLATE;
  }

  async function init() {
    registerServiceWorker();
    showBuildVersion();
    bindEvents();
    bindAuthEvents();

    try {
      let entry = await CloudAuth.tryLoginFromUrl();
      if (!entry) entry = await CloudAuth.restoreSession();
      if (entry) assert145Store(entry);
      if (!entry) {
        showAuthHub('home');
        return;
      }
      await bootApp();
    } catch (err) {
      console.error(err);
      showAuthHub('login', err.message || '接続に失敗しました');
    }
  }

  function assert145Store(entry) {
    const meta = CloudAuth.getCurrentStoreMeta();
    const layoutType = meta?.layoutType || entry?.layoutType;
    const storeNumber = meta?.storeNumber || entry?.storeNumber;
    if (layoutType !== 'fixed-145' && storeNumber !== STORE_NUMBER) {
      throw new Error('145号店（528089）の合言葉でログインしてください');
    }
  }

  async function bootApp() {
    assert145Store();
    hideAuthHub();
    CloudDB.stopSync();
    CloudDB.setOnChange(() => {
      refresh().then(() => {
        if (state.currentShelfId) renderPhotos(state.currentShelfId);
      });
    });
    CloudDB.startSync();
    await ensureShelves();
    await refresh();
    renderStoreLayout();
  }

  function showAuthError(msg) {
    if (!msg) {
      els.authError.hidden = true;
      els.authError.textContent = '';
      return;
    }
    els.authError.hidden = false;
    els.authError.textContent = msg;
  }

  function showAuthPanel(name) {
    const panels = {
      home: els.authPanelHome,
      login: els.authPanelLogin,
      qr: els.authPanelQr,
    };
    Object.values(panels).forEach((p) => { if (p) p.hidden = true; });
    if (panels[name]) panels[name].hidden = false;
  }

  function showAuthHub(panel = 'home', errorMsg = '') {
    if (els.appRoot) els.appRoot.hidden = true;
    if (els.authGate) els.authGate.hidden = false;
    showAuthPanel(panel);
    showAuthError(errorMsg);
  }

  function hideAuthHub() {
    if (els.authGate) els.authGate.hidden = true;
    if (els.appRoot) els.appRoot.hidden = false;
    showAuthError('');
  }

  function bindAuthEvents() {
    $('#btn-auth-login')?.addEventListener('click', () => {
      showAuthError('');
      showAuthPanel('login');
      els.authLoginPass?.focus();
    });
    $('#btn-auth-qr')?.addEventListener('click', () => {
      showAuthError('');
      showAuthPanel('qr');
    });
    $('#btn-auth-login-back')?.addEventListener('click', () => showAuthPanel('home'));
    $('#btn-auth-qr-back')?.addEventListener('click', () => showAuthPanel('home'));

    $('#btn-auth-login-go')?.addEventListener('click', async () => {
      try {
        showAuthError('');
        await CloudAuth.login(STORE_NUMBER, els.authLoginPass.value);
        assert145Store();
        await bootApp();
      } catch (err) {
        showAuthError(err.message);
      }
    });

    $('#btn-auth-qr-pick')?.addEventListener('click', () => els.authQrFile?.click());
    els.authQrFile?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        showAuthError('');
        const text = await decodeQrFromFile(file);
        await CloudAuth.loginFromQr(text);
        assert145Store();
        await bootApp();
      } catch (err) {
        showAuthError(err.message);
      }
    });
  }

  async function decodeQrFromFile(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (!code?.data) throw new Error('QRコードが見つかりませんでした');
    return code.data;
  }

  function showBuildVersion() {
    const script = document.querySelector('script[src*="app.js"]');
    const v = script && new URL(script.src, location.href).searchParams.get('v');
    const el = document.getElementById('app-version');
    if (el && v) el.textContent = `v${v}`;
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=69').catch(() => {});
    }
  }

  async function ensureShelves() {
    const layout = getActiveLayout();
    const version = await DB.getLayoutVersion();
    const slots = getAllSlots();
    await DB.syncShelvesFromTemplate(slots);
    if (version !== layout.version) {
      await DB.setLayoutVersion(layout.version);
    }
  }

  async function refresh() {
    const shelves = await DB.getAllShelves();
    state.shelfMap = {};
    const repairs = [];
    for (const shelf of shelves) {
      const prev = state.shelfMap[shelf.slotKey];
      if (!prev) {
        state.shelfMap[shelf.slotKey] = shelf;
        continue;
      }
      const checked = prev.checked || shelf.checked;
      const canonical = Number(shelf.id) < Number(prev.id) ? shelf : prev;
      if (checked && !canonical.checked) {
        repairs.push(canonical);
      }
      state.shelfMap[shelf.slotKey] = { ...canonical, checked };
    }
    for (const shelf of repairs) {
      shelf.checked = true;
      await DB.updateShelf(shelf);
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
    els.btnSelectPhotos.addEventListener('click', enterPhotoSelectMode);
    els.btnSelectAll.addEventListener('click', toggleSelectAllPhotos);
    els.btnSelectMove.addEventListener('click', () => openMoveShelfDialog('selected'));
    els.btnSelectDelete.addEventListener('click', handleDeleteSelectedPhotos);
    els.btnSelectCancel.addEventListener('click', exitPhotoSelectMode);

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
    els.btnViewerMove.addEventListener('click', () => openMoveShelfDialog('photo'));
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

    els.btnMoveShelfCancel.addEventListener('click', closeMoveShelfDialog);
    els.moveShelfDialog.addEventListener('click', (e) => {
      if (e.target === els.moveShelfDialog) closeMoveShelfDialog();
    });
  }

  function toggleEditMode() {
    state.editMode = !state.editMode;
    els.btnEditMode.setAttribute('aria-pressed', String(state.editMode));
    els.editHint.hidden = !state.editMode;
    document.body.classList.toggle('edit-mode', state.editMode);
  }

  // --- Store Layout Rendering ---

  function renderStoreLayout() {
    const layout = getActiveLayout();
    const root = els.storeLayout;
    root.innerHTML = '';

    const floor = document.createElement('div');
    floor.className = 'store-floor';

    const registerZone = layout.zones.find((z) => z.placement === 'right');

    if (layout.topPerimeter) {
      floor.appendChild(createTopPerimeter(layout.topPerimeter));
    }

    const body = document.createElement('div');
    body.className = 'store-body';

    const leftCol = document.createElement('div');
    leftCol.className = 'store-left-col';
    if (layout.leftPerimeter) {
      const leftStack = document.createElement('div');
      leftStack.className = 'store-perimeter-left';
      for (const cell of layout.leftPerimeter) {
        leftStack.appendChild(createPerimeterCell(cell.slotKey, cell.defaultName));
      }
      leftCol.appendChild(leftStack);
    }

    const main = document.createElement('div');
    main.className = 'store-main';
    for (const row of layout.rows) {
      main.appendChild(createShelfRow(row));
    }
    if (layout.bottomPerimeter) {
      main.appendChild(createBottomPerimeter(layout.bottomPerimeter));
    }

    body.appendChild(leftCol);
    body.appendChild(main);
    if (registerZone) {
      body.appendChild(createZoneCell(registerZone.slotKey, registerZone.defaultName));
    }
    floor.appendChild(body);

    root.appendChild(floor);
    updateShelfCells();
  }

  function appendPerimeterGap(parent, size = 'full') {
    const gap = document.createElement('div');
    gap.className = 'store-perimeter-gap';
    if (size === 'half') gap.classList.add('store-perimeter-gap--half');
    gap.setAttribute('aria-hidden', 'true');
    parent.appendChild(gap);
  }

  function createTopPerimeter(top) {
    const row = document.createElement('div');
    row.className = 'store-perimeter-top__row';
    for (const cell of top.cells) {
      if (cell.gap) {
        appendPerimeterGap(row, cell.gap === 'half' ? 'half' : 'full');
      } else {
        row.appendChild(createPerimeterCell(cell.slotKey, cell.defaultName));
      }
    }
    return row;
  }

  function createBottomPerimeter(cells) {
    const row = document.createElement('div');
    row.className = 'store-perimeter-bottom';
    for (const cell of cells) {
      if (cell.gap) {
        appendPerimeterGap(row, cell.gap === 'half' ? 'half' : 'full');
      } else {
        row.appendChild(createPerimeterCell(cell.slotKey, cell.defaultName));
      }
    }
    return row;
  }

  function createPerimeterCell(slotKey, fallbackName) {
    const shelf = state.shelfMap[slotKey];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'shelf-cell shelf-cell--perimeter';
    el.dataset.slotKey = slotKey;
    const name = shelf?.name || fallbackName;
    el.innerHTML = `
      <span class="shelf-cell__label">${escapeHtml(shortenName(name))}</span>
      <span class="shelf-cell__badge"></span>
      <span class="shelf-cell__check">✓</span>
    `;
    bindShelfCell(el, slotKey);
    return el;
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
    updateSelectPhotosButton(shelfId);
  }

  async function updateSelectPhotosButton(shelfId) {
    if (!els.btnSelectPhotos) return;
    const photos = await DB.getPhotosByShelf(shelfId);
    els.btnSelectPhotos.hidden = photos.length === 0 || state.photoSelectMode;
  }

  function enterPhotoSelectMode() {
    if (!state.currentShelfId) return;
    state.photoSelectMode = true;
    state.selectedPhotoIds = new Set();
    if (els.folder) els.folder.classList.add('folder--select-mode');
    if (els.photoSelectBar) els.photoSelectBar.hidden = false;
    if (els.btnSelectPhotos) els.btnSelectPhotos.hidden = true;
    updatePhotoSelectBar();
    renderPhotos(state.currentShelfId);
  }

  function exitPhotoSelectMode() {
    state.photoSelectMode = false;
    state.selectedPhotoIds = new Set();
    if (els.folder) els.folder.classList.remove('folder--select-mode');
    if (els.photoSelectBar) els.photoSelectBar.hidden = true;
    updatePhotoSelectBar();
    if (state.currentShelfId) {
      updateSelectPhotosButton(state.currentShelfId);
      renderPhotos(state.currentShelfId);
    }
  }

  function togglePhotoSelection(photoId) {
    if (state.selectedPhotoIds.has(photoId)) {
      state.selectedPhotoIds.delete(photoId);
    } else {
      state.selectedPhotoIds.add(photoId);
    }
    updatePhotoSelectBar();
    renderPhotos(state.currentShelfId);
  }

  async function toggleSelectAllPhotos() {
    if (!state.currentShelfId) return;
    const photos = await DB.getPhotosByShelf(state.currentShelfId);
    const allSelected = photos.length > 0 && photos.every((p) => state.selectedPhotoIds.has(p.id));
    state.selectedPhotoIds = allSelected
      ? new Set()
      : new Set(photos.map((p) => p.id));
    updatePhotoSelectBar();
    renderPhotos(state.currentShelfId);
  }

  function updatePhotoSelectBar() {
    const count = state.selectedPhotoIds.size;
    if (els.photoSelectCount) {
      els.photoSelectCount.textContent = count > 0
        ? `${count}枚選択中`
        : '写真をタップして選択';
    }
    if (els.btnSelectMove) els.btnSelectMove.disabled = count === 0;
    if (els.btnSelectDelete) els.btnSelectDelete.disabled = count === 0;
    if (els.btnSelectAll) {
      const allSelected = state.folderPhotoCount > 0
        && state.selectedPhotoIds.size === state.folderPhotoCount;
      els.btnSelectAll.textContent = allSelected ? '選択解除' : 'すべて選択';
    }
  }

  async function handleDeleteSelectedPhotos() {
    const ids = [...state.selectedPhotoIds];
    if (ids.length === 0) {
      alert('削除する写真を選んでください');
      return;
    }
    if (!confirm(`選択した${ids.length}枚の写真を削除しますか？`)) return;

    try {
      await DB.deletePhotos(ids);
      exitPhotoSelectMode();
      state.photoCounts = await DB.getPhotoCounts();
      updateShelfCells();
      await renderPhotos(state.currentShelfId);
      updateSelectPhotosButton(state.currentShelfId);
      alert(`${ids.length}枚を削除しました`);
    } catch (err) {
      alert(err.message || '削除に失敗しました');
    }
  }

  function closeFolder() {
    exitPhotoSelectMode();
    els.folderOverlay.hidden = true;
    document.body.style.overflow = '';
    state.currentShelfId = null;
    revokeAllPhotoUrls();
    refresh();
  }

  function getPhotoDisplayUrl(photo) {
    if (photo.url) return photo.url;
    if (photo.blob) return getPhotoObjectUrl(photo.id, photo.blob);
    return '';
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
    Object.keys(state.photoUrlById).forEach((id) => revokePhotoUrl(id));
  }

  async function renderPhotos(shelfId) {
    const photos = await DB.getPhotosByShelf(shelfId);
    state.folderPhotoCount = photos.length;
    const currentIds = new Set(photos.map((p) => p.id));

    for (const id of Object.keys(state.photoUrlById)) {
      if (!currentIds.has(id)) {
        revokePhotoUrl(id);
      }
    }

    els.photoGrid.innerHTML = '';

    if (photos.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'folder-empty';
      empty.textContent = 'まだ写真がありません';
      els.photoGrid.appendChild(empty);
      updatePhotoSelectBar();
      return;
    }

    photos.sort((a, b) => a.createdAt - b.createdAt);

    for (const photo of photos) {
      const url = getPhotoDisplayUrl(photo);
      const isSelected = state.selectedPhotoIds.has(photo.id);

      const item = document.createElement('div');
      item.className = 'photo-item' + (isSelected ? ' photo-item--selected' : '');

      const date = new Date(photo.createdAt);
      const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      const author = photo.author || '';
      const authorHtml = author
        ? `<span class="photo-item__author">${escapeHtml(author)}</span>`
        : '<span class="photo-item__author photo-item__author--empty">名前未入力</span>';

      const checkHtml = state.photoSelectMode
        ? `<div class="photo-item__check" aria-hidden="true">${isSelected ? '✓' : ''}</div>`
        : '';

      item.innerHTML = `
        ${checkHtml}
        <img src="${url}" alt="清掃写真">
        <div class="photo-item__footer">
          ${authorHtml}
          <span class="photo-item__time">${timeStr}</span>
        </div>
      `;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.photoSelectMode) {
          togglePhotoSelection(photo.id);
        } else {
          openPhotoViewer(photo.id);
        }
      });
      els.photoGrid.appendChild(item);
    }

    if (state.photoSelectMode) {
      updatePhotoSelectBar();
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
    updateSelectPhotosButton(state.currentShelfId);
    await openPhotoViewer(photoId);
  }

  async function openPhotoViewer(photoId) {
    const photo = await DB.getPhoto(photoId);
    if (!photo) return;

    state.viewingPhotoId = photoId;
    els.viewerImage.src = getPhotoDisplayUrl(photo);
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
      updateSelectPhotosButton(state.currentShelfId);
    }
  }

  function sortShelvesForPicker(shelves) {
    return [...shelves].sort((a, b) =>
      a.name.localeCompare(b.name, 'ja', { numeric: true, sensitivity: 'base' }),
    );
  }

  async function getLayoutShelvesForPicker() {
    const validKeys = new Set(getAllSlots().map((s) => s.slotKey));
    const bySlot = new Map();
    const shelves = await DB.getAllShelves();
    for (const shelf of shelves) {
      if (!validKeys.has(shelf.slotKey)) continue;
      const prev = bySlot.get(shelf.slotKey);
      if (!prev) {
        bySlot.set(shelf.slotKey, shelf);
        continue;
      }
      const checked = prev.checked || shelf.checked;
      const canonical = Number(shelf.id) < Number(prev.id) ? shelf : prev;
      bySlot.set(shelf.slotKey, { ...canonical, checked });
    }
    return sortShelvesForPicker([...bySlot.values()]);
  }

  function closeMoveShelfDialog() {
    if (els.moveShelfDialog) els.moveShelfDialog.hidden = true;
    state.moveShelfMode = null;
    state.pendingMovePhotoId = null;
    if (els.moveShelfList) els.moveShelfList.innerHTML = '';
  }

  async function openMoveShelfDialog(mode) {
    if (mode === 'photo' && !state.viewingPhotoId) return;
    if (mode === 'selected' && state.selectedPhotoIds.size === 0) return;
    if (!state.currentShelfId) return;

    const shelves = await getLayoutShelvesForPicker();
    const excludeId = state.currentShelfId;
    const targets = shelves.filter((s) => Number(s.id) !== Number(excludeId));
    if (targets.length === 0) {
      alert('移動先の棚がありません');
      return;
    }

    state.moveShelfMode = mode;
    if (mode === 'photo') {
      state.pendingMovePhotoId = state.viewingPhotoId;
    }
    if (els.moveShelfDialogTitle) {
      const titles = {
        selected: '選択した写真の移動先',
        photo: 'この写真を移動する棚を選ぶ',
      };
      els.moveShelfDialogTitle.textContent = titles[mode] || '移動先の棚を選ぶ';
    }
    if (els.moveShelfDialogHint) {
      const fromShelf = shelves.find((s) => Number(s.id) === Number(excludeId));
      const fromName = fromShelf?.name || 'この棚';
      if (mode === 'selected') {
        els.moveShelfDialogHint.textContent =
          `「${fromName}」の選択した${state.selectedPhotoIds.size}枚を移動します`;
      } else {
        els.moveShelfDialogHint.textContent = `「${fromName}」から移動します`;
      }
    }

    els.moveShelfList.innerHTML = '';
    for (const shelf of targets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'move-shelf-item';
      btn.textContent = shelf.name;
      btn.addEventListener('click', () => handleMoveToShelf(shelf));
      els.moveShelfList.appendChild(btn);
    }

    els.moveShelfDialog.hidden = false;
  }

  async function handleMoveToShelf(targetShelf) {
    const mode = state.moveShelfMode;
    const fromShelfId = state.currentShelfId;
    if (!mode || !fromShelfId) return;

    const fromShelf = await DB.getShelf(fromShelfId);
    const toName = targetShelf.name;
    const selectedCount = state.selectedPhotoIds.size;
    const msg =
      mode === 'selected'
        ? `選択した${selectedCount}枚を「${toName}」へ移動しますか？`
        : `この写真を「${toName}」へ移動しますか？`;
    if (!confirm(msg)) return;

    closeMoveShelfDialog();

    try {
      if (mode === 'selected') {
        const ids = [...state.selectedPhotoIds];
        if (ids.length === 0) {
          alert('移動する写真を選んでください');
          return;
        }
        await DB.movePhotos(ids, targetShelf.id);
        exitPhotoSelectMode();
        state.photoCounts = await DB.getPhotoCounts();
        updateShelfCells();
        await renderPhotos(fromShelfId);
        updateSelectPhotosButton(fromShelfId);
        alert(`「${toName}」へ ${ids.length} 枚移動しました`);
      } else {
        const photoId = state.pendingMovePhotoId || state.viewingPhotoId;
        if (!photoId) {
          alert('移動する写真が見つかりません');
          return;
        }
        const author = els.viewerAuthorInput.value.trim().slice(0, PHOTO_AUTHOR_MAX);
        if (author) {
          const photo = await DB.getPhoto(photoId);
          if (photo) {
            photo.author = author;
            delete photo.url;
            delete photo.blob;
            await DB.updatePhoto(photo);
          }
        }
        closePhotoViewer();
        state.pendingMovePhotoId = null;
        await DB.movePhoto(photoId, targetShelf.id);
        state.photoCounts = await DB.getPhotoCounts();
        updateShelfCells();
        await renderPhotos(fromShelfId);
        updateSelectPhotosButton(fromShelfId);
        alert(`「${toName}」へ移動しました`);
      }
    } catch (err) {
      alert(err.message || '移動に失敗しました');
    }
  }

  // --- Photo Editor (pen only) ---

  async function openPhotoEditor() {
    if (!state.viewingPhotoId) return;
    const photoId = state.viewingPhotoId;
    const photo = await DB.getPhoto(photoId);
    if (!photo) return;

    const imgUrl = getPhotoDisplayUrl(photo);
    const img = await loadImage(imgUrl);

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

    const cssW = rect.width;
    const cssH = rect.height;
    const img = state.editor.img;
    if (!img) return;
    const scale = Math.min(cssW / img.naturalWidth, cssH / img.naturalHeight);
    state.editor.scale = scale;
    state.editor.offsetX = (cssW - img.naturalWidth * scale) / 2;
    state.editor.offsetY = (cssH - img.naturalHeight * scale) / 2;
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
      if (state.editor.undoStack.length > 20) state.editor.undoStack.shift();
    } catch {
      // ignore
    }
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

  function onEditorPointerUp(e) {
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
    if (!photo) {
      closePhotoEditor();
      return;
    }

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

    const imageData = ctx.getImageData(
      Math.floor(sx),
      Math.floor(sy),
      Math.max(1, Math.floor(sw)),
      Math.max(1, Math.floor(sh)),
    );

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

    const newUrl = replacePhotoObjectUrl(photoId, newBlob);
    if (state.currentShelfId) {
      state.photoCounts = await DB.getPhotoCounts();
      updateShelfCells();
      await renderPhotos(state.currentShelfId);
    }
    closePhotoEditor();
    await openPhotoViewer(photoId);
    els.viewerImage.src = newUrl;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
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
