// ===== 奇思妙想模块 =====
// 点击具体内容可编辑 / 跳转后页面显示删除按键
const Ideas = (() => {

  async function render(root) {
    const list = await DB.getAll('ideas');
    list.sort((a,b)=>a.createdAt-b.createdAt); // 最新的在最下面
    root.innerHTML = `
      <div class="card">
        <div class="section-title">奇思妙想</div>
        <div class="row-flex" style="gap:8px;">
          <button class="fab-circle" id="addIdea" style="width:42px;height:42px;font-size:22px;">+</button>
          <span class="muted">点击 + 随手记下你的想法，点击条目即可编辑</span>
        </div>
      </div>
      <div id="ideasList"></div>
    `;
    document.getElementById('addIdea').addEventListener('click', ()=>editIdea(null, true));
    renderList(list);
  }

  function renderList(list) {
    const el = document.getElementById('ideasList');
    if (!list.length) { el.innerHTML = `<div class="empty-tip">还没有想法，点 + 记录第一个吧</div>`; return; }
    el.innerHTML = '';
    list.forEach(idea => {
      const card = document.createElement('div');
      card.className = 'idea-card';
      card.style.cursor = 'pointer';
      const textHtml = `<div class="idea-text">${escapeHtml(idea.text||'')}</div>`;
      const imgs = (idea.images||[]).map(src=>`<img src="${src}" />`).join('');
      const timeHtml = `<div class="idea-time">创建：${fmtFull(idea.createdAt)}${idea.updatedAt && idea.updatedAt!==idea.createdAt?` · 更新：${fmtFull(idea.updatedAt)}`:''}</div>`;
      card.innerHTML = `${textHtml}${imgs}${timeHtml}`;
      card.addEventListener('click', ()=>editIdea(idea.id, false));
      el.appendChild(card);
    });
  }

  async function editIdea(id, isNew) {
    let idea = id ? await DB.get('ideas', id) : null;
    if (id && !idea) return;
    if (isNew) idea = { id: DB.uid(), text:'', images:[], createdAt: Date.now(), updatedAt: null };
    const origText = idea.text;
    const root = document.getElementById('content');
    root.innerHTML = `
      <div class="card">
        <div class="section-title">${isNew?'记录想法':'编辑想法'}</div>
        <textarea id="ideaText" class="expense-area" placeholder="写下你的想法..." style="min-height:120px;">${escapeHtml(idea.text||'')}</textarea>
        <div id="imgBox" class="mt8"></div>
        <div class="row-flex mt8">
          <button class="btn btn-ghost" id="pickImg">📷 相册</button>
          <button class="btn btn-ghost" id="pasteImg">📋 粘贴</button>
          <button class="btn btn-ghost" id="cameraBtn">📸 拍照</button>
        </div>
        <input type="file" id="fileInput" accept="image/*" style="display:none" />
        <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display:none" />
        <div class="modal-btns">
          <button class="btn btn-ghost" id="backBtn">返回</button>
          <button class="btn btn-primary" id="saveBtn">保存</button>
          ${!isNew?`<button class="btn btn-ghost" id="delBtn" style="color:var(--c-red)">删除</button>`:''}
        </div>
        ${!isNew?`<div class="muted mt8" style="text-align:center;">创建：${fmtFull(idea.createdAt)}${idea.updatedAt?` · 更新：${fmtFull(idea.updatedAt)}`:''}</div>`:''}
      </div>
    `;
    let images = idea.images ? [...idea.images] : [];
    function refreshImgs() {
      const box = document.getElementById('imgBox');
      box.innerHTML = '';
      images.forEach((src,i)=>{
        const d=document.createElement('div');
        d.style.cssText='display:inline-block;margin:4px;position:relative;';
        d.innerHTML=`<img src="${src}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" /><button style="position:absolute;top:-4px;right:-4px;background:var(--c-red);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;">×</button>`;
        d.querySelector('button').addEventListener('click',()=>{images.splice(i,1);refreshImgs();});
        box.appendChild(d);
      });
    }
    refreshImgs();
    document.getElementById('pickImg').addEventListener('click',()=>document.getElementById('fileInput').click());
    document.getElementById('cameraBtn').addEventListener('click',()=>document.getElementById('cameraInput').click());
    document.getElementById('fileInput').addEventListener('change', e=>handleFile(e.target.files[0], images, refreshImgs));
    document.getElementById('cameraInput').addEventListener('change', e=>handleFile(e.target.files[0], images, refreshImgs));
    document.getElementById('pasteImg').addEventListener('click', async ()=>{
      try {
        const item = await navigator.clipboard.read();
        for (const it of item) for (const type of it.types) if (type.startsWith('image/')) {
          const blob = await it.getType(type);
          const r=new FileReader(); r.onload=()=>{images.push(r.result);refreshImgs();}; r.readAsDataURL(blob);
        }
      } catch(err) { alert('粘贴失败，请确认剪贴板权限'); }
    });
    document.getElementById('backBtn').addEventListener('click', ()=>render(document.getElementById('content')));
    document.getElementById('saveBtn').addEventListener('click', async ()=>{
      const text = document.getElementById('ideaText').value;
      if (!text.trim() && !images.length) { alert('请输入内容或添加图片'); return; }
      idea.text = text;
      idea.images = images;
      if (isNew) { idea.createdAt = Date.now(); idea.updatedAt = null; }
      else if (text !== origText) idea.updatedAt = Date.now();
      await DB.put('ideas', idea);
      render(document.getElementById('content'));
    });
    if (!isNew) {
      document.getElementById('delBtn').addEventListener('click', async ()=>{
        if(!confirm('删除此想法？')) return;
        await DB.del('ideas', id);
        render(document.getElementById('content'));
      });
    }
  }

  function handleFile(file, images, cb) {
    if (!file) return;
    const r=new FileReader(); r.onload=()=>{images.push(r.result);cb();}; r.readAsDataURL(file);
  }

  function fmtFull(ts){ const d=new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function pad(n){return n<10?'0'+n:n;}
  function escapeHtml(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

  return { render };
})();
