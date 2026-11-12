// ===== 云同步模块 v3（GitHub 私有仓库 · 双向合并 · Git Data API） =====
// 核心算法：每次同步把「本地数据」和「云端数据」逐条合并，
//   - 记录级合并：同一条记录谁修改时间新就保留谁，绝不覆盖丢失
//   - 删除墓碑：删除操作记录到 tombstones，删除也会同步且不复活有效数据
//   - Git Data API 提交：无 1MB 大小限制；提交冲突时自动重新合并重试
//   - 每次同步前把云端旧数据备份到 data-backup.json
const Sync = (() => {
  const REPO = 'Afra-workbench-sync';
  const FILE = 'data.json';
  const BACKUP_FILE = 'data-backup.json';       // 云端旧数据备份
  const SYNC_INTERVAL = 60 * 1000;              // 每 60 秒同步一次
  const PUSH_DEBOUNCE = 2 * 1000;               // 修改后 2 秒自动同步
  const TOMBSTONE_KEEP = 90 * 24 * 3600 * 1000; // 墓碑保留 90 天
  const STORES = ['todos', 'notes', 'expenses', 'ideas', 'life_now', 'life_process'];

  let enabled = false;
  let token = '';
  let owner = '';
  let pushTimer = null;
  let pullTimer = null;
  let syncing = false;

  // ===== 配置读写 =====
  function loadConfig() {
    const c = localStorage.getItem('sync_config');
    if (c) {
      try {
        const cfg = JSON.parse(c);
        token = cfg.token || '';
        owner = cfg.owner || '';
        enabled = !!(token && owner);
      } catch(e) {}
    }
    return enabled;
  }
  function saveConfig(t, o) {
    token = t.trim(); owner = o.trim();
    enabled = !!(token && owner);
    localStorage.setItem('sync_config', JSON.stringify({ token, owner }));
  }
  function clearConfig() {
    enabled = false; token = ''; owner = '';
    localStorage.removeItem('sync_config');
    stopTimers();
  }

  // ===== GitHub API 封装 =====
  function api(path, opts = {}) {
    return fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      }
    });
  }
  function encodeContent(str) { return btoa(unescape(encodeURIComponent(str))); }
  function decodeContent(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }

  async function ensureRepo() {
    const res = await api(`/repos/${owner}/${REPO}`);
    if (res.status === 404) {
      const create = await api('/user/repos', {
        method: 'POST',
        body: JSON.stringify({ name: REPO, private: true, description: '丁慧工作台数据同步' })
      });
      if (!create.ok) throw new Error('创建同步仓库失败：' + (await create.json()).message);
    } else if (res.status === 401) {
      throw new Error('Token 无效，请检查');
    }
  }

  // ===== 读取云端最新状态（Git Data API） =====
  // 返回 { commitSha, treeSha, data } 或 null（空仓库）
  async function getRemoteState() {
    let ref;
    try {
      ref = await api(`/repos/${owner}/${REPO}/git/ref/heads/main`);
    } catch(e) { return null; }
    if (ref.status === 404 || ref.status === 409) return null;   // 空仓库还没有分支
    if (!ref.ok) throw new Error('读取云端失败：' + ref.status);
    const refJ = await ref.json();
    const commitSha = refJ.object.sha;
    const commitRes = await api(`/repos/${owner}/${REPO}/git/commits/${commitSha}`);
    if (!commitRes.ok) throw new Error('读取提交失败：' + commitRes.status);
    const commit = await commitRes.json();
    const treeSha = commit.tree.sha;
    const treeRes = await api(`/repos/${owner}/${REPO}/git/trees/${treeSha}`);
    if (!treeRes.ok) throw new Error('读取文件树失败：' + treeRes.status);
    const tree = await treeRes.json();
    const entry = (tree.tree || []).find(t => t.path === FILE);
    let data = null;
    if (entry) {
      const blobRes = await api(`/repos/${owner}/${REPO}/git/blobs/${entry.sha}`);
      if (!blobRes.ok) throw new Error('读取数据失败：' + blobRes.status);
      const blob = await blobRes.json();
      try { data = JSON.parse(decodeContent(blob.content)); } catch(e) { data = null; }
    }
    return { commitSha, treeSha, data };
  }

  // ===== 提交数据到云端（blob → tree → commit → ref） =====
  // remote: getRemoteState() 的结果；backupData: 要备份的旧云端数据（可 null）
  async function commitData(data, remote, backupData) {
    const ts = new Date().toLocaleString('zh-CN');
    // 1. 新数据 blob
    const blobRes = await api(`/repos/${owner}/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: encodeContent(JSON.stringify(data)), encoding: 'base64' })
    });
    if (!blobRes.ok) throw new Error('上传数据失败：' + blobRes.status);
    const blob = await blobRes.json();

    // 2. 文件树（同时写入 data.json 和备份文件）
    const treeEntries = [{ path: FILE, mode: '100644', type: 'blob', sha: blob.sha }];
    if (backupData) {
      const bakRes = await api(`/repos/${owner}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: encodeContent(JSON.stringify(backupData)), encoding: 'base64' })
      });
      if (bakRes.ok) {
        const bak = await bakRes.json();
        treeEntries.push({ path: BACKUP_FILE, mode: '100644', type: 'blob', sha: bak.sha });
      }
    }
    const treeBody = { tree: treeEntries };
    if (remote && remote.treeSha) treeBody.base_tree = remote.treeSha;
    const treeRes2 = await api(`/repos/${owner}/${REPO}/git/trees`, {
      method: 'POST', body: JSON.stringify(treeBody)
    });
    if (!treeRes2.ok) throw new Error('创建文件树失败：' + treeRes2.status);
    const newTree = await treeRes2.json();

    // 3. 提交
    const commitBody = { message: '同步 ' + ts, tree: newTree.sha, parents: (remote && remote.commitSha) ? [remote.commitSha] : [] };
    const commitRes2 = await api(`/repos/${owner}/${REPO}/git/commits`, {
      method: 'POST', body: JSON.stringify(commitBody)
    });
    if (!commitRes2.ok) throw new Error('创建提交失败：' + commitRes2.status);
    const newCommit = await commitRes2.json();

    // 4. 更新分支引用
    let refRes;
    if (remote && remote.commitSha) {
      refRes = await api(`/repos/${owner}/${REPO}/git/refs/heads/main`, {
        method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha, force: false })
      });
    } else {
      refRes = await api(`/repos/${owner}/${REPO}/git/refs`, {
        method: 'POST', body: JSON.stringify({ ref: 'refs/heads/main', sha: newCommit.sha })
      });
    }
    if (!refRes.ok) {
      const err = new Error('提交冲突');
      err.conflict = true;
      throw err;
    }
  }

  // ===== 记录时间戳 =====
  function stamp(r) { return r.updatedAt || r.createdAt || 0; }

  // ===== 核心：双向合并 =====
  async function mergeSync(manual = false) {
    if (!enabled || syncing) return;
    syncing = true;
    DB.setSilent(true);
    try {
      setStatus(manual ? '正在同步…' : '同步中…');

      // 1. 读取本地数据（合并前快照固定，重试时基于最新合并结果）
      const local = {};
      for (const s of STORES) local[s] = await DB.getAll(s);
      const localTomb = {};
      (await DB.getAll('tombstones')).forEach(t => localTomb[t.id] = t);

      // 2. 同步主循环：冲突时重新拉取云端再合并，最多重试 3 次
      let committed = false;
      for (let attempt = 0; attempt < 3 && !committed; attempt++) {
        const remote = await getRemoteState();
        const cloudData = (remote && remote.data && typeof remote.data === 'object') ? remote.data : null;

        // 合并墓碑（两边并集，谁的新用谁的）
        const mergedTomb = { ...localTomb };
        if (cloudData && cloudData.tombstones) {
          Object.entries(cloudData.tombstones).forEach(([k, t]) => {
            if (!mergedTomb[k] || (t.deletedAt || 0) > (mergedTomb[k].deletedAt || 0)) mergedTomb[k] = t;
          });
        }

        // 逐条合并记录
        const merged = {};
        let addedFromCloud = 0;
        for (const s of STORES) {
          const map = new Map();
          (local[s] || []).forEach(r => map.set(r.id, r));
          const cloudArr = (cloudData && cloudData.stores && cloudData.stores[s]) || [];
          cloudArr.forEach(r => {
            const tomb = mergedTomb[s + ':' + r.id];
            if (tomb && (tomb.deletedAt || 0) >= stamp(r)) return;   // 已被删除
            const cur = map.get(r.id);
            if (!cur) { map.set(r.id, r); addedFromCloud++; return; }
            if (stamp(r) > stamp(cur)) map.set(r.id, r);             // 云端更新则采用
          });
          merged[s] = Array.from(map.values());
        }

        // 清理过期墓碑（90天前）
        const now = Date.now();
        Object.keys(mergedTomb).forEach(k => {
          if (now - (mergedTomb[k].deletedAt || 0) > TOMBSTONE_KEEP) delete mergedTomb[k];
        });

        // 把合并结果写回本地（仅第一次尝试时写入，避免重复写）
        if (attempt === 0) {
          for (const s of STORES) {
            await DB.clear(s);
            for (const r of merged[s]) await DB.put(s, r);
          }
          await DB.clear('tombstones');
          for (const t of Object.values(mergedTomb)) await DB.put('tombstones', t);
        }

        // 上传合并结果（云端旧数据先备份）；无变化则跳过提交
        const payload = { v: 3, updatedAt: now, device: navigator.userAgent.slice(0, 40), stores: merged, tombstones: mergedTomb };
        const cloudSnapshot = cloudData ? JSON.stringify({ stores: cloudData.stores || {}, tombstones: cloudData.tombstones || {} }) : null;
        const newSnapshot = JSON.stringify({ stores: payload.stores, tombstones: payload.tombstones });
        try {
          if (cloudSnapshot === newSnapshot) {
            // 云端数据与合并结果一致，无需提交
            committed = true;
            setStatus('数据已是最新 ✓ ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
            if (addedFromCloud > 0 || manual) refreshCurrentView();
          } else {
            await commitData(payload, remote, cloudData);
            committed = true;
            setStatus('已同步 ✓ ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
            if (addedFromCloud > 0 || manual) refreshCurrentView();
          }
        } catch(e) {
          if (!e.conflict) throw e;   // 非冲突错误直接抛出；冲突则重试
        }
      }
      if (!committed) setStatus('同步冲突，已重试 3 次未成功，请稍后再试');
    } catch(e) {
      setStatus('同步失败：' + e.message);
    }
    DB.setSilent(false);
    syncing = false;
  }

  function refreshCurrentView() {
    try {
      const map = { todo: Todo, notes: Notes, expense: Expense, ideas: Ideas, life: LifeAccount };
      const mod = map[Sidebar.current];
      if (mod && mod.render) mod.render(document.getElementById('content'));
    } catch(e) {}
  }

  // ===== 定时器 =====
  function startTimers() {
    stopTimers();
    pullTimer = setInterval(() => mergeSync(), SYNC_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) mergeSync();
    });
    window.addEventListener('focus', () => mergeSync());
  }
  function stopTimers() {
    if (pullTimer) { clearInterval(pullTimer); pullTimer = null; }
  }

  // ===== 数据变更通知（由 db.js 调用） =====
  function notifyChange() {
    if (!enabled) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => mergeSync(), PUSH_DEBOUNCE);
  }

  function setStatus(text) {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = text;
  }

  // ===== 设置面板 =====
  function openPanel() {
    if (document.getElementById('syncPanel')) return;
    loadConfig();
    const mask = document.createElement('div');
    mask.id = 'syncPanel';
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <div class="modal-title">☁️ 云同步设置 <span class="muted">（代码版本 V3-合并版）</span></div>
        <div class="muted" style="margin-bottom:10px;">
          手机和电脑数据自动双向合并同步（不会互相覆盖、不会丢记录）。
          需要你的 GitHub Token（需 repo 权限），
          数据保存在私有仓库 ${owner || '你的账号'}/${REPO}，仅自己可见。
        </div>
        <div class="modal-row">
          <label>GitHub Token</label>
          <input type="password" id="syncToken" placeholder="ghp_ 开头的 token" value="${token}">
        </div>
        <div class="modal-row">
          <label>GitHub 用户名</label>
          <input type="text" id="syncOwner" placeholder="例如 afrad9309-rgb" value="${owner}">
        </div>
        <div id="syncStatus" class="muted" style="margin-bottom:6px;">${enabled ? '同步已开启' : '当前未开启同步'}</div>
        <div class="modal-btns">
          <button class="btn btn-ghost" id="syncOff">关闭同步</button>
          <button class="btn btn-ghost" id="syncNow">立即同步</button>
          <button class="btn btn-primary" id="syncSave">保存并同步</button>
        </div>
        <button class="btn btn-ghost" id="syncClose" style="width:100%;margin-top:8px;">关闭窗口</button>
      </div>
    `;
    document.body.appendChild(mask);

    document.getElementById('syncClose').addEventListener('click', () => mask.remove());
    document.getElementById('syncSave').addEventListener('click', async () => {
      const t = document.getElementById('syncToken').value.trim();
      const o = document.getElementById('syncOwner').value.trim();
      if (!t || !o) { setStatus('请填写 Token 和用户名'); return; }
      saveConfig(t, o);
      setStatus('正在验证并创建同步仓库…');
      try {
        await ensureRepo();
        await mergeSync(true);
        startTimers();
      } catch(e) {
        setStatus('开启失败：' + e.message);
      }
    });
    document.getElementById('syncNow').addEventListener('click', () => mergeSync(true));
    document.getElementById('syncOff').addEventListener('click', () => {
      clearConfig();
      setStatus('已关闭同步（本地数据不受影响）');
    });
  }

  // ===== 初始化 =====
  function init() {
    if (loadConfig()) {
      startTimers();
      setTimeout(() => mergeSync(), 1500);
    }
  }

  return { init, openPanel, notifyChange, get enabled() { return enabled; } };
})();
