// ===== 顶部横屏区组件 =====
const Header = (() => {
  const WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

  // 粉色小猫 SVG（原版）
  function catSVG() {
    return `
    <svg class="cat-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <!-- 尾巴 -->
      <path class="cat-tail" d="M88 78 Q104 70 100 50 Q98 42 90 44" fill="none" stroke="#E8A0C4" stroke-width="8" stroke-linecap="round"/>
      <!-- 身体 -->
      <ellipse cx="60" cy="80" rx="34" ry="26" fill="#FBD7E5"/>
      <!-- 头 -->
      <circle cx="60" cy="52" r="28" fill="#FBD7E5"/>
      <!-- 耳朵 -->
      <path d="M38 36 L34 16 L52 30 Z" fill="#FBD7E5"/>
      <path d="M82 36 L86 16 L68 30 Z" fill="#FBD7E5"/>
      <path d="M40 32 L38 22 L48 30 Z" fill="#F5A8C8"/>
      <path d="M80 32 L82 22 L72 30 Z" fill="#F5A8C8"/>
      <!-- 腮红 -->
      <circle cx="44" cy="58" r="5" fill="#F5A8C8" opacity="0.6"/>
      <circle cx="76" cy="58" r="5" fill="#F5A8C8" opacity="0.6"/>
      <!-- 眼睛 -->
      <ellipse class="cat-eye" cx="50" cy="50" rx="3.5" ry="5" fill="#3a3a3a"/>
      <ellipse class="cat-eye" cx="70" cy="50" rx="3.5" ry="5" fill="#3a3a3a"/>
      <!-- 高光 -->
      <circle cx="51" cy="48" r="1.2" fill="#fff"/>
      <circle cx="71" cy="48" r="1.2" fill="#fff"/>
      <!-- 鼻子嘴巴 -->
      <path d="M58 58 L60 60 L62 58 Z" fill="#E88B8B"/>
      <path d="M60 60 Q56 64 54 62 M60 60 Q64 64 66 62" stroke="#3a3a3a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <!-- 胡须 -->
      <line x1="36" y1="56" x2="48" y2="57" stroke="#9A9A9A" stroke-width="1"/>
      <line x1="36" y1="60" x2="48" y2="60" stroke="#9A9A9A" stroke-width="1"/>
      <line x1="84" y1="56" x2="72" y2="57" stroke="#9A9A9A" stroke-width="1"/>
      <line x1="84" y1="60" x2="72" y2="60" stroke="#9A9A9A" stroke-width="1"/>
      <!-- 小爪子 -->
      <ellipse cx="48" cy="104" rx="6" ry="4" fill="#F5C9D6"/>
      <ellipse cx="72" cy="104" rx="6" ry="4" fill="#F5C9D6"/>
    </svg>`;
  }

  // 农历干支年
  function lunarYear(d) {
    const year = d.getFullYear();
    const idx = (year - 4) % 60;
    return GAN[(idx % 10)] + ZHI[(idx % 12)] + '年';
  }

  // 简化农历月日，全部转中文
  function lunarSimple(d) {
    try {
      const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month:'long', day:'numeric' });
      let s = fmt.format(d).replace(/\s/g,'');
      s = s.replace(/^\d+年?/, '');
      s = s.replace(/[0-9]+/g, m => num2cn(parseInt(m)));
      return s;
    } catch(e) { return ''; }
  }
  const CN_NUM = ['零','一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','二十一','二十二','二十三','二十四','二十五','二十六','二十七','二十八','二十九','三十'];
  function num2cn(n) { return CN_NUM[n] || n.toString(); }

  function renderDate() {
    const now = new Date();
    document.getElementById('dateMain').textContent = `${now.getMonth()+1}月${now.getDate()}日`;
    document.getElementById('dateSub').textContent = `${WEEK[now.getDay()]}    ${lunarYear(now)}${lunarSimple(now)}`;
  }

  function applyTheme(idx) {
    const h = document.getElementById('top-header');
    h.classList.remove('theme-0','theme-1','theme-2','theme-3','theme-4','theme-5','theme-6');
    h.classList.add('theme-' + idx);
    localStorage.setItem('top_theme_idx', idx);
  }
  function renderDots() {
    const box = document.getElementById('themeDots');
    box.innerHTML = '';
    for (let i=0;i<BG_IMAGES.length;i++) {
      const d = document.createElement('div');
      d.className = 'theme-dot';
      d.title = '背景图' + (i+1);
      d.addEventListener('click', () => {
        localStorage.setItem('bg_manual_idx', i);
        setBg(`https://images.unsplash.com/${BG_IMAGES[i]}?auto=format&fit=crop&w=900&q=80&_=${Date.now()}`);
      });
      box.appendChild(d);
    }
  }
  function getThemeIdx() {
    const saved = localStorage.getItem('top_theme_idx');
    if (saved !== null) return parseInt(saved);
    return Math.floor(Date.now()/86400000) % 7;
  }

  // 背景图
  const BG_IMAGES = [
    'photo-1550684848-fac1c5b4e853',
    'photo-1513151233558-d860c5398176',
    'photo-1490750967868-88aa4486c946',
    'photo-1465146344425-f00d5f5c8f07',
    'photo-1515405295579-ba7b45403062',
    'photo-1505118380757-91f5f5632de0'
  ];

  async function updateBg() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 8) return;
    const key = 'bg_last_update_v2';
    const last = parseInt(localStorage.getItem(key) || '0');
    const now = Date.now();
    if (now - last < 3*3600*1000) {
      const cached = localStorage.getItem('bg_url_v2');
      if (cached) setBg(cached + '&_=' + Math.floor(now/10000));
      return;
    }
    const idx = Math.floor((now / (3*3600*1000)) % BG_IMAGES.length);
    const imgId = BG_IMAGES[idx];
    const url = `https://images.unsplash.com/${imgId}?auto=format&fit=crop&w=900&q=80`;
    setBg(url + '&_=' + Math.floor(now/10000));
    localStorage.setItem('bg_url_v2', url);
    localStorage.setItem(key, now.toString());
  }
  function setBg(url) {
    const h = document.getElementById('top-header');
    const img = new Image();
    img.onload = () => { h.style.backgroundImage = `url("${url}")`; };
    img.onerror = () => { h.style.backgroundImage = `url("${fallbackGradient()}")`; };
    img.src = url;
  }
  function fallbackGradient() {
    const idx = Math.floor(Date.now()/(3*3600*1000)) % 5;
    const palettes = [
      ['#FADADD','#F5C9D6'], ['#E6D7F5','#B9A7E8'], ['#FDF0F4','#F5C9D6'],
      ['#FCDFC8','#F5B89A'], ['#D7E8F5','#A8D0E8']
    ];
    const [c1,c2] = palettes[idx];
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='500'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  // 左滑切换背景图 / 双击隐藏
  function bindSwipe() {
    const h = document.getElementById('top-header');
    let sx=0, sy=0, locked=false;
    h.addEventListener('touchstart', e => { sx=e.touches[0].clientX; sy=e.touches[0].clientY; locked=false; }, {passive:true});
    h.addEventListener('touchmove', e => {
      if (locked) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy)*1.5 && Math.abs(dx) > 10) { locked=true; }
    }, {passive:true});
    h.addEventListener('touchend', e => {
      if (!locked) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (dx < -50) {
        let idx = parseInt(localStorage.getItem('bg_manual_idx') || '0');
        idx = (idx + 1) % BG_IMAGES.length;
        localStorage.setItem('bg_manual_idx', idx);
        setBg(`https://images.unsplash.com/${BG_IMAGES[idx]}?auto=format&fit=crop&w=900&q=80&_=${Date.now()}`);
      }
    });
    let lastTap=0;
    h.addEventListener('touchend', () => {
      const now=Date.now();
      if (now-lastTap<300) {
        h.classList.toggle('hidden');
        if (h.classList.contains('hidden')) setTimeout(()=>h.classList.remove('hidden'),6000);
      }
      lastTap=now;
    });
  }

  function init() {
    renderDate();
    applyTheme(getThemeIdx());
    renderDots();
    updateBg();
    bindSwipe();
    setInterval(renderDate, 60000);
    setInterval(updateBg, 10*60*1000);
  }

  return { init };
})();
