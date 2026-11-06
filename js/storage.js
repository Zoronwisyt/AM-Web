// storage.js — IndexedDB persistence for projects & saved elements
const DB_NAME = 'amweb', DB_VER = 1;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('elements')) db.createObjectStore('elements', { keyPath: 'id' });
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}

function tx(store, mode) {
  return openDB().then(db => db.transaction(store, mode).objectStore(store));
}
function wrap(rq) {
  return new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
}

const Storage = {
  async all(store) { return wrap((await tx(store, 'readonly')).getAll()); },
  async get(store, id) { return wrap((await tx(store, 'readonly')).get(id)); },
  async put(store, obj) { return wrap((await tx(store, 'readwrite')).put(obj)); },
  async del(store, id) { return wrap((await tx(store, 'readwrite')).delete(id)); }
};
