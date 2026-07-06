/* global FirebaseBoot */
const CloudAuth = (function () {
  'use strict';

  const SESSION_KEY = 'tana-kanri-sessions';
  const RESERVED_ON_SIMPLE = new Set(['528089']);
  const PASS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

  let currentStoreId = null;
  let currentStoreMeta = null;

  function authEmailForStore(storeId) {
    return `store.${storeId}@tana-kanri.internal`;
  }

  function generatePassphrase(len = 12) {
    let s = '';
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) {
      s += PASS_CHARS[arr[i] % PASS_CHARS.length];
    }
    return s;
  }

  function generateStoreId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeStoreNumber(value) {
    return String(value || '').trim();
  }

  function isValidStoreNumber(value) {
    return /^\d{6}$/.test(value);
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const data = raw ? JSON.parse(raw) : { currentStoreId: null, stores: [] };
      data.stores = Array.isArray(data.stores) ? data.stores : [];
      return data;
    } catch {
      return { currentStoreId: null, stores: [] };
    }
  }

  function saveSessions(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function upsertSession(entry) {
    const data = loadSessions();
    const idx = data.stores.findIndex((s) => s.storeId === entry.storeId);
    if (idx >= 0) data.stores[idx] = entry;
    else data.stores.push(entry);
    data.currentStoreId = entry.storeId;
    saveSessions(data);
    return data;
  }

  function getSavedStores() {
    return loadSessions().stores;
  }

  function getCurrentStoreId() {
    return currentStoreId;
  }

  function getCurrentStoreMeta() {
    return currentStoreMeta;
  }

  async function signInStore(entry) {
    const { auth } = FirebaseBoot;
    await auth.signOut();
    await auth.signInWithEmailAndPassword(entry.authEmail, entry.passphrase);
    currentStoreId = entry.storeId;
    const snap = await FirebaseBoot.db.collection('stores').doc(entry.storeId).get();
    currentStoreMeta = snap.exists ? snap.data() : null;
    upsertSession(entry);
    return entry;
  }

  async function tryLoginCandidate(storeNumber, passphrase, doc) {
    const storeId = doc.id;
    const data = doc.data();
    const authEmail = data.authEmail || authEmailForStore(storeId);
    try {
      await FirebaseBoot.auth.signInWithEmailAndPassword(authEmail, passphrase);
      const entry = {
        storeId,
        storeNumber: data.storeNumber,
        displayName: data.displayName || data.storeNumber,
        authEmail,
        passphrase,
        layoutType: data.layoutType || 'whiteboard',
      };
      currentStoreId = storeId;
      currentStoreMeta = data;
      upsertSession(entry);
      return entry;
    } catch {
      await FirebaseBoot.auth.signOut();
      return null;
    }
  }

  async function login(storeNumber, passphrase) {
    const num = normalizeStoreNumber(storeNumber);
    if (!isValidStoreNumber(num)) {
      throw new Error('店番号は6桁の数字で入力してください');
    }
    if (!passphrase) throw new Error('合言葉を入力してください');

    const snap = await FirebaseBoot.db.collection('stores')
      .where('storeNumber', '==', num)
      .get();

    if (snap.empty) throw new Error('店番号または合言葉が正しくありません');

    for (const doc of snap.docs) {
      const hit = await tryLoginCandidate(num, passphrase, doc);
      if (hit) return hit;
    }
    throw new Error('店番号または合言葉が正しくありません');
  }

  async function register(storeNumber, displayName, options = {}) {
    const num = normalizeStoreNumber(storeNumber);
    const name = String(displayName || '').trim();
    const layoutType = options.layoutType || 'whiteboard';
    const blockReserved = options.blockReserved !== false;

    if (!isValidStoreNumber(num)) {
      throw new Error('店番号は6桁の数字で入力してください');
    }
    if (blockReserved && RESERVED_ON_SIMPLE.has(num)) {
      throw new Error('この店番号は145専用です');
    }
    if (!name) throw new Error('店舗名を入力してください');

    const storeId = generateStoreId();
    const passphrase = generatePassphrase();
    const authEmail = authEmailForStore(storeId);

    const credential = await FirebaseBoot.auth.createUserWithEmailAndPassword(authEmail, passphrase);
    const uid = credential.user.uid;

    const storeDoc = {
      authUid: uid,
      authEmail,
      storeNumber: num,
      displayName: name,
      layoutType,
      boardLayout: { version: 2, blocks: [] },
      boardView: { scale: 1, x: 0, y: 0 },
      shelfSeq: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await FirebaseBoot.db.collection('stores').doc(storeId).set(storeDoc);

    const entry = {
      storeId,
      storeNumber: num,
      displayName: name,
      authEmail,
      passphrase,
      layoutType,
    };
    currentStoreId = storeId;
    currentStoreMeta = storeDoc;
    upsertSession(entry);
    return { entry, passphrase };
  }

  async function restoreSession() {
    const data = loadSessions();
    if (!data.currentStoreId) return null;
    const entry = data.stores.find((s) => s.storeId === data.currentStoreId);
    if (!entry) return null;
    try {
      return await signInStore(entry);
    } catch {
      return null;
    }
  }

  async function switchStore(storeId) {
    const entry = loadSessions().stores.find((s) => s.storeId === storeId);
    if (!entry) throw new Error('店舗が見つかりません');
    return signInStore(entry);
  }

  async function addStoreByLogin(storeNumber, passphrase) {
    const entry = await login(storeNumber, passphrase);
    return entry;
  }

  function parseQrPayload(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj.n && obj.p) return { storeNumber: String(obj.n), passphrase: String(obj.p) };
    } catch {
      /* fall through */
    }
    try {
      const url = new URL(raw);
      const n = url.searchParams.get('n');
      const p = url.searchParams.get('p');
      if (n && p) return { storeNumber: n, passphrase: p };
    } catch {
      /* ignore */
    }
    return null;
  }

  function buildQrPayload(storeNumber, passphrase) {
    return JSON.stringify({ n: storeNumber, p: passphrase, v: 1 });
  }

  function buildQrUrl(storeNumber, passphrase, basePath) {
    const base = basePath || `${location.origin}${location.pathname}`;
    const u = new URL(base, location.href);
    u.searchParams.set('n', storeNumber);
    u.searchParams.set('p', passphrase);
    return u.toString();
  }

  async function loginFromQr(text) {
    const parsed = parseQrPayload(text);
    if (!parsed) throw new Error('QRの内容を読み取れませんでした');
    return login(parsed.storeNumber, parsed.passphrase);
  }

  async function tryLoginFromUrl() {
    const n = new URLSearchParams(location.search).get('n');
    const p = new URLSearchParams(location.search).get('p');
    if (!n || !p) return null;
    const entry = await login(n, p);
    const clean = new URL(location.href);
    clean.searchParams.delete('n');
    clean.searchParams.delete('p');
    history.replaceState({}, '', clean.pathname + clean.search);
    return entry;
  }

  return {
    RESERVED_ON_SIMPLE,
    normalizeStoreNumber,
    isValidStoreNumber,
    generatePassphrase,
    getSavedStores,
    getCurrentStoreId,
    getCurrentStoreMeta,
    login,
    register,
    restoreSession,
    switchStore,
    addStoreByLogin,
    signInStore,
    parseQrPayload,
    buildQrPayload,
    buildQrUrl,
    loginFromQr,
    tryLoginFromUrl,
  };
})();
