const DB_NAME = 'shelf-cleaning-app';
const DB_VERSION = 2;
const STORE_ID = 'default';

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

async function getAllShelves() {
  const store = await tx('shelves');
  const all = await promisifyRequest(store.getAll());
  return all.filter((s) => s.storeId === STORE_ID);
}

async function getShelf(id) {
  const store = await tx('shelves');
  return promisifyRequest(store.get(id));
}

async function addShelf(data) {
  const store = await tx('shelves', 'readwrite');
  return promisifyRequest(store.add({ ...data, storeId: STORE_ID, checked: false }));
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

async function getShelfBySlotKey(slotKey) {
  const store = await tx('shelves');
  const index = store.index('slotKey');
  const all = await promisifyRequest(index.getAll(slotKey));
  return all.find((s) => s.storeId === STORE_ID) || null;
}

async function seedShelvesFromTemplate() {
  const existing = await getAllShelves();
  if (existing.length > 0) return;

  const slots = getAllSlots();
  const store = await tx('shelves', 'readwrite');
  for (const slot of slots) {
    await promisifyRequest(store.add({
      storeId: STORE_ID,
      slotKey: slot.slotKey,
      name: slot.defaultName,
      checked: false,
    }));
  }
}

async function getLayoutVersion() {
  const row = await getConfig('layoutVersion');
  return row ? row.value : 0;
}

async function setLayoutVersion(version) {
  return setConfig('layoutVersion', version);
}

// --- Reset ---

async function resetAll() {
  const database = await openDB();
  const transaction = database.transaction(['shelves', 'photos'], 'readwrite');

  const shelfStore = transaction.objectStore('shelves');
  const photoStore = transaction.objectStore('photos');

  const shelves = await promisifyRequest(shelfStore.getAll());
  for (const shelf of shelves) {
    if (shelf.storeId === STORE_ID) {
      shelf.checked = false;
      shelfStore.put(shelf);
    }
  }

  const photos = await promisifyRequest(photoStore.getAll());
  for (const photo of photos) {
    const shelf = shelves.find((s) => s.id === photo.shelfId);
    if (shelf && shelf.storeId === STORE_ID) {
      photoStore.delete(photo.id);
    }
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// --- Photo counts cache ---

async function getPhotoCounts() {
  const shelves = await getAllShelves();
  const counts = {};
  for (const shelf of shelves) {
    const photos = await getPhotosByShelf(shelf.id);
    counts[shelf.id] = photos.length;
  }
  return counts;
}

window.DB = {
  STORE_ID,
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
