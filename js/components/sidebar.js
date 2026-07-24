// ===== 左侧任务栏组件 =====
const Sidebar = (() => {
  const ITEMS = [
    { key:'todo', name:'待办事项', icon:'💕' },
    { key:'notes', name:'常用列表', icon:'🌴' },
    { key:'expense', name:'费用大纲', icon:'💵' },
    { key:'ideas', name:'奇思妙想', icon:'🌟' },
    { key:'life', name:'生活账目', icon:'🎏' }
  ];

  let current = 'todo';

  function render() {
    const sb = document.getElementById('sidebar');
    sb.innerHTML = '';
    ITEMS.forEach(it => {
      const el = document.createElement('div');
      el.className = 'sidebar-item' + (it.key===current?' active':'');
      el.innerHTML = `<span class="sb-icon">${it.icon}</span><span>${it.name}</span>`;
      el.addEventListener('click', () => { current = it.key; render(); switchTo(it.key); });
      sb.appendChild(el);
    });
  }

  function switchTo(key) {
    const c = document.getElementById('content');
    c.scrollTop = 0;
    const map = { todo:Todo, notes:Notes, expense:Expense, ideas:Ideas, life:LifeAccount };
    if (map[key] && map[key].render) map[key].render(c);
  }

  function init() {
    render();
    switchTo(current);
  }

  return { init, get current(){return current;} };
})();
