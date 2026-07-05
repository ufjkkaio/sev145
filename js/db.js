const DB_NAME = 'shelf-cleaning-app';
const DB_VERSION = 2;
const DEFAULT_STORE_ID = 'default';

let db = null;
let activeStoreId = DEFAULT_STORE_ID;

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
        shelfStore.createIndex('storeId', 'storeId', { unique: false });
        shelfStore.createIndex('slotKey', 'slotKey', { unique: false });
      } else if (e.oldVersion < 2) {
        const shelfStore = e.target.transaction.objectStore('shelves');
        if (!shelfStore.indexNames.contains('slotKey')) {
          shelfStore.createIndex('slotKey', 'slotKey', { unique: false });
        }
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

function layoutVersionKey(storeId = activeStoreId) {
  return `layoutVersion:${storeId}`;
}

// --- Store context ---

async function initStoreContext() {
  const row = await getConfig('currentStoreId');
  const saved = row?.value;
  if (saved && STORES.some((s) => s.id === saved)) {
    activeStoreId = saved;
  } else {
    activeStoreId = STORES[0]?.id || DEFAULT_STORE_ID;
  }
  return activeStoreId;
}

function getActiveStoreId() {
  return activeStoreId;
}

async function setActiveStoreId(storeId) {
  if (!STORES.some((s) => s.id === storeId)) return;
  activeStoreId = storeId;
  await setConfig('currentStoreId', storeId);
}

function getActiveStore() {
  return getStoreById(activeStoreId);
}

// --- Config ---

async function getConfig(key) {
  const store = await tx('config');
  return promisifyRequest(store.get(key));
}

async function setConfig(key, value) {
  const store = await tx('config', 'readwrite');
  return promisifyRequest(store.put({ key, value }));
}

// --- Shelves ---

async function getAllShelves(storeId = activeStoreId) {
  const store = await tx('shelves');
  const all = await promisifyRequest(store.getAll());
  return all.filter((s) => s.storeId === storeId);
}

async function getShelf(id) {
  const store = await tx('shelves');
  return promisifyRequest(store.get(id));
}

async function addShelf(data, storeId = activeStoreId) {
  const store = await tx('shelves', 'readwrite');
  return promisifyRequest(store.add({ ...data, storeId, checked: false }));
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

// --- Photos ---

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

async function getShelfBySlotKey(slotKey, storeId = activeStoreId) {
  const store = await tx('shelves');
  const index = store.index('slotKey');
  const all = await promisifyRequest(index.getAll(slotKey));
  return all.find((s) => s.storeId === storeId) || null;
}

async function seedShelvesFromTemplate(storeId = activeStoreId) {
  const existing = await getAllShelves(storeId);
  if (existing.length > 0) return;

  const slots = getAllSlotsForStore(storeId);
  const store = await tx('shelves', 'readwrite');
  for (const slot of slots) {
    await promisifyRequest(store.add({
      storeId,
      slotKey: slot.slotKey,
      name: slot.defaultName,
      checked: false,
    }));
  }
}

async function getLayoutVersion(storeId = activeStoreId) {
  const row = await getConfig(layoutVersionKey(storeId));
  if (row) return row.value;

  // 旧形式（店舗共通）からの移行
  const legacy = await getConfig('layoutVersion');
  return legacy ? legacy.value : 0;
}

async function setLayoutVersion(version, storeId = activeStoreId) {
  return setConfig(layoutVersionKey(storeId), version);
}

// --- Reset ---

async function resetAll(storeId = activeStoreId) {
  const database = await openDB();
  const transaction = database.transaction(['shelves', 'photos'], 'readwrite');

  const shelfStore = transaction.objectStore('shelves');
  const photoStore = transaction.objectStore('photos');

  const shelves = await promisifyRequest(shelfStore.getAll());
  for (const shelf of shelves) {
    if (shelf.storeId === storeId) {
      shelf.checked = false;
      shelfStore.put(shelf);
    }
  }

  const photos = await promisifyRequest(photoStore.getAll());
  for (const photo of photos) {
    const shelf = shelves.find((s) => s.id === photo.shelfId);
    if (shelf && shelf.storeId === storeId) {
      photoStore.delete(photo.id);
    }
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// --- Photo counts (metadata only — never load blobs for counting) ---

async function getPhotoCounts(storeId = activeStoreId) {
  const shelves = await getAllShelves(storeId);
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
  DEFAULT_STORE_ID,
  initStoreContext,
  getActiveStoreId,
  setActiveStoreId,
  getActiveStore,
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
  resetAll,
  getPhotoCounts,
  seedShelvesFromTemplate,
  getLayoutVersion,
  setLayoutVersion,
};
