// ===== 常用列表模块（类苹果备忘录） =====
// 点击条目全文显示 / 内容区可长按选择复制
const Notes = (() => {

  async function render(root) {
    const list = await DB.getAll('notes');
    list.sort((a,b)=>b.updatedAt-a.updatedAt);
    root.innerHTML = `
      <div class="card">
        <div class="section-title">常用列表</div>
        <div class="input-row">
          <input id="noteTitleInput" placeholder="新建备忘录标题..." />
          <button class="btn btn-primary" id="noteAddBtn">+ 新建</button>
        </div>
      </div>
      <div id="notesList"></div>
    `;
    document.getElementById('noteAddBtn').addEventListener('click', () => addNote());
    document.getElementById('noteTitleInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addNote(); });
    renderList(list);
  }

  function renderList(list) {
    const el = document.getElementById('notesList');
    if (!list.length) { el.innerHTML = `<div class="empty-tip">还没有备忘录</div>`; return; }
    el.innerHTML = '';
    list.forEach(n => {
      const row = document.createElement('div');
      row.className = 'note-item';
      const thumb = n.images && n.images.length ? `<img class="note-thumb" src="${n.images[0]}" />` : `<div class="note-thumb"></div>`;
      row.innerHTML = `${thumb}<div style="flex:1;overflow:hidden;"><div class="note-title">${escapeHtml(n.title||'(无标题)')}</div><div class="note-date">${fmtDate(n.updatedAt)}</div></div>`;
      row.addEventListener('click', () => viewNote(n.id));
      el.appendChild(row);
    });
  }

  async function addNote() {
    const inp = document.getElementById('noteTitleInput');
    const title = inp.value.trim() || '(无标题)';
    inp.value = '';
    const note = { id: DB.uid(), title, content:'', images:[], createdAt: Date.now(), updatedAt: Date.now() };
    await DB.put('notes', note);
    viewNote(note.id, true);
  }

  // 全文显示+编辑页（内容区可长按选择复制）
  async function viewNote(id, isNew) {
    const n = await DB.get('notes', id);
    if (!n) return;
    const root = document.getElementById('content');
    root.innerHTML = `
      <div class="card">
        <input id="edTitle" value="${escapeAttr(n.title)}" placeholder="标题" style="width:100%;border:none;font-family:var(--f-jj);font-weight:700;font-size:18px;outline:none;background:transparent;color:var(--c-text);margin-bottom:8px;" />
        <div class="muted">创建：${fmtDate(n.createdAt)} · 更新：${fmtDate(n.updatedAt)}</div>
        <div class="muted" style="margin-top:4px;">长按内容可全选/部分选择复制</div>
        <div id="edContent" class="note-content-area mt8" contenteditable="true" style="min-height:200px;border:1px solid var(--c-line);border-radius:10px;padding:12px;font-size:15px;line-height:1.6;-webkit-user-select:text;user-select:text;white-space:pre-wrap;word-break:break-word;">${escapeHtmlKeepNL(n.content||'')}</div>
        <div id="imgBox" class="mt8"></div>
        <div class="row-flex mt8">
          <button class="btn btn-ghost" id="pickImg">📷 相册</button>
          <button class="btn btn-ghost" id="pasteImg">📋 粘贴图片</button>
        </div>
        <input type="file" id="fileInput" accept="image/*" style="display:none" />
        <div class="modal-btns">
          <button class="btn btn-ghost" id="backBtn">返回</button>
          <button class="btn btn-primary" id="saveBtn">保存</button>
          <button class="btn btn-ghost" id="delBtn" style="color:var(--c-red)">删除</button>
        </div>
      </div>
    `;
    let images = n.images ? [...n.images] : [];
    function refreshImgs() {
      const box = document.getElementById('imgBox');
      box.innerHTML = '';
      images.forEach((src,i) => {
        const d = document.createElement('div');
        d.style.cssText = 'display:inline-block;margin:4px;position:relative;';
        d.innerHTML = `<img src="${src}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" /><button style="position:absolute;top:-4px;right:-4px;background:var(--c-red);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;" data-i="${i}">×</button>`;
        d.querySelector('button').addEventListener('click', ()=>{ images.splice(i,1); refreshImgs(); });
        box.appendChild(d);
      });
    }
    refreshImgs();
    // 长按触发全选（手机端便于复制）
    const content = document.getElementById('edContent');
    let pressTimer = null;
    content.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => {
        const range = document.createRange();
        range.selectNodeContents(content);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }, 600);
    });
    content.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
    content.addEventListener('touchmove', () => { if (pressTimer) clearTimeout(pressTimer); });

    document.getElementById('pickImg').addEventListener('click', ()=>document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', e => { handleFile(e.target.files[0], images, refreshImgs); });
    document.getElementById('pasteImg').addEventListener('click', async () => {
      try {
        const item = await navigator.clipboard.read();
        for (const it of item) for (const type of it.types) if (type.startsWith('image/')) {
          const blob = await it.getType(type);
          const r = new FileReader();
          r.onload = () => { images.push(r.result); refreshImgs(); };
          r.readAsDataURL(blob);
        }
      } catch(err) { alert('粘贴失败，请确认剪贴板权限'); }
    });
    document.getElementById('backBtn').addEventListener('click', ()=>render(document.getElementById('content')));
    document.getElementById('saveBtn').addEventListener('click', async ()=>{
      n.title = document.getElementById('edTitle').value || '(无标题)';
      n.content = document.getElementById('edContent').innerText;
      n.images = images; n.updatedAt = Date.now();
      await DB.put('notes', n);
      render(document.getElementById('content'));
    });
    document.getElementById('delBtn').addEventListener('click', async ()=>{
      if(!confirm('删除此备忘录？')) return;
      await DB.del('notes', id);
      render(document.getElementById('content'));
    });
  }

  function handleFile(file, images, cb) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { images.push(r.result); cb(); };
    r.readAsDataURL(file);
  }

  function fmtDate(ts){ const d=new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function pad(n){return n<10?'0'+n:n;}
  function escapeHtml(s){return (s||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));}
  function escapeHtmlKeepNL(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
  function escapeAttr(s){return (s||'').replace(/"/g,'&quot;');}

  return { render };
})();
