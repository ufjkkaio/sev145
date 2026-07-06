(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const PHOTO_AUTHOR_MAX = 10;
  const PHOTO_AUTHOR_PLACEHOLDER = 'シフト　名前';
  const PEN_COLOR = '#e53935';
  const PEN_SIZE = 6;

  const GAP = 4;
  const PAD = 10;
  const VISIBLE_COLS = 5;
  const BOARD_WIDTH_PX = 10000;
  const BOARD_HEIGHT_PX = 10000;
  const MAX_CELL = 62;
  const MIN_CELL = 50;
  const TAP_THRESHOLD = 8;
  const SWIPE_RESIZE = 22;
  const DRAG_START = SWIPE_RESIZE + 8;
  const SNAP_DIST = 32;
  const MAX_BLOCK_CELLS = 16;
  const VIEW_SCALE_MIN = 0.5;
  const VIEW_SCALE_MAX = 2;

  const els = {
    btnStoreName: $('#btn-store-name'),
    headerStoreName: $('#header-store-name'),
    btnLayoutEdit: $('#btn-layout-edit'),
    btnEditMode: $('#btn-edit-mode'),
    btnReset: $('#btn-reset'),
    btnAddShelf: $('#btn-add-shelf'),
    boardCanvas: $('#board-canvas'),
    boardTransform: $('#board-transform'),
    mapArea: $('#map-area'),
    btnZoomIn: $('#btn-zoom-in'),
    btnZoomOut: $('#btn-zoom-out'),
    btnCenter: $('#btn-center'),
    zoomLabel: $('#zoom-label'),
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
    authGate: $('#auth-gate'),
    authError: $('#auth-error'),
    authPanelHome: $('#auth-panel-home'),
    authPanelLogin: $('#auth-panel-login'),
    authPanelRegister: $('#auth-panel-register'),
    authPanelQr: $('#auth-panel-qr'),
    authPanelCreated: $('#auth-panel-created'),
    authLoginNumber: $('#auth-login-number'),
    authLoginPass: $('#auth-login-pass'),
    authRegNumber: $('#auth-reg-number'),
    authRegName: $('#auth-reg-name'),
    authQrFile: $('#auth-qr-file'),
    authCreatedNumber: $('#auth-created-number'),
    authCreatedPass: $('#auth-created-pass'),
    authCreatedQr: $('#auth-created-qr'),
    btnStoreSwitch: $('#btn-store-switch'),
    storeSwitchDialog: $('#store-switch-dialog'),
    storeSwitchList: $('#store-switch-list'),
    appRoot: $('#app'),
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
    board: null,
    editMode: false,
    layoutEditMode: false,
    shelfMap: {},
    photoCounts: {},
    currentShelfId: null,
    photoUrlById: {},
    viewingPhotoId: null,
    nameDialogCallback: null,
    pendingDeleteSlotKey: null,
    view: { scale: 1, x: 0, y: 0 },
    metrics: null,
    drag: null,
    pan: null,
    shelfTap: null,
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
    showBuildVersion();
    bindEvents();

    try {
      let entry = await CloudAuth.tryLoginFromUrl();
      if (!entry) entry = await CloudAuth.restoreSession();
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

  async function bootApp() {
    hideAuthHub();
    CloudDB.stopSync();
    CloudDB.setOnChange(() => {
      refresh().then(() => {
        updateShelfCells();
        if (!state.drag && !state.pan) renderBoard();
      });
    });
    CloudDB.startSync();

    state.board = await DB.getBoardLayout();
    state.view = await DB.getBoardView();
    state.view.scale = clampScale(state.view.scale ?? 1);
    const isLegacyTopLeft = state.view.x === 0 && state.view.y === 0;
    await DB.syncShelvesFromBoard(state.board);
    updateHeader();
    await refresh();
    renderBoard();
    if (isLegacyTopLeft) {
      centerBoardView({ scale: state.view.scale, save: true });
    }
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
      register: els.authPanelRegister,
      qr: els.authPanelQr,
      created: els.authPanelCreated,
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

  async function renderCreatedQr(storeNumber, passphrase) {
    const payload = CloudAuth.buildQrPayload(storeNumber, passphrase);
    if (els.authCreatedNumber) els.authCreatedNumber.textContent = storeNumber;
    if (els.authCreatedPass) els.authCreatedPass.textContent = passphrase;
    if (els.authCreatedQr) {
      try {
        await QrRender.toCanvas(els.authCreatedQr, payload, 200);
      } catch {
        /* QRなしでも店番号・合言葉は表示済み */
      }
    }
  }

  function bindAuthEvents() {
    $('#btn-auth-login')?.addEventListener('click', () => {
      showAuthError('');
      showAuthPanel('login');
    });
    $('#btn-auth-register')?.addEventListener('click', () => {
      showAuthError('');
      showAuthPanel('register');
    });
    $('#btn-auth-qr')?.addEventListener('click', () => {
      showAuthError('');
      showAuthPanel('qr');
    });
    $('#btn-auth-login-back')?.addEventListener('click', () => showAuthPanel('home'));
    $('#btn-auth-reg-back')?.addEventListener('click', () => showAuthPanel('home'));
    $('#btn-auth-qr-back')?.addEventListener('click', () => showAuthPanel('home'));

    $('#btn-auth-login-go')?.addEventListener('click', async () => {
      try {
        showAuthError('');
        await CloudAuth.login(els.authLoginNumber.value, els.authLoginPass.value);
        await bootApp();
      } catch (err) {
        showAuthError(err.message);
      }
    });

    $('#btn-auth-reg-go')?.addEventListener('click', async () => {
      try {
        showAuthError('');
        const result = await CloudAuth.register(els.authRegNumber.value, els.authRegName.value);
        await renderCreatedQr(result.entry.storeNumber, result.passphrase);
        showAuthPanel('created');
      } catch (err) {
        showAuthError(err.message);
      }
    });

    $('#btn-auth-created-go')?.addEventListener('click', async () => {
      try {
        await bootApp();
      } catch (err) {
        showAuthError(err.message);
        showAuthPanel('home');
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
        await bootApp();
      } catch (err) {
        showAuthError(err.message);
      }
    });

    els.btnStoreSwitch?.addEventListener('click', openStoreSwitchDialog);
    $('#btn-store-switch-close')?.addEventListener('click', () => {
      els.storeSwitchDialog.hidden = true;
    });
    $('#btn-store-switch-add')?.addEventListener('click', () => {
      els.storeSwitchDialog.hidden = true;
      showAuthHub('login');
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

  function openStoreSwitchDialog() {
    const stores = CloudAuth.getSavedStores();
    const current = CloudAuth.getCurrentStoreId();
    els.storeSwitchList.innerHTML = '';
    for (const s of stores) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'store-switch-item';
      if (s.storeId === current) btn.classList.add('store-switch-item--active');
      btn.innerHTML = `<span class="store-switch-item__name">${escapeHtml(s.displayName)}</span><span class="store-switch-item__num">${escapeHtml(s.storeNumber)}</span>`;
      btn.addEventListener('click', async () => {
        try {
          els.storeSwitchDialog.hidden = true;
          await CloudAuth.switchStore(s.storeId);
          await bootApp();
        } catch (err) {
          alert(err.message);
        }
      });
      els.storeSwitchList.appendChild(btn);
    }
    els.storeSwitchDialog.hidden = false;
  }

  function showBuildVersion() {
    const script = document.querySelector('script[src*="app.js"]');
    const v = script && new URL(script.src, location.href).searchParams.get('v');
    const el = document.getElementById('app-version');
    if (el && v) el.textContent = `v${v}`;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    const v = document.querySelector('script[src*="app.js"]')?.src.match(/[?&]v=(\d+)/)?.[1] || '';
    navigator.serviceWorker.register(`./sw.js?v=${v}`).then((reg) => {
      reg.update();
    }).catch(() => {});
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
    bindAuthEvents();
    els.btnLayoutEdit.addEventListener('click', toggleLayoutEditMode);
    els.btnEditMode.addEventListener('click', toggleEditMode);
    els.btnAddShelf.addEventListener('click', addShelfBlock);
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

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderBoard(), 150);
    });

    bindViewportEvents();
    els.btnStoreName.addEventListener('click', openStoreNameDialog);
  }

  function clampScale(scale) {
    return Math.max(VIEW_SCALE_MIN, Math.min(VIEW_SCALE_MAX, scale));
  }

  function clampView() {
    const mapW = els.mapArea?.clientWidth || 0;
    const mapH = els.mapArea?.clientHeight || 0;
    const v = state.view;
    v.scale = clampScale(v.scale);

    const boardW = BOARD_WIDTH_PX * v.scale;
    const boardH = BOARD_HEIGHT_PX * v.scale;

    let minX;
    let maxX;
    let minY;
    let maxY;

    if (boardW <= mapW) {
      minX = maxX = (mapW - boardW) / 2;
    } else {
      minX = mapW - boardW;
      maxX = 0;
    }

    if (boardH <= mapH) {
      minY = maxY = (mapH - boardH) / 2;
    } else {
      minY = mapH - boardH;
      maxY = 0;
    }

    v.x = Math.max(minX, Math.min(maxX, v.x));
    v.y = Math.max(minY, Math.min(maxY, v.y));
  }

  function centerBoardView({ scale = state.view.scale, save = false } = {}) {
    const mapW = els.mapArea?.clientWidth || 0;
    const mapH = els.mapArea?.clientHeight || 0;
    const s = clampScale(scale);
    state.view.scale = s;
    state.view.x = mapW / 2 - (BOARD_WIDTH_PX / 2) * s;
    state.view.y = mapH / 2 - (BOARD_HEIGHT_PX / 2) * s;
    applyViewTransform(save);
  }

  function screenToBoard(clientX, clientY) {
    const mapRect = els.mapArea.getBoundingClientRect();
    const v = state.view;
    return {
      x: (clientX - mapRect.left - v.x) / v.scale,
      y: (clientY - mapRect.top - v.y) / v.scale,
    };
  }

  function applyViewTransform(save = false) {
    if (!els.boardTransform) return;
    clampView();
    const v = state.view;
    els.boardTransform.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
    if (els.zoomLabel) {
      els.zoomLabel.textContent = `${Math.round(v.scale * 100)}%`;
    }
    if (els.btnZoomIn) {
      els.btnZoomIn.disabled = v.scale >= VIEW_SCALE_MAX - 0.001;
    }
    if (els.btnZoomOut) {
      els.btnZoomOut.disabled = v.scale <= VIEW_SCALE_MIN + 0.001;
    }
    if (save) DB.setBoardView({ ...v });
  }

  function zoomAtScreen(clientX, clientY, newScale, save = false) {
    const mapRect = els.mapArea.getBoundingClientRect();
    const fx = clientX - mapRect.left;
    const fy = clientY - mapRect.top;
    const next = clampScale(newScale);
    const ratio = next / state.view.scale;
    state.view.x = fx - (fx - state.view.x) * ratio;
    state.view.y = fy - (fy - state.view.y) * ratio;
    state.view.scale = next;
    applyViewTransform(save);
  }

  function bindViewportEvents() {
    const mapCenter = () => {
      const r = els.mapArea.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    els.btnZoomIn.addEventListener('click', () => {
      const c = mapCenter();
      zoomAtScreen(c.x, c.y, state.view.scale * 1.2, true);
    });
    els.btnZoomOut.addEventListener('click', () => {
      const c = mapCenter();
      zoomAtScreen(c.x, c.y, state.view.scale / 1.2, true);
    });
    els.zoomLabel.addEventListener('click', () => {
      centerBoardView({ scale: 1, save: true });
    });
    els.btnCenter.addEventListener('click', () => {
      centerBoardView({ scale: state.view.scale, save: true });
    });

    let pinch = null;

    els.mapArea.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2) return;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch = {
        startDist: Math.hypot(dx, dy),
        startScale: state.view.scale,
        startX: state.view.x,
        startY: state.view.y,
        lastMidX: mx,
        lastMidY: my,
        lastDist: Math.hypot(dx, dy),
      };
      e.preventDefault();
    }, { passive: false });

    els.mapArea.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      if (pinch.lastDist > 1) {
        const scaleFactor = dist / pinch.lastDist;
        zoomAtScreen(mx, my, state.view.scale * scaleFactor, false);
      }
      state.view.x += mx - pinch.lastMidX;
      state.view.y += my - pinch.lastMidY;
      applyViewTransform(false);

      pinch.lastMidX = mx;
      pinch.lastMidY = my;
      pinch.lastDist = dist;
      e.preventDefault();
    }, { passive: false });

    const endPinch = () => {
      if (!pinch) return;
      pinch = null;
      DB.setBoardView({ ...state.view });
    };
    els.mapArea.addEventListener('touchend', endPinch);
    els.mapArea.addEventListener('touchcancel', endPinch);

    els.mapArea.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.board-block')) return;
      if (e.button > 0) return;
      state.pan = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        viewX: state.view.x,
        viewY: state.view.y,
        moved: false,
      };
      els.mapArea.setPointerCapture(e.pointerId);
    });

    els.mapArea.addEventListener('pointermove', (e) => {
      if (!state.pan || state.pan.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.pan.startX;
      const dy = e.clientY - state.pan.startY;
      if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
        state.pan.moved = true;
      }
      state.view.x = state.pan.viewX + dx;
      state.view.y = state.pan.viewY + dy;
      applyViewTransform(false);
    });

    const endPan = (e) => {
      if (!state.pan || state.pan.pointerId !== e.pointerId) return;
      els.mapArea.releasePointerCapture(e.pointerId);
      if (state.pan.moved) {
        DB.setBoardView({ ...state.view });
      }
      state.pan = null;
    };
    els.mapArea.addEventListener('pointerup', endPan);
    els.mapArea.addEventListener('pointercancel', endPan);
  }

  function openStoreNameDialog() {
    DB.getStoreName().then((name) => {
      showNameDialog('店舗名を変更', name || '', async (newName) => {
        if (!newName) return;
        await DB.setStoreName(newName);
        updateHeader();
      }, 20);
    });
  }

  function computeMetrics() {
    const w = els.mapArea ? els.mapArea.clientWidth : window.innerWidth;
    const inner = Math.max(280, w - PAD * 2);
    const cell = Math.floor((inner - GAP * (VISIBLE_COLS - 1)) / VISIBLE_COLS);
    const clamped = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));
    return { cell: clamped, gap: GAP, step: clamped + GAP, pad: PAD };
  }

  function m() {
    return state.metrics || computeMetrics();
  }

  function toggleLayoutEditMode() {
    if (state.editMode) toggleEditMode();
    state.layoutEditMode = !state.layoutEditMode;
    els.btnLayoutEdit.setAttribute('aria-pressed', String(state.layoutEditMode));
    els.layoutHint.hidden = !state.layoutEditMode;
    els.btnAddShelf.hidden = !state.layoutEditMode;
    document.body.classList.toggle('layout-edit-mode', state.layoutEditMode);
    renderBoard();
  }

  function promptDeleteShelf(slotKey) {
    state.pendingDeleteSlotKey = slotKey;
    els.deleteShelfDialog.hidden = false;
  }

  function toggleEditMode() {
    if (state.layoutEditMode) toggleLayoutEditMode();
    state.editMode = !state.editMode;
    els.btnEditMode.setAttribute('aria-pressed', String(state.editMode));
    els.editHint.hidden = !state.editMode;
    document.body.classList.toggle('edit-mode', state.editMode);
  }

  function blockPx(block) {
    const { cell, gap, step, pad } = m();
    return {
      left: pad + block.x * step,
      top: pad + block.y * step,
      width: block.w * cell + (block.w - 1) * gap,
      height: block.h * cell + (block.h - 1) * gap,
    };
  }

  function boardGridDimensions() {
    const { step, pad } = m();
    const cols = Math.floor((BOARD_WIDTH_PX - pad * 2) / step);
    const rows = Math.floor((BOARD_HEIGHT_PX - pad * 2) / step);
    return { cols, rows };
  }

  function boardSize() {
    const { cols, rows } = boardGridDimensions();
    return {
      width: BOARD_WIDTH_PX,
      height: BOARD_HEIGHT_PX,
      cols,
      rows,
    };
  }

  function renderBoard() {
    state.metrics = computeMetrics();
    const { step, pad } = m();

    const root = els.boardCanvas;
    root.innerHTML = '';
    const size = boardSize();
    root.style.width = `${size.width}px`;
    root.style.height = `${size.height}px`;
    root.style.backgroundSize = `${step}px ${step}px`;
    root.style.backgroundPosition = `${pad}px ${pad}px`;

    if (state.board.blocks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'board-empty';
      empty.textContent = state.layoutEditMode
        ? '「棚を追加」で正方形を置けます'
        : 'レイアウトから棚を追加してください';
      root.appendChild(empty);
    }

    for (const block of state.board.blocks) {
      root.appendChild(createBoardBlock(block));
    }
    updateShelfCells();
    applyViewTransform(false);
  }

  function createBoardBlock(block) {
    const shelf = state.shelfMap[block.slotKey];
    const px = blockPx(block);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'board-block shelf-cell';
    el.dataset.slotKey = block.slotKey;
    el.style.left = `${px.left}px`;
    el.style.top = `${px.top}px`;
    el.style.width = `${px.width}px`;
    el.style.height = `${px.height}px`;

    const name = shelf?.name || block.defaultName;
    el.innerHTML = `
      <span class="shelf-cell__label">${escapeHtml(name)}</span>
      <span class="shelf-cell__badge"></span>
      <span class="shelf-cell__check">✓</span>
    `;

    if (state.layoutEditMode) {
      el.addEventListener('pointerdown', (e) => onBlockPointerDown(e, block));
      el.addEventListener('pointermove', onBlockPointerMove);
      el.addEventListener('pointerup', onBlockPointerUp);
      el.addEventListener('pointercancel', onBlockPointerUp);
    } else {
      el.addEventListener('pointerdown', (e) => onShelfPointerDown(e, block));
      el.addEventListener('pointerup', onShelfPointerUp);
      el.addEventListener('pointercancel', onShelfPointerCancel);
    }

    return el;
  }

  function onShelfPointerDown(e, block) {
    if (e.button > 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    state.shelfTap = {
      pointerId: e.pointerId,
      el: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      block,
    };
  }

  function onShelfPointerUp(e) {
    const tap = state.shelfTap;
    if (!tap || tap.pointerId !== e.pointerId || tap.el !== e.currentTarget) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    state.shelfTap = null;
    const dist = Math.hypot(e.clientX - tap.startX, e.clientY - tap.startY);
    if (dist < TAP_THRESHOLD) onShelfTap(tap.block);
  }

  function onShelfPointerCancel() {
    state.shelfTap = null;
  }

  function onShelfTap(block) {
    const shelf = state.shelfMap[block.slotKey];
    if (!shelf) return;

    if (state.editMode) {
      showNameDialog('棚の名称を変更', shelf.name, async (name) => {
        if (!name || name === shelf.name) return;
        shelf.name = name;
        block.defaultName = name;
        await DB.updateShelf(shelf);
        await saveBoard();
        await refresh();
        renderBoard();
      });
      return;
    }

    openFolder(shelf.id);
  }

  function onBlockPointerDown(e, block) {
    if (!state.layoutEditMode || e.button > 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const px = blockPx(block);
    const pt = screenToBoard(e.clientX, e.clientY);
    state.drag = {
      slotKey: block.slotKey,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      repositioning: false,
      offsetBoardX: pt.x - px.left,
      offsetBoardY: pt.y - px.top,
      el,
    };
    e.preventDefault();
  }

  function onBlockPointerMove(e) {
    const drag = state.drag;
    if (!drag || drag.el !== e.currentTarget) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    drag.el.classList.toggle('board-block--resize-hint', Math.hypot(dx, dy) >= SWIPE_RESIZE && Math.hypot(dx, dy) < DRAG_START);

    if (!drag.repositioning && (Math.abs(dx) > DRAG_START || Math.abs(dy) > DRAG_START)) {
      drag.repositioning = true;
      drag.moved = true;
      drag.el.classList.add('board-block--dragging');
    }
    if (!drag.repositioning) return;

    const block = getBlock(drag.slotKey);
    if (!block) return;

    const pt = screenToBoard(e.clientX, e.clientY);
    let left = pt.x - drag.offsetBoardX;
    let top = pt.y - drag.offsetBoardY;

    const drop = resolveDrop(block, left, top);
    clearSnapHighlight();
    clearMergeHighlight();

    if (drop.type === 'merge') {
      const mpx = blockPx(drop.preview);
      left = mpx.left;
      top = mpx.top;
      drag.el.style.width = `${mpx.width}px`;
      drag.el.style.height = `${mpx.height}px`;
      drag.el.classList.add('board-block--merging');
      highlightMergeTarget(drop.mergeTarget);
    } else {
      const px = blockPx({ ...block, x: drop.x, y: drop.y });
      left = px.left;
      top = px.top;
      drag.el.style.width = `${px.width}px`;
      drag.el.style.height = `${px.height}px`;
      drag.el.classList.remove('board-block--merging');
      if (drop.snapTarget) highlightSnapTarget(drop.snapTarget);
    }

    drag.el.style.left = `${left}px`;
    drag.el.style.top = `${top}px`;
    e.preventDefault();
  }

  async function onBlockPointerUp(e) {
    const drag = state.drag;
    if (!drag || drag.el !== e.currentTarget) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);

    drag.el.classList.remove('board-block--dragging');
    drag.el.classList.remove('board-block--merging');
    drag.el.classList.remove('board-block--resize-hint');
    drag.el.releasePointerCapture(e.pointerId);
    clearSnapHighlight();
    clearMergeHighlight();

    const block = getBlock(drag.slotKey);

    if (!drag.repositioning) {
      if (dist >= SWIPE_RESIZE && dist < DRAG_START && block) {
        await tryResizeBlock(block, dx, dy);
        await refresh();
        renderBoard();
      } else if (dist < TAP_THRESHOLD) {
        promptDeleteShelf(drag.slotKey);
      }
      state.drag = null;
      return;
    }

    if (!block) {
      state.drag = null;
      return;
    }

    const relLeft = parseFloat(drag.el.style.left);
    const relTop = parseFloat(drag.el.style.top);
    const drop = resolveDrop(block, relLeft, relTop);

    if (drop.type === 'merge') {
      await mergeBlocksAt(block, drop.mergeTarget, drop.preview);
    } else {
      block.x = drop.x;
      block.y = drop.y;
      await saveBoard();
    }

    state.drag = null;
    await refresh();
    renderBoard();
  }

  async function tryResizeBlock(block, vx, vy) {
    const next = { ...block };
    const ignore = [block.slotKey];

    if (Math.abs(vx) >= Math.abs(vy)) {
      if (vx > 0) next.w += 1;
      else {
        next.x -= 1;
        next.w += 1;
      }
    } else if (vy > 0) {
      next.h += 1;
    } else {
      next.y -= 1;
      next.h += 1;
    }

    if (next.x < 0 || next.y < 0) return false;
    if (next.w > MAX_BLOCK_CELLS || next.h > MAX_BLOCK_CELLS) return false;
    if (!canPlaceMerged(next, ignore)) return false;

    block.x = next.x;
    block.y = next.y;
    block.w = next.w;
    block.h = next.h;
    await saveBoard();
    return true;
  }

  function getBlock(slotKey) {
    return state.board.blocks.find((b) => b.slotKey === slotKey);
  }

  function cellsOccupied(block, blocks = state.board.blocks) {
    const set = new Set();
    for (const b of blocks) {
      if (b.slotKey === block.slotKey) continue;
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          set.add(`${b.x + dx},${b.y + dy}`);
        }
      }
    }
    return set;
  }

  function canPlace(block, x, y, blocks = state.board.blocks) {
    const occupied = cellsOccupied(block, blocks);
    for (let dy = 0; dy < block.h; dy++) {
      for (let dx = 0; dx < block.w; dx++) {
        if (x + dx < 0 || y + dy < 0) return false;
        if (occupied.has(`${x + dx},${y + dy}`)) return false;
      }
    }
    return true;
  }

  function canPlaceMerged(rect, ignoreSlotKeys) {
    const blocks = state.board.blocks.filter((b) => !ignoreSlotKeys.includes(b.slotKey));
    const probe = { slotKey: '__probe__', ...rect };
    return canPlace(probe, rect.x, rect.y, blocks);
  }

  function findEmptyCell(w = 1, h = 1) {
    const { cols, rows } = boardGridDimensions();
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const candidates = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x + w > cols || y + h > rows) continue;
        candidates.push({ x, y, d: (x - cx) ** 2 + (y - cy) ** 2 });
      }
    }
    candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    for (const { x, y } of candidates) {
      const probe = { slotKey: '__probe__', x, y, w, h };
      if (canPlace(probe, x, y)) return { x, y };
    }
    return { x: cx, y: cy };
  }

  function gridRectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolveDrop(block, relLeft, relTop) {
    const { pad, step } = m();
    const gx = Math.round((relLeft - pad) / step);
    const gy = Math.round((relTop - pad) / step);
    const placed = { ...block, x: gx, y: gy };

    for (const other of state.board.blocks) {
      if (other.slotKey === block.slotKey) continue;
      if (gridRectsOverlap(placed, other)) {
        return {
          type: 'merge',
          mergeTarget: other,
          preview: mergeIntoOneCell(other),
        };
      }
    }

    const snap = findBestSnapPosition(block, relLeft, relTop);
    return { type: 'snap', x: snap.x, y: snap.y, snapTarget: snap.nearOther || null };
  }

  function mergeIntoOneCell(other) {
    return { x: other.x, y: other.y, w: 1, h: 1 };
  }

  function findBestSnapPosition(block, relLeft, relTop) {
    const { pad, step } = m();
    const candidates = [];
    const gx = Math.round((relLeft - pad) / step);
    const gy = Math.round((relTop - pad) / step);

    if (canPlace(block, gx, gy)) {
      const px = blockPx({ ...block, x: gx, y: gy });
      candidates.push({
        x: gx,
        y: gy,
        dist: Math.hypot(relLeft - px.left, relTop - px.top),
        nearOther: null,
      });
    }

    for (const other of state.board.blocks) {
      if (other.slotKey === block.slotKey) continue;
      const adjacentPositions = [
        { x: other.x + other.w, y: other.y },
        { x: other.x - block.w, y: other.y },
        { x: other.x, y: other.y + other.h },
        { x: other.x, y: other.y - block.h },
      ];
      for (const pos of adjacentPositions) {
        if (!canPlace(block, pos.x, pos.y)) continue;
        const px = blockPx({ ...block, ...pos });
        const dist = Math.hypot(relLeft - px.left, relTop - px.top);
        if (dist <= SNAP_DIST + step) {
          candidates.push({ x: pos.x, y: pos.y, dist, nearOther: other });
        }
      }
    }

    if (candidates.length === 0) {
      const empty = findNearestEmpty(block, gx, gy);
      return { x: empty.x, y: empty.y, nearOther: null };
    }

    for (const c of candidates) {
      if (c.nearOther) c.dist -= 20;
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0];
  }

  function findNearestEmpty(block, gx, gy) {
    for (let r = 0; r < 30; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (x < 0 || y < 0) continue;
          if (canPlace(block, x, y)) return { x, y };
        }
      }
    }
    return findEmptyCell(block.w, block.h);
  }

  function highlightSnapTarget(other) {
    clearSnapHighlight();
    const el = els.boardCanvas.querySelector(`[data-slot-key="${other.slotKey}"]`);
    if (el) el.classList.add('board-block--snap-target');
  }

  function clearSnapHighlight() {
    els.boardCanvas.querySelectorAll('.board-block--snap-target').forEach((el) => {
      el.classList.remove('board-block--snap-target');
    });
  }

  function highlightMergeTarget(other) {
    clearMergeHighlight();
    const el = els.boardCanvas.querySelector(`[data-slot-key="${other.slotKey}"]`);
    if (el) el.classList.add('board-block--merge-target');
  }

  function clearMergeHighlight() {
    els.boardCanvas.querySelectorAll('.board-block--merge-target').forEach((el) => {
      el.classList.remove('board-block--merge-target');
    });
  }

  async function mergeBlocksAt(moving, other, rect) {
    moving.x = rect.x;
    moving.y = rect.y;
    moving.w = rect.w;
    moving.h = rect.h;

    const primaryShelf = state.shelfMap[moving.slotKey];
    const secondaryShelf = state.shelfMap[other.slotKey];
    if (primaryShelf && secondaryShelf) {
      await DB.mergeShelvesInto(primaryShelf.id, secondaryShelf.id);
    }

    state.board.blocks = state.board.blocks.filter((b) => b.slotKey !== other.slotKey);
    await saveBoard();
  }

  async function saveBoard() {
    state.board.version += 1;
    await DB.setBoardLayout(state.board);
    await DB.syncShelvesFromBoard(state.board);
  }

  async function addShelfBlock() {
    const nextNum = state.board.blocks.length + 1;
    const pos = findEmptyCell(1, 1);
    const block = {
      slotKey: `b-${Date.now()}`,
      defaultName: String(nextNum),
      x: pos.x,
      y: pos.y,
      w: 1,
      h: 1,
    };
    state.board.blocks.push(block);
    await saveBoard();
    await refresh();
    renderBoard();
  }

  async function confirmDeleteShelf() {
    const slotKey = state.pendingDeleteSlotKey;
    els.deleteShelfDialog.hidden = true;
    state.pendingDeleteSlotKey = null;
    if (!slotKey) return;

    state.board.blocks = state.board.blocks.filter((b) => b.slotKey !== slotKey);
    await saveBoard();
    await refresh();
    renderBoard();
  }

  function updateShelfCells() {
    document.querySelectorAll('.board-block[data-slot-key]').forEach((el) => {
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
    updateShelfCells();
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
        const block = state.board.blocks.find((b) => b.slotKey === shelf.slotKey);
        if (block) block.defaultName = name;
        await DB.updateShelf(shelf);
        await saveBoard();
        els.folderTitle.textContent = name;
        await refresh();
        updateShelfCells();
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

  function showNameDialog(title, defaultValue, callback, maxLength = 30) {
    els.nameDialogTitle.textContent = title;
    els.shelfNameInput.value = defaultValue;
    els.shelfNameInput.maxLength = maxLength;
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
    updateShelfCells();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
