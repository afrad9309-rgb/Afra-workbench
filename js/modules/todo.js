// ===== 待办事项模块 =====
// 点击即可编辑 / 右侧小叉号删除 / 已完成按日期分组
const Todo = (() => {
  let doneOpen = false;

  async function render(root) {
    const all = await DB.getAll('todos');
    const pending = all.filter(t=>!t.done).sort((a,b)=>b.createdAt-a.createdAt);
    const done = all.filter(t=>t.done).sort((a,b)=>b.completedAt-a.completedAt);
    root.innerHTML = `
      <div class="card">
        <div class="section-title">待办事项</div>
        <div class="input-row">
          <div class="circle-dot" id="addDot"></div>
          <input id="todoInput" placeholder="添加待办..." />
        </div>
        <div id="todoList" class="mt12"></div>
      </div>
      <div class="card">
        <div class="collapse-head ${doneOpen?'open':''}" id="doneHead">
          <span>已完成（${done.length}）</span>
          <span><button class="btn btn-ghost" id="clearDoneBtn" style="padding:4px 10px;font-size:12px;">一键全选清除</button> <span class="arrow">›</span></span>
        </div>
        <div class="collapse-body ${doneOpen?'open':''}" id="doneBody"></div>
      </div>
    `;
    document.getElementById('addDot').addEventListener('click', addTodo);
    document.getElementById('todoInput').addEventListener('keydown', e => { if(e.key==='Enter') addTodo(); });
    renderPending(pending);
    renderDoneGrouped(done);
    document.getElementById('doneHead').addEventListener('click', e => {
      if (e.target.id === 'clearDoneBtn') return;
      doneOpen = !doneOpen;
      document.getElementById('doneHead').classList.toggle('open', doneOpen);
      document.getElementById('doneBody').classList.toggle('open', doneOpen);
    });
    document.getElementById('clearDoneBtn').addEventListener('click', e => { e.stopPropagation(); clearDone(done); });
    checkSaturdayReminder(done.length);
  }

  function renderPending(list) {
    const el = document.getElementById('todoList');
    if (!list.length) { el.innerHTML = `<div class="empty-tip">还没有待办</div>`; return; }
    el.innerHTML = '';
    list.forEach(t => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="list-row-inner" style="cursor:pointer;">
          <div class="circle-dot" data-id="${t.id}"></div>
          <div class="row-text">${escapeHtml(t.text)}</div>
          <div class="del-x" data-id="${t.id}" style="color:var(--c-red);font-size:18px;padding:0 4px;cursor:pointer;">×</div>
        </div>
      `;
      row.querySelector('.circle-dot').addEventListener('click', e => { e.stopPropagation(); toggleDone(t.id, true); });
      row.querySelector('.row-text').addEventListener('click', () => editTodo(t.id));
      row.querySelector('.del-x').addEventListener('click', e => { e.stopPropagation(); delTodo(t.id); });
      el.appendChild(row);
    });
  }

  // 已完成按日期分组
  function renderDoneGrouped(doneList) {
    const el = document.getElementById('doneBody');
    if (!doneList.length) { el.innerHTML = `<div class="empty-tip">还没有已完成的记录</div>`; return; }
    const groups = {};
    doneList.forEach(t => {
      const k = fmtDayKey(t.completedAt);
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });
    el.innerHTML = '';
    Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(k => {
      const head = document.createElement('div');
      head.className = 'muted mt8';
      head.style.cssText = 'padding:6px 4px;border-bottom:1px dashed var(--c-line);font-family:var(--f-jj);font-weight:700;color:var(--c-text-2);';
      head.textContent = fmtDayLabel(k);
      el.appendChild(head);
      groups[k].forEach(t => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `
          <div class="list-row-inner" style="cursor:pointer;">
            <div class="circle-dot checked" data-id="${t.id}"></div>
            <div class="row-text" style="text-decoration:line-through;color:var(--c-text-3);">${escapeHtml(t.text)}</div>
            <div class="del-x" data-id="${t.id}" style="color:var(--c-red);font-size:18px;padding:0 4px;cursor:pointer;">×</div>
          </div>
        `;
        row.querySelector('.circle-dot').addEventListener('click', e => { e.stopPropagation(); toggleDone(t.id, false); });
        row.querySelector('.row-text').addEventListener('click', () => editTodo(t.id));
        row.querySelector('.del-x').addEventListener('click', e => { e.stopPropagation(); delTodo(t.id); });
        el.appendChild(row);
      });
    });
  }

  async function addTodo() {
    const inp = document.getElementById('todoInput');
    const text = inp.value.trim();
    if (!text) return;
    await DB.put('todos', { id: DB.uid(), text, done:false, createdAt: Date.now() });
    inp.value = '';
    render(document.getElementById('content'));
  }

  async function toggleDone(id, done) {
    const t = await DB.get('todos', id);
    if (!t) return;
    t.done = done;
    t.completedAt = done ? Date.now() : null;
    await DB.put('todos', t);
    render(document.getElementById('content'));
  }

  async function editTodo(id) {
    const t = await DB.get('todos', id);
    const text = prompt('编辑待办：', t.text);
    if (text !== null && text.trim()) {
      t.text = text.trim(); t.editedAt = Date.now();
      await DB.put('todos', t);
      render(document.getElementById('content'));
    }
  }

  async function delTodo(id) {
    if (!confirm('确认删除？')) return;
    await DB.del('todos', id);
    render(document.getElementById('content'));
  }

  async function clearDone(doneList) {
    if (!doneList.length) return;
    if (!confirm(`确认清除 ${doneList.length} 条已完成记录？`)) return;
    for (const t of doneList) await DB.del('todos', t.id);
    render(document.getElementById('content'));
  }

  function checkSaturdayReminder(doneCount) {
    const now = new Date();
    if (now.getDay() !== 6) return;
    const key = 'todo_remind_' + getWeekKey(now);
    if (localStorage.getItem(key)) return;
    if (doneCount === 0) return;
    localStorage.setItem(key, '1');
    setTimeout(() => {
      if (confirm(`今天是周六，已完成清单有 ${doneCount} 条记录，是否清除？`)) {
        DB.getAll('todos').then(all => {
          all.filter(t=>t.done).forEach(t=>DB.del('todos', t.id));
          render(document.getElementById('content'));
        });
      }
    }, 800);
  }

  function getWeekKey(d) {
    const t = new Date(d); t.setHours(0,0,0,0);
    const day = (t.getDay()+6)%7;
    t.setDate(t.getDate()-day);
    return t.toISOString().slice(0,10);
  }
  function fmtDayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function fmtDayLabel(k) {
    const [y,m,d] = k.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((today - dt)/86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return `${m}月${d}日`;
  }
  function pad(n){return n<10?'0'+n:n;}
  function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

  return { render };
})();
