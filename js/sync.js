// ===== 云同步接口（默认关闭，预留开启端口） =====
// 当前为本地存根；后续接入 Supabase 只需实现 push()/pull()
const Sync = {
  enabled: false,
  config: { url: '', key: '' },

  // 启用同步：填入配置后开启
  enable(url, key) {
    this.config = { url, key };
    this.enabled = true;
    localStorage.setItem('sync_config', JSON.stringify(this.config));
  },
  disable() { this.enabled = false; localStorage.removeItem('sync_config'); },
  load() { const c = localStorage.getItem('sync_config'); if (c) { this.config = JSON.parse(c); this.enabled = true; } },

  // 推送本地数据到云端（待实现）
  async push(store, data) {
    if (!this.enabled) return false;
    // TODO: 接入 Supabase / 其他云端
    return false;
  },
  // 拉取云端数据（待实现）
  async pull(store) {
    if (!this.enabled) return [];
    // TODO: 接入 Supabase / 其他云端
    return [];
  }
};
