// ===== 生活账目模块 =====
// NOW：点击修改 / PROCESS：明细可点击编辑删除（删除二次确认）/ 备注 / 总计跳转统计
const LifeAccount = (() => {

  async function render(root) {
    let now = await DB.get('life_now', 'now');
    if (!now) { now = { id:'now', amount:0, updatedAt: Date.now() }; await DB.put('life_now', now); }
    root.innerHTML = `
      <div class="life-now" id="nowBox">
        <div class="now-label">NOW</div>
        <div class="now-amount">¥${now.amount.toFixed(2)}</div>
        <div class="now-date">${fmtFull(now.updatedAt)}</div>
        <button class="now-edit" id="nowEdit">修改</button>
      </div>
      <div class="life-process">
        <button class="process-btn" id="processBtn">PROCESS</button>
      </div>
    `;
    document.getElementById('nowEdit').addEventListener('click', e=>{ e.stopPropagation(); editNow(now); });
    document.getElementById('processBtn').addEventListener('click', ()=>processView(root));
  }

  function editNow(now) {
    const mask = document.createElement('div');
    mask.className='modal-mask';
    mask.innerHTML=`
      <div class="modal">
        <div class="modal-title">修改当前余额</div>
        <div class="modal-row"><label>金额</label><input id="nowAmount" type="number" step="0.01" value="${now.amount}" /></div>
        <div class="modal-btns"><button class="btn btn-ghost" id="cancel">取消</button><button class="btn btn-primary" id="ok">确认</button></div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.querySelector('#cancel').addEventListener('click',()=>mask.remove());
    mask.querySelector('#ok').addEventListener('click', async ()=>{
      const amt = parseFloat(mask.querySelector('#nowAmount').value);
      if (isNaN(amt)) { alert('请输入有效金额'); return; }
      now.amount = amt; now.updatedAt = Date.now();
      await DB.put('life_now', now);
      mask.remove();
      render(document.getElementById('content'));
    });
  }

  async function processView(root) {
    const list = await DB.getAll('life_process');
    list.sort((a,b)=>b.createdAt-a.createdAt);
    const total = list.reduce((s,x)=>s+x.amount,0);
    root.innerHTML = `
      <div class="card">
        <div class="section-title">PROCESS 明细</div>
        <div class="row-flex mb8" style="justify-content:space-between;">
          <button class="btn btn-ghost" id="backBtn">‹ 返回</button>
          <span class="muted">${list.length} 笔 · 点击条目可编辑</span>
        </div>
        <div id="procList"></div>
        <div class="process-row total" id="procTotal" style="cursor:pointer;">
          <div>总计（点击查看统计）</div>
          <div class="process-amt">¥${total.toFixed(2)}</div>
        </div>
        <div style="text-align:center;margin-top:14px;">
          <button class="fab-circle" id="addProc">+</button>
        </div>
      </div>
    `;
    document.getElementById('backBtn').addEventListener('click',()=>render(root));
    document.getElementById('addProc').addEventListener('click',()=>addProcess());
    document.getElementById('procTotal').addEventListener('click', ()=>showTotalStats(root));
    renderProcList(list);
  }

  function renderProcList(list) {
    const el = document.getElementById('procList');
    if (!list.length) { el.innerHTML=`<div class="empty-tip">还没有记录</div>`; return; }
    el.innerHTML='';
    list.forEach(p=>{
      const row=document.createElement('div');
      row.className='process-row';
      row.style.cssText='cursor:pointer;';
      const note = p.note ? `<div class="muted" style="font-size:12px;margin-top:2px;">${escapeHtml(p.note)}</div>` : '';
      row.innerHTML=`<div class="process-date"><div>${fmtDateOnly(p.date)}</div>${note}</div><div class="process-amt">¥${p.amount.toFixed(2)}</div>`;
      row.addEventListener('click', ()=>editProcess(p.id));
      el.appendChild(row);
    });
  }

  // 总计统计弹窗：月度/年度/自定义
  function showTotalStats(root) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <div class="modal-title">查看统计</div>
        <div class="row-flex" style="gap:10px;">
          <button class="btn btn-primary" id="stMonth" style="flex:1;">月度</button>
          <button class="btn btn-ghost" id="stYear" style="flex:1;">年度</button>
          <button class="btn btn-ghost" id="stRange" style="flex:1;">自定义</button>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.querySelector('#stMonth').addEventListener('click', ()=>{ mask.remove(); openMonthStats(); });
    mask.querySelector('#stYear').addEventListener('click', ()=>{ mask.remove(); openYearStats(); });
    mask.querySelector('#stRange').addEventListener('click', ()=>{ mask.remove(); openRangeStats(); });
  }

  async function openMonthStats() {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth();
    const all = await DB.getAll('life_process');
    const monthData = all.filter(e => { const d = new Date(e.date); return d.getFullYear()===y && d.getMonth()===m; }).sort((a,b)=>b.date-a.date);
    const total = monthData.reduce((s,e)=>s+e.amount,0);
    showStatResult('本月统计', `${y}年${m+1}月`, monthData, total);
  }
  async function openYearStats() {
    const y = new Date().getFullYear();
    const all = await DB.getAll('life_process');
    const yearData = all.filter(e => new Date(e.date).getFullYear()===y).sort((a,b)=>b.date-a.date);
    const total = yearData.reduce((s,e)=>s+e.amount,0);
    showStatResult('本年统计', `${y}年`, yearData, total);
  }
  function openRangeStats() {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const today = new Date().toISOString().slice(0,10);
    mask.innerHTML = `
      <div class="modal">
        <div class="modal-title">自定义时间</div>
        <div class="modal-row"><label>开始</label><input type="date" id="sStart" /></div>
        <div class="modal-row"><label>结束</label><input type="date" id="sEnd" value="${today}" /></div>
        <div class="modal-btns"><button class="btn btn-ghost" id="cancel">取消</button><button class="btn btn-primary" id="ok">查询</button></div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.querySelector('#cancel').addEventListener('click', ()=>mask.remove());
    mask.querySelector('#ok').addEventListener('click', async ()=>{
      const s = mask.querySelector('#sStart').value;
      const e = mask.querySelector('#sEnd').value;
      if (!s || !e) { alert('请选择日期'); return; }
      const start = new Date(s+'T00:00:00').getTime();
      const end = new Date(e+'T23:59:59').getTime();
      const all = await DB.getAll('life_process');
      const rangeData = all.filter(x => x.date>=start && x.date<=end).sort((a,b)=>b.date-a.date);
      const total = rangeData.reduce((sum,x)=>sum+x.amount,0);
      mask.remove();
      showStatResult('自定义统计', `${s} 至 ${e}`, rangeData, total);
    });
  }

  function showStatResult(title, subtitle, list, total) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    let rows = list.map(p => `
      <div class="process-row" style="border-bottom:1px solid var(--c-line);">
        <div class="process-date">${fmtDateOnly(p.date)} ${p.note?'<span class="muted">'+escapeHtml(p.note)+'</span>':''}</div>
        <div class="process-amt">¥${p.amount.toFixed(2)}</div>
      </div>
    `).join('') || '<div class="empty-tip">无记录</div>';
    mask.innerHTML = `
      <div class="modal" style="max-height:70vh;overflow:hidden;display:flex;flex-direction:column;">
        <div class="modal-title">${title}</div>
        <div class="muted" style="text-align:center;">${subtitle}</div>
        <div class="process-row total" style="margin-top:10px;"><div>合计</div><div class="process-amt">¥${total.toFixed(2)}</div></div>
        <div style="overflow-y:auto;margin-top:10px;flex:1;">${rows}</div>
        <div class="modal-btns"><button class="btn btn-primary" id="ok" style="width:100%;">关闭</button></div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.querySelector('#ok').addEventListener('click', ()=>mask.remove());
  }

  async function editProcess(id) {
    const p = await DB.get('life_process', id);
    if (!p) return;
    const mask=document.createElement('div');
    mask.className='modal-mask';
    mask.innerHTML=`
      <div class="modal">
        <div class="modal-title">编辑 / 删除</div>
        <div class="modal-row"><label>金额</label><input id="procAmount" type="number" step="0.01" value="${p.amount}" /></div>
        <div class="modal-row"><label>备注</label><input id="procNote" value="${escapeAttr(p.note||'')}" placeholder="可输入中文备注..." /></div>
        <div class="muted" style="text-align:center;">原日期：${fmtDateOnly(p.date)}</div>
        <div class="modal-btns">
          <button class="btn btn-ghost" id="delBtn" style="color:var(--c-red)">删除</button>
          <button class="btn btn-ghost" id="cancel">取消</button>
          <button class="btn btn-primary" id="ok">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.querySelector('#cancel').addEventListener('click',()=>mask.remove());
    mask.querySelector('#ok').addEventListener('click', async ()=>{
      const amt=parseFloat(mask.querySelector('#procAmount').value);
      if (isNaN(amt)||amt<=0) { alert('请输入有效金额'); return; }
      p.amount=amt;
      p.note = mask.querySelector('#procNote').value.trim();
      await DB.put('life_process', p);
      mask.remove();
      processView(document.getElementById('content'));
    });
    mask.querySelector('#delBtn').addEventListener('click', ()=>{
      if (!confirm('确认删除此记录？')) return;
      if (!confirm('再次确认：删除后无法恢复，确定吗？')) return;
      DB.del('life_process', id).then(()=>{
        mask.remove();
        processView(document.getElementById('content'));
      });
    });
  }

  function addProcess() {
    const mask=document.createElement('div');
    mask.className='modal-mask';
    const today = new Date().toISOString().slice(0,10);
    mask.innerHTML=`
      <div class="modal">
        <div class="modal-title">添加一笔</div>
        <div class="modal-row"><label>日期</label><input type="date" id="procDate" value="${today}" /></div>
        <div class="modal-row"><label>金额</label><input id="procAmount" type="number" step="0.01" placeholder="0.00" /></div>
        <div class="modal-row"><label>备注</label><input id="procNote" placeholder="可输入中文备注..." /></div>
        <div class="modal-btns"><button class="btn btn-ghost" id="cancel">取消</button><button class="btn btn-primary" id="ok">确认</button></div>
      </div>
    `;
    document.body.appendChild(mask);
    mask.querySelector('#cancel').addEventListener('click',()=>mask.remove());
    mask.querySelector('#ok').addEventListener('click', async ()=>{
      const amt=parseFloat(mask.querySelector('#procAmount').value);
      const dateStr = mask.querySelector('#procDate').value;
      const note = mask.querySelector('#procNote').value.trim();
      if (isNaN(amt)||amt<=0) { alert('请输入有效金额'); return; }
      if (!dateStr) { alert('请选择日期'); return; }
      const d = new Date(dateStr+'T00:00:00');
      await DB.put('life_process', { id: DB.uid(), amount: amt, note: note, date: d.getTime(), createdAt: Date.now() });
      mask.remove();
      processView(document.getElementById('content'));
    });
  }

  function fmtFull(ts){ const d=new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fmtDateOnly(ts){ const d=new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; }
  function fmtDate(ts){ const d=new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; }
  function pad(n){return n<10?'0'+n:n;}
  function escapeHtml(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escapeAttr(s){return (s||'').replace(/"/g,'&quot;');}

  return { render };
})();
