// ===== 丁慧工作台 — 密码锁模块 =====
// 功能：密码设置 / SHA-256 验证 / 锁屏 UI / 30 分钟无操作自动锁定
const Lock = (() => {
  const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 分钟
  let timer = null;
  let isLocked = false;

  // ===== SHA-256 哈希 =====
  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ===== 读取/保存密码哈希 =====
  async function getHash() {
    const r = await DB.get('settings', 'lock_hash');
    return r ? r.value : null;
  }
  async function setHash(hash) {
    await DB.put('settings', { id: 'lock_hash', value: hash });
  }
  async function hasPassword() {
    return !!await getHash();
  }

  // ===== 渲染锁屏 UI =====
  function renderLockScreen() {
    // 如果已存在锁屏遮罩，不重复渲染
    if (document.getElementById('lockScreen')) return;
    isLocked = true;
    stopIdleTimer(); // 锁定后停止计时

    const mask = document.createElement('div');
    mask.id = 'lockScreen';
    mask.className = 'lock-screen';
    mask.innerHTML = `
      <div class="lock-inner">
        <div class="lock-icon">🔒</div>
        <div class="lock-title">丁慧工作台已锁定</div>
        <div class="lock-subtitle">请输入密码解锁</div>
        <div class="lock-input-wrap">
          <input type="password" id="lockPwdInput" class="lock-input" placeholder="输入密码"
                 autocomplete="off" autofocus maxlength="20">
          <button id="lockUnlockBtn" class="lock-btn">解锁</button>
        </div>
        <div id="lockError" class="lock-error"></div>
      </div>
    `;
    document.body.appendChild(mask);

    // 绑定事件
    const input = document.getElementById('lockPwdInput');
    const btn = document.getElementById('lockUnlockBtn');
    const errEl = document.getElementById('lockError');

    btn.addEventListener('click', () => tryUnlock(input, errEl));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') tryUnlock(input, errEl);
    });
    // 聚焦输入框
    setTimeout(() => input.focus(), 300);
  }

  async function tryUnlock(input, errEl) {
    const pwd = input.value.trim();
    if (!pwd) {
      errEl.textContent = '请输入密码';
      shakeInput(input);
      return;
    }
    const hash = await sha256(pwd);
    const stored = await getHash();
    if (hash === stored) {
      // 解锁成功
      unlock();
    } else {
      errEl.textContent = '密码错误，请重试';
      input.value = '';
      shakeInput(input);
    }
  }

  function shakeInput(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 600);
  }

  function unlock() {
    isLocked = false;
    const mask = document.getElementById('lockScreen');
    if (mask) {
      mask.classList.add('unlocking');
      setTimeout(() => mask.remove(), 400);
    }
    // 重新开始空闲计时
    startIdleTimer();
  }

  // ===== 渲染设置密码 UI =====
  function renderSetPassword() {
    // 创建首次设置密码的弹窗
    const mask = document.createElement('div');
    mask.id = 'lockScreen';
    mask.className = 'lock-screen';
    mask.innerHTML = `
      <div class="lock-inner lock-setup">
        <div class="lock-icon">🛡️</div>
        <div class="lock-title">设置密码保护</div>
        <div class="lock-subtitle">为工作台设置密码，30 分钟无操作将自动锁定</div>
        <div class="lock-input-wrap">
          <input type="password" id="lockSetPwd" class="lock-input" placeholder="设置密码（4-20位）"
                 autocomplete="off" maxlength="20">
        </div>
        <div class="lock-input-wrap" style="margin-top:10px;">
          <input type="password" id="lockSetPwd2" class="lock-input" placeholder="确认密码"
                 autocomplete="off" maxlength="20">
        </div>
        <button id="lockSetBtn" class="lock-btn" style="margin-top:16px;">确认设置</button>
        <button id="lockSkipBtn" class="lock-btn-skip">暂不设置</button>
        <div id="lockError" class="lock-error"></div>
      </div>
    `;
    document.body.appendChild(mask);

    const pwd1 = document.getElementById('lockSetPwd');
    const pwd2 = document.getElementById('lockSetPwd2');
    const btn = document.getElementById('lockSetBtn');
    const skip = document.getElementById('lockSkipBtn');
    const errEl = document.getElementById('lockError');

    btn.addEventListener('click', async () => {
      const p1 = pwd1.value.trim();
      const p2 = pwd2.value.trim();
      if (p1.length < 4) {
        errEl.textContent = '密码至少 4 位';
        shakeInput(pwd1);
        return;
      }
      if (p1 !== p2) {
        errEl.textContent = '两次密码不一致';
        shakeInput(pwd2);
        return;
      }
      const hash = await sha256(p1);
      await setHash(hash);
      // 设置成功，关闭弹窗
      mask.classList.add('unlocking');
      setTimeout(() => mask.remove(), 400);
      // 开始空闲计时
      startIdleTimer();
    });

    skip.addEventListener('click', () => {
      mask.classList.add('unlocking');
      setTimeout(() => mask.remove(), 400);
    });

    setTimeout(() => pwd1.focus(), 300);
  }

  // ===== 空闲计时器 =====
  function startIdleTimer() {
    stopIdleTimer();
    timer = setTimeout(() => {
      if (!isLocked && _hasPwdCache) {
        renderLockScreen();
      }
    }, LOCK_TIMEOUT);
  }

  function stopIdleTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  // 重置计时器（用户有操作时）
  function resetIdleTimer() {
    if (!isLocked) {
      startIdleTimer();
    }
  }

  // 检查是否已设置密码（同步缓存版本）
  let _hasPwdCache = null;
  async function await_hasPassword() {
    if (_hasPwdCache === null) _hasPwdCache = await hasPassword();
    return _hasPwdCache;
  }

  // 监听用户交互事件来重置计时器
  function bindIdleEvents() {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(ev => {
      document.addEventListener(ev, resetIdleTimer, { passive: true });
    });
  }

  // ===== 初始化 =====
  async function init() {
    const hasPwd = await hasPassword();
    _hasPwdCache = hasPwd;

    if (!hasPwd) {
      // 首次使用，弹出设置密码
      renderSetPassword();
    } else {
      // 已有密码，直接显示锁屏（安全性：每次打开都需解锁）
      renderLockScreen();
    }

    // 绑定空闲事件监听
    bindIdleEvents();
  }

  // ===== 修改密码（可在设置中调用） =====
  async function changePassword(oldPwd, newPwd) {
    const oldHash = await sha256(oldPwd);
    const stored = await getHash();
    if (oldHash !== stored) return false;
    const newHash = await sha256(newPwd);
    await setHash(newHash);
    return true;
  }

  // ===== 清除密码 =====
  async function clearPassword(pwd) {
    const hash = await sha256(pwd);
    const stored = await getHash();
    if (hash !== stored) return false;
    await DB.del('settings', 'lock_hash');
    _hasPwdCache = false;
    stopIdleTimer();
    return true;
  }

  return { init, changePassword, clearPassword, hasPassword, renderLockScreen, unlock };
})();
