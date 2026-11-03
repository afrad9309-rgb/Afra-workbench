// ===== 云同步模块（GitHub 私有仓库存储） =====
// 原理：把所有数据打包成 data.json 存到你的 GitHub 私有仓库，
//       手机和电脑都读写同一份，实现两端同步。
// 使用：在侧栏「同步」里填入 GitHub Token 即可开启。
const Sync = (() => {
  const REPO = 'Afra-workbench-sync';       // 私有数据仓库名
  const FILE = 'data.json';                  // 数据文件名
  const PULL_INTERVAL = 60 * 1000;           // 每 60 秒自动拉取一次
  const PUSH_DEBOUNCE = 3 * 1000;            // 修改后 3 秒自动推送
  const STORES = ['todos', 'notes', 'expenses', 'ideas', 'life_now', 'life_process'];

  let enabled = false;
  let token = '';
  let owner = '';
  let pushTimer = null;
  let pullTimer = null;
  let pushing = false;
  let lastCloudTime = 0;
  let lastLocalChange = 0;

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

  // 首次启用时自动创建私有仓库
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

  // 读取云端数据
  async function fetchCloud() {
    const res = await api(`/repos/${owner}/${REPO}/contents/${FILE}`);
    if (res.status === 404) return null;         // 还没有数据文件
    if (!res.ok) throw new Error('读取云端失败：' + res.status);
    const json = await res.json();
    const text = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
    return { sha: json.sha, data: JSON.parse(text) };
  }

  // 写入云端数据
  async function uploadCloud(payload, sha) {
    const body = {
      message: '同步数据 ' + new Date().toLocaleString('zh-CN'),
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    };
    if (sha) body.sha = sha;
    const res = await api(`/repos/${owner}/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('上传云端失败：' + res.status);
    return (await res.json()).content.sha;
  }

  // ===== 推送（本地 → 云端） =====
  async function push(manual = false) {
    if (!enabled || pushing) return setStatus('同步中…');
    pushing = true;
    try {
      setStatus(manual ? '正在上传…' : '同步中…');
      const payload = { updatedAt: Date.now(), stores: {} };
      for (const s of STORES) payload.stores[s] = await DB.getAll(s);
      const cloud = await fetchCloud();
      // 冲突保护：云端比本地新且非手动推送，先拉取合并
      if (cloud && cloud.data.updatedAt > lastLocalChange && !manual) {
        await applyCloud(cloud);
      }
      const sha = cloud ? cloud.sha : null;
      cloudSha = await uploadCloud(payload, sha);
      lastCloudTime = payload.updatedAt;
      setStatus('已同步 ✓ ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}));
    } catch(e) {
      setStatus('同步失败：' + e.message);
    }
    pushing = false;
  }

  // ===== 拉取（云端 → 本地） =====
  let cloudSha = null;
  async function pull(manual = false) {
    if (!enabled || pushing) return;
    try {
      const cloud = await fetchCloud();
      if (!cloud) return;                        // 云端无数据
      cloudSha = cloud.sha;
      if (cloud.data.updatedAt !== lastCloudTime) {
        if (cloud.data.updatedAt > lastLocalChange || manual) {
          await applyCloud(cloud);
          lastCloudTime = cloud.data.updatedAt;
          setStatus('已从云端更新 ✓');
        }
      }
    } catch(e) {
      if (manual) setStatus('拉取失败：' + e.message);
    }
  }

  // 应用云端数据到本地 IndexedDB，并刷新当前页面
  async function applyCloud(cloud) {
    for (const s of STORES) {
      await DB.clear(s);
      for (const item of (cloud.data.stores[s] || [])) {
        await DB.put(s, item);
      }
    }
    lastLocalChange = Date.now();
    // 刷新当前显示的模块
    const map = { todo:Todo, notes:Notes, expense:Expense, ideas:Ideas, life:LifeAccount };
    const mod = map[Sidebar.current];
    if (mod && mod.render) mod.render(document.getElementById('content'));
  }

  // ===== 定时器 =====
  function startTimers() {
    stopTimers();
    pullTimer = setInterval(() => pull(), PULL_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pull();
    });
  }
  function stopTimers() {
    if (pullTimer) { clearInterval(pullTimer); pullTimer = null; }
  }

  // ===== 数据变更通知（由 db.js 调用） =====
  function notifyChange() {
    if (!enabled) return;
    lastLocalChange = Date.now();
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(), PUSH_DEBOUNCE);
  }

  // ===== 状态显示 =====
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
        <div class="modal-title">☁️ 云同步设置</div>
        <div class="muted" style="margin-bottom:10px;">
          手机和电脑数据自动同步。需要你的 GitHub Token（需 repo 权限），
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
          <button class="btn btn-ghost" id="syncPull">立即拉取</button>
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
        await push(true);
        startTimers();
      } catch(e) {
        setStatus('开启失败：' + e.message);
      }
    });
    document.getElementById('syncPull').addEventListener('click', () => pull(true));
    document.getElementById('syncOff').addEventListener('click', () => {
      clearConfig();
      setStatus('已关闭同步（本地数据不受影响）');
    });
  }

  // ===== 初始化 =====
  function init() {
    if (loadConfig()) {
      startTimers();
      // 启动时拉取一次云端数据
      setTimeout(() => pull(), 1500);
    }
  }

  return { init, openPanel, notifyChange, push, pull, get enabled(){ return enabled; } };
})();
