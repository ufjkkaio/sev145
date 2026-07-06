/* global firebase, firebaseConfig */
const FirebaseBoot = (function () {
  'use strict';

  if (!firebase?.apps?.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  auth.useDeviceLanguage();

  return { auth, db, storage };
})();
