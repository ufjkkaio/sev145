/* global firebase, firebaseConfig */
const FirebaseBoot = (function () {
  'use strict';

  if (!firebase?.apps?.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = typeof firebase.storage === 'function' ? firebase.storage() : null;

  auth.useDeviceLanguage();

  return { auth, db, storage };
})();
