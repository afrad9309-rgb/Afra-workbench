// ===== 丁慧工作台 主入口 =====
(async function() {
  try {
    await DB.open();
    Sync.load();
    Header.init();
    Sidebar.init();
    Lock.init(); // 密码锁：首次设置密码 / 已有密码则锁屏等待解锁

    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(()=>{});
    }
  } catch(e) {
    console.error('初始化失败:', e);
    document.getElementById('content').innerHTML = `<div class="empty-tip">初始化失败，请刷新重试</div>`;
  }
})();
