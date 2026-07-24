// ===== IndexedDB 数据层（统一接口，预留云同步） =====
const DB = (() => {
  const DB_NAME = 'dinghui_workbench';
  const DB_VER = 1;
  const STORES = ['todos', 'notes', 'expenses', 'ideas', 'life_now', 'life_process', 'settings'];
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e.target.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return db.transaction(store, mode).objectStore(store);
  }

  function req2promise(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  async function getAll(store) { return req2promise(tx(store).getAll()); }
  async function get(store, id) { return req2promise(tx(store).get(id)); }
  async function put(store, val) { return req2promise(tx(store, 'readwrite').put(val)); }
  async function del(store, id) { return req2promise(tx(store, 'readwrite').delete(id)); }
  async function clear(store) { return req2promise(tx(store, 'readwrite').clear()); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  return { open, getAll, get, put, del, clear, uid };
})();
