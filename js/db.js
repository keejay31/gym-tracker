// IndexedDB: по хранилищу на сущность, ключ — поле id.

const DB_NAME = 'gymtracker';
const DB_VERSION = 1;

export const STORES = ['settings', 'muscles', 'movements', 'equipment', 'variants', 'weeks', 'sessions', 'measurements'];

let dbp = null;

export function openDB() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const txDone = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, obj) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(obj);
  return txDone(tx);
}

export async function putMany(store, list) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  for (const obj of list) tx.objectStore(store).put(obj);
  return txDone(tx);
}

export async function del(store, id) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return txDone(tx);
}

// Заменить всё содержимое базы одним махом (импорт, первый запуск)
export async function replaceAll(data) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    os.clear();
    for (const obj of data[s] || []) os.put(obj);
  }
  return txDone(tx);
}
