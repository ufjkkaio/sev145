const DB_NAME = 'shelf-cleaning-grid';
const DB_VERSION = 1;
const DEFAULT_COLS = 4;
const DEFAULT_BLOCK_COUNT = 12;

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

function createDefaultGrid() {
  return {
    version: 1,
    cols: DEFAULT_COLS,
    blocks: Array.from({ length: DEFAULT_BLOCK_COUNT }, (_, i) => ({
      slotKey: `g-${i + 1}`,
      defaultName: String(i + 1),
    })),
  };
}

async function getGridLayout() {
  const row = await getConfig('gridLayout');
  return row ? row.value : createDefaultGrid();
}

async function setGridLayout(layout) {
  return setConfig('gridLayout', layout);
}

async function getStoreName() {
  const row = await getConfig('storeName');
  return row ? row.value : '';
}

async function setStoreName(name) {
  return setConfig('storeName', name);
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

async function syncShelvesFromGrid(grid) {
  const existing = await getAllShelves();
  const slotKeys = new Set(grid.blocks.map((b) => b.slotKey));

  for (const shelf of existing) {
    if (!slotKeys.has(shelf.slotKey)) {
      await deleteShelf(shelf.id);
    }
  }

  for (const block of grid.blocks) {
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
  DEFAULT_COLS,
  getGridLayout,
  setGridLayout,
  getStoreName,
  setStoreName,
  getAllShelves,
  getShelf,
  getShelfBySlotKey,
  addShelf,
  updateShelf,
  deleteShelf,
  getPhotosByShelf,
  addPhoto,
  updatePhoto,
  deletePhoto,
  getPhoto,
  syncShelvesFromGrid,
  resetAll,
  getPhotoCounts,
};
