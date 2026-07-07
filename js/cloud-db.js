/* global FirebaseBoot, CloudAuth */
const CloudDB = (function () {
  'use strict';

  const blobCache = new Map();
  const urlCache = new Map();
  let listeners = [];
  let onChangeCallback = null;

  function storeRef() {
    const storeId = CloudAuth.getCurrentStoreId();
    if (!storeId) throw new Error('店舗に接続されていません');
    return FirebaseBoot.db.collection('stores').doc(storeId);
  }

  function shelvesCol() {
    return storeRef().collection('shelves');
  }

  function photosCol() {
    return storeRef().collection('photos');
  }

  function setOnChange(fn) {
    onChangeCallback = fn;
  }

  function notifyChange() {
    if (onChangeCallback) onChangeCallback();
  }

  function startSync() {
    stopSync();
    const ref = storeRef();
    listeners.push(ref.onSnapshot(() => notifyChange()));
    listeners.push(shelvesCol().onSnapshot(() => notifyChange()));
    listeners.push(photosCol().onSnapshot(() => notifyChange()));
  }

  function stopSync() {
    listeners.forEach((unsub) => unsub());
    listeners = [];
  }

  function migrateToBoard(data) {
    if (!data) return { version: 2, blocks: [] };
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
    const snap = await storeRef().get();
    const data = snap.data();
    return migrateToBoard(data?.boardLayout);
  }

  async function setBoardLayout(layout) {
    await storeRef().set({ boardLayout: layout }, { merge: true });
  }

  async function getStoreName() {
    const snap = await storeRef().get();
    return snap.data()?.displayName || '';
  }

  async function setStoreName(name) {
    await storeRef().set({ displayName: name }, { merge: true });
  }

  async function getBoardView() {
    const snap = await storeRef().get();
    return snap.data()?.boardView || { scale: 1, x: 0, y: 0 };
  }

  async function setBoardView(view) {
    await storeRef().set({ boardView: view }, { merge: true });
  }

  function shelfFromDoc(doc) {
    const d = doc.data();
    return {
      id: d.id,
      slotKey: d.slotKey,
      name: d.name,
      checked: !!d.checked,
    };
  }

  async function getAllShelves() {
    const snap = await shelvesCol().get();
    return snap.docs.map(shelfFromDoc);
  }

  async function getShelf(id) {
    const snap = await shelvesCol().where('id', '==', id).limit(1).get();
    if (snap.empty) return null;
    return shelfFromDoc(snap.docs[0]);
  }

  async function getShelfBySlotKey(slotKey) {
    const snap = await shelvesCol().where('slotKey', '==', slotKey).limit(1).get();
    if (snap.empty) return null;
    return shelfFromDoc(snap.docs[0]);
  }

  async function allocShelfId() {
    const ref = storeRef();
    return FirebaseBoot.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = (snap.data()?.shelfSeq || 0) + 1;
      tx.set(ref, { shelfSeq: next }, { merge: true });
      return next;
    });
  }

  async function addShelf(data) {
    const id = await allocShelfId();
    const payload = {
      id,
      slotKey: data.slotKey,
      name: data.name,
      checked: false,
    };
    await shelvesCol().doc(String(id)).set(payload);
    return id;
  }

  async function updateShelf(shelf) {
    await shelvesCol().doc(String(shelf.id)).set({
      id: shelf.id,
      slotKey: shelf.slotKey,
      name: shelf.name,
      checked: !!shelf.checked,
    }, { merge: true });
  }

  async function deleteShelf(id) {
    const photos = await getPhotosByShelf(id);
    for (const photo of photos) {
      await deletePhoto(photo.id);
    }
    await shelvesCol().doc(String(id)).delete();
  }

  async function dedupeShelvesBySlotKey(validSlotKeys) {
    const existing = await getAllShelves();
    const groups = new Map();
    for (const shelf of existing) {
      if (validSlotKeys && !validSlotKeys.has(shelf.slotKey)) continue;
      if (!groups.has(shelf.slotKey)) groups.set(shelf.slotKey, []);
      groups.get(shelf.slotKey).push(shelf);
    }
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => Number(a.id) - Number(b.id));
      const primary = group[0];
      const anyChecked = group.some((s) => s.checked);
      if (anyChecked && !primary.checked) {
        primary.checked = true;
        await updateShelf(primary);
      }
      for (let i = 1; i < group.length; i += 1) {
        await mergeShelvesInto(primary.id, group[i].id);
      }
    }
  }

  async function mergeShelvesInto(primaryId, secondaryId) {
    const primary = await getShelf(primaryId);
    const secondary = await getShelf(secondaryId);
    if (!primary || !secondary) return;

    const photos = await getPhotosByShelf(secondaryId);
    for (const photo of photos) {
      photo.shelfId = primaryId;
      await updatePhoto(photo);
    }

    if (secondary.checked && !primary.checked) {
      primary.checked = true;
      await updateShelf(primary);
    }

    await shelvesCol().doc(String(secondaryId)).delete();
  }

  function photoFromDoc(doc) {
    const d = doc.data();
    return {
      id: d.id,
      shelfId: d.shelfId,
      author: d.author || '',
      createdAt: d.createdAt || 0,
      storagePath: d.storagePath,
      _docId: doc.id,
    };
  }

  function normalizeShelfId(shelfId) {
    const n = Number(shelfId);
    return Number.isFinite(n) ? n : shelfId;
  }

  async function getPhotoDownloadUrl(photo) {
    if (urlCache.has(photo.id)) return urlCache.get(photo.id);
    const ref = FirebaseBoot.storage.ref(photo.storagePath);
    const url = await ref.getDownloadURL();
    urlCache.set(photo.id, url);
    return url;
  }

  async function fetchPhotoBlob(photo) {
    if (blobCache.has(photo.id)) return blobCache.get(photo.id);
    const url = await getPhotoDownloadUrl(photo);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`写真の取得に失敗しました (${res.status})`);
    const blob = await res.blob();
    blobCache.set(photo.id, blob);
    return blob;
  }

  async function getPhotosByShelf(shelfId) {
    const sid = normalizeShelfId(shelfId);
    const snap = await photosCol().where('shelfId', '==', sid).get();
    const rows = snap.docs.map(photoFromDoc);
    return Promise.all(rows.map(async (p) => ({
      ...p,
      url: await getPhotoDownloadUrl(p),
    })));
  }

  async function compressImage(file, maxSide = 1600, quality = 0.82) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    });
  }

  async function allocPhotoId() {
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function addPhoto(shelfId, file, author = '') {
    const storeId = CloudAuth.getCurrentStoreId();
    const photoId = await allocPhotoId();
    const blob = await compressImage(file);
    const path = `stores/${storeId}/photos/${photoId}.jpg`;
    const ref = FirebaseBoot.storage.ref(path);
    await ref.put(blob, { contentType: 'image/jpeg' });
    const url = await ref.getDownloadURL();
    const sid = normalizeShelfId(shelfId);
    const meta = {
      id: photoId,
      shelfId: sid,
      author,
      createdAt: Date.now(),
      storagePath: path,
    };
    await photosCol().doc(photoId).set(meta);
    blobCache.set(photoId, blob);
    urlCache.set(photoId, url);
    return photoId;
  }

  async function updatePhoto(photo) {
    if (photo.blob && photo.storagePath) {
      const ref = FirebaseBoot.storage.ref(photo.storagePath);
      await ref.put(photo.blob, { contentType: 'image/jpeg' });
      blobCache.set(photo.id, photo.blob);
      urlCache.delete(photo.id);
    }
    await photosCol().doc(photo.id).set({
      id: photo.id,
      shelfId: normalizeShelfId(photo.shelfId),
      author: photo.author || '',
      createdAt: photo.createdAt || Date.now(),
      storagePath: photo.storagePath,
    }, { merge: true });
    if (photo.blob) blobCache.set(photo.id, photo.blob);
  }

  async function deletePhoto(id) {
    const snap = await photosCol().doc(id).get();
    if (snap.exists) {
      const path = snap.data().storagePath;
      if (path) {
        try {
          await FirebaseBoot.storage.ref(path).delete();
        } catch {
          /* ignore */
        }
      }
      await photosCol().doc(id).delete();
    }
    blobCache.delete(id);
    urlCache.delete(id);
  }

  async function getPhoto(id) {
    const snap = await photosCol().doc(id).get();
    if (!snap.exists) return null;
    const photo = photoFromDoc(snap);
    const url = await getPhotoDownloadUrl(photo);
    return { ...photo, url };
  }

  async function getPhotoBlob(id) {
    const snap = await photosCol().doc(id).get();
    if (!snap.exists) return null;
    return fetchPhotoBlob(photoFromDoc(snap));
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

  async function getLayoutVersion() {
    const snap = await storeRef().get();
    return snap.data()?.fixedLayoutVersion || 0;
  }

  async function setLayoutVersion(version) {
    await storeRef().set({ fixedLayoutVersion: version }, { merge: true });
  }

  async function syncShelvesFromTemplate(slots, options = {}) {
    const slotKeys = new Set(slots.map((s) => s.slotKey));

    if (options.reset) {
      const existing = await getAllShelves();
      for (const shelf of existing) {
        await deleteShelf(shelf.id);
      }
      if (options.layoutVersion != null) {
        await setLayoutVersion(options.layoutVersion);
      }
    }

    let existing = await getAllShelves();
    for (const shelf of existing) {
      if (!slotKeys.has(shelf.slotKey)) {
        await deleteShelf(shelf.id);
      }
    }

    await dedupeShelvesBySlotKey(slotKeys);

    existing = await getAllShelves();
    const bySlot = new Map(existing.map((s) => [s.slotKey, s]));
    for (const slot of slots) {
      if (!bySlot.has(slot.slotKey)) {
        await addShelf({
          slotKey: slot.slotKey,
          name: slot.defaultName,
        });
      }
    }
  }

  async function resetAll() {
    const shelves = await getAllShelves();
    for (const shelf of shelves) {
      shelf.checked = false;
      await updateShelf(shelf);
    }
    const snap = await photosCol().get();
    for (const doc of snap.docs) {
      await deletePhoto(doc.id);
    }
  }

  async function getPhotoCounts() {
    const shelves = await getAllShelves();
    const counts = {};
    await Promise.all(shelves.map(async (shelf) => {
      const snap = await photosCol().where('shelfId', '==', normalizeShelfId(shelf.id)).get();
      counts[shelf.id] = snap.size;
    }));
    return counts;
  }

  return {
    setOnChange,
    startSync,
    stopSync,
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
    getPhotoBlob,
    syncShelvesFromBoard,
    syncShelvesFromTemplate,
    getLayoutVersion,
    setLayoutVersion,
    resetAll,
    getPhotoCounts,
  };
})();
