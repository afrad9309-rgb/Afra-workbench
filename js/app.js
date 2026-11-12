// ===== 丁慧工作台 主入口 =====
(async function() {
  try {
    await DB.open();
    Sync.init();
    Header.init();
    Sidebar.init();
    Lock.init(); // 4位数字密码锁：首次设置 / 已有密码则锁屏等待解锁

    // 注册 Service Worker（新版发布后自动刷新页面加载最新代码）
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').then(reg => {
        // 检测到新版本安装完成 → 自动刷新一次
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // 避免刷新循环：本次会话只自动刷新一次
              if (!sessionStorage.getItem('sw_reloaded')) {
                sessionStorage.setItem('sw_reloaded', '1');
                location.reload();
              }
            }
          });
        });
      }).catch(()=>{});
      // SW 接管后刷新一次
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!sessionStorage.getItem('sw_reloaded')) {
          sessionStorage.setItem('sw_reloaded', '1');
          location.reload();
        }
      });
    }
  } catch(e) {
    console.error('初始化失败:', e);
    document.getElementById('content').innerHTML = `<div class="empty-tip">初始化失败，请刷新重试</div>`;
  }
})();
