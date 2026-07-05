const DB_NAME = 'shelf-cleaning-grid';
const DB_VERSION = 1;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('config')) {
        database.createObjectStore('config', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('shelves')) {
        const shelfStore = database.createObjectStore('shelves', { keyPath: 'id', autoIncrement: true });
        shelfStore.createIndex('slotKey', 'slotKey', { unique: false });
      }
      if (!database.objectStoreNames.contains('photos')) {
        const photoStore = database.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        photoStore.createIndex('shelfId', 'shelfId', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((database) => {
    const transaction = database.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getConfig(key) {
  const store = await tx('config');
  return promisifyRequest(store.get(key));
}

async function setConfig(key, value) {
  const store = await tx('config', 'readwrite');
  return promisifyRequest(store.put({ key, value }));
}

function createDefaultBoard() {
  return { version: 2, blocks: [] };
}

function migrateToBoard(data) {
  if (!data) return createDefaultBoard();
  if (data.blocks?.[0]?.x !== undefined) return data;

  const cols = data.cols || 4;
  return {
    version: 2,
    blocks: (data.blocks || []).map((b, i) => ({
      slotKey: b.slotKey,
      defaultName: b.defaultName,
      x: i % cols,
      y: Math.floor(i / cols),
      w: 1,
      h: 1,
    })),
  };
}

async function getBoardLayout() {
  const row = await getConfig('boardLayout');
  if (row) return migrateToBoard(row.value);

  const legacy = await getConfig('gridLayout');
  if (legacy) {
    const board = migrateToBoard(legacy.value);
    await setBoardLayout(board);
    return board;
  }

  return createDefaultBoard();
}

async function setBoardLayout(layout) {
  return setConfig('boardLayout', layout);
}

async function getStoreName() {
  const row = await getConfig('storeName');
  return row ? row.value : '';
}

async function setStoreName(name) {
  return setConfig('storeName', name);
}

async function getBoardView() {
  const row = await getConfig('boardView');
  if (row) return row.value;
  const legacy = await getConfig('boardZoom');
  if (legacy) return { scale: legacy.value, x: 0, y: 0 };
  return { scale: 1, x: 0, y: 0 };
}

async function setBoardView(view) {
  return setConfig('boardView', view);
}

async function getAllShelves() {
  const store = await tx('shelves');
  return promisifyRequest(store.getAll());
}

async function getShelf(id) {
  const store = await tx('shelves');
  return promisifyRequest(store.get(id));
}

async function getShelfBySlotKey(slotKey) {
  const store = await tx('shelves');
  const index = store.index('slotKey');
  const all = await promisifyRequest(index.getAll(slotKey));
  return all[0] || null;
}

async function addShelf(data) {
  const store = await tx('shelves', 'readwrite');
  return promisifyRequest(store.add({ ...data, checked: false }));
}

async function updateShelf(shelf) {
  const store = await tx('shelves', 'readwrite');
  return promisifyRequest(store.put(shelf));
}

async function deleteShelf(id) {
  const store = await tx('shelves', 'readwrite');
  await promisifyRequest(store.delete(id));
  const photos = await getPhotosByShelf(id);
  const photoStore = await tx('photos', 'readwrite');
  for (const photo of photos) {
    await promisifyRequest(photoStore.delete(photo.id));
  }
}

async function mergeShelvesInto(primaryId, secondaryId) {
  const photos = await getPhotosByShelf(secondaryId);
  for (const photo of photos) {
    photo.shelfId = primaryId;
    await updatePhoto(photo);
  }
  const store = await tx('shelves', 'readwrite');
  await promisifyRequest(store.delete(secondaryId));
}

async function getPhotosByShelf(shelfId) {
  const store = await tx('photos');
  const index = store.index('shelfId');
  return promisifyRequest(index.getAll(shelfId));
}

async function addPhoto(shelfId, blob, author = '') {
  const store = await tx('photos', 'readwrite');
  return promisifyRequest(store.add({
    shelfId,
    blob,
    author,
    createdAt: Date.now(),
  }));
}

async function updatePhoto(photo) {
  const store = await tx('photos', 'readwrite');
  return promisifyRequest(store.put(photo));
}

async function deletePhoto(id) {
  const store = await tx('photos', 'readwrite');
  return promisifyRequest(store.delete(id));
}

async function getPhoto(id) {
  const store = await tx('photos');
  return promisifyRequest(store.get(id));
}

async function syncShelvesFromBoard(board) {
  const existing = await getAllShelves();
  const slotKeys = new Set(board.blocks.map((b) => b.slotKey));

  for (const shelf of existing) {
    if (!slotKeys.has(shelf.slotKey)) {
      await deleteShelf(shelf.id);
    }
  }

  for (const block of board.blocks) {
    const shelf = await getShelfBySlotKey(block.slotKey);
    if (!shelf) {
      await addShelf({
        slotKey: block.slotKey,
        name: block.defaultName,
      });
    }
  }
}

async function resetAll() {
  const database = await openDB();
  const transaction = database.transaction(['shelves', 'photos'], 'readwrite');
  const shelfStore = transaction.objectStore('shelves');
  const photoStore = transaction.objectStore('photos');

  const shelves = await promisifyRequest(shelfStore.getAll());
  for (const shelf of shelves) {
    shelf.checked = false;
    shelfStore.put(shelf);
  }

  const photos = await promisifyRequest(photoStore.getAll());
  for (const photo of photos) {
    photoStore.delete(photo.id);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getPhotoCounts() {
  const shelves = await getAllShelves();
  const database = await openDB();
  const transaction = database.transaction('photos', 'readonly');
  const index = transaction.objectStore('photos').index('shelfId');
  const counts = {};

  await Promise.all(
    shelves.map(
      (shelf) =>
        new Promise((resolve, reject) => {
          const req = index.count(shelf.id);
          req.onsuccess = () => {
            counts[shelf.id] = req.result;
            resolve();
          };
          req.onerror = () => reject(req.error);
        }),
    ),
  );

  return counts;
}

window.DB = {
  getBoardLayout,
  setBoardLayout,
  getStoreName,
  setStoreName,
  getBoardView,
  setBoardView,
  getAllShelves,
  getShelf,
  getShelfBySlotKey,
  addShelf,
  updateShelf,
  deleteShelf,
  mergeShelvesInto,
  getPhotosByShelf,
  addPhoto,
  updatePhoto,
  deletePhoto,
  getPhoto,
  syncShelvesFromBoard,
  resetAll,
  getPhotoCounts,
};
