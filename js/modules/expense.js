// ===== 费用大纲模块（参考百事AA记账） =====
// 最近记录最新在上 / 点击单条跳转编辑删除 / 查询页月份自选 / 自定义日期范围 / 年度按月日历视图
const Expense = (() => {
  let balanceVisible = true;
  let viewMonth = null;     // 月度视图当前月
  let viewYear = null;      // 年度视图当前年
  let queryTab = 'month';   // month / range / year

  async function render(root) {
    const all = await DB.getAll('expenses');
    const balance = all.reduce((s,e)=> s + (e.type==='income'?e.amount:-e.amount), 0);
    root.innerHTML = `
      <div class="balance-box">
        <div>
          <div class="bal-label">最新余额</div>
          <div class="bal-num">${balanceVisible? '¥'+balance.toFixed(2) : '¥••••'}</div>
        </div>
        <button class="eye-btn" id="eyeBtn">${balanceVisible?'👁':'🙈'}</button>
      </div>
      <div class="row-flex mb8" style="justify-content:space-between;">
        <button class="fab-circle" id="addExp">+</button>
        <button class="btn btn-primary" id="queryBtn">查询</button>
      </div>
      <div id="expList"></div>
    `;
    document.getElementById('eyeBtn').addEventListener('click', ()=>{ balanceVisible=!balanceVisible; render(root); });
    document.getElementById('addExp').addEventListener('click', addExpense);
    document.getElementById('queryBtn').addEventListener('click', ()=>queryView(root));
    renderRecent(all);
  }

  // 最近记录 - 最新在最上
  function renderRecent(all) {
    const recent = all.slice().sort((a,b)=>b.date-a.date).slice(0,30);
    const el = document.getElementById('expList');
    if (!recent.length) { el.innerHTML = `<div class="empty-tip">还没有记录，点 + 添加</div>`; return; }
    el.innerHTML = '<div class="section-title">最近记录（点击可编辑）</div>';
    recent.forEach(e => {
      const row = document.createElement('div');
      row.className = 'list-row';
      const sign = e.type==='income'?'+':'-';
      const color = e.type==='income'?'var(--c-green)':'var(--c-red)';
      row.innerHTML = `
        <div class="list-row-inner" style="cursor:pointer;" data-id="${e.id}">
          <div style="width:36px;height:36px;border-radius:10px;background:${e.type==='income'?'#E3F5EC':'#FCE5E5'};display:flex;align-items:center;justify-content:center;font-size:18px;">${e.type==='income'?'📈':'📉'}</div>
          <div class="row-text">
            <div>${escapeHtml(e.reason||'未填事由')}</div>
            <div class="muted">${fmtDate(e.date)}</div>
          </div>
          <div style="color:${color};font-family:var(--f-num);font-weight:700;font-size:16px;">${sign}¥${e.amount.toFixed(2)}</div>
        </div>
      `;
      row.querySelector('.list-row-inner').addEventListener('click', ()=>editExpense(e.id));
      el.appendChild(row);
    });
  }

  // 添加 / 编辑共用弹窗
  function addExpense() { editExpense(null, true); }

  async function editExpense(id, isNew) {
    let e = id ? await DB.get('expenses', id) : null;
    if (id && !e) return;
    const cur = e || { type:'expense', reason:'', amount:0, date: Date.now() };
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const curDate = new Date(cur.date);
    mask.innerHTML = `
      <div class="modal">
        <div class="modal-title">${isNew?'记一笔':'编辑记录'}</div>
        <div class="row-flex" style="justify-content:center;gap:12px;margin-bottom:14px;">
          <button class="btn ${cur.type==='income'?'btn-primary':'btn-ghost'}" id="typeIncome" style="min-width:90px;">收入</button>
          <button class="btn ${cur.type==='expense'?'btn-primary':'btn-ghost'}" id="typeExpense" style="min-width:90px;">支出</button>
        </div>
        <div class="modal-row"><label>事由</label><input id="expReason" placeholder="输入事由" value="${escapeAttr(cur.reason||'')}" /></div>
        <div class="modal-row"><label>金额</label><input id="expAmount" type="number" step="0.01" placeholder="0.00" value="${cur.amount?cur.amount:''}" /></div>
        <div class="modal-row"><label>日期</label><input id="expDate" type="date" value="${curDate.toISOString().slice(0,10)}" /></div>
        <div class="modal-btns">
          ${isNew?'':`<button class="btn btn-ghost" id="delBtn" style="color:var(--c-red)">删除</button>`}
          <button class="btn btn-ghost" id="cancelBtn">取消</button>
          <button class="btn btn-primary" id="confirmBtn">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    let type = cur.type;
    const ti=mask.querySelector('#typeIncome'), te=mask.querySelector('#typeExpense');
    ti.addEventListener('click',()=>{type='income'; ti.className='btn btn-primary'; te.className='btn btn-ghost';});
    te.addEventListener('click',()=>{type='expense'; te.className='btn btn-primary'; ti.className='btn btn-ghost';});
    mask.querySelector('#cancelBtn').addEventListener('click',()=>mask.remove());
    mask.querySelector('#confirmBtn').addEventListener('click', async ()=>{
      const reason = mask.querySelector('#expReason').value.trim();
      const amount = parseFloat(mask.querySelector('#expAmount').value);
      const dateStr = mask.querySelector('#expDate').value;
      if (!amount || amount<=0) { alert('请输入有效金额'); return; }
      const date = new Date(dateStr+'T00:00:00').getTime();
      if (isNew) {
        await DB.put('expenses', { id: DB.uid(), type, reason, amount, date });
      } else {
        e.type=type; e.reason=reason; e.amount=amount; e.date=date;
        await DB.put('expenses', e);
      }
      mask.remove();
      render(document.getElementById('content'));
    });
    if (!isNew) {
      mask.querySelector('#delBtn').addEventListener('click', async ()=>{
        if(!confirm('确认删除此记录？')) return;
        await DB.del('expenses', id);
        mask.remove();
        render(document.getElementById('content'));
      });
    }
  }

  // ===== 查询页（3 个 Tab：月度 / 自定义范围 / 年度）=====
  async function queryView(root) {
    if (!viewMonth) viewMonth = new Date();
    if (!viewYear) viewYear = new Date().getFullYear();
    root.innerHTML = `
      <div class="card">
        <div class="row-flex" style="gap:8px;justify-content:center;">
          <button class="btn ${queryTab==='month'?'btn-primary':'btn-ghost'}" id="tabMonth" style="flex:1;">月度</button>
          <button class="btn ${queryTab==='range'?'btn-primary':'btn-ghost'}" id="tabRange" style="flex:1;">自定义范围</button>
          <button class="btn ${queryTab==='year'?'btn-primary':'btn-ghost'}" id="tabYear" style="flex:1;">年度</button>
        </div>
      </div>
      <div id="queryBody"></div>
      <button class="btn btn-ghost mt8" id="backMain" style="width:100%;">返回主页</button>
    `;
    document.getElementById('tabMonth').addEventListener('click',()=>{queryTab='month'; queryView(root);});
    document.getElementById('tabRange').addEventListener('click',()=>{queryTab='range'; queryView(root);});
    document.getElementById('tabYear').addEventListener('click',()=>{queryTab='year'; queryView(root);});
    document.getElementById('backMain').addEventListener('click',()=>{ render(root); });
    if (queryTab==='month') renderMonthView(root);
    else if (queryTab==='range') renderRangeView(root);
    else renderYearView(root);
  }

  // 月度视图 - 点年月可自选月份
  async function renderMonthView(root) {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const all = await DB.getAll('expenses');
    const monthData = all.filter(e=>{
      const d = new Date(e.date); return d.getFullYear()===y && d.getMonth()===m;
    });
    const income = monthData.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
    const expense = monthData.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
    const body = document.getElementById('queryBody');
    body.innerHTML = `
      <div class="card">
        <div class="row-flex" style="justify-content:space-between;">
          <button class="btn btn-ghost" id="prevMonth">‹ 上月</button>
          <div class="section-title" id="monthLabel" style="margin:0;cursor:pointer;">${y}年${m+1}月</div>
          <button class="btn btn-ghost" id="nextMonth">下月 ›</button>
        </div>
        <input type="month" id="monthPicker" style="display:none;" value="${y}-${pad(m+1)}" />
        <div class="row-flex mt12" style="justify-content:space-around;">
          <div style="text-align:center;"><div class="muted">收入</div><div style="color:var(--c-green);font-family:var(--f-num);font-weight:700;font-size:18px;">+¥${income.toFixed(2)}</div></div>
          <div style="text-align:center;"><div class="muted">支出</div><div style="color:var(--c-red);font-family:var(--f-num);font-weight:700;font-size:18px;">-¥${expense.toFixed(2)}</div></div>
          <div style="text-align:center;"><div class="muted">结余</div><div style="font-family:var(--f-num);font-weight:700;font-size:18px;">¥${(income-expense).toFixed(2)}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">日历</div>
        <div class="cal-week-head"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="calendar" id="calGrid"></div>
      </div>
      <div class="card">
        <div class="section-title">收支分类</div>
        <div class="pie-box"><canvas id="pieCanvas" width="260" height="260"></canvas><div class="pie-legend" id="pieLegend"></div></div>
      </div>
    `;
    document.getElementById('prevMonth').addEventListener('click',()=>{ viewMonth.setMonth(m-1); queryView(root); });
    document.getElementById('nextMonth').addEventListener('click',()=>{ viewMonth.setMonth(m+1); queryView(root); });
    const label = document.getElementById('monthLabel');
    const picker = document.getElementById('monthPicker');
    label.addEventListener('click',()=>{ picker.style.display='block'; picker.focus(); });
    picker.addEventListener('change', ()=>{
      const [yy,mm] = picker.value.split('-').map(Number);
      viewMonth = new Date(yy, mm-1, 1);
      queryView(root);
    });
    renderCalendar(y, m, monthData);
    renderPie(monthData);
  }

  // 自定义日期范围
  async function renderRangeView(root) {
    const body = document.getElementById('queryBody');
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
    const defaultEnd = today.toISOString().slice(0,10);
    body.innerHTML = `
      <div class="card">
        <div class="section-title">自定义日期范围</div>
        <div class="modal-row"><label>开始日期</label><input type="date" id="rangeStart" value="${defaultStart}" /></div>
        <div class="modal-row"><label>结束日期</label><input type="date" id="rangeEnd" value="${defaultEnd}" /></div>
        <button class="btn btn-primary mt8" id="rangeQuery" style="width:100%;">查询</button>
      </div>
      <div id="rangeResult"></div>
    `;
    document.getElementById('rangeQuery').addEventListener('click', async ()=>{
      const s = document.getElementById('rangeStart').value;
      const e = document.getElementById('rangeEnd').value;
      if (!s || !e) { alert('请选择日期范围'); return; }
      const startTs = new Date(s+'T00:00:00').getTime();
      const endTs = new Date(e+'T23:59:59').getTime();
      const all = await DB.getAll('expenses');
      const rangeData = all.filter(x=> x.date>=startTs && x.date<=endTs).sort((a,b)=>b.date-a.date);
      const income = rangeData.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
      const expense = rangeData.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
      const box = document.getElementById('rangeResult');
      box.innerHTML = `
        <div class="card">
          <div class="section-title">${s} 至 ${e}</div>
          <div class="row-flex" style="justify-content:space-around;">
            <div style="text-align:center;"><div class="muted">收入</div><div style="color:var(--c-green);font-family:var(--f-num);font-weight:700;">+¥${income.toFixed(2)}</div></div>
            <div style="text-align:center;"><div class="muted">支出</div><div style="color:var(--c-red);font-family:var(--f-num);font-weight:700;">-¥${expense.toFixed(2)}</div></div>
            <div style="text-align:center;"><div class="muted">结余</div><div style="font-family:var(--f-num);font-weight:700;">¥${(income-expense).toFixed(2)}</div></div>
          </div>
          <div class="muted mt8">共 ${rangeData.length} 笔记录</div>
        </div>
        <div class="card">
          <div class="section-title">明细</div>
          <div id="rangeList"></div>
        </div>
        <div class="card">
          <div class="section-title">分类占比</div>
          <div class="pie-box"><canvas id="pieCanvas2" width="260" height="260"></canvas><div class="pie-legend" id="pieLegend2"></div></div>
        </div>
      `;
      const rl = document.getElementById('rangeList');
      if (!rangeData.length) { rl.innerHTML = `<div class="empty-tip">范围内无记录</div>`; }
      else {
        rl.innerHTML = '';
        rangeData.forEach(e => {
          const row = document.createElement('div');
          row.className = 'list-row';
          const sign = e.type==='income'?'+':'-';
          const color = e.type==='income'?'var(--c-green)':'var(--c-red)';
          row.innerHTML = `
            <div class="list-row-inner" style="cursor:pointer;" data-id="${e.id}">
              <div style="width:36px;height:36px;border-radius:10px;background:${e.type==='income'?'#E3F5EC':'#FCE5E5'};display:flex;align-items:center;justify-content:center;font-size:18px;">${e.type==='income'?'📈':'📉'}</div>
              <div class="row-text"><div>${escapeHtml(e.reason||'未填事由')}</div><div class="muted">${fmtDate(e.date)}</div></div>
              <div style="color:${color};font-family:var(--f-num);font-weight:700;font-size:16px;">${sign}¥${e.amount.toFixed(2)}</div>
            </div>
          `;
          row.querySelector('.list-row-inner').addEventListener('click', ()=>editExpense(e.id));
          rl.appendChild(row);
        });
      }
      renderPieAt('pieCanvas2', 'pieLegend2', rangeData);
    });
  }

  // 年度视图 - 按月日历式显示每月收支
  async function renderYearView(root) {
    const y = viewYear;
    const all = await DB.getAll('expenses');
    const yearData = all.filter(e=> new Date(e.date).getFullYear()===y);
    const income = yearData.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
    const expense = yearData.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
    const body = document.getElementById('queryBody');
    body.innerHTML = `
      <div class="card">
        <div class="row-flex" style="justify-content:space-between;">
          <button class="btn btn-ghost" id="prevYear">‹ 上年</button>
          <div class="section-title" id="yearLabel" style="margin:0;cursor:pointer;">${y}年</div>
          <button class="btn btn-ghost" id="nextYear">下年 ›</button>
        </div>
        <input type="number" id="yearPicker" style="display:none;" value="${y}" min="2000" max="2100" />
        <div class="row-flex mt12" style="justify-content:space-around;">
          <div style="text-align:center;"><div class="muted">全年收入</div><div style="color:var(--c-green);font-family:var(--f-num);font-weight:700;font-size:18px;">+¥${income.toFixed(2)}</div></div>
          <div style="text-align:center;"><div class="muted">全年支出</div><div style="color:var(--c-red);font-family:var(--f-num);font-weight:700;font-size:18px;">-¥${expense.toFixed(2)}</div></div>
          <div style="text-align:center;"><div class="muted">结余</div><div style="font-family:var(--f-num);font-weight:700;font-size:18px;">¥${(income-expense).toFixed(2)}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">按月收支</div>
        <div class="cal-week-head"><span>1月</span><span>2月</span><span>3月</span><span>4月</span><span>5月</span><span>6月</span><span>7月</span></div>
        <div class="calendar" id="yearGrid1" style="grid-template-columns:repeat(7,1fr);"></div>
        <div class="cal-week-head mt8"><span>8月</span><span>9月</span><span>10月</span><span>11月</span><span>12月</span></div>
        <div class="calendar" id="yearGrid2" style="grid-template-columns:repeat(5,1fr);"></div>
      </div>
    `;
    document.getElementById('prevYear').addEventListener('click',()=>{ viewYear--; queryView(root); });
    document.getElementById('nextYear').addEventListener('click',()=>{ viewYear++; queryView(root); });
    const label = document.getElementById('yearLabel');
    const picker = document.getElementById('yearPicker');
    label.addEventListener('click',()=>{ picker.style.display='block'; picker.focus(); });
    picker.addEventListener('change', ()=>{ viewYear = parseInt(picker.value); queryView(root); });

    // 月度统计
    const monthStats = [];
    for (let mm=0; mm<12; mm++) {
      const md = yearData.filter(e=> new Date(e.date).getMonth()===mm);
      const mi = md.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
      const mo = md.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
      monthStats.push({m:mm, in:mi, out:mo, net:mi-mo, count:md.length});
    }
    const g1 = document.getElementById('yearGrid1');
    const g2 = document.getElementById('yearGrid2');
    function monthCell(s) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      cell.style.cssText = 'cursor:pointer;min-height:60px;';
      cell.innerHTML = `
        <div class="cal-date">${s.m+1}月</div>
        ${s.in?`<div class="cal-amt in">+${s.in.toFixed(0)}</div>`:''}
        ${s.out?`<div class="cal-amt out">-${s.out.toFixed(0)}</div>`:''}
        ${(!s.in&&!s.out)?`<div class="muted" style="font-size:10px;">—</div>`:''}
      `;
      cell.addEventListener('click', ()=>{ viewMonth = new Date(y, s.m, 1); queryTab='month'; queryView(root); });
      return cell;
    }
    monthStats.slice(0,7).forEach(s=>g1.appendChild(monthCell(s)));
    monthStats.slice(7).forEach(s=>g2.appendChild(monthCell(s)));
  }

  function renderCalendar(y, m, monthData) {
    const grid = document.getElementById('calGrid');
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m+1, 0).getDate();
    const dayMap = {};
    monthData.forEach(e => {
      const d = new Date(e.date).getDate();
      if (!dayMap[d]) dayMap[d] = {in:0,out:0};
      if (e.type==='income') dayMap[d].in += e.amount; else dayMap[d].out += e.amount;
    });
    let html = '';
    for (let i=0;i<first;i++) html += `<div class="cal-cell empty"></div>`;
    for (let d=1; d<=days; d++) {
      const info = dayMap[d];
      const today = new Date();
      const isToday = (today.getFullYear()===y && today.getMonth()===m && today.getDate()===d);
      html += `<div class="cal-cell" style="${isToday?'box-shadow:inset 0 0 0 2px var(--c-primary);':''}">
        <div class="cal-date">${d}</div>
        ${info&&info.in?`<div class="cal-amt in">+${info.in.toFixed(0)}</div>`:''}
        ${info&&info.out?`<div class="cal-amt out">-${info.out.toFixed(0)}</div>`:''}
      </div>`;
    }
    grid.innerHTML = html;
  }

  function renderPie(monthData) { renderPieAt('pieCanvas','pieLegend',monthData); }

  function renderPieAt(canvasId, legendId, data) {
    const byReason = {};
    data.forEach(e => {
      const k = e.reason || '其他';
      if (!byReason[k]) byReason[k] = {in:0,out:0};
      if (e.type==='income') byReason[k].in += e.amount; else byReason[k].out += e.amount;
    });
    const items = Object.entries(byReason).map(([k,v])=>({name:k, val:v.in-v.out})).filter(x=>x.val!==0);
    const total = items.reduce((s,x)=>s+Math.abs(x.val),0);
    const colors = ['#E8A0C4','#B9A7E8','#7FC8A9','#F0B870','#E88B8B','#A8D0E8','#C77DA3','#8E78C9'];
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx=130, cy=130, R=100, r=55;
    ctx.clearRect(0,0,260,260);
    if (total===0) { ctx.fillStyle='#ccc'; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill(); }
    else {
      let start=-Math.PI/2;
      items.forEach((it,i)=>{
        const ang = (Math.abs(it.val)/total)*Math.PI*2;
        ctx.fillStyle = colors[i%colors.length];
        ctx.beginPath(); ctx.moveTo(cx,cy);
        ctx.arc(cx,cy,R,start,start+ang); ctx.closePath(); ctx.fill();
        start += ang;
      });
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
      ctx.fillText('¥'+total.toFixed(0), cx, cy+5);
    }
    const lg = document.getElementById(legendId);
    lg.innerHTML = items.map((it,i)=>`<div class="lg-item"><div class="lg-color" style="background:${colors[i%colors.length]}"></div>${escapeHtml(it.name)} ¥${Math.abs(it.val).toFixed(2)}</div>`).join('') || '<div class="muted">无数据</div>';
  }

  function fmtDate(ts){ const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; }
  function pad(n){return n<10?'0'+n:n;}
  function escapeHtml(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escapeAttr(s){return (s||'').replace(/"/g,'&quot;');}

  return { render };
})();
