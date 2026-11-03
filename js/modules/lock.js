// ===== 丁慧工作台 — 密码锁模块（4位数字密码） =====
// 功能：4位数字密码设置 / SHA-256 验证 / 数字键盘锁屏 UI / 30 分钟无操作自动锁定
const Lock = (() => {
  const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 分钟
  let timer = null;
  let isLocked = false;
  let _hasPwdCache = null;
  let currentInput = '';   // 当前已输入的数字
  let inputMode = null;    // 'unlock' | 'set1' | 'set2'
  let firstPin = '';       // 设置密码时第一次输入

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

  // ===== 渲染 4 位圆点 =====
  function dotsHTML() {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += `<span class="pin-dot ${i < currentInput.length ? 'filled' : ''}"></span>`;
    }
    return s;
  }

  function refreshDots() {
    const box = document.getElementById('pinDots');
    if (box) box.innerHTML = dotsHTML();
  }

  // ===== 键盘按下 =====
  function pressDigit(d) {
    if (currentInput.length >= 4) return;
    currentInput += d;
    refreshDots();
    if (currentInput.length === 4) {
      setTimeout(() => handleFullInput(), 150);
    }
  }
  function pressDelete() {
    currentInput = currentInput.slice(0, -1);
    refreshDots();
  }

  async function handleFullInput() {
    const errEl = document.getElementById('pinError');
    const entered = currentInput;
    currentInput = '';

    if (inputMode === 'unlock') {
      const hash = await sha256(entered);
      const stored = await getHash();
      if (hash === stored) {
        errEl.textContent = '';
        unlock();
      } else {
        errEl.textContent = '密码错误，请重试';
        shakeDots();
        refreshDots();
      }
    } else if (inputMode === 'set1') {
      firstPin = entered;
      inputMode = 'set2';
      const sub = document.getElementById('pinSubtitle');
      if (sub) sub.textContent = '请再次输入确认';
      errEl.textContent = '';
      refreshDots();
    } else if (inputMode === 'set2') {
      if (entered === firstPin) {
        const hash = await sha256(entered);
        await setHash(hash);
        _hasPwdCache = true;
        errEl.textContent = '';
        unlock();
      } else {
        errEl.textContent = '两次输入不一致，请重新设置';
        shakeDots();
        inputMode = 'set1';
        const sub = document.getElementById('pinSubtitle');
        if (sub) sub.textContent = '请设置 4 位数字密码';
        firstPin = '';
        refreshDots();
      }
    }
  }

  function shakeDots() {
    const box = document.getElementById('pinDots');
    if (box) {
      box.classList.add('shake');
      setTimeout(() => box.classList.remove('shake'), 500);
    }
  }

  // ===== 键盘 HTML =====
  function keypadHTML() {
    const keys = ['1','2','3','4','5','6','7','8','9','删除','0',''];
    return keys.map(k => {
      if (k === '') return `<div class="pin-key pin-key-empty"></div>`;
      if (k === '删除') return `<div class="pin-key pin-key-del" data-act="del">⌫</div>`;
      return `<div class="pin-key" data-digit="${k}">${k}</div>`;
    }).join('');
  }

  // ===== 渲染锁屏 UI =====
  function renderLockScreen(mode) {
    if (document.getElementById('lockScreen')) return;
    isLocked = (mode === 'unlock');
    if (isLocked) stopIdleTimer();
    inputMode = mode;
    currentInput = '';
    firstPin = '';

    const isSetup = (mode !== 'unlock');
    const mask = document.createElement('div');
    mask.id = 'lockScreen';
    mask.className = 'lock-screen';
    mask.innerHTML = `
      <div class="lock-inner">
        <div class="lock-icon">${isSetup ? '🛡️' : '🔒'}</div>
        <div class="lock-title">${isSetup ? '设置密码保护' : '丁慧工作台已锁定'}</div>
        <div class="lock-subtitle" id="pinSubtitle">${isSetup ? '请设置 4 位数字密码' : '请输入 4 位数字密码解锁'}</div>
        <div class="pin-dots" id="pinDots">${dotsHTML()}</div>
        <div class="pin-error" id="pinError"></div>
        <div class="pin-keypad">${keypadHTML()}</div>
        ${isSetup ? `<div class="pin-skip" id="pinSkip">暂不设置</div>` : ''}
      </div>
    `;
    document.body.appendChild(mask);

    // 键盘事件
    mask.querySelectorAll('.pin-key[data-digit]').forEach(k => {
      k.addEventListener('click', () => pressDigit(k.dataset.digit));
    });
    const del = mask.querySelector('.pin-key-del');
    if (del) del.addEventListener('click', pressDelete);

    // 物理键盘支持（电脑端）
    document.addEventListener('keydown', physKeyHandler);

    const skip = document.getElementById('pinSkip');
    if (skip) skip.addEventListener('click', () => {
      document.removeEventListener('keydown', physKeyHandler);
      closeLockScreen();
    });
  }

  function physKeyHandler(e) {
    if (!document.getElementById('lockScreen')) {
      document.removeEventListener('keydown', physKeyHandler);
      return;
    }
    if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
    else if (e.key === 'Backspace') pressDelete();
    e.preventDefault();
  }

  function closeLockScreen() {
    const mask = document.getElementById('lockScreen');
    if (mask) {
      mask.classList.add('unlocking');
      setTimeout(() => mask.remove(), 400);
    }
  }

  function unlock() {
    isLocked = false;
    document.removeEventListener('keydown', physKeyHandler);
    closeLockScreen();
    // 重新开始空闲计时
    startIdleTimer();
  }

  // ===== 空闲计时器 =====
  function startIdleTimer() {
    stopIdleTimer();
    timer = setTimeout(() => {
      if (!isLocked && _hasPwdCache) {
        renderLockScreen('unlock');
      }
    }, LOCK_TIMEOUT);
  }

  function stopIdleTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function resetIdleTimer() {
    if (!isLocked && _hasPwdCache) {
      startIdleTimer();
    }
  }

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
      renderLockScreen('set1');   // 首次使用，弹出设置密码
    } else {
      renderLockScreen('unlock'); // 已有密码，显示锁屏
    }
    bindIdleEvents();
  }

  return { init, hasPassword };
})();
