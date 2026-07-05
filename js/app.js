(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const PHOTO_AUTHOR_MAX = 10;
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
    photoInput: $('#photo-input'),
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
    photoDeleteConfirm: $('#photo-delete-confirm'),
    btnViewerDeleteCancel: $('#btn-viewer-delete-cancel'),
    btnViewerDeleteOk: $('#btn-viewer-delete-ok'),
  };

  let state = {
    editMode: false,
    shelfMap: {},
    photoCounts: {},
    currentShelfId: null,
    photoObjectUrls: [],
    viewerBlobUrl: null,
    nameDialogCallback: null,
    viewingPhotoId: null,
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
      navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    els.photoInput.addEventListener('change', handlePhotoUpload);
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
    els.viewerAuthorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveViewerAuthor();
      }
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
    revokePhotoUrls();
    refresh();
  }

  async function renderPhotos(shelfId) {
    revokePhotoUrls();
    const photos = await DB.getPhotosByShelf(shelfId);
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
      const url = URL.createObjectURL(photo.blob);
      state.photoObjectUrls.push(url);

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

  function revokePhotoUrls() {
    state.photoObjectUrls.forEach((url) => {
      if (url !== state.viewerBlobUrl) URL.revokeObjectURL(url);
    });
    state.photoObjectUrls = [];
  }

  function revokeViewerUrl() {
    if (state.viewerBlobUrl) {
      URL.revokeObjectURL(state.viewerBlobUrl);
      state.viewerBlobUrl = null;
    }
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

    revokeViewerUrl();
    state.viewingPhotoId = photoId;
    state.viewerBlobUrl = URL.createObjectURL(photo.blob);
    els.viewerImage.src = state.viewerBlobUrl;
    els.viewerAuthorInput.value = photo.author || '';
    hideDeleteConfirm();
    els.photoViewer.hidden = false;

    const last = localStorage.getItem(LAST_AUTHOR_KEY);
    els.viewerAuthorInput.placeholder = last ? `例：${last}` : '例：夜勤 山田';

    requestAnimationFrame(() => {
      if (!photo.author) els.viewerAuthorInput.focus();
    });
  }

  function closePhotoViewer() {
    els.photoViewer.hidden = true;
    hideDeleteConfirm();
    state.viewingPhotoId = null;
    revokeViewerUrl();
  }

  function showDeleteConfirm() {
    els.photoDeleteConfirm.hidden = false;
  }

  function hideDeleteConfirm() {
    els.photoDeleteConfirm.hidden = true;
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
    els.viewerAuthorInput.blur();
    if (state.currentShelfId) {
      await renderPhotos(state.currentShelfId);
    }
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
