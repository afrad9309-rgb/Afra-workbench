// ===== IndexedDB 数据层（统一接口 + 云同步支持） =====
// v2: 新增 tombstones（删除墓碑）存储，用于同步删除操作
const DB = (() => {
  const DB_NAME = 'dinghui_workbench';
  const DB_VER = 2;
  const STORES = ['todos', 'notes', 'expenses', 'ideas', 'life_now', 'life_process', 'settings', 'tombstones'];
  let db = null;
  let _silent = false;   // 同步程序写入时置 true，避免触发同步循环和墓碑记录

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

  function isSyncStore(store) {
    return _silent !== true && store !== 'settings' && store !== 'tombstones' && window.Sync;
  }

  // 记录删除墓碑
  function recordTombstone(store, id) {
    try {
      tx('tombstones', 'readwrite').put({ id: store + ':' + id, store: store, delId: id, deletedAt: Date.now() });
    } catch(e) {}
  }

  async function getAll(store) { return req2promise(tx(store).getAll()); }
  async function get(store, id) { return req2promise(tx(store).get(id)); }

  async function put(store, val) {
    const r = await req2promise(tx(store, 'readwrite').put(val));
    if (isSyncStore(store)) Sync.notifyChange();
    return r;
  }

  async function del(store, id) {
    if (isSyncStore(store)) recordTombstone(store, id);
    const r = await req2promise(tx(store, 'readwrite').delete(id));
    if (isSyncStore(store)) Sync.notifyChange();
    return r;
  }

  async function clear(store) {
    // 用户手动清空时，为每条记录记墓碑，保证删除操作也能同步
    if (isSyncStore(store)) {
      const all = await req2promise(tx(store).getAll());
      all.forEach(item => recordTombstone(store, item.id));
    }
    const r = await req2promise(tx(store, 'readwrite').clear());
    if (isSyncStore(store)) Sync.notifyChange();
    return r;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // 同步模块专用：静默写入（不触发同步/墓碑）
  function setSilent(v) { _silent = v; }

  return { open, getAll, get, put, del, clear, uid, setSilent };
})();
