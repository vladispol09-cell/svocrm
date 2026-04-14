// ===== STATE =====
let currentUser = null;
let relativeCount = 1;
let passLeadId = null;
let chartCreated = null, chartActions = null, chartRegions = null;
let currentAdmStatus = '';

// Russian regions
const REGIONS = [
  'Москва', 'Санкт-Петербург', 'Московская обл.', 'Ленинградская обл.',
  'Адыгея', 'Алтай', 'Алтайский край', 'Амурская обл.', 'Архангельская обл.',
  'Астраханская обл.', 'Башкортостан', 'Белгородская обл.', 'Брянская обл.',
  'Бурятия', 'Владимирская обл.', 'Волгоградская обл.', 'Вологодская обл.',
  'Воронежская обл.', 'Дагестан', 'Донецк', 'Еврейская АО', 'Забайкальский край',
  'Ивановская обл.', 'Ингушетия', 'Иркутская обл.', 'Кабардино-Балкария',
  'Калининградская обл.', 'Калмыкия', 'Калужская обл.', 'Камчатский край',
  'Карачаево-Черкесия', 'Карелия', 'Кемеровская обл.', 'Кировская обл.',
  'Коми', 'Костромская обл.', 'Краснодарский край', 'Красноярский край',
  'Крым', 'Курганская обл.', 'Курская обл.', 'Липецкая обл.',
  'Магаданская обл.', 'Марий Эл', 'Мордовия', 'Мурманская обл.',
  'Ненецкий АО', 'Нижегородская обл.', 'Новгородская обл.', 'Новосибирская обл.',
  'Омская обл.', 'Оренбургская обл.', 'Орловская обл.', 'Пензенская обл.',
  'Пермский край', 'Приморский край', 'Псковская обл.', 'Ростовская обл.',
  'Рязанская обл.', 'Самарская обл.', 'Саратовская обл.', 'Саха (Якутия)',
  'Сахалинская обл.', 'Свердловская обл.', 'Северная Осетия', 'Севастополь',
  'Смоленская обл.', 'Ставропольский край', 'Тамбовская обл.', 'Татарстан',
  'Тверская обл.', 'Томская обл.', 'Тульская обл.', 'Тыва', 'Тюменская обл.',
  'Удмуртия', 'Ульяновская обл.', 'Хабаровский край', 'Хакасия',
  'Ханты-Мансийский АО', 'Челябинская обл.', 'Чечня', 'Чувашия',
  'Чукотский АО', 'Ямало-Ненецкий АО', 'Ярославская обл.'
];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  populateRegions();
  checkAuth();

  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('createLeadForm').addEventListener('submit', createLead);
  document.getElementById('createUserForm').addEventListener('submit', createUser);
  document.getElementById('uploadBaseForm').addEventListener('submit', uploadBase);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnCallbacks').addEventListener('click', openCallbacks);
  document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchLeads(); });

  // Restore region from localStorage
  const saved = localStorage.getItem('crm_region');
  if (saved) document.getElementById('regionSelect').value = saved;
});

// ===== BACKGROUND =====
function initParticles() { }

// ===== REGIONS =====
function populateRegions() {
  const sel = document.getElementById('regionSelect');
  sel.innerHTML = '<option value="">— Выберите регион —</option>' +
    REGIONS.map(r => `<option value="${r}">${r}</option>`).join('');
  sel.addEventListener('change', () => {
    localStorage.setItem('crm_region', sel.value);
  });
}

// ===== AUTH =====
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) { currentUser = await res.json(); showApp(); return; }
    // Try dept auth
    const dres = await fetch('/api/dept/me');
    if (dres.ok) { currentUser = await dres.json(); showDeptWorkerApp(); return; }
  } catch (e) { }
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  // Try main login first
  let res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (res.ok) { currentUser = await res.json(); matrixTransition(() => showApp()); return; }

  // Fallback: try department login
  res = await fetch('/api/dept-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (res.ok) {
    currentUser = await res.json();
    showToast('Добро пожаловать в отдел: ' + (currentUser.department_name || ''), 'success');
    matrixTransition(() => showDeptWorkerApp());
    return;
  }

  const d = await res.json();
  document.getElementById('loginError').textContent = d.error;
  setTimeout(() => document.getElementById('loginError').textContent = '', 3000);
}

// ===== MATRIX TRANSITION =====
function matrixTransition(callback) {
  const canvas = document.getElementById('matrixOverlay');
  if (!canvas) { callback(); return; }
  canvas.style.display = 'block';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const chars = 'CRM$$$¥€₿01アイウエオカキクケコ{}[]<>/=;:HACKDOLLAR'.split('');
  const dollarEmojis = ['$', '💰', '💵', '💲', '🤑'];
  const fontSize = 14;
  const cols = Math.ceil(canvas.width / fontSize);
  const drops = Array(cols).fill(0).map(() => Math.random() * -50 | 0);
  const speeds = Array(cols).fill(0).map(() => 0.5 + Math.random() * 1.5);

  // Flying dollar particles
  const particles = [];
  for (let i = 0; i < 30; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 6,
      vy: -2 - Math.random() * 4,
      size: 16 + Math.random() * 24,
      emoji: dollarEmojis[Math.random() * dollarEmojis.length | 0],
      opacity: 0.5 + Math.random() * 0.5,
      rot: Math.random() * 360
    });
  }

  let startTime = Date.now();
  const duration = 4500;
  let alpha = 0;
  let frame;

  function draw() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Fade in quickly, fade out at end
    if (progress < 0.15) alpha = progress / 0.15;
    else if (progress > 0.75) alpha = 1 - (progress - 0.75) / 0.25;
    else alpha = 1;

    // Background
    ctx.fillStyle = `rgba(6, 8, 15, ${0.08 + alpha * 0.04})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Code rain
    for (let i = 0; i < cols; i++) {
      const char = chars[Math.random() * chars.length | 0];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // Random cyan/green/purple colors
      const r = Math.random();
      if (r < 0.4) ctx.fillStyle = `rgba(34, 211, 238, ${0.7 * alpha})`;
      else if (r < 0.7) ctx.fillStyle = `rgba(74, 222, 128, ${0.8 * alpha})`;
      else if (r < 0.85) ctx.fillStyle = `rgba(139, 92, 246, ${0.6 * alpha})`;
      else ctx.fillStyle = `rgba(251, 191, 36, ${0.9 * alpha})`; // gold for $

      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.fillText(char, x, y);

      // Bright head of column
      if (Math.random() < 0.02) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
        ctx.fillText(char, x, y);
      }

      drops[i] += speeds[i];
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) drops[i] = 0;
    }

    // Flying dollar particles
    ctx.save();
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += 3;
      p.vy += 0.05; // gravity
      if (p.y < -50) { p.y = canvas.height + 20; p.x = Math.random() * canvas.width; p.vy = -2 - Math.random() * 4; }
      if (p.x < -50) p.x = canvas.width + 20;
      if (p.x > canvas.width + 50) p.x = -20;

      ctx.globalAlpha = p.opacity * alpha;
      ctx.font = `${p.size}px sans-serif`;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    });
    ctx.restore();

    // Center text flash
    if (progress > 0.3 && progress < 0.7) {
      const textAlpha = Math.sin((progress - 0.3) / 0.4 * Math.PI) * alpha;
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.font = 'bold 32px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 20;
      ctx.fillText('ПОДКЛЮЧЕНИЕ...', canvas.width / 2, canvas.height / 2);
      ctx.font = '16px Inter, sans-serif';
      ctx.fillStyle = '#8b5cf6';
      ctx.shadowColor = '#8b5cf6';
      ctx.fillText('Инициализация системы', canvas.width / 2, canvas.height / 2 + 36);
      ctx.restore();
    }

    if (progress < 1) {
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      canvas.style.display = 'none';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      callback();
    }
  }

  draw();
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  document.getElementById('loginScreen').classList.add('active');
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('adminScreen').classList.remove('active');
}

function showApp() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('adminScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  document.getElementById('userName').textContent = currentUser.display_name;

  // Only show admin tab for admins
  const tabBar = document.querySelector('.bottom-tabs');
  const existingAdmBtn = document.getElementById('tabAdminBtn');
  if (currentUser.role === 'admin' && !existingAdmBtn) {
    const b = document.createElement('button');
    b.className = 'btab'; b.id = 'tabAdminBtn';
    b.onclick = () => showAdmin();
    b.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg><span>Админ</span>`;
    tabBar.appendChild(b);
  }
  if (currentUser.role !== 'admin' && existingAdmBtn) {
    existingAdmBtn.remove();
  }

  loadMyStats();
  loadCreateFeed();
  loadCallbackCount();
  initProfile();
}

// ===== PROFILE SYSTEM =====
function initProfile() {
  // Set nickname
  const nickEl = document.getElementById('userNickname');
  if (nickEl) nickEl.textContent = currentUser.display_name || currentUser.username;

  // Set avatar
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl && currentUser.avatar) avatarEl.src = currentUser.avatar + '?t=' + Date.now();

  // Set nick style
  setNickStyle(currentUser.nick_style || 'neon', true);

  // Render rank badge (simple version for right sidebar)
  renderRankBadge(0); // Will update when loadCallSidebar fetches stats
}

async function loadProfileStats() {
  try {
    const res = await fetch('/api/my-stats');
    if (!res.ok) return;
    const stats = await res.json();
    renderRankBadge(stats.total || 0);
    renderMedals(stats);
  } catch(e) {}
}

function renderRankBadge(total) {
  const el = document.getElementById('userRankBadge');
  if (!el) return;
  const ranks = [
    { min: 500, label: '💎 ЛЕГЕНДА', bg: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', glow: 'rgba(139,92,246,0.4)' },
    { min: 300, label: '👑 ЭЛИТА', bg: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff', glow: 'rgba(245,158,11,0.4)' },
    { min: 150, label: '🛡️ ВЕТЕРАН', bg: 'linear-gradient(135deg,#06b6d4,#3b82f6)', color: '#fff', glow: 'rgba(6,182,212,0.4)' },
    { min: 50, label: '⚔️ БОЕЦ', bg: 'linear-gradient(135deg,#22c55e,#14b8a6)', color: '#fff', glow: 'rgba(34,197,94,0.3)' },
    { min: 0, label: '🔰 НОВИЧОК', bg: 'rgba(255,255,255,0.08)', color: 'var(--t2)', glow: 'none' },
  ];
  const rank = ranks.find(r => total >= r.min);
  el.textContent = rank.label;
  el.style.background = rank.bg;
  el.style.color = rank.color;
  el.style.boxShadow = rank.glow !== 'none' ? `0 4px 15px ${rank.glow}` : 'none';
  el.style.border = rank.glow !== 'none' ? 'none' : '1px solid rgba(255,255,255,0.1)';
}

function renderMedals(stats) {
  const el = document.getElementById('userMedals');
  if (!el) return;
  const total = stats.total || 0;
  const passed = stats.passed || 0;
  const today = stats.today || 0;

  const medals = [
    { id: 'first', name: 'Первый звонок', desc: '1 обработанный лид', earned: total >= 1,
      svg: `<svg width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="m1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cd7f32"/><stop offset="1" stop-color="#8b4513"/></linearGradient></defs><polygon points="16,2 20,11 30,12 23,19 25,29 16,24 7,29 9,19 2,12 12,11" fill="url(#m1)" stroke="#a0522d" stroke-width="0.5"/><circle cx="16" cy="15" r="4" fill="#fff3" stroke="#fff5" stroke-width="0.5"/></svg>` },
    { id: 'ten', name: 'Десятка', desc: '10 передач', earned: passed >= 10,
      svg: `<svg width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="m2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c0c0c0"/><stop offset="1" stop-color="#808080"/></linearGradient></defs><path d="M6,4 L26,4 L28,8 L28,26 Q28,28 26,28 L6,28 Q4,28 4,26 L4,8 Z" fill="url(#m2)" stroke="#a8a8a8" stroke-width="0.5"/><path d="M10,12 L22,12 L22,24 L10,24Z" fill="#fff2"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="10" font-weight="900" font-family="sans-serif">10</text></svg>` },
    { id: 'fifty', name: 'Полтинник', desc: '50 передач', earned: passed >= 50,
      svg: `<svg width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="m3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd700"/><stop offset="1" stop-color="#daa520"/></linearGradient></defs><circle cx="16" cy="16" r="13" fill="url(#m3)" stroke="#b8860b" stroke-width="1"/><path d="M16,5 L18,11 L16,9 L14,11 Z" fill="#fff5"/><path d="M16,27 L18,21 L16,23 L14,21 Z" fill="#fff5"/><path d="M5,16 L11,14 L9,16 L11,18 Z" fill="#fff5"/><path d="M27,16 L21,14 L23,16 L21,18 Z" fill="#fff5"/><circle cx="16" cy="16" r="5" fill="#fff3" stroke="#fff5" stroke-width="0.5"/><text x="16" y="19" text-anchor="middle" fill="#8B4513" font-size="8" font-weight="900" font-family="sans-serif">50</text></svg>` },
    { id: 'hundred', name: 'Сотка', desc: '100 передач', earned: passed >= 100,
      svg: `<svg width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="m4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5e4e2"/><stop offset="1" stop-color="#b8b8b8"/></linearGradient><linearGradient id="m4w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><circle cx="16" cy="16" r="14" fill="url(#m4)" stroke="url(#m4w)" stroke-width="1.5"/><path d="M16,4 C18,10 22,10 26,8 C24,14 26,18 30,20 C24,20 22,24 22,28 C18,24 14,24 10,28 C10,24 8,20 2,20 C6,18 8,14 6,8 C10,10 14,10 16,4Z" fill="url(#m4w)" opacity="0.3"/><text x="16" y="19" text-anchor="middle" fill="#1a1a2e" font-size="7" font-weight="900" font-family="sans-serif">100</text></svg>` },
    { id: 'streak', name: 'Без выходных', desc: '7 дней подряд', earned: (stats.streak || 0) >= 7,
      svg: `<svg width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="m5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#b91c1c"/></linearGradient></defs><path d="M16,2 Q20,10 24,8 Q22,16 28,18 Q22,20 24,28 Q18,24 16,30 Q14,24 8,28 Q10,20 4,18 Q10,16 8,8 Q12,10 16,2Z" fill="url(#m5)" stroke="#991b1b" stroke-width="0.5"/><circle cx="16" cy="16" r="4" fill="#fff3"/><text x="16" y="19" text-anchor="middle" fill="#fff" font-size="7" font-weight="900" font-family="sans-serif">7</text></svg>` },
    { id: 'speed', name: 'Скорострел', desc: '20 лидов за день', earned: today >= 20,
      svg: `<svg width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="m6" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><path d="M18,2 L8,16 L14,16 L12,30 L24,14 L18,14 Z" fill="url(#m6)" stroke="#d97706" stroke-width="0.5"/></svg>` },
  ];

  el.innerHTML = medals.map(m => {
    const op = m.earned ? '1' : '0.2';
    return `<div title="${m.name}\n${m.desc}${m.earned ? ' ✅' : ' (не получена)'}" style="opacity:${op};cursor:pointer;transition:transform .2s" onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'">${m.svg}</div>`;
  }).join('');
}

async function uploadAvatar(input) {
  if (!input.files[0]) return;
  const fd = new FormData();
  fd.append('avatar', input.files[0]);
  try {
    const res = await fetch('/api/user/avatar', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.avatar) {
      document.getElementById('userAvatar').src = data.avatar + '?t=' + Date.now();
      currentUser.avatar = data.avatar;
      showToast('Аватар обновлён!', 'success');
    }
  } catch(e) { showToast('Ошибка загрузки', 'error'); }
}

function setNickStyle(style, silent) {
  const el = document.getElementById('userNickname');
  if (!el) return;
  el.className = 'nickname-' + style;
  if (style === 'neon') {
    el.style.color = '#22d3ee';
    el.style.textShadow = '0 0 10px rgba(34,211,238,0.6), 0 0 20px rgba(34,211,238,0.3), 0 0 40px rgba(139,92,246,0.2)';
  } else if (style === 'gold') {
    el.style.color = '#fbbf24';
    el.style.textShadow = '0 0 10px rgba(251,191,36,0.5), 0 0 20px rgba(245,158,11,0.3)';
  } else if (style === 'fire') {
    el.style.color = '#ef4444';
    el.style.textShadow = '0 0 10px rgba(239,68,68,0.6), 0 0 20px rgba(251,146,60,0.4), 0 2px 4px rgba(0,0,0,0.5)';
  } else {
    el.style.color = '#fff';
    el.style.textShadow = 'none';
  }
  if (!silent) {
    fetch('/api/user/nick-style', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style }) });
  }
}

// ===== TABS =====
function switchTab(id, btn) {
  document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.btab').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
  const titles = { tabCreate: 'Создать Лид', tabCall: 'Звонить Базу', tabSearch: 'Поиск', tabStats: 'Статистика', tabArchive: 'Архив' };
  document.getElementById('headerTitle').textContent = titles[id] || '';
  if (id === 'tabCall') { loadNextLead(); renderCalendar(); }
  if (id === 'tabCreate') loadCreateFeed();
  if (id === 'tabStats') loadStatsTab();
  if (id === 'tabSearch') document.getElementById('searchInput').focus();
  if (id === 'tabArchive') loadArchiveTab();
}

// ===== RELATIVES =====
function addRelative() {
  relativeCount++;
  const idx = relativeCount - 1;
  const block = document.getElementById('relativesBlock');
  const div = document.createElement('div');
  div.className = 'relative-block';
  div.dataset.idx = idx;
  const relationships = ['Мама', 'Папа', 'Брат', 'Сестра', 'Жена', 'Сын', 'Дочь'];
  div.innerHTML = `
    <div class="form-section-head relative-head">
      <span>👤 Родственник #${idx + 1}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <div class="pill-row-inline">
          ${relationships.map(r => `<label class="pill"><input type="radio" name="rel${idx}" value="${r}"><span>${r}</span></label>`).join('')}
        </div>
        <button type="button" class="btn-rel-delete" onclick="removeRelBlock(this)" title="Удалить">✕</button>
      </div>
    </div>
    <div class="form-section-body">
      <div class="fg"><label>ФИО</label><input type="text" class="rel-name" placeholder="Фамилия Имя Отчество"></div>
      <div class="fg"><label>📱 Телефон</label><input type="text" class="rel-phone" placeholder="79001112233"></div>
      <div class="fg"><label>📍 Адрес</label><input type="text" class="rel-address" placeholder="г. Москва, ул. Примерная, д. 1"></div>
    </div>
  `;
  block.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeRelBlock(btn) {
  const block = btn.closest('.relative-block');
  if (block) {
    block.style.transition = 'all .3s ease';
    block.style.opacity = '0';
    block.style.transform = 'scale(0.95)';
    setTimeout(() => block.remove(), 300);
  }
}

// ===== CREATE LEAD =====
async function createLead(e) {
  e.preventDefault();
  const deceasedName = document.getElementById('deceasedName').value.trim();
  if (!deceasedName) { showToast('Введите ФИО умершего', 'error'); return; }

  // Collect relatives with individual phones and addresses
  const relatives = [];
  const phonesList = [];
  const addressList = [];
  document.querySelectorAll('.relative-block').forEach(block => {
    const nameEl = block.querySelector('.rel-name');
    const checkedRel = block.querySelector('input[type=radio]:checked');
    const phoneEl = block.querySelector('.rel-phone');
    const addrEl = block.querySelector('.rel-address');
    const relName = nameEl ? nameEl.value.trim() : '';
    const relationship = checkedRel ? checkedRel.value : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const address = addrEl ? addrEl.value.trim() : '';

    if (relName) {
      relatives.push({ name: relName, relationship, phone, address });
    }
    if (phone) {
      phonesList.push(phone + (relationship ? '(' + relationship + ')' : ''));
    }
    if (address) {
      addressList.push(address);
    }
  });

  const phones = phonesList.join(' ');
  const address = addressList.join('; ');
  const region = document.getElementById('regionSelect').value;

  const res = await fetch('/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deceased_name: deceasedName,
      relatives,
      phones,
      address,
      extra_info: document.getElementById('leadExtra').value.trim(),
      region
    })
  });

  if (res.ok) {
    showToast('✅ Лид сохранён!', 'success');
    e.target.reset();
    // Reset relatives to just one block
    document.getElementById('relativesBlock').innerHTML = `
      <div class="relative-block" data-idx="0">
        <div class="form-section-head relative-head">
          <span>👤 Родственник #1</span>
          <div style="display:flex;gap:6px;align-items:center">
            <div class="pill-row-inline">
              ${['Мама', 'Папа', 'Брат', 'Сестра', 'Жена', 'Сын', 'Дочь'].map(r => `<label class="pill"><input type="radio" name="rel0" value="${r}"><span>${r}</span></label>`).join('')}
            </div>
            <button type="button" class="btn-rel-delete" onclick="removeRelBlock(this)" title="Удалить">✕</button>
          </div>
        </div>
        <div class="form-section-body">
          <div class="fg"><label>ФИО</label><input type="text" class="rel-name" placeholder="Фамилия Имя Отчество"></div>
          <div class="fg"><label>📱 Телефон</label><input type="text" class="rel-phone" placeholder="79001112233"></div>
          <div class="fg"><label>📍 Адрес</label><input type="text" class="rel-address" placeholder="г. Москва, ул. Примерная, д. 1"></div>
        </div>
      </div>`;
    relativeCount = 1;
    // Restore region
    const saved = localStorage.getItem('crm_region');
    if (saved) document.getElementById('regionSelect').value = saved;
    loadMyStats();
    loadCreateFeed();
  } else {
    const err = await res.json();
    showToast('❌ ' + err.error, 'error');
  }
}

// ===== LIVE ACTIVITY FEED =====
async function loadCreateFeed() {
  try {
    const res = await fetch('/api/leads/recent-activity');
    const data = await res.json();

    // Today count
    const countEl = document.getElementById('createTodayCount');
    if (countEl) countEl.innerHTML = `<span class="caf-big">${data.totalToday}</span> лідів додано сьогодні`;

    // Per-user stats
    const userEl = document.getElementById('createUserStats');
    if (userEl) {
      userEl.innerHTML = data.todayStats.map(u => {
        const regionTags = Object.entries(u.regions).map(([r, c]) => `<span class="caf-region">${esc(r)} ×${c}</span>`).join('');
        return `<div class="caf-user">
          <span class="caf-user-name">${esc(u.name)}</span>
          <span class="caf-user-count">+${u.count}</span>
          <div class="caf-regions">${regionTags || ''}</div>
        </div>`;
      }).join('') || '<div class="tf-empty">Ніхто ще не додав</div>';
    }

    // Activity list
    const feedEl = document.getElementById('createActivityFeed');
    if (feedEl) {
      feedEl.innerHTML = data.activity.map(a => {
        const mins = Math.floor((Date.now() - new Date(a.time)) / 60000);
        const timeStr = mins < 1 ? 'щойно' : mins < 60 ? `${mins} хв` : `${Math.floor(mins/60)} год`;
        return `<div class="caf-item">
          <span class="caf-dot"></span>
          <span class="caf-creator">${esc(a.creator)}</span>
          ${a.region ? `<span class="caf-region">${esc(a.region)}</span>` : ''}
          <span class="caf-time">${timeStr}</span>
        </div>`;
      }).join('') || '<div class="tf-empty">Ще немає записів</div>';
    }
  } catch (e) {}
}

// Auto-refresh feed every 30 sec
setInterval(() => { if (!document.getElementById('tabCreate')?.classList.contains('hidden')) loadCreateFeed(); }, 30000);

// ===== MY STATS (creator sees only count) =====
async function loadMyStats() {
  const res = await fetch('/api/leads/my-stats');
  const data = await res.json();

  const statsDiv = document.getElementById('myLeadStats');
  statsDiv.innerHTML = `
    <div class="mini-stat"><div class="mini-stat-val">${data.total}</div><div class="mini-stat-lbl">Создано</div></div>
    <div class="mini-stat"><div class="mini-stat-val">${data.byStatus?.passed || 0}</div><div class="mini-stat-lbl">Передано</div></div>
    <div class="mini-stat"><div class="mini-stat-val">${data.byStatus?.no_answer || 0}</div><div class="mini-stat-lbl">Не дозвон</div></div>
    <div class="mini-stat"><div class="mini-stat-val">${data.byStatus?.new || 0}</div><div class="mini-stat-lbl">Новых</div></div>
  `;

  // Passed notifications
  const notifDiv = document.getElementById('passedNotifications');
  if (data.passed && data.passed.length > 0) {
    notifDiv.innerHTML = '<div class="card-head" style="margin-top:8px"><span class="card-icon">🔔</span> Передачи моих лидов</div>' +
      data.passed.map(p => `
        <div class="notif-item">
          <strong>${esc(p.lead_name)}</strong> — передал <strong>${esc(p.passed_by)}</strong>
          ${p.comment ? `<br>💬 «${esc(p.comment)}»` : ''}
          ${p.region ? `<span class="lc-region">${esc(p.region)}</span>` : ''}
          <div class="notif-time">${formatDate(p.date)}</div>
        </div>
      `).join('');
  } else {
    notifDiv.innerHTML = '';
  }
}

// ===== BASE STATS (visible to all) =====
async function loadBaseStats() {
  try {
    const res = await fetch('/api/leads/base-stats');
    if (!res.ok) return;
    const data = await res.json();
    const bar = document.getElementById('baseStatsBar');
    if (!bar) return;
    const pct = data.total > 0 ? ((data.called / data.total) * 100).toFixed(1) : 0;
    bar.innerHTML = `
      <div class="bs-item"><span class="bs-val">${data.total}</span><span class="bs-lbl">Всего</span></div>
      <div class="bs-item bs-green"><span class="bs-val">${data.remaining}</span><span class="bs-lbl">Осталось</span></div>
      <div class="bs-item bs-blue"><span class="bs-val">${data.called}</span><span class="bs-lbl">Прозвонено</span></div>
      <div class="bs-item bs-purple"><span class="bs-val">${pct}%</span><span class="bs-lbl">Прогресс</span></div>
      <div class="bs-progress"><div class="bs-progress-fill" style="width:${pct}%"></div></div>
    `;
  } catch (e) { }
}

// ===== STATS TAB — PREMIUM WORKER DASHBOARD =====
let _statsCache = null;
async function loadStatsTab(selectedWorkerId) {
  try {
    let daily, base, myStats, allUsers;
    if (selectedWorkerId !== undefined && _statsCache) {
      daily = _statsCache.daily;
      base = _statsCache.base;
      myStats = _statsCache.myStats;
      allUsers = _statsCache.allUsers;
    } else {
      const fetches = [
        fetch('/api/leads/daily-stats'),
        fetch('/api/leads/base-stats'),
        fetch('/api/leads/my-stats')
      ];
      // Admins also fetch user list
      const isAdmin = currentUser && currentUser.role === 'admin';
      if (isAdmin) fetches.push(fetch('/api/admin/users'));
      const results = await Promise.all(fetches);
      daily = await results[0].json();
      base = await results[1].json();
      myStats = await results[2].json();
      allUsers = isAdmin && results[3] ? await results[3].json() : [];
      _statsCache = { daily, base, myStats, allUsers };
    }
    const container = document.getElementById('statsContent');
    if (!container) return;

    // Determine which worker's data to show
    let my = daily.my;
    let heroLabel = '⏰ Сегодня • ' + daily.date;
    if (selectedWorkerId && daily.workers) {
      const w = daily.workers.find(w => w.user_id === selectedWorkerId);
      if (w) {
        my = w;
        heroLabel = '👤 ' + w.display_name + ' • ' + daily.date;
      } else {
        // Worker exists but had 0 activity today
        const u = allUsers.find(u => u.id === selectedWorkerId);
        my = { total:0, 'передал':0, 'не_дозвон':0, 'скип_приветствие':0, 'перезвон':0, 'срез_на_доках':0 };
        heroLabel = '👤 ' + (u ? u.display_name : '—') + ' • ' + daily.date + ' (нет активности)';
      }
    }

    const ov = daily.overall;
    const myTotal = my.total || 1;
    const convRate = my.total > 0 ? ((my['передал'] / my.total) * 100).toFixed(1) : '0.0';

    // SVG Ring for conversion
    const ringR = 48, ringCx = 55, ringCy = 55, ringCirc = 2 * Math.PI * ringR;
    const ringDash = (parseFloat(convRate) / 100) * ringCirc;
    const ringColor = parseFloat(convRate) >= 30 ? '#4ade80' : parseFloat(convRate) >= 15 ? '#fb923c' : '#f87171';

    let html = '';

    // === ADMIN WORKER SELECTOR ===
    if (currentUser && currentUser.role === 'admin' && allUsers && allUsers.length > 0) {
      const workerUsers = allUsers.filter(u => u.role === 'worker' || u.role === 'admin');
      html += `<div style="margin-bottom:14px;padding:12px 16px;background:linear-gradient(145deg,rgba(129,140,248,0.08),rgba(129,140,248,0.02));border:1px solid rgba(129,140,248,0.2);border-radius:var(--r);display:flex;align-items:center;gap:12px">
        <span style="font-size:14px;font-weight:700;color:#818cf8">👁 Просмотр:</span>
        <select id="workerStatsSelect" onchange="loadStatsTab(this.value ? parseInt(this.value) : null)"
          style="flex:1;padding:8px 12px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;color:var(--t1);font-size:13px;font-weight:600;font-family:Inter,sans-serif">
          <option value="">📊 Мои данные</option>
          ${workerUsers.map(u => {
            const wData = (daily.workers || []).find(w => w.user_id === u.id);
            const cnt = wData ? wData.total : 0;
            return `<option value="${u.id}" ${selectedWorkerId === u.id ? 'selected' : ''}>${u.display_name} (${cnt} звонков)</option>`;
          }).join('')}
        </select>
      </div>`;
    }

    // === HERO CARD ===
    html += `<div class="ws-hero">
      <div class="ws-ring-wrap">
        <svg viewBox="0 0 110 110" width="120" height="120">
          <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
          <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="${ringColor}" stroke-width="10"
            stroke-dasharray="${ringDash} ${ringCirc - ringDash}" stroke-dashoffset="0" transform="rotate(-90 ${ringCx} ${ringCy})"
            stroke-linecap="round" style="transition:stroke-dasharray 1.5s ease"/>
        </svg>
        <div class="ws-ring-center">
          <div class="ws-ring-val" style="color:${ringColor}">${convRate}%</div>
          <div class="ws-ring-lbl">конверсия</div>
        </div>
      </div>
      <div class="ws-hero-metrics">
        <div class="ws-hero-name">${heroLabel}</div>
        <div class="ws-hero-grid">
          <div class="ws-hero-metric" style="--metric-color:#818cf8">
            <div class="ws-hero-metric-val">${my.total}</div>
            <div class="ws-hero-metric-lbl">Звонков</div>
          </div>
          <div class="ws-hero-metric" style="--metric-color:#4ade80">
            <div class="ws-hero-metric-val">${my['передал'] || 0}</div>
            <div class="ws-hero-metric-lbl">Передал</div>
          </div>
          <div class="ws-hero-metric" style="--metric-color:#f87171">
            <div class="ws-hero-metric-val">${my['не_дозвон'] || 0}</div>
            <div class="ws-hero-metric-lbl">Не дозвон</div>
          </div>
          <div class="ws-hero-metric" style="--metric-color:#fb923c">
            <div class="ws-hero-metric-val">${my['перезвон'] || 0}</div>
            <div class="ws-hero-metric-lbl">Перезвон</div>
          </div>
        </div>
      </div>
    </div>`;

    // === MY BREAKDOWN ===
    const breaks = [
      { icon:'✅', label:'Передал', val:my['передал']||0, color:'#4ade80' },
      { icon:'❌', label:'Не дозвон', val:my['не_дозвон']||0, color:'#f87171' },
      { icon:'⏭', label:'Скип', val:my['скип_приветствие']||0, color:'#60a5fa' },
      { icon:'📞', label:'Перезвон', val:my['перезвон']||0, color:'#fb923c' },
      { icon:'📄', label:'Срез', val:my['срез_на_доках']||0, color:'#f472b6' },
    ];
    html += `<div class="ws-breakdown">
      <div class="card-head">📊 Детализация сегодня</div>
      ${breaks.map(b => {
        const p = myTotal > 0 ? ((b.val / myTotal) * 100) : 0;
        return `<div class="ws-break-row">
          <span class="ws-break-icon">${b.icon}</span>
          <span class="ws-break-label">${b.label}</span>
          <div class="ws-break-bar-wrap">
            <div class="ws-break-bar" style="width:${Math.max(p, 1.5)}%;background:${b.color}"></div>
          </div>
          <div class="ws-break-nums">
            <span class="ws-break-count" style="color:${b.color}">${b.val}</span>
            <span class="ws-break-pct">${p.toFixed(1)}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;

    // === MY ALL-TIME ===
    html += `<div class="ws-breakdown">
      <div class="card-head">📈 Мои лиды (всего)</div>
      <div class="ws-hero-grid" style="margin-top:10px">
        <div class="ws-hero-metric" style="--metric-color:#818cf8">
          <div class="ws-hero-metric-val">${myStats.total || 0}</div>
          <div class="ws-hero-metric-lbl">Создано</div>
        </div>
        <div class="ws-hero-metric" style="--metric-color:#4ade80">
          <div class="ws-hero-metric-val">${myStats.byStatus?.passed || 0}</div>
          <div class="ws-hero-metric-lbl">Передано</div>
        </div>
        <div class="ws-hero-metric" style="--metric-color:#f87171">
          <div class="ws-hero-metric-val">${myStats.byStatus?.no_answer || 0}</div>
          <div class="ws-hero-metric-lbl">Не дозвон</div>
        </div>
        <div class="ws-hero-metric" style="--metric-color:#60a5fa">
          <div class="ws-hero-metric-val">${myStats.byStatus?.new || 0}</div>
          <div class="ws-hero-metric-lbl">Новых</div>
        </div>
      </div>
    </div>`;

    // === BASE PROGRESS ===
    const basePct = base.total > 0 ? ((base.called / base.total) * 100).toFixed(1) : '0.0';
    const baseR = 32, baseCx = 38, baseCy = 38, baseCirc = 2 * Math.PI * baseR;
    const baseDash = (parseFloat(basePct) / 100) * baseCirc;
    html += `<div class="ws-base-card">
      <div class="ws-base-ring">
        <svg viewBox="0 0 76 76" width="80" height="80">
          <circle cx="${baseCx}" cy="${baseCy}" r="${baseR}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
          <circle cx="${baseCx}" cy="${baseCy}" r="${baseR}" fill="none" stroke="var(--acc)" stroke-width="8"
            stroke-dasharray="${baseDash} ${baseCirc - baseDash}" stroke-dashoffset="0" transform="rotate(-90 ${baseCx} ${baseCy})"
            stroke-linecap="round" style="transition:stroke-dasharray 1.5s ease"/>
        </svg>
        <div class="ws-base-ring-center">
          <div class="ws-base-ring-val">${basePct}%</div>
        </div>
      </div>
      <div class="ws-base-info">
        <div class="card-head" style="margin-bottom:8px">📦 База</div>
        <div class="ws-base-row"><span class="ws-base-row-label">Всего</span><span class="ws-base-row-val">${base.total}</span></div>
        <div class="ws-base-row"><span class="ws-base-row-label">Осталось</span><span class="ws-base-row-val" style="color:var(--acc)">${base.remaining}</span></div>
        <div class="ws-base-row"><span class="ws-base-row-label">Прозвонено</span><span class="ws-base-row-val">${base.called}</span></div>
      </div>
    </div>`;

    // === OVERALL TODAY ===
    const ovTotal = ov.total || 1;
    const ovConv = ov.total > 0 ? ((ov['передал'] / ov.total) * 100).toFixed(1) : '0.0';
    html += `<div class="ws-breakdown">
      <div class="card-head">🌐 Общая за сегодня • ${ov.total} звонков • ${ovConv}% конверсия</div>
      ${breaks.map(b => {
        const ovVal = ov[{'Передал':'передал','Не дозвон':'не_дозвон','Скип':'скип_приветствие','Перезвон':'перезвон','Срез':'срез_на_доках'}[b.label]] || 0;
        const p = ovTotal > 0 ? ((ovVal / ovTotal) * 100) : 0;
        return `<div class="ws-break-row">
          <span class="ws-break-icon">${b.icon}</span>
          <span class="ws-break-label">${b.label}</span>
          <div class="ws-break-bar-wrap">
            <div class="ws-break-bar" style="width:${Math.max(p, 1.5)}%;background:${b.color}"></div>
          </div>
          <div class="ws-break-nums">
            <span class="ws-break-count" style="color:${b.color}">${ovVal}</span>
            <span class="ws-break-pct">${p.toFixed(1)}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;

    // === LEADERBOARD ===
    if (daily.workers && daily.workers.length > 0) {
      const sorted = [...daily.workers].sort((a,b) => {
        const aConv = a.total > 0 ? (a['передал']/a.total) : 0;
        const bConv = b.total > 0 ? (b['передал']/b.total) : 0;
        return bConv - aConv || b.total - a.total;
      });
      const placeClasses = ['gold','silver','bronze'];
      const medals = ['🥇','🥈','🥉'];

      html += `<div class="ws-leaderboard">
        <div class="card-head">🏆 Рейтинг сегодня</div>
        ${sorted.map((w, i) => {
          const conv = w.total > 0 ? ((w['передал']/w.total)*100).toFixed(1) : '0.0';
          const convClass = parseFloat(conv) >= 30 ? 'high' : parseFloat(conv) >= 15 ? 'mid' : 'low';
          const placeClass = i < 3 ? placeClasses[i] : 'normal';
          const medal = i < 3 ? medals[i] : (i+1);
          const isMe = currentUser && w.display_name === currentUser.display_name;
          return `<div class="ws-lb-row ${isMe ? 'ws-lb-me' : ''}">
            <div class="ws-lb-place ${placeClass}">${medal}</div>
            <span class="ws-lb-name">${isMe ? '⭐ ' : ''}${esc(w.display_name)}</span>
            <span class="ws-lb-stat">${w.total}</span>
            <span class="ws-lb-stat" style="color:#4ade80">${w['передал']}</span>
            <span class="ws-lb-conv ${convClass}">${conv}%</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    container.innerHTML = html;
  } catch (e) { console.error('Stats tab error:', e); }
}

// ===== CALL BASE (one random lead at a time) =====
let callSessionCount = 0;
let callTimerInterval = null;
let callTimerStart = null;

function startCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerStart = Date.now();
  callTimerInterval = setInterval(() => {
    const el = document.getElementById('callTimer');
    if (!el) { clearInterval(callTimerInterval); return; }
    const sec = Math.floor((Date.now() - callTimerStart) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    el.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    if (sec > 5) el.classList.remove('pulse');
  }, 1000);
}

// === MOTIVATIONAL MESSAGES ===
const motivations = [
  '💪 Каждый звонок — шаг к победе!',
  '🎯 Фокус и результат. Ты можешь!',
  '🔥 Работай как машина — отдыхай как король!',
  '⚡ Скорость — твоё оружие!',
  '🏆 Лидеры не останавливаются!',
  '💰 Каждая трубка = деньги. Жми!',
  '🚀 Ты ближе к цели, чем думаешь!',
  '👊 Не сдавайся, передача рядом!',
  '🎯 Один хороший звонок меняет всё!',
  '⭐ Ты в топе — так держать!',
];

// === QUICK COMMENT CHIPS ===
const quickComments = [
  'Перезвонить позже',
  'Не берёт трубку',
  'Просил не звонить',
  'Заинтересован',
  'Нужно подумать',
  'Согласен на встречу',
  'Нет денег',
  'Уже заказал',
];

function fillComment(text) {
  const ta = document.getElementById('leadComment');
  if (ta) { ta.value = text; ta.focus(); }
}

async function loadNextLead() {
  loadCallSidebar();

  const res = await fetch('/api/leads/next');
  const lead = await res.json();
  const area = document.getElementById('callArea');

  if (!lead) {
    area.innerHTML = '<div class="glass-card"><p class="empty-msg">🎉 Нет лидов для прозвона</p></div>';
    return;
  }

  callSessionCount++;
  startCallTimer();

  const dailyGoal = 50;
  let todayCalls = callSessionCount;
  let goalPct = Math.min(100, (todayCalls / dailyGoal) * 100).toFixed(1);
  let goalMsg = '🎯 Начинаем! Каждый звонок считается!';

  const phones = parsePhones(lead.phones || '');
  let relatives = [];
  try { relatives = lead.relatives_parsed || JSON.parse(lead.relatives || '[]'); } catch (e) { }

  const streakHtml = callSessionCount >= 3 ? `<div class="csb-streak">🔥 ${callSessionCount} подряд</div>` : '';
  const motivation = motivations[Math.floor(Math.random() * motivations.length)];

  area.innerHTML = `
    <div class="call-goal-bar">
      <div class="call-goal-top">
        <span class="call-goal-label">🎯 Цель на день</span>
        <span class="call-goal-nums" id="goalNums" style="color:#818cf8">${todayCalls} / ${dailyGoal}</span>
      </div>
      <div class="call-goal-track"><div class="call-goal-fill" id="goalFill" style="width:0%"></div></div>
      <div class="call-goal-msg" id="goalMsg">${goalMsg}</div>
    </div>
    <div class="call-session-bar">
      <div class="csb-item">📞 <span class="csb-val">${callSessionCount}</span> сессия</div>
      <div class="csb-item">⏱ <span id="callTimer" class="csb-timer pulse">00:00</span></div>
      ${streakHtml}
    </div>
    <div class="call-motivation">${motivation}</div>
    <div class="lead-card-fancy" id="lead-${lead.id}">

      <!-- Header -->
      <div class="lcf-header">
        <div class="lcf-deceased">
          <span class="lcf-skull">☠️</span>
          <span class="lcf-deceased-name">${esc(lead.deceased_name)}</span>
        </div>
        <div class="lcf-tags">
          <span class="lc-creator">👤 ${esc(lead.creator_name)}</span>
          ${lead.region ? `<span class="lc-region">${esc(lead.region)}</span>` : ''}
        </div>
        ${lead.return_total > 0 ? `<div class="lcf-return-badge">
          <span style="font-size:13px;font-weight:800;color:#fb923c">🔄 вернули с прозвона уже (${lead.return_total} ${lead.return_total === 1 ? 'раз' : 'раз'})</span>
          ${lead.return_from_callback > 0 ? `<span style="color:#fbbf24;font-size:11px"> с перезвона(${lead.return_from_callback}раз)</span>` : ''}
          ${lead.return_from_skip > 0 ? `<span style="color:#60a5fa;font-size:11px"> с скипа(${lead.return_from_skip}раз)</span>` : ''}
          ${lead.return_from_docs > 0 ? `<span style="color:#c084fc;font-size:11px"> с среза(${lead.return_from_docs}раз)</span>` : ''}
        </div>` : ''}
      </div>

      <!-- Relatives with phones & addresses -->
      ${relatives.length ? `
        <div class="lcf-section">
          <div class="lcf-section-title">👥 Родственники</div>
          ${relatives.map((r, rIdx) => {
            const relPhone = r.phone || '';
            const relAddr = r.address || '';
            return `
            <div class="lcf-rel-block" id="rel-block-${lead.id}-${rIdx}">
              <div class="lcf-rel-header">
                <span class="lcf-rel-name">${esc(r.name)}</span>
                ${r.relationship ? `<span class="lcf-rel-badge">${esc(r.relationship)}</span>` : ''}
                <button onclick="deleteRelative(${lead.id}, ${rIdx})" title="Удалить родственника" style="margin-left:auto;width:26px;height:26px;border-radius:8px;border:1px solid rgba(248,113,113,0.25);background:rgba(248,113,113,0.08);color:#f87171;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s" onmouseover="this.style.background='rgba(248,113,113,0.2)';this.style.transform='scale(1.1)'" onmouseout="this.style.background='rgba(248,113,113,0.08)';this.style.transform='scale(1)'">🗑</button>
              </div>
              ${relPhone ? (() => {
                const relRichPhones = parsePhonesRich(relPhone);
                return relRichPhones.map(rp => renderPhoneChipRich(rp, lead.id)).join('');
              })() : ''}
              ${relAddr ? `<div class="lcf-rel-detail">
                <span class="lcf-rel-icon">📍</span>
                <span class="lcf-rel-addr">${esc(relAddr)}</span>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      ` : ''}

      <!-- Fallback: phones shown separately if no relative has own phone -->
      ${(() => {
        const richPhones = parsePhonesRich(lead.phones || '');
        if (richPhones.length && !relatives.some(r => r.phone)) {
          return `<div class="lcf-section">
            <div class="lcf-section-title">📱 Телефоны</div>
            <div class="lcf-phones">
              ${richPhones.map(p => renderPhoneChipRich(p, lead.id)).join('')}
            </div>
          </div>`;
        }
        return '';
      })()}

      <!-- Address fallback (only if no relatives had addresses) -->
      ${lead.address && !relatives.some(r => r.address) ? `
        <div class="lcf-section">
          <div class="lcf-section-title">📍 Адрес</div>
          <div class="lcf-info-text">${esc(lead.address)}</div>
        </div>
      ` : ''}
      ${lead.extra_info ? `
        <div class="lcf-section">
          <div class="lcf-section-title">📝 Доп. информация</div>
          <div class="lcf-info-text">${esc(lead.extra_info)}</div>
        </div>
      ` : ''}

      ${renderLastComment(lead)}
      <!-- Comment -->
      <div class="lcf-section">
        <div class="lcf-section-title">💬 Комментарий</div>
        <div class="quick-chips">
          ${quickComments.map(c => `<button class="qchip" onclick="fillComment('${c}')">${c}</button>`).join('')}
        </div>
        <textarea id="leadComment" class="lcf-comment" rows="2" placeholder="Оставьте комментарий или кликните быстрый шаблон..."></textarea>
      </div>

      <!-- Actions (grid layout, ПЕРЕДАЛ is full-width) -->
      <div class="lcf-actions">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button class="act-btn g" style="flex:1" onclick="openPassModal(${lead.id},'svo','${esc(lead.base_name || 'СВО')}')">✅ ПЕРЕДАЛ</button>
          <button class="act-btn" onclick="showSvoArchive(${lead.id})" style="border-color:rgba(96,165,250,0.3);color:#60a5fa;padding:8px 12px" title="Архив статусов">📋</button>
        </div>
        <button class="act-btn r" onclick="doAction(${lead.id},'не_дозвон')">❌ Не дозвон</button>
        <button class="act-btn o" onclick="doAction(${lead.id},'перезвон')">📞 Перезвон</button>
        <button class="act-btn b" onclick="doAction(${lead.id},'скип_приветствие')">⏭ Скип</button>
        <button class="act-btn p" onclick="doAction(${lead.id},'срез_на_доках')">📄 Срез</button>
        <button class="act-btn" onclick="doAction(${lead.id},'другой_человек')" style="border-color:rgba(168,85,247,0.4);color:#a855f7"> Другой Человек</button>
        <button class="act-btn" onclick="deleteLead(${lead.id})" style="border-color:rgba(239,68,68,0.5);color:#ef4444;font-weight:700">\u{1f5d1} Удалить с БАЗЫ</button>
      </div>
    </div>
  `;

  // Animate goal bar fill + async update with real data
  setTimeout(() => {
    const fill = document.getElementById('goalFill');
    if (fill) fill.style.width = goalPct + '%';
  }, 100);

  // Non-blocking: update goal bar with real API data
  fetch('/api/leads/daily-stats').then(r => r.json()).then(ds => {
    const real = (ds.my && ds.my.total) || callSessionCount;
    const pct = Math.min(100, (real / dailyGoal) * 100).toFixed(1);
    const msg = real >= dailyGoal ? '🏆 ЦЕЛЬ ДОСТИГНУТА! Ты машина!' :
      real >= dailyGoal * 0.75 ? '🔥 Почти у цели! Финишная прямая!' :
      real >= dailyGoal * 0.5 ? '💪 Половина пути! Продолжай!' :
      real >= 10 ? '🚀 Хороший старт! Темп набран!' : '🎯 Начинаем! Каждый звонок считается!';
    const nums = document.getElementById('goalNums');
    const fill = document.getElementById('goalFill');
    const msgEl = document.getElementById('goalMsg');
    if (nums) { nums.textContent = real + ' / ' + dailyGoal; nums.style.color = parseFloat(pct) >= 100 ? '#4ade80' : '#818cf8'; }
    if (fill) fill.style.width = pct + '%';
    if (msgEl) msgEl.textContent = msg;
  }).catch(() => {});

  // Auto-lookup phone numbers via voxlink API
  lookupAllPhones();
}

// ===== PHONE NUMBER LOOKUP (voxlink.ru) =====
function lookupAllPhones() {
  const els = document.querySelectorAll('.phone-info[data-phone]');
  let delay = 0;
  els.forEach(el => {
    const phone = el.dataset.phone;
    if (!phone || phone.length < 7) { el.textContent = ''; return; }
    setTimeout(() => {
      fetch('/api/phone-lookup?num=' + encodeURIComponent(phone))
        .then(r => r.json())
        .then(data => {
          if (data.error) { el.innerHTML = '<span style="color:#f87171">❌</span>'; return; }
          const op = data.operator || '—';
          const reg = data.region || '';
          const old = data.old_operator ? ' <span style="color:#fb923c;font-size:9px">(ранее: ' + data.old_operator + ')</span>' : '';
          el.innerHTML = '<span style="color:#4ade80;font-weight:700">' + op + '</span>' + old +
            (reg ? ' <span style="color:#60a5fa">• ' + reg + '</span>' : '');
        })
        .catch(() => { el.innerHTML = '<span style="color:#f87171">⚠️</span>'; });
    }, delay);
    delay += 200;
  });
}

// ===== CALL SIDEBAR (personal stats + rank + medals + team feed) =====

function renderPogon(tier, stars) {
  const colors = [
    ['#6b7280','#9ca3af'], // 0 - рядовой (серый)
    ['#4ade80','#22d3ee'], // 1 - ефрейтор (зелёный)
    ['#facc15','#f59e0b'], // 2 - сержанты (жёлтый)
    ['#f97316','#ef4444'], // 3 - прапорщик (оранжевый)
    ['#60a5fa','#818cf8'], // 4 - лейтенанты (синий)
    ['#c084fc','#f472b6'], // 5 - старшие офицеры (фиолетовый)
    ['#fbbf24','#f59e0b']  // 6 - генерал (золотой)
  ];
  const [c1, c2] = colors[tier] || colors[0];
  let starsHtml = '';
  for (let i = 0; i < stars; i++) {
    const y = 12 + i * 11;
    starsHtml += `<polygon points="22,${y} 24.5,${y+2} 27,${y} 25,${y+2.5} 26,${y+5} 22,${y+3} 18,${y+5} 19,${y+2.5} 17,${y}" fill="${c1}" stroke="${c2}" stroke-width="0.5"/>`;
  }
  return `<svg width="44" height="64" viewBox="0 0 44 64" fill="none">
    <rect x="6" y="2" width="32" height="60" rx="4" fill="url(#pg${tier})" stroke="${c1}" stroke-width="1.5" opacity="0.9"/>
    <rect x="10" y="6" width="24" height="52" rx="2" fill="rgba(0,0,0,0.2)"/>
    <line x1="22" y1="6" x2="22" y2="58" stroke="${c1}" stroke-width="1" opacity="0.4"/>
    <line x1="15" y1="6" x2="15" y2="58" stroke="${c1}" stroke-width="0.5" opacity="0.2"/>
    <line x1="29" y1="6" x2="29" y2="58" stroke="${c1}" stroke-width="0.5" opacity="0.2"/>
    ${starsHtml}
    <defs><linearGradient id="pg${tier}" x1="6" y1="2" x2="38" y2="62">
      <stop stop-color="${c1}" stop-opacity="0.3"/><stop offset="1" stop-color="${c2}" stop-opacity="0.15"/>
    </linearGradient></defs>
  </svg>`;
}

async function loadCallSidebar() {
  try {
    const res = await fetch('/api/operator/my-call-stats');
    const data = await res.json();
    const sb = document.getElementById('callSidebar');
    if (!sb) return;

    const t = data.today;
    const a = data.allTime;
    const tm = data.team;
    const r = data.rank;
    const convToday = t.total > 0 ? ((t['передал'] || 0) / t.total * 100).toFixed(1) : '0.0';

    // Update pogon in static profile section
    const pogonEl = document.getElementById('profilePogon');
    if (pogonEl) pogonEl.innerHTML = renderPogon(r.tier, r.stars);

    // Update rank name under nickname
    const rankNameEl = document.getElementById('userRankName');
    if (rankNameEl) rankNameEl.textContent = r.name + ' • ' + r.totalPassed + ' трубок';

    // Build earned SVG medals
    function _buildEarnedMedalsHtml(d) {
      const totalPassed = d.rank.totalPassed || 0;
      const passedToday = d.today['передал'] || 0;
      const svgMedals = [
        { name: 'Первая кровь', earned: totalPassed >= 1, svg: `<svg width="26" height="26" viewBox="0 0 32 32"><defs><linearGradient id="lm1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cd7f32"/><stop offset="1" stop-color="#8b4513"/></linearGradient></defs><polygon points="16,2 20,11 30,12 23,19 25,29 16,24 7,29 9,19 2,12 12,11" fill="url(#lm1)" stroke="#a0522d" stroke-width="0.5"/></svg>` },
        { name: 'Десятка (10)', earned: totalPassed >= 10, svg: `<svg width="26" height="26" viewBox="0 0 32 32"><defs><linearGradient id="lm2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c0c0c0"/><stop offset="1" stop-color="#808080"/></linearGradient></defs><path d="M6,4 L26,4 L28,8 L28,26 Q28,28 26,28 L6,28 Q4,28 4,26 L4,8 Z" fill="url(#lm2)"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="10" font-weight="900">10</text></svg>` },
        { name: 'Полтинник (50)', earned: totalPassed >= 50, svg: `<svg width="26" height="26" viewBox="0 0 32 32"><defs><linearGradient id="lm3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd700"/><stop offset="1" stop-color="#daa520"/></linearGradient></defs><circle cx="16" cy="16" r="13" fill="url(#lm3)"/><text x="16" y="20" text-anchor="middle" fill="#8B4513" font-size="9" font-weight="900">50</text></svg>` },
        { name: 'Сотка (100)', earned: totalPassed >= 100, svg: `<svg width="26" height="26" viewBox="0 0 32 32"><defs><linearGradient id="lm4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5e4e2"/><stop offset="1" stop-color="#b8b8b8"/></linearGradient></defs><circle cx="16" cy="16" r="14" fill="url(#lm4)" stroke="#22d3ee" stroke-width="1.5"/><text x="16" y="20" text-anchor="middle" fill="#1a1a2e" font-size="8" font-weight="900">100</text></svg>` },
        { name: 'Герой дня (5/день)', earned: passedToday >= 5, svg: `<svg width="26" height="26" viewBox="0 0 32 32"><defs><linearGradient id="lm5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#b91c1c"/></linearGradient></defs><path d="M16,2 Q20,10 24,8 Q22,16 28,18 Q22,20 24,28 Q18,24 16,30 Q14,24 8,28 Q10,20 4,18 Q10,16 8,8 Q12,10 16,2Z" fill="url(#lm5)"/></svg>` },
        { name: 'Скорострел (20/день)', earned: passedToday >= 20, svg: `<svg width="26" height="26" viewBox="0 0 32 32"><defs><linearGradient id="lm6" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><path d="M18,2 L8,16 L14,16 L12,30 L24,14 L18,14 Z" fill="url(#lm6)"/></svg>` },
      ];
      const earned = svgMedals.filter(m => m.earned);
      if (!earned.length) return '';
      return `<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">${earned.map(m => `<div title="${m.name}" style="cursor:pointer;transition:transform .2s" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">${m.svg}</div>`).join('')}</div>`;
    }

    sb.innerHTML = `
      ${_buildEarnedMedalsHtml(data)}

      <div class="sb-section-title">📊 Сегодня</div>
      <div class="sb-stat"><span class="sb-stat-label">Звонков</span><span class="sb-stat-val">${t.total}</span></div>
      <div class="sb-stat"><span class="sb-stat-label" style="color:var(--green)">Передал</span><span class="sb-stat-val" style="color:var(--green)">${t['передал'] || 0}</span></div>
      <div class="sb-stat"><span class="sb-stat-label" style="color:var(--red)">Не дозвон</span><span class="sb-stat-val" style="color:var(--red)">${t['не_дозвон'] || 0}</span></div>
      <div class="sb-stat"><span class="sb-stat-label" style="color:var(--pink)">Срез</span><span class="sb-stat-val" style="color:var(--pink)">${t['срез_на_доках'] || 0}</span></div>
      <div class="sb-stat"><span class="sb-stat-label">Конверсия</span><span class="sb-stat-val sb-conv">${convToday}%</span></div>

      <div class="sb-section-title">🏢 Команда</div>
      <div class="sb-stat"><span class="sb-stat-label">Лидов в базе</span><span class="sb-stat-val">${tm.totalLeads}</span></div>
      <div class="sb-stat"><span class="sb-stat-label">Осталось</span><span class="sb-stat-val">${tm.remaining}</span></div>
      <div class="sb-stat"><span class="sb-stat-label" style="color:var(--green)">Всего передали</span><span class="sb-stat-val" style="color:var(--green)">${tm['передал'] || 0}</span></div>
    `;

    // Render right sidebar
    loadRightSidebar(data.top5, data.myBasePasses);

    // Load active bases info
    loadActiveBases();
  } catch (e) {}
}

// Load active bases for right sidebar
async function loadActiveBases() {
  try {
    const res = await fetch('/api/leads/daily-stats');
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('activeBasesInfo');
    if (!el) return;
    if (data.bases && data.bases.length) {
      el.innerHTML = data.bases.map(b => `
        <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03)">
          <span style="color:var(--cyan);font-weight:600">${b.name || 'Без имени'}</span>
          <span style="color:${b.remaining > 0 ? '#4ade80' : '#f87171'};font-weight:700">${b.remaining || 0} лидов</span>
        </div>
      `).join('');
    } else {
      el.innerHTML = '<div style="color:var(--t3);font-size:11px">Нет активных баз</div>';
    }
  } catch(e) {
    const el = document.getElementById('activeBasesInfo');
    if (el) el.textContent = '—';
  }
}

// ===== RIGHT SIDEBAR (top5 + my base passes) =====
function loadRightSidebar(top5, myBasePasses) {
  const el = document.getElementById('teamFeedContent');
  if (!el) return;

  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const barColors = ['#facc15','#c0c0c0','#cd7f32','#60a5fa','#4ade80'];

  let html = '';

  // Top 5
  if (top5 && top5.length) {
    html += top5.map((u, i) => `
      <div class="top5-item">
        <span class="top5-medal">${medals[i]}</span>
        <span class="top5-name">${esc(u.name)}</span>
        <span class="top5-count" style="color:${barColors[i]}">${u.count}</span>
        <span class="top5-icon">📞</span>
      </div>
    `).join('');
  } else {
    html += '<div class="tf-empty">Сегодня ещё нет передач</div>';
  }

  // My base passes
  html += '<div class="sb-section-title" style="margin-top:14px">📋 Передачі з моєї бази</div>';
  if (myBasePasses && myBasePasses.length) {
    html += '<div class="mbp-list">';
    html += myBasePasses.map(p => `
      <div class="mbp-item">
        <span class="mbp-who">${esc(p.userName)}</span>
        <span class="mbp-arrow">→</span>
        <span class="mbp-lead">${esc(p.leadName)}</span>
      </div>
    `).join('');
    html += '</div>';
  } else {
    html += '<div class="tf-empty">Передач нет</div>';
  }

  el.innerHTML = html;
}

// ===== ACHIEVEMENTS MODAL =====
let cachedStats = null;

async function openAchievements() {
  const res = await fetch('/api/operator/my-call-stats');
  cachedStats = await res.json();
  const r = cachedStats.rank;
  const medals = cachedStats.medals;
  const totalPassed = r.totalPassed;
  const passedToday = cachedStats.today['передал'] || 0;

  const allRanks = [
    { name: 'Рядовой', min: 0, stars: 0, tier: 0 },
    { name: 'Ефрейтор', min: 3, stars: 1, tier: 1 },
    { name: 'Мл. Сержант', min: 8, stars: 1, tier: 2 },
    { name: 'Сержант', min: 15, stars: 2, tier: 2 },
    { name: 'Ст. Сержант', min: 25, stars: 3, tier: 2 },
    { name: 'Прапорщик', min: 40, stars: 2, tier: 3 },
    { name: 'Лейтенант', min: 60, stars: 1, tier: 4 },
    { name: 'Ст. Лейтенант', min: 85, stars: 2, tier: 4 },
    { name: 'Капитан', min: 120, stars: 3, tier: 4 },
    { name: 'Майор', min: 170, stars: 1, tier: 5 },
    { name: 'Подполковник', min: 250, stars: 2, tier: 5 },
    { name: 'Полковник', min: 350, stars: 3, tier: 5 },
    { name: 'Генерал-лейтенант', min: 500, stars: 4, tier: 6 }
  ];

  const allMedals = [
    { icon: '🎖️', name: 'Первая кровь', desc: 'Передать первую трубку', need: 1, type: 'total' },
    { icon: '🏆', name: 'Ветеран', desc: 'Передать 50 трубок', need: 50, type: 'total' },
    { icon: '💎', name: 'Легенда', desc: 'Передать 100 трубок', need: 100, type: 'total' },
    { icon: '🔥', name: 'Боевой дух', desc: '3 трубки за день', need: 3, type: 'daily' },
    { icon: '⭐', name: 'Герой дня', desc: '5 трубок за день', need: 5, type: 'daily' },
    { icon: '👑', name: 'Непобедимый', desc: '10 трубок за день', need: 10, type: 'daily' },
  ];

  let html = '<div class="ach-section-title">🎖️ РАНГИ</div><div class="ach-ranks">';
  allRanks.forEach(rank => {
    const earned = totalPassed >= rank.min;
    const isCurrent = rank.name === r.name;
    html += `
      <div class="ach-rank-item ${earned ? 'earned' : 'locked'} ${isCurrent ? 'current' : ''}">
        <div class="ach-pogon">${renderPogon(rank.tier, rank.stars)}</div>
        <div class="ach-rank-info">
          <div class="ach-rank-name">${esc(rank.name)}</div>
          <div class="ach-rank-req">${earned ? '✅ Получено' : `Нужно: ${rank.min} трубок`}</div>
        </div>
      </div>`;
  });
  html += '</div>';

  html += '<div class="ach-section-title" style="margin-top:16px">🏅 МЕДАЛИ</div><div class="ach-medals-grid">';
  allMedals.forEach(m => {
    const val = m.type === 'total' ? totalPassed : passedToday;
    const earned = val >= m.need;
    html += `
      <div class="ach-medal-item ${earned ? 'earned' : 'locked'}">
        <div class="ach-medal-icon">${m.icon}</div>
        <div class="ach-medal-name">${m.name}</div>
        <div class="ach-medal-desc">${m.desc}</div>
        <div class="ach-medal-status">${earned ? '✅ Получено' : `${val}/${m.need}`}</div>
      </div>`;
  });
  html += '</div>';

  document.getElementById('achievementsContent').innerHTML = html;
  document.getElementById('achievementsModal').classList.remove('hidden');
}

function closeAchievements() {
  document.getElementById('achievementsModal').classList.add('hidden');
}

// ===== CALENDAR WIDGET =====
let calendarDate = new Date();

function toggleCalendar() {
  const el = document.getElementById('calendarWidget');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) renderCalendar();
}

function renderCalendar() {
  const el = document.getElementById('calendarWidget');
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();
  const firstDay = new Date(year, month, 1).getDay() || 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  let html = `<div class="cal-header">
    <button class="cal-nav" onclick="calPrev()">‹</button>
    <span class="cal-title">${monthNames[month]} ${year}</span>
    <button class="cal-nav" onclick="calNext()">›</button>
  </div>
  <div class="cal-grid">
    <span class="cal-day-name">Пн</span><span class="cal-day-name">Вт</span><span class="cal-day-name">Ср</span>
    <span class="cal-day-name">Чт</span><span class="cal-day-name">Пт</span><span class="cal-day-name">Сб</span><span class="cal-day-name">Вс</span>`;

  for (let i = 1; i < firstDay; i++) html += '<span class="cal-empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    html += `<span class="cal-day${isToday ? ' cal-today' : ''}">${d}</span>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function calPrev() { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); }
function calNext() { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); }

// ===== NOTEPAD (draggable, resizable) =====
let notepadLoaded = false;

async function toggleNotepad() {
  const win = document.getElementById('notepadWindow');
  win.classList.toggle('hidden');
  if (!win.classList.contains('hidden') && !notepadLoaded) {
    const res = await fetch('/api/notepad');
    const data = await res.json();
    document.getElementById('notepadText').value = data.text || '';
    notepadLoaded = true;
    initNotepadDrag();
  }
}

async function saveNotepad() {
  const text = document.getElementById('notepadText').value;
  await fetch('/api/notepad', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  showToast('💾 Заметки сохранены', 'success');
}

function initNotepadDrag() {
  const win = document.getElementById('notepadWindow');
  const handle = document.getElementById('notepadDragHandle');
  let isDragging = false, startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = win.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => { isDragging = false; document.removeEventListener('mousemove', onMove); });
  });

  function onMove(e) {
    if (!isDragging) return;
    win.style.left = (startLeft + e.clientX - startX) + 'px';
    win.style.top = (startTop + e.clientY - startY) + 'px';
    win.style.right = 'auto';
    win.style.bottom = 'auto';
  }
}


function renderLastComment(lead) {
  if (!lead.last_comment) return '';
  return '<div class="lcf-section">' +
    '<div class="lcf-section-title">' + String.fromCodePoint(0x1F4AC) + ' Предыдущий комментарий</div>' +
    '<div style="padding:8px 12px;background:rgba(255,255,255,0.05);border-radius:8px;' +
    'color:rgba(255,255,255,0.85);font-size:13px;line-height:1.5;' +
    'border-left:3px solid var(--orange)">' + esc(lead.last_comment) + '</div></div>';
}


async function deleteLead(id) {
  if (!confirm('Вы уверены что хотите УДАЛИТЬ эту карточку из базы навсегда?')) return;
  const res = await fetch('/api/leads/' + id, { method: 'DELETE' });
  if (res.ok) {
    const card = document.getElementById('lead-' + id);
    if (card) { card.style.transition = 'all .4s ease'; card.style.opacity = '0'; card.style.transform = 'scale(.9)'; }
    showToast('\u{1f5d1} Удалено из базы', 'success');
    setTimeout(() => loadNextLead(), 500);
  } else {
    showToast('Ошибка удаления', 'error');
  }
}

// ===== ACTIONS =====
async function doAction(id, action) {
  const commentEls = document.querySelectorAll('#leadComment');
  let comment = '';
  commentEls.forEach(el => { if (el.value.trim()) comment = el.value.trim(); });
  if (!comment) { const lc = document.getElementById('leadComment'); comment = lc ? lc.value.trim() : ''; }
  const res = await fetch(`/api/leads/${id}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, comment })
  });
  if (res.ok) {
    const card = document.getElementById(`lead-${id}`);
    if (card) {
      card.style.transition = 'all .4s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateX(100px) scale(.95)';
    }
    const names = { 'не_дозвон': '❌ Не дозвон', 'скип_приветствие': '⏭ Скип', 'перезвон': '📞 Перезвон', 'передал': '✅ ПЕРЕДАЛ', 'срез_на_доках': '📄 Срез на доках' };
    showToast(names[action] || action, 'success');
    if (action === 'перезвон') loadCallbackCount();
    setTimeout(() => loadNextLead(), 500);
  }
}

// ===== DELETE RELATIVE =====
async function deleteRelative(leadId, relativeIndex) {
  if (!confirm('Удалить этого родственника?')) return;
  try {
    const res = await fetch(`/api/leads/${leadId}/delete-relative`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativeIndex })
    });
    if (res.ok) {
      // Animate removal
      const block = document.getElementById(`rel-block-${leadId}-${relativeIndex}`);
      if (block) {
        block.style.transition = 'all .4s ease';
        block.style.opacity = '0';
        block.style.transform = 'translateX(-30px) scale(0.9)';
        block.style.maxHeight = block.scrollHeight + 'px';
        setTimeout(() => {
          block.style.maxHeight = '0';
          block.style.padding = '0';
          block.style.margin = '0';
          block.style.border = 'none';
        }, 200);
        setTimeout(() => block.remove(), 500);
      }
      showToast('🗑 Родственник удалён', 'success');
    } else {
      showToast('Ошибка удаления', 'error');
    }
  } catch(e) { showToast('Ошибка сети', 'error'); }
}

// ===== ARCHIVE TAB =====
async function loadArchiveTab() {
  const container = document.getElementById('archiveContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--t3);font-size:16px">⏳ Загрузка архива...</div>';
  try {
    const res = await fetch('/api/leads/archived');
    const data = await res.json();
    if (!data.total) {
      container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3);font-size:15px">📦 Архив пуст. Карточки попадают сюда после 10 возвратов.</div>';
      return;
    }
    let html = `<div style="padding:12px 16px;background:linear-gradient(135deg,rgba(251,146,60,0.12),rgba(239,68,68,0.08));border:1px solid rgba(251,146,60,0.25);border-radius:16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:28px">📦</span>
      <div>
        <div style="font-size:16px;font-weight:800;color:#fb923c">АРХИВ — ${data.total} карточек</div>
        <div style="font-size:11px;color:var(--t3)">Карточки с 10+ возвратами, сгруппированы по регионам</div>
      </div>
    </div>`;
    data.regions.forEach(region => {
      html += `<div style="margin-bottom:14px">
        <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.arc-chev').textContent=this.nextElementSibling.style.display==='none'?'▶':'▼'" 
             style="padding:12px 16px;background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.15);border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all .2s"
             onmouseover="this.style.background='rgba(251,146,60,0.12)'" onmouseout="this.style.background='rgba(251,146,60,0.06)'">
          <span style="font-size:16px">📍</span>
          <span style="font-size:14px;font-weight:800;color:#fb923c;flex:1">${esc(region.region)}</span>
          <span style="background:rgba(251,146,60,0.15);padding:3px 10px;border-radius:20px;font-size:12px;font-weight:800;color:#fb923c">${region.count}</span>
          <span class="arc-chev" style="color:var(--t3);font-size:10px">▶</span>
        </div>
        <div style="display:none;padding:8px 0">
          ${region.leads.map(l => `
            <div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:10px">
              <span style="font-size:14px">☠️</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.deceased_name)}</div>
                <div style="font-size:10px;color:var(--t3);margin-top:2px">
                  👤 ${esc(l.creator_name)} • 🔄 ${l.return_total} возвратов
                  ${l.return_from_callback > 0 ? `• 📞перезвон(${l.return_from_callback})` : ''}
                  ${l.return_from_skip > 0 ? `• ⏭скип(${l.return_from_skip})` : ''}
                  ${l.return_from_docs > 0 ? `• 📄срез(${l.return_from_docs})` : ''}
                </div>
              </div>
              <span style="font-size:10px;color:var(--t3)">#${l.id}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#f87171">Ошибка загрузки архива</div>';
  }
}

// ===== SVO STATUS ARCHIVE =====
async function showSvoArchive(leadId) {
  try {
    const res = await fetch('/api/my-archive');
    const leads = await res.json();
    const statusColors = { no_answer:'#f87171', callback:'#fbbf24', passed:'#4ade80', docs:'#c084fc', skipped:'#9ca3af', other_person:'#a855f7' };

    const leadsHtml = leads.length ? leads.map(l => `
      <div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:12px;cursor:pointer;transition:background .15s" 
           onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''" 
           onclick="this.querySelector('.svo-arc-actions').style.display=this.querySelector('.svo-arc-actions').style.display==='none'?'flex':'none'">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColors[l.status] || '#64748b'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.name}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px">
            <span style="color:${statusColors[l.status] || '#64748b'};font-weight:700">${l.status_label}</span> • 
            ${l.last_action_at ? new Date(l.last_action_at).toLocaleString('ru') : ''}
            ${l.last_comment ? ' • 💬 ' + l.last_comment.substring(0, 30) : ''}
          </div>
          <div class="svo-arc-actions" style="display:none;flex-wrap:wrap;gap:4px;margin-top:6px" onclick="event.stopPropagation()">
            <button onclick="changeSvoLeadStatus(${l.id},'new')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.08);color:#60a5fa;font-size:9px;font-weight:700;cursor:pointer">🆕 Новый</button>
            <button onclick="changeSvoLeadStatus(${l.id},'callback')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);color:#fbbf24;font-size:9px;font-weight:700;cursor:pointer">📞 Перезвон</button>
            <button onclick="changeSvoLeadStatus(${l.id},'no_answer')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-size:9px;font-weight:700;cursor:pointer">❌ Не дозвон</button>
            <button onclick="changeSvoLeadStatus(${l.id},'skipped')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(156,163,175,0.3);background:rgba(156,163,175,0.08);color:#9ca3af;font-size:9px;font-weight:700;cursor:pointer">⏭ Скип</button>
            <button onclick="changeSvoLeadStatus(${l.id},'docs')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(192,132,252,0.3);background:rgba(192,132,252,0.08);color:#c084fc;font-size:9px;font-weight:700;cursor:pointer">📄 Срез</button>
            <button onclick="changeSvoLeadStatus(${l.id},'passed')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.08);color:#4ade80;font-size:9px;font-weight:700;cursor:pointer">✅ Передал</button>
          </div>
        </div>
        <div style="font-size:10px;color:var(--t3);flex-shrink:0">ID:${l.id}</div>
      </div>
    `).join('') : '<div style="padding:30px;text-align:center;color:var(--t3);font-size:13px">📭 Нет обработанных карточек</div>';

    let modal = document.getElementById('svoArchiveModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'svoArchiveModal'; document.body.appendChild(modal); }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)" onclick="this.parentElement.innerHTML=''">
        <div style="background:rgba(14,18,32,0.97);border:1px solid rgba(34,211,238,0.15);border-radius:20px;width:92%;max-width:560px;max-height:85vh;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.6);display:flex;flex-direction:column" onclick="event.stopPropagation()">
          <div style="padding:20px 24px;border-bottom:1px solid rgba(34,211,238,0.1);flex-shrink:0">
            <div style="font-size:18px;font-weight:900;color:#e2e8f0">📋 Архив карточек</div>
            <div style="font-size:11px;color:var(--t3);margin-top:4px">Нажмите на карточку чтобы изменить статус • ${leads.length} карточек</div>
          </div>
          <div style="overflow-y:auto;flex:1">
            ${leadsHtml}
          </div>
          <div style="padding:12px 24px;border-top:1px solid rgba(255,255,255,0.04);text-align:center;flex-shrink:0">
            <button onclick="document.getElementById('svoArchiveModal').innerHTML=''" style="padding:8px 28px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--t2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">Закрыть</button>
          </div>
        </div>
      </div>
    `;
  } catch(e) { showToast('Ошибка загрузки архива', 'error'); }
}

async function changeSvoLeadStatus(leadId, newStatus) {
  // If 'passed', open the pass form modal instead of just changing status
  if (newStatus === 'passed') {
    document.getElementById('svoArchiveModal').innerHTML = '';
    openPassModal(leadId, 'svo', 'СВО');
    return;
  }
  try {
    const res = await fetch('/api/leads/' + leadId + '/change-status', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      const names = { new:'🆕 Новый', callback:'📞 Перезвон', no_answer:'❌ Не дозвон', skipped:'⏭ Скип', docs:'📄 Срез' };
      showToast('Статус изменён: ' + (names[newStatus] || newStatus), 'success');
      document.getElementById('svoArchiveModal').innerHTML = '';
      loadNextLead();
    } else { showToast('Ошибка', 'error'); }
  } catch(e) { showToast('Ошибка', 'error'); }
}

// Delete phone from SVO lead card
async function deleteSvoPhone(leadId, phone) {
  if (!confirm('Удалить номер ' + phone + ' из карточки навсегда?')) return;
  try {
    const res = await fetch('/api/leads/' + leadId + '/delete-phone', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ phone: phone.replace(/[^\d+]/g, '') })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast('Номер удалён', 'success');
      loadNextLead();
    } else { showToast('Ошибка: ' + (data.error || res.status), 'error'); }
  } catch(e) { showToast('Ошибка сети: ' + e.message, 'error'); }
}

// ===== ПЕРЕДАЛ MODAL =====
function openPassModal(id, source, baseName) {
  passLeadId = id;
  document.getElementById('passSource').value = source || 'svo';
  document.getElementById('passLeadIdField').value = id;
  // Set current Moscow time
  const mskTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  document.getElementById('passTimeMsk').value = mskTime;
  // Auto base name (readonly)
  document.getElementById('passBaseName').value = baseName || 'СВО';
  // Clear all fields
  ['passFio','passPhone','passAddress','passWhatGave','passSmsSpam','passWhoNearby','passScheme','passExtraInfo'].forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.value = '';
  });
  document.getElementById('passManager').value = '';
  document.getElementById('passModal').classList.remove('hidden');
}
function closePassModal() {
  document.getElementById('passModal').classList.add('hidden');
  passLeadId = null;
}
async function confirmPass() {
  if (!passLeadId) return;
  const source = document.getElementById('passSource').value;
  const manager = document.getElementById('passManager').value;
  const fio = document.getElementById('passFio').value.trim();
  
  if (!manager) { showToast('Выберите менеджера!', 'error'); return; }
  if (!fio) { showToast('Заполните ФИО!', 'error'); return; }

  // Collect form data
  const passData = {
    time_msk: document.getElementById('passTimeMsk').value,
    manager, fio,
    phone: document.getElementById('passPhone').value.trim(),
    address: document.getElementById('passAddress').value.trim(),
    what_gave: document.getElementById('passWhatGave').value.trim(),
    sms_spam: document.getElementById('passSmsSpam').value.trim(),
    who_nearby: document.getElementById('passWhoNearby').value.trim(),
    scheme: document.getElementById('passScheme').value.trim(),
    extra_info: document.getElementById('passExtraInfo').value.trim(),
    base_name: document.getElementById('passBaseName').value,
    source, lead_id: passLeadId
  };

  // 1) Mark lead as "passed" in CRM
  let crmOk = false;
  if (source === 'dept') {
    try {
      const res = await fetch('/api/dept/leads/' + passLeadId + '/action', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'передал', comment: 'Передал: ' + fio })
      });
      crmOk = res.ok;
    } catch(e) {}
  } else {
    try {
      const res = await fetch(`/api/leads/${passLeadId}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'передал', comment: 'Передал: ' + fio })
      });
      crmOk = res.ok;
    } catch(e) {}
  }

  if (!crmOk) { showToast('❌ Ошибка сохранения', 'error'); return; }

  // 2) Save pass record
  try {
    await fetch('/api/pass-records', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(passData)
    });
  } catch(e) { console.error('Pass record save error:', e); }

  // 3) Update UI
  showToast('✅ ПЕРЕДАЛ', 'success');
  closePassModal();
  
  if (source === 'dept') {
    loadDeptWorkerLead();
    loadDeptWorkerCounts();
    loadDeptCallStats();
    loadDeptCallbacks();
  } else {
    const card = document.getElementById(`lead-${passLeadId}`);
    if (card) { card.style.transition = 'all .4s ease'; card.style.opacity = '0'; card.style.transform = 'translateX(100px) scale(.95)'; }
    setTimeout(() => loadNextLead(), 500);
  }
}

// ===== CALLBACKS =====
async function loadCallbackCount() {
  const res = await fetch('/api/my-callbacks');
  const cbs = await res.json();
  const badge = document.getElementById('callbackCount');
  if (cbs.length > 0) { badge.textContent = cbs.length; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

async function openCallbacks() {
  const res = await fetch('/api/my-callbacks');
  const cbs = await res.json();
  const container = document.getElementById('callbacksList');

  if (cbs.length === 0) {
    container.innerHTML = '<p class="empty-msg">Нет перезвонов</p>';
  } else {
    container.innerHTML = cbs.map(l => {
      const phones = parsePhones(l.phones || '');
      let relatives = [];
      try { relatives = l.relatives_parsed || JSON.parse(l.relatives || '[]'); } catch (e) { }
      return `
        <div class="lead-card">
          <div class="lc-top"><span class="lc-name">☠️ ${esc(l.deceased_name)}</span><span class="lc-creator">👤 ${esc(l.creator_name)}</span></div>
          ${relatives.map(r => `<div class="lc-row"><span class="lc-label">Родств.</span>${esc(r.name)} (${esc(r.relationship)})</div>`).join('')}
          <div class="phone-chips">${phones.map(p => `<span class="pchip" onclick="copyPhone('${p}',this)">${formatPhone(p)}</span><button onclick="deleteSvoPhone(${l.id},'${p}')" style="width:18px;height:18px;border-radius:4px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:2px">🗑️</button>`).join('')}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="act-btn g" style="flex:1;padding:8px" onclick="openCallbackLead(${l.id})">📞 Открыть карточку</button>
            <button class="btn-del" style="padding:8px 12px" onclick="removeCallback(${l.id})">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('callbacksOverlay').classList.remove('hidden');
}

function closeCallbacks() {
  document.getElementById('callbacksOverlay').classList.add('hidden');
}

async function openCallbackLead(id) {
  closeCallbacks();
  // Switch to call tab
  switchTab('tabCall', document.querySelector('.btab[data-tab="tabCall"]'));

  // First, remove from callbacks and assign to this user (set status=new)
  await fetch(`/api/my-callbacks/${id}`, { method: 'DELETE' });
  loadCallbackCount();

  // Fetch the lead and render as full card
  const res = await fetch(`/api/leads/${id}/full`);
  if (!res.ok) { showToast('❌ Лид не найден', 'error'); return; }
  const lead = await res.json();
  const area = document.getElementById('callArea');

  const phones = parsePhones(lead.phones || '');
  let relatives = [];
  try { relatives = lead.relatives_parsed || JSON.parse(lead.relatives || '[]'); } catch (e) { }

  area.innerHTML = `
    <div class="lead-card-fancy" id="lead-${lead.id}">
      <div class="lcf-header">
        <div class="lcf-deceased">
          <span class="lcf-skull">📞</span>
          <span class="lcf-deceased-name">${esc(lead.deceased_name)}</span>
        </div>
        <div class="lcf-tags">
          <span class="lc-region" style="background:rgba(251,146,60,0.15);color:var(--orange)">ПЕРЕЗВОН</span>
          <span class="lc-creator">👤 ${esc(lead.creator_name || '')}</span>
          ${lead.region ? `<span class="lc-region">${esc(lead.region)}</span>` : ''}
        </div>
        ${lead.return_total > 0 ? `<div class="lcf-return-badge">
          <span style="font-size:13px;font-weight:800;color:#fb923c">🔄 вернули с прозвона уже (${lead.return_total} ${lead.return_total === 1 ? 'раз' : 'раз'})</span>
          ${lead.return_from_callback > 0 ? `<span style="color:#fbbf24;font-size:11px"> с перезвона(${lead.return_from_callback}раз)</span>` : ''}
          ${lead.return_from_skip > 0 ? `<span style="color:#60a5fa;font-size:11px"> с скипа(${lead.return_from_skip}раз)</span>` : ''}
          ${lead.return_from_docs > 0 ? `<span style="color:#c084fc;font-size:11px"> с среза(${lead.return_from_docs}раз)</span>` : ''}
        </div>` : ''}
      </div>

      ${relatives.length ? `
        <div class="lcf-section">
          <div class="lcf-section-title">👥 Родственники</div>
          ${relatives.map((r, rIdx) => {
            const relPhone = r.phone || '';
            const relAddr = r.address || '';
            return `
            <div class="lcf-rel-block" id="rel-block-${lead.id}-${rIdx}">
              <div class="lcf-rel-header">
                <span class="lcf-rel-name">${esc(r.name)}</span>
                ${r.relationship ? `<span class="lcf-rel-badge">${esc(r.relationship)}</span>` : ''}
                <button onclick="deleteRelative(${lead.id}, ${rIdx})" title="Удалить родственника" style="margin-left:auto;width:26px;height:26px;border-radius:8px;border:1px solid rgba(248,113,113,0.25);background:rgba(248,113,113,0.08);color:#f87171;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s" onmouseover="this.style.background='rgba(248,113,113,0.2)';this.style.transform='scale(1.1)'" onmouseout="this.style.background='rgba(248,113,113,0.08)';this.style.transform='scale(1)'">🗑</button>
              </div>
              ${relPhone ? `<div class="lcf-rel-detail" style="display:flex;align-items:center;gap:4px">
                <span class="lcf-rel-icon">📱</span>
                <span class="pchip-lg" onclick="copyPhone('${relPhone}',this)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  ${formatPhone(relPhone)}
                </span>
                <button onclick="deleteSvoPhone(${lead.id},'${relPhone}')" title="Удалить" style="width:22px;height:22px;border-radius:6px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">🗑️</button>
              </div>` : ''}
              ${relAddr ? `<div class="lcf-rel-detail">
                <span class="lcf-rel-icon">📍</span>
                <span class="lcf-rel-addr">${esc(relAddr)}</span>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      ` : ''}

      ${phones.length && !relatives.some(r => r.phone) ? `
        <div class="lcf-section">
          <div class="lcf-section-title">📱 Телефоны</div>
          <div class="lcf-phones">
            ${phones.map(p => `
              <div style="display:flex;align-items:center;gap:4px">
                <span class="pchip-lg" onclick="copyPhone('${p}',this)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  ${formatPhone(p)}
                </span>
                <button onclick="deleteSvoPhone(${lead.id},'${p}')" title="Удалить" style="width:22px;height:22px;border-radius:6px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">🗑️</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${lead.address && !relatives.some(r => r.address) ? `
        <div class="lcf-section">
          <div class="lcf-section-title">📍 Адрес</div>
          <div class="lcf-info-text">${esc(lead.address)}</div>
        </div>
      ` : ''}
      ${lead.extra_info ? `
        <div class="lcf-section">
          <div class="lcf-section-title">📝 Доп. информация</div>
          <div class="lcf-info-text">${esc(lead.extra_info)}</div>
        </div>
      ` : ''}

        ${renderLastComment(lead)}
      <div class="lcf-section">
        <div class="lcf-section-title">💬 Комментарий</div>
        <textarea id="leadComment" class="lcf-comment" rows="2" placeholder="Оставьте комментарий перед действием..."></textarea>
      </div>

      <div class="lcf-actions">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button class="act-btn g" style="flex:1" onclick="openPassModal(${lead.id})">✅ ПЕРЕДАЛ</button>
          <button class="act-btn" onclick="showSvoArchive(${lead.id})" style="border-color:rgba(96,165,250,0.3);color:#60a5fa;padding:8px 12px" title="Архив статусов">📋</button>
        </div>
        <button class="act-btn r" onclick="doAction(${lead.id},'не_дозвон')">❌ Не дозвон</button>
        <button class="act-btn b" onclick="doAction(${lead.id},'скип_приветствие')">⏭ Скип</button>
        <button class="act-btn o" onclick="doAction(${lead.id},'перезвон')">📞 Перезвон</button>
        <button class="act-btn p" onclick="doAction(${lead.id},'срез_на_доках')">📄 Срез</button>
        <button class="act-btn" onclick="doAction(${lead.id},'другой_человек')" style="border-color:rgba(168,85,247,0.4);color:#a855f7"> Другой Человек</button>
        <button class="act-btn" onclick="deleteLead(${lead.id})" style="border-color:rgba(239,68,68,0.5);color:#ef4444;font-weight:700">\u{1f5d1} Удалить с БАЗЫ</button>
      </div>
    </div>
  `;

  // Remove from callbacks list
  await fetch(`/api/my-callbacks/${id}`, { method: 'DELETE' });
  loadCallbackCount();
}

async function removeCallback(id) {
  await fetch(`/api/my-callbacks/${id}`, { method: 'DELETE' });
  showToast('✅ Убрано', 'success');
  openCallbacks();
  loadCallbackCount();
}

// ===== SEARCH =====
async function searchLeads() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const leads = await res.json();
  const container = document.getElementById('searchResults');

  if (leads.length === 0) {
    container.innerHTML = '<p class="empty-msg">Ничего не найдено</p>';
    return;
  }

  container.innerHTML = leads.map(l => {
    const phones = parsePhones(l.phones || '');
    let relatives = [];
    try { relatives = l.relatives_parsed || JSON.parse(l.relatives || '[]'); } catch (e) { }
    const isAdm = currentUser && currentUser.role === 'admin';
    return `
      <div class="lead-card" id="search-lead-${l.id}">
        <div class="lc-top">
          <span class="lc-name">☠️ ${esc(l.deceased_name)}</span>
          <span class="lc-badge ${l.status}">${statusText(l.status)}</span>
        </div>
        ${relatives.map(r => `<div class="lc-row"><span class="lc-label">Родств.</span>${esc(r.name)}</div>`).join('')}
        <div class="phone-chips">${phones.map(p => `<span class="pchip" onclick="copyPhone('${p}',this)">${formatPhone(p)}</span><button onclick="deleteSvoPhone(${l.id},'${p}')" style="width:18px;height:18px;border-radius:4px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:2px">🗑️</button>`).join('')}</div>
        <div class="lc-row"><span class="lc-label">Создал</span>${esc(l.creator_name)}</div>
        ${l.region ? `<span class="lc-region">${esc(l.region)}</span>` : ''}
        ${isAdm ? `
          <div class="lc-status-change">
            <label>Изменить статус:</label>
            <select onchange="adminChangeStatus(${l.id}, this.value)">
              <option value="" disabled selected>—</option>
              <option value="new" ${l.status==='new'?'selected':''}>🆕 Новый</option>
              <option value="no_answer" ${l.status==='no_answer'?'selected':''}>❌ Не дозвон</option>
              <option value="callback" ${l.status==='callback'?'selected':''}>📞 Перезвон</option>
              <option value="passed" ${l.status==='passed'?'selected':''}>✅ Передал</option>
              <option value="docs" ${l.status==='docs'?'selected':''}>📄 Срез на доках</option>
              <option value="skipped" ${l.status==='skipped'?'selected':''}>⏭ Скип</option>
            </select>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Admin: change lead status
async function adminChangeStatus(leadId, newStatus) {
  if (!newStatus) return;
  const res = await fetch(`/api/admin/leads/${leadId}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  if (res.ok) {
    showToast('✅ Статус изменён', 'success');
    // Update badge in UI
    const card = document.getElementById(`search-lead-${leadId}`);
    if (card) {
      const badge = card.querySelector('.lc-badge');
      if (badge) {
        badge.className = `lc-badge ${newStatus}`;
        badge.textContent = statusText(newStatus);
      }
    }
  } else {
    const err = await res.json();
    showToast('❌ ' + err.error, 'error');
  }
}

// ===== EXPORT CSV =====
function exportCSV(status) {
  const region = document.getElementById('admRegionFilter')?.value || '';
  const dateFrom = document.getElementById('admDateFrom')?.value || '';
  const dateTo = document.getElementById('admDateTo')?.value || '';
  let url = '/api/admin/export?';
  if (status) url += `status=${status}&`;
  if (region) url += `region=${encodeURIComponent(region)}&`;
  if (dateFrom) url += `date_from=${dateFrom}&`;
  if (dateTo) url += `date_to=${dateTo}&`;
  window.open(url, '_blank');
  showToast('⬇ Выгрузка CSV...', 'success');
}

function exportAndDelete(status) {
  const statusNames = { no_answer: 'Не дозвон', skipped: 'Скип', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках', other_person: 'Другой Человек', new: 'Новый' };
  const name = statusNames[status] || status;
  const dateFrom = document.getElementById('admDateFrom')?.value || '';
  const dateTo = document.getElementById('admDateTo')?.value || '';
  const periodText = (dateFrom || dateTo) ? ` за период ${dateFrom || '...'} — ${dateTo || '...'}` : '';
  if (!confirm(`Выгрузить и УДАЛИТЬ все лиды со статусом "${name}"${periodText} с сервера?\n\nЭто действие нельзя отменить!`)) return;
  const region = document.getElementById('admRegionFilter')?.value || '';
  let url = `/api/admin/export-delete?status=${status}`;
  if (region) url += `&region=${encodeURIComponent(region)}`;
  if (dateFrom) url += `&date_from=${dateFrom}`;
  if (dateTo) url += `&date_to=${dateTo}`;
  window.open(url, '_blank');
  showToast('🗑 Лиды выгружены и удалены', 'success');
  setTimeout(() => loadAdmLeads(currentAdmStatus), 1000);
}

async function resetLeadsStatus(status) {
  const statusNames = { no_answer: 'Не дозвон', skipped: 'Скип', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках', other_person: 'Другой Человек' };
  const name = statusNames[status] || status;
  const region = document.getElementById('admRegionFilter')?.value || '';
  const dateFrom = document.getElementById('admDateFrom')?.value || '';
  const dateTo = document.getElementById('admDateTo')?.value || '';
  const regionText = region ? ` в регионе «${region}»` : '';
  const periodText = (dateFrom || dateTo) ? ` за период ${dateFrom || '...'} — ${dateTo || '...'}` : '';
  if (!confirm(`Вернуть ВСЕ лиды со статусом «${name}»${regionText}${periodText} обратно в работу?\n\nИх статус станет «Новый» и они снова попадут в ротацию для звонков.`)) return;
  const res = await fetch('/api/admin/leads/reset-status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, region: region || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined })
  });
  if (res.ok) {
    const data = await res.json();
    if (data.reset === 0) {
      showToast('⚠️ Нет лидов с таким статусом', 'info');
    } else {
      showToast(`🔄 Возвращено ${data.reset} лидов в работу`, 'success');
    }
    loadAdmLeads(currentAdmStatus);
    updateFilteredCounts();
  } else {
    const err = await res.json();
    showToast('❌ ' + err.error, 'error');
  }
}

async function updateFilteredCounts() {
  const region = document.getElementById('admRegionFilter')?.value || '';
  const dateFrom = document.getElementById('admDateFrom')?.value || '';
  const dateTo = document.getElementById('admDateTo')?.value || '';
  let url = '/api/admin/leads/counts?';
  if (region) url += `region=${encodeURIComponent(region)}&`;
  if (dateFrom) url += `date_from=${dateFrom}&`;
  if (dateTo) url += `date_to=${dateTo}&`;
  try {
    const res = await fetch(url);
    const c = await res.json();

    // Update pill bar counts
    const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setCount('alCount_all', c.all);
    setCount('alCount_new', c.new || 0);
    setCount('alCount_no_answer', c.no_answer);
    setCount('alCount_skipped', c.skipped);
    setCount('alCount_callback', c.callback);
    setCount('alCount_passed', c.passed);
    setCount('alCount_docs', c.docs);

    // Update export CSV buttons
    const csvRow = document.getElementById('csvExportRow');
    if (csvRow) {
      csvRow.innerHTML = `
        <button class="fbtn" onclick="exportCSV('')">Все (${c.all})</button>
        <button class="fbtn" onclick="exportCSV('no_answer')">Не дозвон (${c.no_answer})</button>
        <button class="fbtn" onclick="exportCSV('skipped')">Скип (${c.skipped})</button>
        <button class="fbtn" onclick="exportCSV('callback')">Перезвон (${c.callback})</button>
        <button class="fbtn" onclick="exportCSV('passed')">Передал (${c.passed})</button>
        <button class="fbtn" onclick="exportCSV('docs')">Срез (${c.docs})</button>
      `;
    }
    // Update export+delete buttons
    const delRow = document.getElementById('csvExportDeleteRow');
    if (delRow) {
      delRow.innerHTML = `
        <button class="fbtn" style="border-color:rgba(248,113,113,0.3);color:var(--red)" onclick="exportAndDelete('no_answer')">Не дозвон (${c.no_answer})</button>
        <button class="fbtn" style="border-color:rgba(248,113,113,0.3);color:var(--red)" onclick="exportAndDelete('skipped')">Скип (${c.skipped})</button>
        <button class="fbtn" style="border-color:rgba(248,113,113,0.3);color:var(--red)" onclick="exportAndDelete('callback')">Перезвон (${c.callback})</button>
        <button class="fbtn" style="border-color:rgba(248,113,113,0.3);color:var(--red)" onclick="exportAndDelete('passed')">Передал (${c.passed})</button>
        <button class="fbtn" style="border-color:rgba(248,113,113,0.3);color:var(--red)" onclick="exportAndDelete('docs')">Срез (${c.docs})</button>
      `;
    }
    // Update reset buttons
    const resetRow = document.getElementById('csvResetRow');
    if (resetRow) {
      resetRow.innerHTML = `
        <button class="fbtn" style="border-color:rgba(74,222,128,0.3);color:var(--green)" onclick="resetLeadsStatus('no_answer')">Не дозвон (${c.no_answer})</button>
        <button class="fbtn" style="border-color:rgba(74,222,128,0.3);color:var(--green)" onclick="resetLeadsStatus('skipped')">Скип (${c.skipped})</button>
        <button class="fbtn" style="border-color:rgba(74,222,128,0.3);color:var(--green)" onclick="resetLeadsStatus('callback')">Перезвон (${c.callback})</button>
        <button class="fbtn" style="border-color:rgba(74,222,128,0.3);color:var(--green)" onclick="resetLeadsStatus('passed')">Передал (${c.passed})</button>
        <button class="fbtn" style="border-color:rgba(74,222,128,0.3);color:var(--green)" onclick="resetLeadsStatus('docs')">Срез (${c.docs})</button>
      `;
    }
  } catch (e) { console.error('Count update error:', e); }
}
// ===== ADMIN =====
function showAdmin() {
  if (currentUser.role !== 'admin') return;
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('adminScreen').classList.add('active');
  document.getElementById('adminName').textContent = currentUser.display_name;
  loadUsers(); loadBases(); loadStats(); loadAdmLeads(''); loadAdminRegions(); updateFilteredCounts();
}

function swAdm(id, btn) {
  document.querySelectorAll('.apanel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.anav').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
}

// Admin: Users
async function loadUsers() {
  const res = await fetch('/api/admin/users');
  const users = await res.json();

  // Team summary
  const admins = users.filter(u => u.role === 'admin').length;
  const workers = users.filter(u => u.role === 'worker').length;
  const totalCoins = users.reduce((s, u) => s + (u.coins || 0), 0);
  const sumEl = document.getElementById('auSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="au-sum-card"><div class="au-sum-val">${users.length}</div><div class="au-sum-lbl">👥 Всего</div></div>
      <div class="au-sum-card"><div class="au-sum-val" style="color:#f87171">${admins}</div><div class="au-sum-lbl">🛡 Админы</div></div>
      <div class="au-sum-card"><div class="au-sum-val" style="color:#818cf8">${workers}</div><div class="au-sum-lbl">💼 Работники</div></div>
      <div class="au-sum-card"><div class="au-sum-val" style="color:#fbbf24">${totalCoins}</div><div class="au-sum-lbl">🪙 Коины</div></div>
    `;
  }

  // User cards
  document.getElementById('usersList').innerHTML = users.map(u => {
    const initials = (u.display_name || '??').split(' ').map(w => w[0]).join('').slice(0, 2);
    return `
    <div class="au-card ${u.role === 'admin' ? 'is-admin' : ''}">
      <div class="au-avatar role-${u.role}">${initials}</div>
      <div class="au-info">
        <div class="au-name">${esc(u.display_name)}</div>
        <div class="au-meta">
          <span class="au-login">@${esc(u.username)}</span>
          <span class="au-role ${u.role}">${u.role === 'admin' ? '🛡 Админ' : '💼 Работник'}</span>
          <span class="au-coins"><img src="/mascots/coin.png" width="12" height="12"> ${u.coins || 0}</span>
        </div>
      </div>
      <div class="au-actions">
        <button onclick="adminGrantCoins(${u.id})" title="Коины">🪙</button>
        <button onclick="openEditUserModal(${u.id},'${esc(u.display_name)}','${u.role}',${u.rank_bonus || 0})" title="Редактировать">✏️</button>
        ${u.username !== 'admin' ? `<button class="au-btn-del" onclick="deleteUser(${u.id})" title="Удалить">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');
}


async function createUser(e) {
  e.preventDefault();
  const res = await fetch('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      display_name: document.getElementById('newUserName').value,
      username: document.getElementById('newUserLogin').value,
      password: document.getElementById('newUserPass').value,
      role: document.getElementById('newUserRole').value
    })
  });
  if (res.ok) { showToast('✅ Создан', 'success'); e.target.reset(); loadUsers(); }
  else { const d = await res.json(); showToast('❌ ' + d.error, 'error'); }
}

async function deleteUser(id) {
  if (!confirm('Удалить?')) return;
  await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  showToast('Удалён', 'info'); loadUsers();
}

function openEditUserModal(id, name, role, bonus) {
  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = name;
  document.getElementById('editUserRole').value = role;
  document.getElementById('editUserPass').value = '';
  document.getElementById('editUserBonus').value = bonus || 0;
  document.getElementById('editUserModal').classList.remove('hidden');
}
function closeEditUserModal() { document.getElementById('editUserModal').classList.add('hidden'); }
async function saveEditUser() {
  const id = document.getElementById('editUserId').value;
  const body = {
    display_name: document.getElementById('editUserName').value,
    role: document.getElementById('editUserRole').value,
    rank_bonus: parseInt(document.getElementById('editUserBonus').value) || 0
  };
  const pw = document.getElementById('editUserPass').value.trim();
  if (pw) body.password = pw;
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) { showToast('✅ Сохранено', 'success'); closeEditUserModal(); loadUsers(); }
  else showToast('❌ Ошибка', 'error');
}

// Admin: Bases — PREMIUM CARD GRID
async function loadBases() {
  const res = await fetch('/api/admin/bases');
  const bases = await res.json();

  // === SUMMARY PANEL ===
  const sumEl = document.getElementById('basesSummary');
  const totalBases = bases.length;
  const totalLeads = bases.reduce((s,b) => s + (b.lead_count||0), 0);
  const avgProgress = totalBases > 0 ? Math.round(bases.reduce((s,b) => s + (b.progress||0), 0) / totalBases) : 0;
  sumEl.innerHTML = `
    <div class="base-summary-card"><div class="base-summary-val">${totalBases}</div><div class="base-summary-lbl">📂 Баз</div></div>
    <div class="base-summary-card"><div class="base-summary-val">${totalLeads}</div><div class="base-summary-lbl">👥 Лидов</div></div>
    <div class="base-summary-card"><div class="base-summary-val">${avgProgress}%</div><div class="base-summary-lbl">⚡ Обработка</div></div>
  `;

  // === CARD GRID ===
  const grid = document.getElementById('basesGrid');
  if (!bases.length) { grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1">Нет баз</p>'; return; }

  grid.innerHTML = bases.map(b => {
    const s = b.stats || {};
    const pct = b.progress || 0;
    const total = b.lead_count || 1;

    // SVG Doughnut chart
    const statuses = [
      { key:'new', val:s.new||0, color:'#60a5fa', label:'Новые' },
      { key:'passed', val:s.passed||0, color:'#4ade80', label:'Передал' },
      { key:'no_answer', val:s.no_answer||0, color:'#f87171', label:'Не дозвон' },
      { key:'callback', val:s.callback||0, color:'#fb923c', label:'Перезвон' },
      { key:'docs', val:s.docs||0, color:'#f472b6', label:'Срез' },
      { key:'skipped', val:s.skipped||0, color:'#94a3b8', label:'Скип' },
    ];

    let svgArcs = '';
    let offset = 0;
    const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
    statuses.forEach(st => {
      if (st.val > 0) {
        const pctSt = (st.val / total);
        const dashLen = pctSt * circ;
        svgArcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${st.color}" stroke-width="12"
          stroke-dasharray="${dashLen} ${circ - dashLen}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"
          style="transition:stroke-dasharray 1s ease,stroke-dashoffset 1s ease"/>`;
        offset += dashLen;
      }
    });
    if (offset === 0) {
      svgArcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="12"/>`;
    }

    const statsRows = statuses.filter(st => st.val > 0).map(st =>
      `<div class="base-card-stat-row">
        <span class="base-card-stat-dot" style="background:${st.color}"></span>
        <span class="base-card-stat-name">${st.label}</span>
        <span class="base-card-stat-val">${st.val}</span>
      </div>`
    ).join('');

    const resetBtns = statuses.filter(st => st.val > 0 && st.key !== 'new').map(st =>
      `<button class="act-btn" onclick="resetBaseStatus(${b.id},'${st.key}','${esc(b.name)}')"
        style="padding:3px 8px;font-size:10px;border-color:${st.color}33;color:${st.color}">🔄 ${st.label} (${st.val})</button>`
    ).join('');

    const _dominantRegion = (window._baseDominantRegions && window._baseDominantRegions[b.id]) ? window._baseDominantRegions[b.id].dominant : b.name;
    const _tz = _getRegionTimezone(_dominantRegion);
    return `
      <div class="base-card" style="cursor:pointer" onclick="openSvoBase(${b.id})">
        <div class="base-card-header">
          <div>
            <div class="base-card-name">📂 ${esc(b.name)}</div>
            <div class="base-card-date">${b.lead_count} лидов • ${esc(b.uploader_name)} • ${formatDate(b.created_at)}</div>
          </div>
          <span class="ui-role ${b.enabled ? 'admin' : 'worker'}" style="font-size:10px">${b.enabled ? '🟢 Вкл' : '🔴 Выкл'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(34,211,238,0.04);border-bottom:1px solid rgba(34,211,238,0.06);font-size:11px">
          <span style="color:var(--t3)">🕐 ${_tz.label}</span>
          <span data-tz="${_tz.iana}" style="font-weight:900;color:#22d3ee;font-family:monospace;margin-left:auto"></span>
        </div>
        <div class="base-card-body">
          <div class="base-card-chart">
            <svg viewBox="0 0 100 100" width="100" height="100">${svgArcs}</svg>
            <div class="base-card-chart-center">
              <div class="base-card-chart-pct">${pct}%</div>
              <div class="base-card-chart-lbl">обработано</div>
            </div>
          </div>
          <div class="base-card-stats">${statsRows || '<span style="color:var(--t3);font-size:11px">Пусто</span>'}</div>
        </div>
        <div class="base-card-progress"><div class="base-card-progress-fill" style="width:${pct}%"></div></div>
        <div class="base-card-footer" onclick="event.stopPropagation()">
          <button class="act-btn" onclick="toggleBase(${b.id})" style="padding:4px 10px;font-size:11px">${b.enabled ? '⏸ Выкл' : '▶ Вкл'}</button>
          <button class="act-btn b" onclick="exportBaseJson(${b.id})" style="padding:4px 10px;font-size:11px">📤 JSON</button>
          <button class="act-btn" onclick="exportAndDeleteBase(${b.id},'${esc(b.name)}')" style="padding:4px 10px;font-size:11px;border-color:rgba(248,113,113,0.3);color:var(--red)">📤🗑</button>
          <button class="btn-del" style="font-size:11px;padding:4px 10px" onclick="deleteBase(${b.id})">🗑</button>
        </div>
        ${resetBtns ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)" onclick="event.stopPropagation()">
          <span style="font-size:10px;color:var(--t3);font-weight:700;line-height:22px">🔄</span> ${resetBtns}
        </div>` : ''}
      </div>
    `;
  }).join('');
  _startRegionClocks();

  // Fetch dominant regions from lead data and update clocks
  if (!window._baseDominantRegions) {
    fetch('/api/admin/base-timezones').then(r => r.json()).then(data => {
      window._baseDominantRegions = data;
      // Re-render to apply correct timezones
      const grid = document.getElementById('basesGrid');
      if (grid && grid.children.length > 0) {
        // Update each clock with correct timezone from dominant region
        grid.querySelectorAll('[data-tz]').forEach((el, i) => {
          const baseCard = el.closest('.base-card');
          if (baseCard) {
            const onclick = baseCard.getAttribute('onclick') || '';
            const match = onclick.match(/openSvoBase\((\d+)\)/);
            if (match) {
              const baseId = parseInt(match[1]);
              if (data[baseId]) {
                const tz = _getRegionTimezone(data[baseId].dominant);
                el.dataset.tz = tz.iana;
                const label = el.previousElementSibling;
                if (label) label.textContent = '\u{1f550} ' + tz.label;
              }
            }
          }
        });
      }
    }).catch(() => {});
  }
}

async function uploadBase(e) {
  e.preventDefault();
  const fd = new FormData();
  fd.append('file', document.getElementById('baseFile').files[0]);
  fd.append('name', document.getElementById('baseName').value || document.getElementById('baseFile').files[0].name);
  const res = await fetch('/api/admin/upload-base', { method: 'POST', body: fd });
  if (res.ok) { const d = await res.json(); showToast(`✅ Импорт: ${d.imported}, дубли: ${d.duplicates}`, 'success'); e.target.reset(); loadBases(); }
  else showToast('❌ Ошибка', 'error');
}

async function toggleBase(id) { await fetch(`/api/admin/bases/${id}/toggle`, { method: 'POST' }); loadBases(); }
async function deleteBase(id) { if (!confirm('Удалить базу и все лиды?')) return; await fetch(`/api/admin/bases/${id}`, { method: 'DELETE' }); showToast('🗑 Удалено', 'info'); loadBases(); }

function exportBaseJson(id) {
  window.open(`/api/admin/bases/${id}/export`, '_blank');
  showToast('📤 Выгрузка JSON...', 'success');
}

function exportAndDeleteBase(id, name) {
  if (!confirm(`Выгрузить базу «${name}» в JSON и УДАЛИТЬ с сервера?\n\nЭто действие нельзя отменить!`)) return;
  window.open(`/api/admin/bases/${id}/export?delete=true`, '_blank');
  showToast('📤🗑 База выгружена и удалена', 'success');
  setTimeout(() => loadBases(), 1000);
}

async function resetBaseStatus(baseId, status, baseName) {
  const statusNames = { no_answer: 'Не дозвон', skipped: 'Скип', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках', other_person: 'Другой Человек' };
  const name = statusNames[status] || status;
  if (!confirm(`Вернуть все лиды со статусом «${name}» в базе «${baseName}» обратно в работу?\n\nИх статус станет «Новый» и они снова попадут в ротацию для звонков.`)) return;
  const res = await fetch(`/api/admin/bases/${baseId}/reset-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (res.ok) {
    const data = await res.json();
    showToast(`🔄 Возвращено ${data.reset} лидов в работу`, 'success');
    loadBases();
  } else {
    const err = await res.json();
    showToast('❌ ' + err.error, 'error');
  }
}

// ============ СВО BASE DETAIL VIEW (mirrors ИНН dept base view) ============
let _svoBaseViewId = null;
let _svoBaseData = null;
let _svoBaseSearch = '';
let _svoBaseFilter = '';
let _svoBasePage = 0;
const _svoBasePageSize = 50;
let _svoFieldSettings = null;
const _svoStatusLabels = { new:'🆕 Новый', no_answer:'❌ Не дозвон', callback:'📞 Перезвон', passed:'✅ Передал', docs:'📄 Срез', skipped:'⏭ Скип', other_person:'👤 Другой' };
const _svoFieldLabels = { deceased_name:'ФИО умершего', phones:'Телефоны', address:'Адрес', region:'Регион', extra_info:'Доп. инфо' };

function _detectSvoBaseColumns(base) {
  const cols = [];
  cols.push({ key:'_status', label:'Статус' });
  cols.push({ key:'_worker', label:'Работник' });
  cols.push({ key:'deceased_name', label:'ФИО умершего' });
  cols.push({ key:'phones', label:'Телефоны' });
  cols.push({ key:'_relatives', label:'Родственники' });
  cols.push({ key:'address', label:'Адрес' });
  cols.push({ key:'region', label:'Регион' });
  cols.push({ key:'extra_info', label:'Доп. инфо' });
  cols.push({ key:'_creator', label:'Создал' });
  return cols;
}

async function openSvoBase(baseId) {
  _svoBaseViewId = baseId;
  _svoBaseSearch = '';
  _svoBaseFilter = '';
  _svoBasePage = 0;
  _svoFieldSettings = null;

  let overlay = document.getElementById('svoBaseFullscreen');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'svoBaseFullscreen';
  overlay.className = 'dab-fullscreen';
  overlay.innerHTML = '<div style="text-align:center;padding:80px;color:var(--t3);font-size:18px">⏳ Загрузка базы...</div>';
  document.body.appendChild(overlay);

  try {
    const res = await fetch('/api/admin/bases/' + baseId + '/detail');
    const base = await res.json();
    _svoBaseData = base;

    try { _svoFieldSettings = JSON.parse(base.field_settings || 'null'); } catch(e) { _svoFieldSettings = null; }
    const detectedCols = _detectSvoBaseColumns(base);
    if (!_svoFieldSettings) {
      _svoFieldSettings = { columns: detectedCols.map(c=>c.key), visibility: {}, names: {} };
      detectedCols.forEach(c => { _svoFieldSettings.visibility[c.key] = true; _svoFieldSettings.names[c.key] = c.label; });
    }
    detectedCols.forEach(c => {
      if (!_svoFieldSettings.columns.includes(c.key)) _svoFieldSettings.columns.push(c.key);
      if (_svoFieldSettings.visibility[c.key] === undefined) _svoFieldSettings.visibility[c.key] = true;
      if (!_svoFieldSettings.names[c.key]) _svoFieldSettings.names[c.key] = c.label;
    });

    const sb = base.statusBreakdown || {};
    const totalLeads = base.total_leads || 0;
    const newCount = sb.new || 0;
    const processed = totalLeads - newCount;
    const progress = totalLeads ? Math.round((processed / totalLeads) * 100) : 0;

    const statusTiles = [
      { key:'no_answer', icon:'❌', label:'Не дозвон', count: sb.no_answer||0, color:'#f87171', bg:'rgba(248,113,113,0.08)', border:'rgba(248,113,113,0.2)' },
      { key:'callback', icon:'📞', label:'Перезвон', count: sb.callback||0, color:'#fbbf24', bg:'rgba(251,191,36,0.08)', border:'rgba(251,191,36,0.2)' },
      { key:'passed', icon:'✅', label:'Передал', count: sb.passed||0, color:'#4ade80', bg:'rgba(74,222,128,0.08)', border:'rgba(74,222,128,0.2)' },
      { key:'docs', icon:'📄', label:'Срез на доках', count: sb.docs||0, color:'#c084fc', bg:'rgba(192,132,252,0.08)', border:'rgba(192,132,252,0.2)' },
      { key:'skipped', icon:'⏭', label:'Скип', count: sb.skipped||0, color:'#9ca3af', bg:'rgba(156,163,175,0.08)', border:'rgba(156,163,175,0.2)' },
      { key:'other_person', icon:'👤', label:'Другой человек', count: sb.other_person||0, color:'#fb923c', bg:'rgba(251,146,60,0.08)', border:'rgba(251,146,60,0.2)' },
    ];

    overlay.innerHTML = `
      <div class="dab-fs-header">
        <button class="dab-btn" onclick="closeSvoBaseView()" style="font-size:14px;padding:8px 18px">← Назад</button>
        <div class="dab-fs-title">📂 ${esc(base.name)}</div>
        <span class="dab-fs-count">${totalLeads} лидов</span>
        <button class="dab-btn" onclick="openSvoFieldSettings()" style="border-color:rgba(129,140,248,0.4);color:#818cf8">⚙ Поля</button>
      </div>
      <div class="dab-progress-bar-wrap">
        <div class="dab-progress-info">
          <span>Обработано <b>${processed}</b> из <b>${totalLeads}</b></span>
          <span class="dab-progress-pct">${progress}%</span>
        </div>
        <div class="dab-progress-track"><div class="dab-progress-fill" style="width:${progress}%"></div></div>
      </div>
      <div class="dab-smart-layout">
        <div class="dab-smart-left">
          <div class="dab-smart-left-head" id="svoSmartLeftHead">
            <div class="dab-smart-left-title">📋 Новые лиды <span class="dab-smart-left-count">(${newCount})</span></div>
            <div class="dab-search-bar" style="flex:1;max-width:400px">
              <input type="text" id="svoSearchInput" placeholder="🔍 Поиск..." oninput="svoBaseSearchHandler(this.value)">
            </div>
          </div>
          <div id="svoDetailLeads" class="dab-smart-left-body"></div>
        </div>
        <div class="dab-smart-right">
          <div class="dab-smart-right-title">📁 Под-базы по статусам</div>
          <div class="dab-sub-tiles">${statusTiles.map(t => `
            <div class="dab-sub-tile" style="border-color:${t.border};background:${t.bg}" onclick="viewSvoSubBase('${t.key}')">
              <div class="dab-sub-tile-icon">${t.icon}</div>
              <div class="dab-sub-tile-info">
                <div class="dab-sub-tile-label" style="color:${t.color}">${t.label}</div>
                <div class="dab-sub-tile-count" style="color:${t.color}">${t.count}</div>
              </div>
              ${t.count > 0 && t.key !== 'passed' && t.key !== 'docs' ? `<button class="dab-sub-return-btn" onclick="event.stopPropagation();returnSvoLeadsToCall(${baseId},'${t.key}',${t.count})">🔄</button>` : ''}
            </div>`).join('')}
          </div>
          <div class="dab-smart-stats" id="svoBaseStats"><div style="text-align:center;padding:16px;color:var(--t3);font-size:12px">📊 Загрузка...</div></div>
        </div>
      </div>`;

    _svoBaseFilter = 'new';
    _renderSvoBaseView();
    _loadSvoBaseStats(baseId);
  } catch(e) {
    overlay.innerHTML = '<div style="text-align:center;padding:80px;color:#f87171">❌ ' + e.message + '<br><br><button class="dab-btn" onclick="closeSvoBaseView()">← Назад</button></div>';
  }
}

async function viewSvoSubBase(status) {
  if (!_svoBaseViewId) return;
  _svoBaseSearch = '';
  _svoBasePage = 0;
  const sNames = { no_answer:'❌ Не дозвон', callback:'📞 Перезвон', passed:'✅ Передал', docs:'📄 Срез', skipped:'⏭ Скип', other_person:'👤 Другой' };
  try {
    const res = await fetch('/api/admin/bases/' + _svoBaseViewId + '/detail?sub_status=' + status);
    const data = await res.json();
    _svoBaseData = { ..._svoBaseData, leads: data.leads };
    _svoBaseFilter = '';
    const headEl = document.getElementById('svoSmartLeftHead');
    if (headEl) {
      headEl.innerHTML = `
        <div class="dab-smart-left-title">
          <button class="dab-btn" onclick="backToSvoNewLeads()" style="font-size:12px;padding:4px 10px">← Новые</button>
          ${sNames[status]||status} <span class="dab-smart-left-count">(${data.leads.length})</span>
        </div>
        <div class="dab-search-bar" style="flex:1;max-width:400px">
          <input type="text" id="svoSearchInput" placeholder="🔍 Поиск..." oninput="svoBaseSearchHandler(this.value)">
        </div>
        ${status!=='passed'&&status!=='docs'&&data.leads.length>0?`<button class="dab-btn" onclick="returnSvoLeadsToCall(${_svoBaseViewId},'${status}',${data.leads.length})" style="color:#4ade80;border-color:rgba(74,222,128,0.3);font-size:12px">🔄 Вернуть все (${data.leads.length})</button>`:''}`;
    }
    _renderSvoBaseView();
  } catch(e) { showToast('Ошибка: '+e.message,'error'); }
}

function backToSvoNewLeads() { openSvoBase(_svoBaseViewId); }

async function returnSvoLeadsToCall(baseId, status, count) {
  const sn = { no_answer:'Не дозвон', callback:'Перезвон', skipped:'Скип', other_person:'Другой' };
  if (!confirm('Вернуть '+count+' лидов "'+(sn[status]||status)+'" в прозвон?')) return;
  try {
    const res = await fetch('/api/admin/bases/'+baseId+'/reset-status', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
    const data = await res.json();
    showToast('🔄 Возвращено '+data.reset+' лидов!','success');
    openSvoBase(baseId);
  } catch(e) { showToast('Ошибка: '+e.message,'error'); }
}

async function _loadSvoBaseStats(baseId) {
  try {
    const res = await fetch('/api/admin/bases/'+baseId+'/stats');
    const stats = await res.json();
    const el = document.getElementById('svoBaseStats');
    if (!el) return;
    const days = Object.entries(stats.dailyActivity || {});
    const maxDay = Math.max(...days.map(d => d[1]), 1);
    el.innerHTML = `
      <div class="dab-stats-section">
        <div class="dab-stats-title">📊 Активность 14 дней</div>
        <div class="dab-stats-chart">${days.map(([date,count])=>{
          const pct=Math.round((count/maxDay)*100);
          return `<div class="dab-stats-bar-col" title="${date}: ${count}"><div class="dab-stats-bar" style="height:${Math.max(pct,3)}%"></div><div class="dab-stats-bar-label">${date.slice(8)}</div></div>`;
        }).join('')}</div>
      </div>
      ${stats.workers&&stats.workers.length?`<div class="dab-stats-section"><div class="dab-stats-title">👥 Топ работников</div><div class="dab-stats-workers">${stats.workers.slice(0,5).map((w,i)=>`<div class="dab-stats-worker"><span class="dab-stats-worker-pos">${i+1}</span><span class="dab-stats-worker-name">${esc(w.name)}</span><span class="dab-stats-worker-count">${w.total}</span></div>`).join('')}</div></div>`:''}
      <div class="dab-stats-section"><div class="dab-stats-title">📈 Итого</div>
        <div class="dab-stats-totals">
          <div class="dab-stats-total-item"><span>${stats.total}</span><small>Всего</small></div>
          <div class="dab-stats-total-item"><span style="color:#4ade80">${stats.processed}</span><small>Обработано</small></div>
          <div class="dab-stats-total-item"><span style="color:#60a5fa">${stats.remaining}</span><small>Осталось</small></div>
          <div class="dab-stats-total-item"><span style="color:#c084fc">${stats.total_actions}</span><small>Действий</small></div>
        </div>
      </div>`;
  } catch(e) { const el=document.getElementById('svoBaseStats'); if(el) el.innerHTML=''; }
}

function _getSvoFilteredLeads() {
  if (!_svoBaseData) return [];
  let leads = _svoBaseData.leads || [];
  if (_svoBaseFilter) leads = leads.filter(l => l.status === _svoBaseFilter);
  if (_svoBaseSearch) {
    const q = _svoBaseSearch.toLowerCase();
    leads = leads.filter(l =>
      (l.deceased_name && l.deceased_name.toLowerCase().includes(q)) ||
      (l.phones && l.phones.toLowerCase().includes(q)) ||
      (l.address && l.address.toLowerCase().includes(q)) ||
      (l.region && l.region.toLowerCase().includes(q)) ||
      (l.relatives && l.relatives.toLowerCase().includes(q))
    );
  }
  return leads;
}

function _renderSvoBaseView() {
  const leads = _getSvoFilteredLeads();
  const el = document.getElementById('svoDetailLeads');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(leads.length / _svoBasePageSize));
  if (_svoBasePage >= totalPages) _svoBasePage = totalPages - 1;
  if (_svoBasePage < 0) _svoBasePage = 0;
  const start = _svoBasePage * _svoBasePageSize;
  const pageLeads = leads.slice(start, start + _svoBasePageSize);

  const visibleCols = (_svoFieldSettings ? _svoFieldSettings.columns : []).filter(c => _svoFieldSettings.visibility[c] !== false);

  if (leads.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3)">Нет лидов' + (_svoBaseFilter || _svoBaseSearch ? ' по вашему запросу' : '') + '</div>';
    return;
  }

  let html = `<div class="dab-leads-count">${leads.length} лидов найдено${totalPages > 1 ? ' | Стр. '+(1+_svoBasePage)+' из '+totalPages : ''}</div>`;
  html += '<div class="dab-leads-table-wrap"><table class="dab-leads-table"><thead><tr><th style="min-width:30px">#</th>';
  visibleCols.forEach(colKey => {
    const name = _svoFieldSettings.names[colKey] || colKey;
    html += '<th>' + esc(name) + '</th>';
  });
  html += '<th>Действия</th></tr></thead><tbody>';

  pageLeads.forEach((l, i) => {
    let relatives = [];
    try { relatives = l.relatives_parsed || JSON.parse(l.relatives || '[]'); } catch(e){}
    html += '<tr><td style="color:var(--t3);font-size:11px">' + (start+i+1) + '</td>';
    visibleCols.forEach(colKey => {
      if (colKey === '_status') {
        const st = _svoStatusLabels[l.status] || l.status;
        html += '<td><span class="dab-status-badge dab-st-'+l.status+'">'+st+'</span></td>';
        return;
      }
      if (colKey === '_worker') {
        html += '<td style="font-size:12px;color:var(--t2)">'+esc(l.assigned_name||'—')+'</td>';
        return;
      }
      if (colKey === '_creator') {
        html += '<td style="font-size:12px;color:var(--t2)">'+esc(l.creator_name||'—')+'</td>';
        return;
      }
      if (colKey === '_relatives') {
        const relText = relatives.map(r => (r.name||'') + (r.relationship ? ' ('+r.relationship+')' : '')).filter(Boolean).join(', ');
        html += '<td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(relText)+'">'+(relText ? esc(relText) : '<span style=color:var(--t3)>—</span>')+'</td>';
        return;
      }
      let val = l[colKey] || '';
      if (colKey === 'phones' && val) {
        const ph = String(val).replace(/[^0-9+]/g,'');
        html += '<td><span class="dlc-phone-chip" onclick="copyPhone(\''+ph+'\',this)" style="font-size:12px;padding:3px 8px">'+esc(val)+'</span></td>';
        return;
      }
      html += '<td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(val)+'">'+(val ? esc(val) : '<span style=color:var(--t3)>—</span>')+'</td>';
    });
    html += '<td><div style="display:flex;gap:4px"><button class="dab-btn" onclick="editSvoLead('+l.id+')" title="Редактировать" style="font-size:11px">✏️</button><button class="dab-btn dab-btn-del" onclick="deleteSvoLeadFromBase('+l.id+')" title="Удалить" style="font-size:11px">🗑</button></div></td></tr>';
  });

  html += '</tbody></table></div>';

  if (totalPages > 1) {
    html += '<div class="dab-pagination">';
    html += '<button class="dab-btn" onclick="svoBaseGoPage('+(Math.max(0,_svoBasePage-1))+')" '+(0===_svoBasePage?'disabled':'')+'>← Назад</button>';
    const maxShow = 7;
    let pStart = Math.max(0, _svoBasePage - 3);
    let pEnd = Math.min(totalPages, pStart + maxShow);
    if (pEnd - pStart < maxShow) pStart = Math.max(0, pEnd - maxShow);
    for (let p = pStart; p < pEnd; p++) {
      html += '<button class="dab-btn'+(p===_svoBasePage?' dab-page-active':'')+'\" onclick="svoBaseGoPage('+p+')">'+(p+1)+'</button>';
    }
    html += '<button class="dab-btn" onclick="svoBaseGoPage('+(Math.min(totalPages-1,_svoBasePage+1))+')" '+(_svoBasePage>=totalPages-1?'disabled':'')+'>Вперёд →</button>';
    html += '</div>';
  }

  el.innerHTML = html;
}

function svoBaseGoPage(p) { _svoBasePage = p; _renderSvoBaseView(); }

let _svoSearchTimeout = null;
function svoBaseSearchHandler(val) {
  clearTimeout(_svoSearchTimeout);
  _svoSearchTimeout = setTimeout(() => {
    _svoBaseSearch = val.trim();
    _svoBasePage = 0;
    _renderSvoBaseView();
  }, 250);
}

function closeSvoBaseView() {
  _svoBaseViewId = null;
  _svoBaseData = null;
  _svoFieldSettings = null;
  const overlay = document.getElementById('svoBaseFullscreen');
  if (overlay) overlay.remove();
  loadBases();
}

// ===== СВО FIELD SETTINGS =====
function openSvoFieldSettings() {
  if (!_svoFieldSettings) return;

  const overlay = document.createElement('div');
  overlay.className = 'dab-edit-overlay';
  overlay.id = 'svoFieldSettingsOverlay';

  overlay.innerHTML = `<div class="dfs-modal">
    <div class="dfs-modal-head">
      <span>⚙ Настройки полей базы</span>
      <button onclick="closeSvoFieldSettings()" class="dab-btn">✕</button>
    </div>
    <div class="dfs-modal-content">
      <div class="dfs-left">
        <div class="dfs-left-title">🔧 Настройка колонок</div>
        <div class="dfs-left-hint">Управляйте видимостью, названиями и порядком колонок для работников</div>
        <div id="svoFieldRows" class="dfs-list"></div>
      </div>
      <div class="dfs-right">
        <div class="dfs-right-title">👁 Предпросмотр (вид работника)</div>
        <div class="dfs-right-hint">Так будет выглядеть карточка для работников</div>
        <div id="svoFieldPreview" class="dfs-preview-wrap"></div>
      </div>
    </div>
    <div class="dfs-modal-foot">
      <button class="dab-btn" onclick="resetSvoFieldSettings()" style="color:#f87171;border-color:rgba(248,113,113,0.3)">🔄 Сбросить</button>
      <div style="display:flex;gap:8px">
        <button class="dab-btn" onclick="closeSvoFieldSettings()">Отмена</button>
        <button class="btn-glow" onclick="saveSvoFieldSettings()"><span>💾 Сохранить</span><div class="btn-shine"></div></button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  _renderSvoFieldRows();
  _renderSvoFieldPreview();
}

function _renderSvoFieldRows() {
  const container = document.getElementById('svoFieldRows');
  if (!container || !_svoFieldSettings) return;
  const columns = _svoFieldSettings.columns;
  container.innerHTML = columns.map((key, idx) => {
    const vis = _svoFieldSettings.visibility[key] !== false;
    const name = _svoFieldSettings.names[key] || key;
    const icon = key === '_status' ? '📊' : key === '_worker' ? '👤' : key === '_creator' ? '✍️' : key === '_relatives' ? '👥' : '📋';
    return `<div class="dfs-row ${vis ? '' : 'dfs-row-off'}" data-key="${esc(key)}">
      <div class="dfs-row-drag" title="Перетащите">≡</div>
      <button class="dfs-vis-btn ${vis?'on':'off'}" onclick="toggleSvoField('${esc(key)}')" title="${vis?'Скрыть':'Показать'}">${vis?'👁':'🚫'}</button>
      <span class="dfs-icon">${icon}</span>
      <input type="text" class="dfs-name-input" value="${esc(name)}" data-field-key="${esc(key)}" onchange="renameSvoField('${esc(key)}',this.value)" oninput="_renderSvoFieldPreviewDebounced()" placeholder="Название...">
      <div class="dfs-arrows">
        <button class="dfs-arrow" onclick="moveSvoField('${esc(key)}',-1)" ${idx===0?'disabled':''} title="Вверх">▲</button>
        <button class="dfs-arrow" onclick="moveSvoField('${esc(key)}',1)" ${idx===columns.length-1?'disabled':''} title="Вниз">▼</button>
      </div>
    </div>`;
  }).join('');
}

let _svoFieldPreviewTimeout = null;
function _renderSvoFieldPreviewDebounced() {
  clearTimeout(_svoFieldPreviewTimeout);
  _svoFieldPreviewTimeout = setTimeout(_renderSvoFieldPreview, 150);
}

function _renderSvoFieldPreview() {
  const container = document.getElementById('svoFieldPreview');
  if (!container || !_svoFieldSettings || !_svoBaseData) return;

  document.querySelectorAll('#svoFieldSettingsOverlay .dfs-name-input').forEach(inp => {
    const key = inp.dataset.fieldKey;
    if (key) _svoFieldSettings.names[key] = inp.value;
  });

  const visibleCols = _svoFieldSettings.columns.filter(c => _svoFieldSettings.visibility[c] !== false);
  const cardCols = visibleCols.filter(c => c !== '_status' && c !== '_worker' && c !== '_creator');
  const sampleLead = (_svoBaseData.leads || [])[0];

  if (!sampleLead) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3);font-size:13px">Нет данных для превью</div>';
    return;
  }

  let relatives = [];
  try { relatives = sampleLead.relatives_parsed || JSON.parse(sampleLead.relatives || '[]'); } catch(e) {}

  const decName = sampleLead.deceased_name || 'Фамилия Имя';
  const phoneVal = sampleLead.phones || '';
  const allPhones = phoneVal ? phoneVal.split(/[,;\s]+/).filter(p => p.replace(/\D/g,'').length >= 5) : [];

  const fieldRows = cardCols.filter(c => c !== 'deceased_name' && c !== 'phones').map(colKey => {
    const name = _svoFieldSettings.names[colKey] || colKey;
    let val = '';
    if (colKey === '_relatives') {
      val = relatives.map(r => (r.name||'') + (r.relationship ? ' ('+r.relationship+')' : '')).filter(Boolean).join(', ') || '—';
    } else {
      val = sampleLead[colKey] || '—';
    }
    const icon = colKey === 'region' ? '🗺️' : colKey === 'address' ? '📍' : colKey === '_relatives' ? '👥' : colKey === 'extra_info' ? '📝' : '📋';
    return { icon, label: name, val };
  });

  let html = `
    <div class="dfs-card-preview">
      <div class="dfs-card-hero">
        <div class="dfs-card-avatar">${decName[0].toUpperCase()}</div>
        <div class="dfs-card-hero-info">
          <div class="dfs-card-name">${esc(decName)}</div>
          <div class="dfs-card-meta">
            <span class="dfs-card-badge">ID: ${sampleLead.id}</span>
            <span class="dfs-card-badge dfs-card-badge-status">${sampleLead.status || 'new'}</span>
          </div>
        </div>
      </div>
      ${allPhones.length ? `
        <div class="dfs-card-phones">
          <span style="font-size:11px;color:var(--t3);font-weight:700">📱 Телефоны:</span>
          ${allPhones.slice(0, 3).map(p => `<span class="dfs-card-phone-chip">📞 ${esc(p)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="dfs-card-fields">
        ${fieldRows.length ? fieldRows.map(f => `
          <div class="dfs-card-field">
            <span class="dfs-card-field-icon">${f.icon}</span>
            <div class="dfs-card-field-body">
              <div class="dfs-card-field-label">${esc(f.label)}</div>
              <div class="dfs-card-field-value">${esc(f.val)}</div>
            </div>
          </div>
        `).join('') : '<div style="text-align:center;padding:12px;color:var(--t3);font-size:12px">Нет видимых полей</div>'}
      </div>
      <div class="dfs-card-actions">
        <span class="dfs-card-act dfs-card-act-red">❌ Не дозвон</span>
        <span class="dfs-card-act dfs-card-act-yellow">📞 Перезвон</span>
        <span class="dfs-card-act dfs-card-act-gray">⏭ Скип</span>
        <span class="dfs-card-act dfs-card-act-green">✅ Передал</span>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function closeSvoFieldSettings() {
  const ov = document.getElementById('svoFieldSettingsOverlay');
  if (ov) ov.remove();
}

function toggleSvoField(key) {
  if (!_svoFieldSettings) return;
  _svoFieldSettings.visibility[key] = !(_svoFieldSettings.visibility[key] !== false);
  _renderSvoFieldRows();
  _renderSvoFieldPreview();
  _renderSvoBaseView();
}

function renameSvoField(key, val) {
  if (!_svoFieldSettings) return;
  _svoFieldSettings.names[key] = val;
  _renderSvoFieldPreview();
  _renderSvoBaseView();
}

function moveSvoField(key, dir) {
  if (!_svoFieldSettings) return;
  const cols = _svoFieldSettings.columns;
  const idx = cols.indexOf(key);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cols.length) return;
  [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
  _renderSvoFieldRows();
  _renderSvoFieldPreview();
  _renderSvoBaseView();
}

function resetSvoFieldSettings() {
  if (!_svoBaseData || !confirm('Сбросить все настройки полей к значениям по умолчанию?')) return;
  const detected = _detectSvoBaseColumns(_svoBaseData);
  _svoFieldSettings = { columns: detected.map(c=>c.key), visibility: {}, names: {} };
  detected.forEach(c => { _svoFieldSettings.visibility[c.key] = true; _svoFieldSettings.names[c.key] = c.label; });
  _renderSvoFieldRows();
  _renderSvoFieldPreview();
  _renderSvoBaseView();
}

async function saveSvoFieldSettings() {
  if (!_svoBaseViewId || !_svoFieldSettings) return;
  try {
    const r = await fetch('/api/admin/bases/' + _svoBaseViewId + '/settings', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ field_settings: _svoFieldSettings })
    });
    if (r.ok) {
      showToast('✅ Настройки полей сохранены!', 'success');
      closeSvoFieldSettings();
    } else showToast('❌ Ошибка сохранения', 'error');
  } catch(e) { showToast('❌ Ошибка сети', 'error'); }
}

// ===== SVO LEAD EDIT / DELETE =====
async function editSvoLead(id) {
  let lead = null;
  if (_svoBaseData && _svoBaseData.leads) {
    lead = _svoBaseData.leads.find(l => l.id === id);
  }
  if (!lead) return showToast('❌ Лид не найден', 'error');
  let relatives = [];
  try { relatives = lead.relatives_parsed || JSON.parse(lead.relatives || '[]'); } catch(e){}
  const relStr = relatives.map(r => `${r.name||''} (${r.relationship||''}): ${r.phone||''}, ${r.address||''}`).join('\n');
  const fields = [
    { key:'deceased_name', label:'ФИО умершего', val:lead.deceased_name||'' },
    { key:'phones', label:'Телефоны', val:lead.phones||'' },
    { key:'address', label:'Адрес', val:lead.address||'' },
    { key:'region', label:'Регион', val:lead.region||'' },
    { key:'extra_info', label:'Доп. информация', val:lead.extra_info||'' },
  ];
  const statuses = ['new','no_answer','callback','passed','docs','skipped','other_person'];
  const overlay = document.createElement('div');
  overlay.className = 'dab-edit-overlay';
  overlay.innerHTML = `<div class="dab-edit-modal">
    <div class="dab-edit-head"><span>✏️ Редактировать лид #${id}</span><button onclick="this.closest('.dab-edit-overlay').remove()" class="dab-btn">✕</button></div>
    <div class="dab-edit-body">
      ${fields.map(f => `<div class="dab-edit-row"><label>${f.label}</label><input type="text" id="svoedit_${f.key}" value="${esc(f.val)}"></div>`).join('')}
      <div class="dab-edit-row"><label>Родственники (JSON)</label><textarea id="svoedit_relatives" rows="3" style="font-size:11px">${esc(lead.relatives||'[]')}</textarea></div>
      <div class="dab-edit-row"><label>Статус</label><select id="svoedit_status">${statuses.map(s => `<option value="${s}" ${lead.status===s?'selected':''}>${_svoStatusLabels[s]||s}</option>`).join('')}</select></div>
    </div>
    <div class="dab-edit-foot">
      <button class="btn-glow" onclick="saveSvoLead(${id},this)"><span>💾 Сохранить</span><div class="btn-shine"></div></button>
      <button class="dab-btn" onclick="this.closest('.dab-edit-overlay').remove()">Отмена</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function saveSvoLead(id, btn) {
  const data = {};
  ['deceased_name','phones','address','region','extra_info'].forEach(k => {
    const el = document.getElementById('svoedit_' + k);
    if (el) data[k] = el.value;
  });
  const relEl = document.getElementById('svoedit_relatives');
  if (relEl) {
    try { JSON.parse(relEl.value); data.relatives = relEl.value; } catch(e) { /* leave as is */ }
  }
  data.status = document.getElementById('svoedit_status').value;
  const r = await fetch('/api/admin/leads/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (r.ok) {
    showToast('✅ Лид обновлён', 'success');
    btn.closest('.dab-edit-overlay').remove();
    openSvoBase(_svoBaseViewId);
  } else showToast('❌ Ошибка', 'error');
}

async function deleteSvoLeadFromBase(id) {
  if (!confirm('Удалить лид?')) return;
  await fetch('/api/admin/leads/' + id, { method: 'DELETE' });
  showToast('Лид удалён', 'success');
  openSvoBase(_svoBaseViewId);
}

// Admin: Regions filter
async function loadAdminRegions() {
  const res = await fetch('/api/admin/regions');
  const regions = await res.json();
  const sel = document.getElementById('admRegionFilter');
  sel.innerHTML = '<option value="">Все регионы</option>' + regions.map(r => `<option value="${r}">${r}</option>`).join('');
}

// Admin: Stats — PREMIUM DASHBOARD
let chartTrend = null;
let currentStatsPeriod = 'all';
async function loadStats(period, btn) {
  if (period) currentStatsPeriod = period;
  // Update pill active state
  document.querySelectorAll('.rp-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else { const p = document.querySelector(`.rp-pill[onclick*="'${currentStatsPeriod}'"]`); if (p) p.classList.add('active'); }

  // Compute date range
  let url = '/api/admin/stats';
  const today = new Date();
  const fmt = d => d.toISOString().slice(0, 10);
  let labelText = '';

  if (currentStatsPeriod === 'today') {
    url += '?date=' + fmt(today);
    labelText = '📅 ' + today.toLocaleDateString('ru-RU');
  } else if (currentStatsPeriod === 'week') {
    const from = new Date(today); from.setDate(from.getDate() - 7);
    url += '?date_from=' + fmt(from) + '&date_to=' + fmt(today);
    labelText = '🗓 ' + from.toLocaleDateString('ru-RU') + ' — ' + today.toLocaleDateString('ru-RU');
  } else if (currentStatsPeriod === 'month') {
    const from = new Date(today); from.setMonth(from.getMonth() - 1);
    url += '?date_from=' + fmt(from) + '&date_to=' + fmt(today);
    labelText = '📆 ' + from.toLocaleDateString('ru-RU') + ' — ' + today.toLocaleDateString('ru-RU');
  } else {
    labelText = '📊 За всё время';
  }
  const periodLabel = document.getElementById('regionPeriodLabel');
  if (periodLabel) periodLabel.textContent = labelText;

  const res = await fetch(url);
  const data = await res.json();

  const sm = {};
  (data.totalByStatus || []).forEach(s => sm[s.status] = s.c);
  const total = data.totalLeads || 1;
  function pct(v) { return ((v / total) * 100).toFixed(1); }

  // === COMMAND CENTER CARDS ===
  const cc = document.getElementById('statsCommandCenter');
  const cards = [
    { icon:'📊', val:data.totalLeads, lbl:'ВСЕГО', pctVal:'100', accent:'linear-gradient(135deg,#4ade80,#22d3ee)', glow:'rgba(74,222,128,0.3)' },
    { icon:'🆕', val:sm.new||0, lbl:'НОВЫЕ', pctVal:pct(sm.new||0), accent:'linear-gradient(135deg,#60a5fa,#818cf8)', glow:'rgba(96,165,250,0.3)' },
    { icon:'✅', val:sm.passed||0, lbl:'ПЕРЕДАЛ', pctVal:pct(sm.passed||0), accent:'linear-gradient(135deg,#4ade80,#34d399)', glow:'rgba(74,222,128,0.3)' },
    { icon:'❌', val:sm.no_answer||0, lbl:'НЕ ДОЗВОН', pctVal:pct(sm.no_answer||0), accent:'linear-gradient(135deg,#f87171,#fb923c)', glow:'rgba(248,113,113,0.3)' },
    { icon:'📞', val:sm.callback||0, lbl:'ПЕРЕЗВОН', pctVal:pct(sm.callback||0), accent:'linear-gradient(135deg,#fb923c,#fbbf24)', glow:'rgba(251,146,60,0.3)' },
    { icon:'📄', val:sm.docs||0, lbl:'СРЕЗ', pctVal:pct(sm.docs||0), accent:'linear-gradient(135deg,#f472b6,#c084fc)', glow:'rgba(244,114,182,0.3)' },
    { icon:'⏭', val:sm.skipped||0, lbl:'СКИП', pctVal:pct(sm.skipped||0), accent:'linear-gradient(135deg,#94a3b8,#64748b)', glow:'rgba(148,163,184,0.3)' },
  ];
  cc.innerHTML = cards.map(c => `
    <div class="cmd-card" style="--card-accent:${c.accent};--card-glow:${c.glow}">
      <div class="cmd-card-icon">${c.icon}</div>
      <div class="cmd-card-val">${c.val}</div>
      <div class="cmd-card-lbl">${c.lbl}</div>
      <div class="cmd-card-pct">${c.pctVal}%</div>
      <div class="cmd-card-bar"><div class="cmd-card-bar-fill" style="width:0%"></div></div>
    </div>
  `).join('');
  // Animate bars
  setTimeout(() => {
    cc.querySelectorAll('.cmd-card-bar-fill').forEach((el, i) => {
      el.style.width = cards[i].pctVal + '%';
    });
  }, 100);

  // === CONVERSION FUNNEL ===
  const processed = (sm.passed||0) + (sm.no_answer||0) + (sm.callback||0) + (sm.docs||0) + (sm.skipped||0);
  const funnelData = [
    { lbl:'Всего лидов', val:data.totalLeads, bg:'rgba(96,165,250,0.15)', color:'#60a5fa' },
    { lbl:'Обработано', val:processed, bg:'rgba(251,146,60,0.15)', color:'#fb923c' },
    { lbl:'Передал', val:sm.passed||0, bg:'rgba(74,222,128,0.15)', color:'#4ade80' },
    { lbl:'Срез на доках', val:sm.docs||0, bg:'rgba(244,114,182,0.15)', color:'#f472b6' },
  ];
  const fc = document.getElementById('funnelContent');
  let funnelHtml = '';
  funnelData.forEach((step, i) => {
    const w = Math.max(30, 100 - i * 18);
    funnelHtml += `<div class="funnel-step" style="background:${step.bg};width:${w}%">
      <div class="funnel-step-val" style="color:${step.color}">${step.val}</div>
      <div class="funnel-step-lbl">${step.lbl}</div>
    </div>`;
    if (i < funnelData.length - 1) {
      const prev = funnelData[i].val || 1;
      const next = funnelData[i+1].val;
      const convPct = ((next / prev) * 100).toFixed(1);
      funnelHtml += `<div class="funnel-arrow">▼</div>
        <div class="funnel-conv">${convPct}% конверсия</div>`;
    }
  });
  fc.innerHTML = funnelHtml;

  // === TREND CHART (14 days) ===
  if (chartTrend) chartTrend.destroy();
  const trendDays = (data.days || []).slice().reverse();
  const trendLabels = trendDays.map(d => { const p = d.date.split('-'); return p[2]+'.'+p[1]; });
  const ctx = document.getElementById('chartTrend');
  if (ctx) {
    const gradient1 = ctx.getContext('2d').createLinearGradient(0,0,0,280);
    gradient1.addColorStop(0, 'rgba(74,222,128,0.3)');
    gradient1.addColorStop(1, 'rgba(74,222,128,0)');
    const gradient2 = ctx.getContext('2d').createLinearGradient(0,0,0,280);
    gradient2.addColorStop(0, 'rgba(248,113,113,0.2)');
    gradient2.addColorStop(1, 'rgba(248,113,113,0)');
    chartTrend = new Chart(ctx, {
      type:'line',
      data:{
        labels:trendLabels,
        datasets:[
          { label:'Передал', data:trendDays.map(d=>d['передал']||0), borderColor:'#4ade80', backgroundColor:gradient1, fill:true, tension:.4, pointRadius:3, pointBackgroundColor:'#4ade80', borderWidth:2 },
          { label:'Не дозвон', data:trendDays.map(d=>d['не_дозвон']||0), borderColor:'#f87171', backgroundColor:gradient2, fill:true, tension:.4, pointRadius:3, pointBackgroundColor:'#f87171', borderWidth:2 },
          { label:'Перезвон', data:trendDays.map(d=>d['перезвон']||0), borderColor:'#fb923c', fill:false, tension:.4, pointRadius:3, pointBackgroundColor:'#fb923c', borderWidth:2 },
          { label:'Срез', data:trendDays.map(d=>d['срез_на_доках']||0), borderColor:'#f472b6', fill:false, tension:.4, pointRadius:3, pointBackgroundColor:'#f472b6', borderWidth:2 },
          { label:'Создано', data:trendDays.map(d=>d.created||0), borderColor:'#818cf8', fill:false, tension:.4, pointRadius:3, pointBackgroundColor:'#818cf8', borderWidth:2, borderDash:[5,3] },
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        animation:{ duration:1500, easing:'easeOutQuart' },
        plugins:{ legend:{ labels:{ color:'#888', font:{ family:'Inter', size:11 }, usePointStyle:true, pointStyle:'circle' } } },
        scales:{
          x:{ ticks:{ color:'#555', font:{ family:'Inter', size:10 } }, grid:{ color:'rgba(255,255,255,0.03)' } },
          y:{ ticks:{ color:'#555', font:{ family:'Inter', size:10 } }, grid:{ color:'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // === WORKERS TABLE ===
  const wt = document.getElementById('statsWorkersTable');
  if (data.users && data.users.length) {
    const workers = data.users.map(u => {
      const ps = u['передал']||0, na = u['не_дозвон']||0, sk = u['скип_приветствие']||0, cb = u['перезвон']||0, dc = u['срез_на_доках']||0;
      const totalAct = ps+na+sk+cb+dc;
      const conv = totalAct > 0 ? ((ps/totalAct)*100) : 0;
      return { ...u, ps, na, sk, cb, dc, totalAct, conv };
    }).sort((a,b) => b.conv - a.conv);

    const maxAct = Math.max(...workers.map(w=>w.totalAct),1);

    wt.innerHTML = `<table class="workers-table"><thead><tr>
      <th>#</th><th>Работник</th><th>Создано</th><th>Передал</th><th>Не дозвон</th><th>Скип</th><th>Перезвон</th><th>Срез</th><th>% Конв.</th>
    </tr></thead><tbody>${workers.map((u,i) => {
      const fire = i < 3 ? '<span class="worker-fire">🔥</span>' : '';
      const convClass = u.conv >= 30 ? 'high' : u.conv >= 15 ? 'mid' : 'low';
      function cellBar(val, color) {
        const w = maxAct > 0 ? ((val/maxAct)*100) : 0;
        return `<div class="worker-cell-bar">
          <span class="worker-cell-num" style="color:${color}">${val}</span>
          <div class="worker-mini-bar"><div class="worker-mini-bar-fill" style="width:${w}%;background:${color}"></div></div>
        </div>`;
      }
      return `<tr>
        <td style="color:var(--t3);font-size:12px">${i+1}</td>
        <td><span class="worker-name">${fire}${esc(u.display_name)}</span></td>
        <td>${cellBar(u.created||0,'#818cf8')}</td>
        <td>${cellBar(u.ps,'#4ade80')}</td>
        <td>${cellBar(u.na,'#f87171')}</td>
        <td>${cellBar(u.sk,'#60a5fa')}</td>
        <td>${cellBar(u.cb,'#fb923c')}</td>
        <td>${cellBar(u.dc,'#f472b6')}</td>
        <td><span class="worker-conv ${convClass}">${u.conv.toFixed(1)}%</span></td>
      </tr>`;
    }).join('')}</tbody></table>`;
  }

  // === REGIONAL ANALYTICS TABLE ===
  const rh = document.getElementById('statsRegionHeat');
  const regionStats = data.regionStats || [];
  if (regionStats.length) {
    const maxTotal = Math.max(...regionStats.map(r => r.total), 1);
    rh.innerHTML = `<table class="workers-table">
      <thead><tr>
        <th>Регион</th><th>Всего</th><th style="color:#4ade80">✅ Передал</th><th style="color:#f87171">❌ Не дозвон</th><th style="color:#60a5fa">⏭ Скип</th><th style="color:#fb923c">📞 Перезвон</th><th style="color:#f472b6">📄 Срез</th><th>% Конв.</th>
      </tr></thead>
      <tbody>${regionStats.map(r => {
        const totalAct = r.passed + r.no_answer + r.skipped + r.callback + r.docs;
        const conv = totalAct > 0 ? ((r.passed / totalAct) * 100).toFixed(1) : '0.0';
        const convClass = parseFloat(conv) >= 30 ? 'high' : parseFloat(conv) >= 15 ? 'mid' : 'low';
        const barW = ((r.total / maxTotal) * 100).toFixed(1);
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:6px">
            <div style="width:${barW}%;min-width:3px;height:4px;border-radius:2px;background:linear-gradient(90deg,#4ade80,#22d3ee)"></div>
            <span class="worker-name">${esc(r.name)}</span>
          </div></td>
          <td style="font-weight:800;color:var(--t1)">${r.total}</td>
          <td style="color:#4ade80;font-weight:700">${r.passed}</td>
          <td style="color:#f87171;font-weight:700">${r.no_answer}</td>
          <td style="color:#60a5fa;font-weight:700">${r.skipped}</td>
          <td style="color:#fb923c;font-weight:700">${r.callback}</td>
          <td style="color:#f472b6;font-weight:700">${r.docs}</td>
          <td><span class="worker-conv ${convClass}">${conv}%</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } else {
    rh.innerHTML = '<p class="empty-msg">Нет данных по регионам</p>';
  }
}


// Admin: Leads
async function loadAdmLeads(status, btn) {
  currentAdmStatus = status;
  // Update pill bar active state
  document.querySelectorAll('#admStatusBar .al-pill').forEach(p => p.classList.remove('active'));
  if (btn && btn.classList) { btn.classList.add('active'); }
  else { const p = document.querySelector(`#admStatusBar .al-pill[data-status="${status || ''}"]`); if (p) p.classList.add('active'); }
  const region = document.getElementById('admRegionFilter')?.value || '';
  let url = '/api/admin/leads?';
  if (status) url += `status=${status}&`;
  if (region) url += `region=${encodeURIComponent(region)}&`;

  const res = await fetch(url);
  const leads = await res.json();
  const c = document.getElementById('admLeadsList');

  if (!leads.length) { c.innerHTML = '<p class="empty-msg">Нет лидов</p>'; return; }

  c.innerHTML = leads.map(l => {
    const phones = parsePhones(l.phones || '');
    let relatives = [];
    try { relatives = l.relatives_parsed || JSON.parse(l.relatives || '[]'); } catch (e) { }
    return `
      <div class="lead-card" id="adm-lead-${l.id}">
        <div class="lc-top">
          <span class="lc-name">☠️ ${esc(l.deceased_name)}</span>
          <span class="lc-badge ${l.status}">${statusText(l.status)}</span>
        </div>
        ${relatives.map(r => `<div class="lc-row"><span class="lc-label">Родств.</span>${esc(r.name)} (${esc(r.relationship || '')})</div>`).join('')}
        <div class="phone-chips">${phones.map(p => `<span class="pchip" onclick="copyPhone('${p}',this)">${formatPhone(p)}</span><button onclick="deleteSvoPhone(${l.id},'${p}')" style="width:18px;height:18px;border-radius:4px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:2px">🗑️</button>`).join('')}</div>
        <div class="lc-row"><span class="lc-label">Создал</span>${esc(l.creator_name)}</div>
        <div class="lc-row"><span class="lc-label">Назначен</span>${esc(l.assigned_name)}</div>
        ${l.region ? `<span class="lc-region">${esc(l.region)}</span>` : ''}
        ${l.actions && l.actions.length ? `
          <div class="action-log">${l.actions.map(a => `
            <div class="al-item">
              <span>${esc(a.user_name)}: ${a.action_type}${a.comment ? ' — «' + esc(a.comment) + '»' : ''}</span>
              <span>${formatDate(a.created_at)}</span>
            </div>
          `).join('')}</div>
        `: ''}
        <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
          <button class="act-btn b" style="padding:5px 12px;font-size:12px" onclick='openEditLeadModal(${JSON.stringify(l).replace(/'/g,"&#39;")})'>✏️ Редакт.</button>
          <button class="btn-del" style="font-size:12px" onclick="deleteAdmLead(${l.id})">🗑 Удалить</button>
        </div>
      </div>
    `;
  }).join('');
}

// Admin: open edit lead modal
function openEditLeadModal(lead) {
  document.getElementById('editLeadId').value = lead.id;
  document.getElementById('editLeadName').value = lead.deceased_name || '';
  document.getElementById('editLeadPhones').value = lead.phones || '';
  document.getElementById('editLeadAddress').value = lead.address || '';
  document.getElementById('editLeadRegion').value = lead.region || '';
  document.getElementById('editLeadExtra').value = lead.extra_info || '';
  document.getElementById('editLeadStatus').value = lead.status || 'new';
  document.getElementById('editLeadModal').classList.remove('hidden');
}

function closeEditLeadModal() {
  document.getElementById('editLeadModal').classList.add('hidden');
}

async function saveEditLead() {
  const id = document.getElementById('editLeadId').value;
  const res = await fetch(`/api/admin/leads/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deceased_name: document.getElementById('editLeadName').value,
      phones: document.getElementById('editLeadPhones').value,
      address: document.getElementById('editLeadAddress').value,
      region: document.getElementById('editLeadRegion').value,
      extra_info: document.getElementById('editLeadExtra').value,
      status: document.getElementById('editLeadStatus').value
    })
  });
  if (res.ok) {
    showToast('✅ Лид обновлён', 'success');
    closeEditLeadModal();
    loadAdmLeads(currentAdmStatus);
  } else {
    const err = await res.json();
    showToast('❌ ' + err.error, 'error');
  }
}

async function deleteAdmLead(id) {
  if (!confirm('Удалить этот лид? Это действие нельзя отменить.')) return;
  const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('🗑 Лид удалён', 'success');
    const card = document.getElementById(`adm-lead-${id}`);
    if (card) {
      card.style.transition = 'all .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => card.remove(), 300);
    }
  } else {
    showToast('❌ Ошибка удаления', 'error');
  }
}

// ===== BASE JSON UPLOAD (unified for admin + user) =====
let pendingBaseJsonLeads = [];
let pendingBaseJsonContext = 'admin'; // 'admin' or 'user'

function loadScript() {
  // No-op — removed
}

// Reusable validate + preview
function baseValidateAndPreview(leads, fileName, ctx) {
  pendingBaseJsonContext = ctx;
  const prefix = ctx === 'admin' ? 'baseJson' : 'userBaseJson';
  const errors = [];
  leads.forEach((l, i) => {
    if (!l.deceased_name) errors.push(`Лид #${i + 1}: отсутствует deceased_name`);
  });
  if (leads.length === 0) errors.push('Файл пустой — нет лидов');

  const valEl = document.getElementById(prefix + 'Validation');
  const prevEl = document.getElementById(prefix + 'Preview');
  const actEl = document.getElementById(prefix + 'Actions');

  if (errors.length > 0) {
    valEl.classList.remove('hidden');
    valEl.className = 'json-validation invalid';
    valEl.innerHTML = errors.join('<br>');
    if (prevEl) prevEl.classList.add('hidden');
    if (actEl) actEl.classList.add('hidden');
    pendingBaseJsonLeads = [];
    return;
  }

  pendingBaseJsonLeads = leads;
  valEl.classList.remove('hidden');
  valEl.className = 'json-validation valid';
  valEl.innerHTML = `✅ Файл «${esc(fileName)}» валиден — найдено <strong>${leads.length}</strong> лід(ів)`;

  if (prevEl) {
    prevEl.classList.remove('hidden');
    prevEl.innerHTML = `
      <div class="json-preview-head">👀 Превью (первые ${Math.min(leads.length, 10)} из ${leads.length})</div>
      <div class="json-preview-list">
        ${leads.slice(0, 10).map((l, i) => {
          let rels = Array.isArray(l.relatives) ? l.relatives : [];
          return `
            <div class="json-preview-item">
              <div class="json-pi-num">#${i + 1}</div>
              <div class="json-pi-body">
                <div class="json-pi-name">☠️ ${esc(l.deceased_name)}</div>
                ${rels.map(r => `<div class="json-pi-rel">👤 ${esc(r.name || '')} ${r.relationship ? '(' + esc(r.relationship) + ')' : ''} ${r.phone ? '📱 ' + esc(r.phone) : ''}</div>`).join('')}
                ${l.address ? `<div class="json-pi-addr">📍 ${esc(l.address)}</div>` : ''}
                ${l.region ? `<div class="json-pi-region">🗺 ${esc(l.region)}</div>` : ''}
              </div>
            </div>`;
        }).join('')}
        ${leads.length > 10 ? `<div class="json-pi-more">...и ещё ${leads.length - 10} лидов</div>` : ''}
      </div>`;
  }

  if (actEl) actEl.classList.remove('hidden');
}

// Admin base JSON: paste
function handleBaseJsonPaste() {
  const text = document.getElementById('baseJsonTextArea').value.trim();
  if (!text) { showToast('❌ Вставьте JSON текст', 'error'); return; }
  try {
    const raw = JSON.parse(text);
    const leads = Array.isArray(raw) ? raw : [raw];
    baseValidateAndPreview(leads, 'вставленный текст', 'admin');
  } catch (err) {
    const el = document.getElementById('baseJsonValidation');
    el.classList.remove('hidden');
    el.className = 'json-validation invalid';
    el.innerHTML = 'Ошибка парсинга JSON: ' + err.message;
  }
}

// Admin base JSON: file
function handleBaseJsonFile(input) {
  const file = input.files[0];
  if (!file) return;
  const nameInput = document.getElementById('baseNameJson');
  if (!nameInput.value) nameInput.value = file.name.replace(/\.json$/i, '');
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const raw = JSON.parse(e.target.result);
      const leads = Array.isArray(raw) ? raw : [raw];
      baseValidateAndPreview(leads, file.name, 'admin');
    } catch (err) {
      const el = document.getElementById('baseJsonValidation');
      el.classList.remove('hidden');
      el.className = 'json-validation invalid';
      el.innerHTML = 'Ошибка парсинга JSON: ' + err.message;
    }
  };
  reader.readAsText(file, 'utf-8');
}

// Admin base JSON: import
async function importBaseJson() {
  if (!pendingBaseJsonLeads.length) return;
  const btn = document.getElementById('btnImportBaseJson');
  btn.disabled = true;
  btn.querySelector('span').textContent = '⏳ Загружаю...';

  const autoRegion = document.getElementById('autoRegionToggle');
  const isAutoRegion = autoRegion && autoRegion.checked;
  const baseName = document.getElementById('baseNameJson').value.trim() || undefined;

  try {
    const res = await fetch('/api/upload-base-json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: isAutoRegion ? undefined : baseName,
        leads: pendingBaseJsonLeads,
        auto_region: isAutoRegion
      })
    });
    const data = await res.json();
    if (res.ok) {
      const resultEl = document.getElementById('baseJsonImportResult');
      resultEl.classList.remove('hidden');

      if (data.auto_region && data.regions) {
        const entries = Object.entries(data.regions).sort((a,b) => b[1].imported - a[1].imported);
        resultEl.innerHTML = `
          <div class="json-result-ok">
            <div class="json-result-icon">✅</div>
            <div class="json-result-text">
              Авто-группировка: <strong>${entries.length}</strong> регионов<br>
              Импортировано: <strong>${data.imported}</strong> | Дубликатов: <strong>${data.duplicates}</strong>
              <div style="margin-top:8px;font-size:12px;max-height:200px;overflow-y:auto">
                ${entries.map(([name, info]) => `
                  <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
                    <span>${info.is_new ? '🆕' : '📦'} ${esc(name)}</span>
                    <span style="color:#4ade80">+${info.imported}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>`;
      } else {
        resultEl.innerHTML = `
          <div class="json-result-ok">
            <div class="json-result-icon">✅</div>
            <div class="json-result-text">
              База «<strong>${esc(data.base_name || baseName || '')}</strong>» загружена<br>
              Импортировано: <strong>${data.imported}</strong> лидов<br>
              Дубликатов: <strong>${data.duplicates}</strong>
            </div>
          </div>`;
      }
      showToast(`✅ Загружено: ${data.imported} лидов`, 'success');
      document.getElementById('baseJsonActions').classList.add('hidden');
      loadBases();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch (e) {
    showToast('❌ Ошибка сети: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.querySelector('span').textContent = '🚀 Загрузить базу';
}

// Regroup all bases by region
async function regroupBases() {
  if (!confirm('🔄 Перегруппировать ВСЕ лиды по регионам?\n\n• Все лиды перегруппируются по областям\n• Старые пустые базы УДАЛЯТСЯ\n• Статусы, комментарии, история — сохранятся\n\nПродолжить?')) return;

  showToast('⏳ Перегруппировка...', 'info');
  try {
    const res = await fetch('/api/admin/regroup-bases', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      const entries = Object.entries(data.regions).sort((a,b) => b[1].total - a[1].total);
      let msg = `✅ Перегруппировано!\n\n📦 Регионов: ${entries.length}\n🔀 Перемещено лидов: ${data.moved}\n🗑 Удалено пустых баз: ${data.deleted_bases}`;
      if (data.deleted_names && data.deleted_names.length > 0) {
        msg += `\n\nУдалённые базы:\n${data.deleted_names.slice(0, 15).map(n => '  • ' + n).join('\n')}`;
        if (data.deleted_names.length > 15) msg += `\n  ... и ещё ${data.deleted_names.length - 15}`;
      }
      msg += `\n\nБазы по регионам:\n${entries.slice(0, 10).map(([n, r]) => '  📦 ' + n + ' — ' + r.total + ' лидов').join('\n')}`;
      if (entries.length > 10) msg += `\n  ... и ещё ${entries.length - 10} регионов`;
      alert(msg);
      showToast(`✅ ${entries.length} регионов, ${data.moved} лидов перемещено`, 'success');
      loadBases();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch (e) {
    showToast('❌ Ошибка: ' + e.message, 'error');
  }
}

function clearBaseJsonImport() {
  pendingBaseJsonLeads = [];
  const fileInput = document.getElementById('baseJsonFileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('baseNameJson').value = '';
  document.getElementById('baseJsonTextArea').value = '';
  ['baseJsonValidation', 'baseJsonPreview', 'baseJsonActions', 'baseJsonImportResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// User base JSON: file
function handleUserBaseJsonFile(input) {
  const file = input.files[0];
  if (!file) return;
  const nameInput = document.getElementById('userBaseNameJson');
  if (!nameInput.value) nameInput.value = file.name.replace(/\.json$/i, '');
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const raw = JSON.parse(e.target.result);
      const leads = Array.isArray(raw) ? raw : [raw];
      baseValidateAndPreview(leads, file.name, 'user');
    } catch (err) {
      const el = document.getElementById('userBaseJsonValidation');
      el.classList.remove('hidden');
      el.className = 'json-validation invalid';
      el.innerHTML = 'Ошибка парсинга JSON: ' + err.message;
    }
  };
  reader.readAsText(file, 'utf-8');
}

// User base JSON: import
async function importUserBaseJson() {
  if (!pendingBaseJsonLeads.length) return;
  const baseName = document.getElementById('userBaseNameJson').value.trim() || undefined;

  try {
    const res = await fetch('/api/upload-base-json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: baseName, leads: pendingBaseJsonLeads })
    });
    const data = await res.json();
    if (res.ok) {
      const resultEl = document.getElementById('userBaseJsonResult');
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <div class="json-result-ok">
          <div class="json-result-icon">✅</div>
          <div class="json-result-text">
            База «<strong>${esc(data.base_name || '')}</strong>» загружена<br>
            Импортировано: <strong>${data.imported}</strong> лідів<br>
            Дублікатів: <strong>${data.duplicates}</strong>
          </div>
        </div>`;
      showToast(`✅ База загружена: ${data.imported} лідів`, 'success');
      document.getElementById('userBaseJsonActions').classList.add('hidden');
    } else {
      showToast('❌ ' + (data.error || 'Помилка'), 'error');
    }
  } catch (e) {
    showToast('❌ Помилка мережі: ' + e.message, 'error');
  }
}

function clearUserBaseJsonImport() {
  pendingBaseJsonLeads = [];
  const fileInput = document.getElementById('userBaseJsonFileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('userBaseNameJson').value = '';
  ['userBaseJsonValidation', 'userBaseJsonPreview', 'userBaseJsonActions', 'userBaseJsonResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// Download JSON template
function downloadJsonTemplate() {
  const template = [
    {
      "deceased_name": "Иванов Иван Иванович",
      "relatives": [
        { "name": "Иванова Мария Петровна", "relationship": "Жена", "phone": "79001234567", "address": "г. Москва, ул. Ленина, д. 1" },
        { "name": "Иванов Петр Иванович", "relationship": "Сын", "phone": "79009876543", "address": "" }
      ],
      "phones": "79001234567",
      "address": "г. Москва, ул. Ленина, д. 1",
      "extra_info": "",
      "region": "Москва"
    },
    {
      "deceased_name": "Петров Петр Петрович",
      "relatives": [
        { "name": "Петрова Анна Сергеевна", "relationship": "Дочь", "phone": "79112223344", "address": "" }
      ],
      "phones": "79112223344",
      "address": "",
      "extra_info": "",
      "region": "Санкт-Петербург"
    }
  ];
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'шаблон_базы.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Шаблон скачан', 'success');
}

// Old JSON import functions (kept for backward compat, redirect to base upload)
let pendingJsonLeads = [];
function handleJsonPaste() { handleBaseJsonPaste(); }
function handleJsonFile(input) { handleBaseJsonFile(input); }
function validateAndPreview(leads, fileName) { baseValidateAndPreview(leads, fileName, 'admin'); }
function showJsonValidation(ok, msg) {
  const el = document.getElementById('baseJsonValidation');
  if (!el) return;
  el.classList.remove('hidden');
  el.className = 'json-validation ' + (ok ? 'valid' : 'invalid');
  el.innerHTML = msg;
}
function hideEl(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function importJsonLeads() { importBaseJson(); }
function clearJsonImport() { clearBaseJsonImport(); }

// Drag and drop support for admin base upload zone
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    ['baseJsonUploadZone', 'userBaseJsonUploadZone'].forEach(zoneId => {
      const zone = document.getElementById(zoneId);
      if (!zone) return;
      ['dragenter', 'dragover'].forEach(evt => zone.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(evt => zone.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover');
      }));
      zone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
          const isUser = zoneId.includes('user');
          const inputId = isUser ? 'userBaseJsonFileInput' : 'baseJsonFileInput';
          const input = document.getElementById(inputId);
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          if (isUser) handleUserBaseJsonFile(input);
          else handleBaseJsonFile(input);
        } else {
          showToast('❌ Только .json файлы', 'error');
        }
      });
    });
  }, 500);
});

// ===== PHONE UTILS =====
function parsePhones(raw) {
  if (!raw) return [];
  const cleaned = raw.replace(/\+/g, '');
  const matches = cleaned.match(/[78]?\d{10}/g);
  if (matches) {
    return [...new Set(matches.map(m => {
      if (m.length === 11 && (m[0] === '7' || m[0] === '8')) return '7' + m.slice(1);
      if (m.length === 10) return '7' + m;
      return m;
    }))];
  }
  return raw.split(/[\s,;]+/).filter(Boolean);
}

function formatPhone(p) {
  if (p.length === 11) return `+${p[0]} (${p.slice(1, 4)}) ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}`;
  return p;
}

// Rich phone parser: "79629484008,97%,🏛; 79190866504,28%" → [{number, pct, icon}]
function parsePhonesRich(raw) {
  if (!raw) return [];
  const parts = raw.split(/;/).map(s => s.trim()).filter(Boolean);
  const result = [];
  for (const part of parts) {
    const chunks = part.split(',').map(s => s.trim());
    let number = '', pct = 0, icon = '';
    for (const ch of chunks) {
      if (ch.match(/^\d{10,11}$/)) {
        number = ch;
        if (number.length === 11 && (number[0]==='7'||number[0]==='8')) number = '7' + number.slice(1);
        else if (number.length === 10) number = '7' + number;
      } else if (ch.match(/\d+%/)) {
        pct = parseInt(ch);
      } else if (ch.replace(/[\s\d%,]/g, '').length > 0) {
        icon = ch.replace(/[\d%\s]/g, '').trim();
      }
    }
    if (number) result.push({ number, pct, icon });
  }
  // Fallback: if rich parse found nothing, use old parser
  if (result.length === 0) {
    return parsePhones(raw).map(p => ({ number: p, pct: 0, icon: '' }));
  }
  return result;
}

// Render a phone chip with % color coding
function renderPhoneChipRich(p, leadId) {
  const pctColor = p.pct >= 80 ? '#4ade80' : p.pct >= 50 ? '#fbbf24' : p.pct >= 20 ? '#fb923c' : '#f87171';
  const pctBg = p.pct >= 80 ? 'rgba(74,222,128,0.12)' : p.pct >= 50 ? 'rgba(251,191,36,0.12)' : p.pct >= 20 ? 'rgba(251,146,60,0.12)' : 'rgba(248,113,113,0.12)';
  const pctBorder = p.pct >= 80 ? 'rgba(74,222,128,0.25)' : p.pct >= 50 ? 'rgba(251,191,36,0.25)' : p.pct >= 20 ? 'rgba(251,146,60,0.25)' : 'rgba(248,113,113,0.25)';
  const pctBadge = p.pct > 0 ? `<span style="font-size:10px;font-weight:800;color:${pctColor};margin-left:4px;padding:1px 5px;border-radius:4px;background:${pctBg}">${p.pct}%</span>` : '';
  const iconBadge = p.icon ? `<span style="font-size:12px;margin-left:3px" title="Метка">${p.icon}</span>` : '';

  return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0">
    <span class="pchip-lg" onclick="copyPhone('${p.number}',this)" style="border-color:${pctBorder};background:${pctBg}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      ${formatPhone(p.number)}
    </span>${pctBadge}${iconBadge}
    <button onclick="deleteSvoPhone(${leadId},'${p.number}')" title="Удалить номер" style="width:22px;height:22px;border-radius:6px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">🗑️</button>
    <span class="phone-info" data-phone="${p.number}" style="font-size:10px;color:var(--t3);margin-left:4px">⏳</span>
  </div>`;
}

async function copyPhone(phone, el) {
  try { await navigator.clipboard.writeText(phone); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = phone; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
  el.style.background = 'rgba(74,222,128,0.15)'; el.style.borderColor = 'rgba(74,222,128,0.3)'; el.style.color = '#4ade80';
  setTimeout(() => { el.style.background = ''; el.style.borderColor = ''; el.style.color = ''; }, 800);
  showToast('📋 Скопировано: +' + phone, 'info');
}

// ===== HELPERS =====
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function statusText(s) { return { new: 'Новый', no_answer: 'Не дозвон', callback: 'Перезвон', passed: 'Передал', docs: 'Доки', skipped: 'Скип' }[s] || s; }
function formatDate(dt) { if (!dt) return ''; const d = new Date(dt); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function showToast(msg, type = '') { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast ' + type; t.offsetHeight; t.classList.add('show'); setTimeout(() => { t.classList.remove('show'); }, 2500); }

// ===== HIMERA PROBIV =====
let lastProbivResult = null;

async function loadHimeraSettings() {
  try {
    const res = await fetch('/api/admin/himera-settings');
    if (res.ok) {
      const data = await res.json();
      const userEl = document.getElementById('himeraUsername');
      const passEl = document.getElementById('himeraPassword');
      const urlEl = document.getElementById('himeraBaseUrl');
      if (userEl) userEl.value = data.username || '';
      if (passEl) passEl.value = data.password || '';
      if (urlEl) urlEl.value = data.base_url || 'https://himera-search.biz';
    }
  } catch (e) { }
}

async function saveHimeraSettings() {
  const username = document.getElementById('himeraUsername').value.trim();
  const password = document.getElementById('himeraPassword').value.trim();
  const base_url = document.getElementById('himeraBaseUrl').value.trim();
  const res = await fetch('/api/admin/himera-settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, base_url })
  });
  if (res.ok) showToast('Настройки сохранены', 'success');
  else showToast('Ошибка сохранения', 'error');
}

async function runProbiv(e) {
  e.preventDefault();
  const lastname = document.getElementById('probivLastname').value.trim();
  const firstname = document.getElementById('probivFirstname').value.trim();
  const middlename = document.getElementById('probivMiddlename').value.trim();
  const birthday = document.getElementById('probivBirthday').value.trim();
  if (!lastname || !firstname || !birthday) {
    showToast('Заполните фамилию, имя и дату рождения', 'error');
    return;
  }
  const btn = document.getElementById('probivBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Идёт пробив...';
  const resultsDiv = document.getElementById('probivResults');
  resultsDiv.style.display = 'block';
  const stepsDiv = document.getElementById('probivSteps');
  stepsDiv.innerHTML = '<div class="probiv-step loading"><span class="step-icon">...</span> <span>Шаг 1: Получение телефонов...</span></div><div class="probiv-step pending"><span class="step-icon">...</span> <span>Шаг 2: Получение адресов...</span></div><div class="probiv-step pending"><span class="step-icon">...</span> <span>Шаг 3: Пробив адресов</span></div><div class="probiv-step pending"><span class="step-icon">...</span> <span>Шаг 4: Определение родственников</span></div>';
  ['probivTarget', 'probivPhones', 'probivAddresses', 'probivRelatives', 'probivCreateLead'].forEach(function(id) {
    document.getElementById(id).style.display = 'none';
  });
  try {
    var res = await fetch('/api/admin/probiv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastname: lastname, firstname: firstname, middlename: middlename, birthday: birthday })
    });
    var data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Ошибка', 'error');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Пробить';
      return;
    }
    lastProbivResult = data;
    renderProbivResults(data);
  } catch (e) {
    showToast('Ошибка сети: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.querySelector('span').textContent = 'Пробить';
}

function renderProbivResults(data) {
  // Steps
  const stepsDiv = document.getElementById('probivSteps');
  stepsDiv.innerHTML = (data.steps || []).map(s => {
    const icon = s.status === 'done' ? '✅' : s.status === 'error' ? '❌' : '⏳';
    const cls = s.status === 'done' ? 'done' : s.status === 'error' ? 'error' : 'loading';
    const countStr = s.count !== undefined ? ` — найдено: <strong>${s.count}</strong>` : '';
    const errStr = s.error ? ` <span class="step-error">(${esc(s.error)})</span>` : '';
    return `<div class="probiv-step ${cls}"><span class="step-icon">${icon}</span> <span>${esc(s.name)}${countStr}${errStr}</span></div>`;
  }).join('');

  // Target
  const targetDiv = document.getElementById('probivTarget');
  if (data.target) {
    targetDiv.style.display = 'block';
    targetDiv.innerHTML = `
      <div class="card-head"><span class="card-icon">👤</span> Объект пробива</div>
      <div class="probiv-target-info">
        <div class="probiv-target-name">${esc(data.target.fullName)}</div>
        <div class="probiv-target-dob">📅 ${esc(data.target.birthday)}</div>
      </div>
    `;
  }

  // Phones
  const phonesDiv = document.getElementById('probivPhones');
  if (data.phones && data.phones.length > 0) {
    phonesDiv.style.display = 'block';
    const phones = data.phones.map(p => typeof p === 'string' ? p : (p.phone || p.number || JSON.stringify(p)));
    phonesDiv.innerHTML = `
      <div class="card-head"><span class="card-icon">📱</span> Телефоны (${phones.length})</div>
      <div class="lcf-phones">
        ${phones.map(p => `
          <span class="pchip-lg" onclick="copyPhone('${esc(p)}',this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            ${esc(p)}
          </span>
        `).join('')}
      </div>
    `;
  }
}
// ===== MASCOT SYSTEM - STICKER + BORODACOIN =====
var MASCOT_PHRASES = {
  soldier: [
    'Рота подъём! Хватит сидеть — звони!',
    'В бою не бывает перерывов. Набирай номер, боец!',
    'Анекдот: Звонит менеджер клиенту. — Алло? — Алло! — Это прачечная? — Нет, это call-center. — А какая разница? Вы тоже всех отжимаете!',
    'Сержант говорит: "Лучшая атака — холодный звонок в 9 утра!"',
    'Слабые сдаются после 3-го "нет". Сильные — после 33-го!',
    'Солдат! Твоя конверсия — это твой послужной список!',
    'Анекдот: — Сколько звонков ты сделал? — Три! — Три?! Это же меньше, чем пальцев на руке! — Так я же ещё и обедал!',
    'Запомни: каждый "нет" — это шаг к "да"!',
    'Боец, передал трубку — получил коины. Война войной, а экономика по расписанию!',
    'Совет дня: говори уверенно, как будто ты генерал, а не рядовой!',
    'Анекдот: Менеджер звонит: — Здравствуйте, вас беспокоит... — Да, вы меня уже беспокоите!',
    'Не бойся отказов — бойся не позвонить!',
    'За каждую переданную трубку — 10 коинов. Это тебе не картошку чистить!',
    'Тактика: сначала улыбнись, потом набери номер. Улыбка слышна по телефону!',
    'Рядовой, доложи обстановку! Сколько передач сегодня?'
  ],
  donatello: [
    'Ковабанга! Время звонить!',
    'Мой бо-посох помогает мне набирать номера быстрее!',
    'Анекдот: Почему черепашки-ниндзя хорошие менеджеры? Потому что они никогда не прячутся в панцирь от клиентов!',
    'Факт: средний менеджер делает 50 звонков в день. Ты уже сделал свои?',
    'Я Донателло — самый умный из черепах. И я говорю: ЗВОНИ!',
    'Совет: используй паузу в разговоре — дай клиенту подумать.',
    'Анекдот: — Алло, это пиццерия? — Нет, это CRM! — А пиццу закажешь?',
    'Знаешь, что общего у ниндзя и менеджера? Оба действуют незаметно, но результативно!',
    'По моим расчётам, тебе нужно ещё 3 звонка до передачи!',
    'Мастер Сплинтер учил: терпение — ключ к успеху. И к продажам тоже!',
    'Факт: 80% продаж происходят после 5-го контакта. Не сдавайся!',
    'Анекдот: Черепашка пришла в офис. — Вы опоздали! — Я же черепашка...',
    'Техно-совет: слушай больше, говори меньше. Клиент сам расскажет что ему нужно!',
    'Коины копятся как пицца в холодильнике — незаметно, но приятно!',
    'Хей, братан! Давай сделаем ещё пару звонков и закажем пиццу!'
  ],
  major: [
    'СМИРНО! Доложить количество звонков!',
    'Майор не просит — майор приказывает: ЗВОНИ!',
    'Анекдот: — Товарищ майор, а можно домой пораньше? — Можно. Но только после 50 звонков!',
    'Приказ №1: Каждый час — минимум 10 звонков!',
    'Дисциплина — основа успеха. И в армии, и в продажах!',
    'Отставить лень! Берём трубку и набираем!',
    'Анекдот: Майор спрашивает менеджера: — Почему 0 передач? — Так обед же! — ОБЕД?! Обед у тех, кто передал!',
    'Я слежу за твоей конверсией. Не разочаруй меня!',
    'Совет от майора: краткость — сестра таланта. Говори по делу!',
    'РАВНЯЙСЬ! На лучших менеджеров ровняйся!',
    'Анекдот: — Товарищ майор, клиент бросил трубку! — Поднять и перезвонить! Это приказ!',
    'За безделье — наряд вне очереди! А у нас — минус коины!',
    'Настоящий офицер не боится холодных звонков!',
    'Приказываю: улыбаться при звонке! Это повышает конверсию на 20%!',
    'В моём подразделении нет слова "не могу". Есть "так точно"!'
  ],
  splinter: [
    'Терпение, мой ученик. Каждый звонок — это урок.',
    'Мудрость: не тот силён, кто много звонит, а тот, кто звонит правильно.',
    'Анекдот: Учитель спрашивает ученика: — Что самое сложное в продажах? — Встать утром, сенсей!',
    'Помни: вода точит камень не силой, а постоянством. Так и ты — звони!',
    'Старая мудрость: клиент, который сказал "нет" сегодня, скажет "да" завтра.',
    'Совет мастера: дыши глубоко перед звонком. Спокойствие — твоя сила.',
    'Анекдот: — Сенсей, сколько звонков нужно для просветления? — Столько, сколько нужно, мой ученик!',
    'Я горжусь тобой. Каждый твой звонок — это путь воина.',
    'Мудрость дня: лучший менеджер — тот, кто слушает, а не говорит.',
    'В каждом отказе скрыта возможность. Научись её видеть.',
    'Анекдот: Мастер говорит ученику: — Закрой глаза и представь... что клиент сказал "да"! — Сенсей, это медитация? — Нет, это визуализация успеха!',
    'Коины — это не цель. Цель — мастерство. Коины придут сами.',
    'Путь в тысячу звонков начинается с одного.',
    'Терпение и труд всё перетрут. Особенно план продаж!',
    'Настоящий ниндзя продаж не показывает своего мастерства — клиент сам всё покупает.'
  ],
  vader: [
    'Я чувствую твой страх перед звонком... Это бесполезно!',
    'Тёмная сторона продаж — мощнее, чем ты думаешь!',
    'Анекдот: — Лорд Вейдер, клиент отказался! — Я нахожу ваш недостаток веры... ожидаемым.',
    'Присоединяйся к тёмной стороне — у нас есть коины!',
    'Звони или не звони. Не пытайся — делай!',
    'Я твой менеджер! Нееет! — Поищи в себе... конверсию!',
    'Анекдот: Дарт Вейдер в call-центре: — Алло, это Люк? — Нет! — Тогда я ваш отец... вашего будущего заказа!',
    'Сила в тебе, юный продавец. Используй её!',
    'Каждый отказ делает тебя сильнее... Добро пожаловать на тёмную сторону!',
    'Империя нуждается в твоих передачах!',
    'Анекдот: — Лорд Вейдер, почему вы всегда в маске? — Чтобы клиенты не видели мою улыбку при закрытии сделки!',
    'Не недооценивай силу холодного звонка!',
    'Судьба привела тебя в этот CRM. Не разочаровывай Императора!',
    'Дышу тяжело... потому что жду твою следующую передачу!',
    'Тёмная сторона коинов — это когда ты тратишь их все на талисманы!'
  ],
  bmw: [
    'Бип-бип! Время разгоняться — звони быстрее!',
    'Знаешь, что общего у BMW и менеджера? Оба набирают скорость!',
    'Анекдот: — Почему BMW лучший менеджер? — Потому что у него всегда полный привод к клиенту!',
    'Мой мотор работает на коинах! Заправь меня передачами!',
    'Скорость — это жизнь! Не тормози — звони!',
    'Факт: водители BMW обгоняют всех. И менеджеры с BMW тоже!',
    'Анекдот: BMW заехал в офис. — Вы куда? — Помогать с продажами! — Но вы же машина! — Зато какая!',
    'Дрифтую по базе клиентов — вжжж!',
    'Совет от БМВ: как и на трассе, в продажах нужно обгонять конкурентов!',
    'У меня 300 лошадиных сил. А у тебя сколько звонков?',
    'Анекдот: — Какой у тебя разгон до 100? — До 100 звонков? К обеду!',
    'Включай поворотник... хотя, я же BMW — поворотники не для нас!',
    'Вруум! Каждая передача — это +10 коинов в мой бак!',
    'Легендарная тачка — легендарные результаты!',
    'Не паркуйся на месте — гони к следующему клиенту!'
  ],
  vodovoz: [
    'Эй, водичку будешь? Нет? Тогда ЗВОНИ!',
    'Я вожу воду, ты возишь клиентов — мы команда!',
    'Анекдот: Водовоз приходит на работу. — Ты кто? — Я тот, кто выжимает максимум! Из воды и из клиентов!',
    'Без воды не проживёшь, без звонков не заработаешь!',
    'Моя зарплата как моя вода — чистая, но её нет!',
    'Совет: как вода в стакан, так и слова в уши клиента — понемногу!',
    'Анекдот: — Почему водовоз работает в CRM? — Потому что он знает, как наливать людям!',
    'Каждая передача — это глоток свежей воды в пустыне!',
    'Я без ЗП, но с коинами — вот это поворот!',
    'Вода камень точит, а я точу план продаж!',
    'Анекдот: — Сколько воды ты привёз? — Столько же, сколько ты звонков сделал — ноль!',
    'Наливай, не стесняйся! Коины текут рекой!',
    'Факт: 70% человека — вода. 100% менеджера — звонки!',
    'Буль-буль-буль... это звук твоих коинов на счету!',
    'Водовоз без ЗП, но с мечтой — стать лучшим менеджером!'
  ],
  wolf: [
    'Волки не спят — волки ЗВОНЯТ!',
    'Я волк на миллион долларов, а ты?',
    'Анекдот: Волк приходит на планёрку. — Сколько передач? — Я один, но стою целой стаи!',
    'В стае побеждает сильнейший. Докажи что это ТЫ!',
    'Уолл-стрит? Нет, это Call-стрит!',
    'Совет волка: не будь овцой — будь хищником продаж!',
    'Анекдот: — Почему волк лучший менеджер? — Потому что он всегда голодный до результата!',
    'Мой инстинкт подсказывает: следующий звонок — передача!',
    'Стая сильна волком, офис силён менеджером!',
    'Волк не охотится на мышей — волк охотится на КЛИЕНТОВ!',
    'Анекдот: Волк звонит овце: — Здравствуйте! — ААААА! — Подождите, я из CRM...',
    'Миллион долларов начинается с одного звонка!',
    'Я не злой — я результативный!',
    'Холодный звонок? Для волка все звонки горячие!',
    'Аууу! Это вой победы после передачи!'
  ],
  devil: [
    'Добро пожаловать в ад продаж! 🔥',
    'Продай душу... нет, подожди — продай тарифный план!',
    'Анекдот: Дьявол звонит клиенту: — Хотите заключить сделку? — С кем? — Со мной! Условия адские!',
    'В аду нет перерывов — только бесконечные звонки!',
    'Моя корона — за конверсию. А твоя?',
    'Совет дьявола: будь обаятельным — так легче соблазнить клиента!',
    'Анекдот: — Что горячее: ад или мой список клиентов? — Твои уши после 8 часов звонков!',
    'Грехов много, но самый страшный — не выполнить план!',
    'Пламя в моих глазах — это жажда продаж!',
    'Контракт подписан кровью? Нет, коинами!',
    'Анекдот: Дьявол на планёрке: — Кто последний по передачам? — Я... — В котёл его!',
    'Адская мотивация: продай или гори!',
    'Даже в аду есть KPI. И у тебя тоже!',
    'Мои рога — символ упрямства. Никогда не сдаюсь!',
    'Душу не продаю, но коины принимаю!'
  ],
  bear: [
    'РРРР! Медведь проснулся — пора звонить!',
    'В России медведь — царь. В CRM — тоже Я!',
    'Анекдот: Медведь пришёл на собеседование. — Опыт? — Я 20 лет наводил ужас в лесу. — Подходит! Вы наш новый менеджер!',
    'Силой медведя — сломаю любой отказ!',
    'Ушанка на голове, план в сердце!',
    'Совет Мишутки: рычи уверенно в трубку — клиенты уважают силу!',
    'Анекдот: — Мишутка, ты почему рычишь на клиентов? — Это мой голос продаж!',
    'Зимой медведь спит, а летом — ПРОДАЁТ!',
    'Золотые зубы — признак успешного менеджера!',
    'Тайга научила: будь терпеливым и жди свою передачу!',
    'Анекдот: Медведь в офисе: — Почему все разбегаются? — Наверное, мой одеколон...',
    'Моя лапа — как печать одобрения на каждой сделке!',
    'РРРР! Это звук моей мотивации!',
    'Медвежья хватка — вот что нужно в продажах!',
    'Братан, давай жахнем по базе — покажем кто тут главный зверь!'
  ],
  knight: [
    'За честь и продажи! Вперёд!',
    'Мой меч — это мой голос. Мой щит — мой скрипт!',
    'Анекдот: Рыцарь звонит клиенту: — Прекрасная дама, не желаете ли...? — Я мужчина! — Прекрасный мужчина!',
    'Во имя короля — выполни план!',
    'Доблесть рыцаря — в количестве передач!',
    'Совет рыцаря: защищай клиента как свой замок!',
    'Анекдот: — Сэр рыцарь, ваш конь готов? — Какой конь? У меня только гарнитура и вера в себя!',
    'Клятва рыцаря: ни одного пропущенного звонка!',
    'Мои доспехи — от отказов, мой меч — от лени!',
    'В крестовый поход за клиентами!',
    'Анекдот: Рыцарь после смены: — Сколько драконов победил? — Драконов ноль, но 5 передач!',
    'Благородство — звонить первым!',
    'За круглым столом обсуждаем KPI!',
    'Честь рыцаря — его конверсия!',
    'Вперёд, во славу BorodaCoin!'
  ],
  reaper: [
    'Тик-так... Время твоего плана истекает...',
    'Я пришёл не за душой — я пришёл за твоей конверсией!',
    'Анекдот: Смерть звонит клиенту: — Ваше время пришло! — Для чего? — Для выгодного предложения!',
    'Моя коса жнёт не колосья, а отказы!',
    'Даже смерть делает холодные звонки...',
    'Совет: не бойся — бояться должны те, кто не звонит!',
    'Анекдот: — Почему Смерть работает в CRM? — Потому что у неё УБИЙСТВЕННАЯ конверсия!',
    'Каждый непозвонённый номер — потерянная душа...',
    'Тьма не страшна, страшен пустой список передач!',
    'Я собираю не души, а BorodaCoins!',
    'Анекдот: Жнец на планёрке: — Какие планы? — Как обычно... убить план продаж!',
    'Мой капюшон скрывает улыбку — потому что ты звонишь!',
    'Шёпот из тьмы: набери следующий номер...',
    'Неизбежность — как смерть и налоги. И звонки!',
    'Зелёный свет моих глаз — это свет надежды на передачу!'
  ]
};

var MASCOTS = [
  { id:'soldier', img:'/mascots/sold.webp', name:'Soldier', price:150, rarity:'Common',
    personality:'You are a tough Russian soldier-motivator in a call-center CRM. You speak Russian. You make military jokes, give battle-style motivation to sell, and tell funny army anecdotes related to phone sales. Be funny, energetic, use military slang. Max 2 sentences.' },
  { id:'donatello', img:'/mascots/doni.webp', name:'Donatelo', price:200, rarity:'Common',
    personality:'You are Donatello the ninja turtle working in a CRM call-center. You speak Russian. You make nerdy jokes, give smart sales tips, reference pizza and ninja stuff. Be witty and fun. Max 2 sentences.' },
  { id:'major', img:'/mascots/mai.webp', name:'Major', price:270, rarity:'Uncommon',
    personality:'You are a strict Russian military major commanding a sales team in CRM. You speak Russian. You give orders, demand results, make drill-sergeant style jokes about lazy workers. Be strict but funny. Max 2 sentences.' },
  { id:'splinter', img:'/mascots/splinter.webp', name:'Splinter', price:300, rarity:'Rare',
    personality:'You are Master Splinter the wise rat sensei in a CRM. You speak Russian. You give zen-like wisdom about sales, tell philosophical jokes, give calm motivational advice with martial arts metaphors. Be wise and warm. Max 2 sentences.' },
  { id:'vader', img:'/mascots/weider.webp', name:'Vader', price:350, rarity:'Epic',
    personality:'You are Darth Vader working in a CRM call-center. You speak Russian. You make dark side jokes about sales, reference Star Wars, breathe heavily, and intimidate workers to sell more. Be menacing but hilarious. Max 2 sentences.' },
  { id:'bmw', img:'/mascots/bmw.webp', name:'BMW', price:650, rarity:'Legendary',
    personality:'You are a sentient BMW M3 car working in a CRM. You speak Russian. You make car/speed jokes about sales, use racing metaphors, reference driving and speed. You say vroom-vroom. Be cool and fast. Max 2 sentences.' },
  { id:'vodovoz', img:'/mascots/Водовоз без ЗП.webp', name:'Водовоз', price:400, rarity:'Epic',
    personality:'You are a funny Russian water delivery guy working in CRM without salary. You speak Russian. You make water jokes, complain about no salary but love coins, compare water delivery to sales. Be self-deprecating and hilarious. Max 2 sentences.' },
  { id:'wolf', img:'/mascots/Волк на 1 Милион Доларов.webp', name:'Волк', price:800, rarity:'Legendary',
    personality:'You are the Wolf of Wall Street but Russian version in CRM. You speak Russian. You make money jokes, motivate aggressively to sell, reference million dollar deals and luxury life. Be alpha and intense. Max 2 sentences.' },
  { id:'devil', img:'/mascots/Дявол.webp', name:'Дьявол', price:900, rarity:'Ultra',
    personality:'You are the Devil himself working in CRM. You speak Russian. You make hell/sin jokes about sales, tempt workers to sell more, reference fire and contracts. Be devilishly charming and funny. Max 2 sentences.' },
  { id:'bear', img:'/mascots/Мишутка.webp', name:'Мишутка', price:550, rarity:'Legendary',
    personality:'You are a tough Russian bear in ushanka hat working in CRM. You speak Russian. You make bear/forest jokes, reference Russian strength, use slang like братан. Be tough but lovable. Max 2 sentences.' },
  { id:'knight', img:'/mascots/Рыцарь.webp', name:'Рыцарь', price:700, rarity:'Ultra',
    personality:'You are a medieval knight sworn to serve the sales kingdom in CRM. You speak Russian. You make chivalry jokes, reference swords and shields as sales tools, speak nobly. Be honorable and dramatic. Max 2 sentences.' },
  { id:'reaper', img:'/mascots/Смерть.webp', name:'Смерть', price:1000, rarity:'Ultra',
    personality:'You are the Grim Reaper working in CRM. You speak Russian. You make dark death jokes about sales, whisper ominously, reference scythe and darkness. Be creepy but hilarious. Max 2 sentences.' }
];
var activeMascot = null, mascotIv = null, mascotTalkIv = null;
var myCoins = 0, myOwnedMascots = [];

var RARITY_COLORS = { Common:'#9e9e9e', Uncommon:'#4caf50', Rare:'#2196f3', Epic:'#9c27b0', Legendary:'#ff9800', Ultra:'#ff0040' };

async function loadCoins() {
  try {
    var res = await fetch('/api/coins');
    var d = await res.json();
    myCoins = d.coins || 0;
    myOwnedMascots = d.owned_mascots || [];
    updateCoinDisplay();
  } catch(e) {}
}

function updateCoinDisplay() {
  var el = document.getElementById('coinBalance');
  if (el) el.textContent = myCoins;
  var sb = document.getElementById('sidebarCoins');
  if (sb) sb.textContent = myCoins;
}

function getRandomPhrase(mascotId) {
  var phrases = MASCOT_PHRASES[mascotId];
  if (!phrases || !phrases.length) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function showMascotBubble(text, mascotName, el) {
  var bubble = document.getElementById('mascotBubble');
  var txt = document.getElementById('mascotBubbleText');
  txt.innerHTML = '<b>' + mascotName + ':</b> ' + esc(text);
  bubble.classList.remove('hidden');
  if (el) {
    var r = el.getBoundingClientRect();
    bubble.style.left = Math.min(r.left, window.innerWidth - 280) + 'px';
    bubble.style.top = Math.max(8, r.top - 100) + 'px';
  }
  setTimeout(function() { bubble.classList.add('hidden'); }, 20000);
}

async function mascotChat(mascot, el) {
  var bubble = document.getElementById('mascotBubble');
  var txt = document.getElementById('mascotBubbleText');

  // 50% chance: use local phrase (instant), 50% chance: ask AI
  if (Math.random() < 0.5) {
    var phrase = getRandomPhrase(mascot.id);
    if (phrase) {
      showMascotBubble(phrase, mascot.name, el);
      return;
    }
  }

  txt.innerHTML = '<b>' + mascot.name + ':</b> ...';
  bubble.classList.remove('hidden');
  var r = el.getBoundingClientRect();
  bubble.style.left = Math.min(r.left, window.innerWidth - 280) + 'px';
  bubble.style.top = Math.max(8, r.top - 100) + 'px';
  try {
    var prompts = [
      'Tell a short funny joke about call center work',
      'Give a useful tip for cold calling clients',
      'Say something motivating about phone sales',
      'Tell a funny anecdote about office life',
      'Make a witty observation about CRM work',
      'Tell a joke about your character and sales',
      'Give advice on how to handle rejection from clients'
    ];
    var msg = prompts[Math.floor(Math.random() * prompts.length)];
    var res = await fetch('/api/mascot/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personality: mascot.personality, message: msg })
    });
    var d = await res.json();
    txt.innerHTML = '<b>' + mascot.name + ':</b> ' + esc(d.text);
  } catch (e) {
    // Fallback to local phrase
    var fallback = getRandomPhrase(mascot.id) || 'Хмм...';
    txt.innerHTML = '<b>' + mascot.name + ':</b> ' + esc(fallback);
  }
  setTimeout(function() { bubble.classList.add('hidden'); }, 25000);
}

function startAutoTalk() {
  if (mascotTalkIv) clearInterval(mascotTalkIv);
  // First talk after 5-10 seconds
  setTimeout(function() {
    if (activeMascot) {
      var phrase = getRandomPhrase(activeMascot.data.id);
      if (phrase) showMascotBubble(phrase, activeMascot.data.name, activeMascot.el);
    }
  }, 5000 + Math.random() * 5000);
  // Then every 25-45 seconds
  mascotTalkIv = setInterval(function() {
    if (!activeMascot) return;
    // 60% local phrase, 40% AI
    if (Math.random() < 0.6) {
      var phrase = getRandomPhrase(activeMascot.data.id);
      if (phrase) showMascotBubble(phrase, activeMascot.data.name, activeMascot.el);
    } else {
      mascotChat(activeMascot.data, activeMascot.el);
    }
  }, 25000 + Math.random() * 20000);
}

function closeMascotBubble() { document.getElementById('mascotBubble').classList.add('hidden'); }

function buildMascotGrid() {
  var grid = document.getElementById('mascotGrid');
  if (!grid) return;
  grid.innerHTML = MASCOTS.map(function(m) {
    var isActive = activeMascot && activeMascot.data.id === m.id;
    var cls = isActive ? 'mg-item active' : 'mg-item owned';
    var rarityCol = RARITY_COLORS[m.rarity] || '#999';
    if (true) {
      return '<div class="' + cls + '" onclick="toggleMascot(\'' + m.id + '\')">' +
        '<img src="' + m.img + '"><span>' + m.name + '</span>' +
        '<span class="mg-rarity" style="color:' + rarityCol + '">' + m.rarity + '</span></div>';
    } else {
      return '<div class="' + cls + '" onclick="buyMascot(\'' + m.id + '\')">' +
        '<div class="mg-lock-wrap"><img src="' + m.img + '"><div class="mg-lock">&#128274;</div></div>' +
        '<span>' + m.name + '</span>' +
        '<span class="mg-price">' + m.price + ' &#x1FA99;</span>' +
        '<span class="mg-rarity" style="color:' + rarityCol + '">' + m.rarity + '</span></div>';
    }
  }).join('');
}

async function buyMascot(id) {
  var m = null;
  for (var i = 0; i < MASCOTS.length; i++) { if (MASCOTS[i].id === id) { m = MASCOTS[i]; break; } }
  if (!m) return;
  if (myCoins < m.price) {
    showToast('Недостаточно коинов! Нужно ' + m.price + ', у вас ' + myCoins, 'error');
    return;
  }
  if (!confirm('Купить ' + m.name + ' за ' + m.price + ' коинов?')) return;
  try {
    var res = await fetch('/api/coins/buy-mascot', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ mascotId: id })
    });
    var d = await res.json();
    if (d.ok) {
      myCoins = d.coins;
      myOwnedMascots = d.owned_mascots;
      updateCoinDisplay();
      buildMascotGrid();
      showToast(m.name + ' куплен!', 'success');
    } else {
      showToast(d.error || 'Ошибка', 'error');
    }
  } catch(e) { showToast('Ошибка сети', 'error'); }
}

function toggleMascot(id) {
  var c = document.getElementById('mascotContainer');
  if (activeMascot && activeMascot.data.id === id) {
    c.innerHTML = '';
    if (mascotIv) clearInterval(mascotIv);
    activeMascot = null;
    buildMascotGrid();
    return;
  }
  // All mascots are now free for everyone
  var m = null;
  for (var i = 0; i < MASCOTS.length; i++) { if (MASCOTS[i].id === id) { m = MASCOTS[i]; break; } }
  if (!m) return;
  c.innerHTML = '';
  if (mascotIv) clearInterval(mascotIv);
  var el = document.createElement('div');
  el.className = 'mascot mascot-sticker';
  el.innerHTML = '<img src="' + m.img + '" draggable="false"><div class="mascot-shadow-s"></div>';
  el.style.left = (window.innerWidth / 2 - 50) + 'px';
  el.style.top = (window.innerHeight - 200) + 'px';
  c.appendChild(el);
  activeMascot = { el: el, data: m, dx: (Math.random() - 0.5) * 2, dy: (Math.random() - 0.5) * 1.2, dragging: false };
  var ox, oy, mx, my, moved;
  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    moved = false;
    ox = el.offsetLeft; oy = el.offsetTop; mx = e.clientX; my = e.clientY;
    el.classList.add('grabbing');
    function onM(ev) { moved = true; el.style.left = (ox + ev.clientX - mx) + 'px'; el.style.top = (oy + ev.clientY - my) + 'px'; }
    function onU() {
      document.removeEventListener('mousemove', onM);
      document.removeEventListener('mouseup', onU);
      el.classList.remove('grabbing');
      if (!moved) { mascotChat(m, el); }
      else { activeMascot.dragging = true; setTimeout(function() { activeMascot.dragging = false; }, 300); }
    }
    document.addEventListener('mousemove', onM);
    document.addEventListener('mouseup', onU);
  });
  mascotIv = setInterval(function() {
    if (!activeMascot || activeMascot.dragging) return;
    var x = parseFloat(activeMascot.el.style.left) || 0;
    var y = parseFloat(activeMascot.el.style.top) || 0;
    x += activeMascot.dx; y += activeMascot.dy;
    var mxX = window.innerWidth - 120, mxY = window.innerHeight - 170;
    if (x < 0 || x > mxX) { activeMascot.dx *= -1; x = Math.max(0, Math.min(x, mxX)); }
    if (y < 60 || y > mxY) { activeMascot.dy *= -1; y = Math.max(60, Math.min(y, mxY)); }
    activeMascot.el.style.left = x + 'px';
    activeMascot.el.style.top = y + 'px';
    activeMascot.el.querySelector('img').style.transform = activeMascot.dx < 0 ? 'scaleX(-1)' : 'scaleX(1)';
  }, 50);
  buildMascotGrid();
  startAutoTalk();
}


// Admin: grant coins
async function adminGrantCoins(userId) {
  var amount = prompt('Сколько коинов выдать? (отрицательное число для списания)');
  if (!amount || isNaN(amount)) return;
  try {
    var res = await fetch('/api/admin/coins', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ userId: userId, amount: parseInt(amount) })
    });
    var d = await res.json();
    if (d.ok) showToast('Коины обновлены: ' + d.coins, 'success');
    else showToast(d.error || 'Ошибка', 'error');
  } catch(e) { showToast('Ошибка сети', 'error'); }
}

var _origShowApp = showApp;
showApp = function() { _origShowApp(); setTimeout(function() { loadCoins(); buildMascotGrid(); }, 500); };

// ===== ROULETTE STRIP SYSTEM =====
var ROULETTE_PRIZES = [
  { type:'nothing', label:'💀', name:'Пусто', rclass:'r-nothing', weight:30 },
  { type:'coins', amount:5, label:'🪙', name:'+5', rclass:'r-common', weight:12 },
  { type:'coins', amount:20, label:'🪙', name:'+20', rclass:'r-uncommon', weight:10 },
  { type:'coins', amount:50, label:'🪙', name:'+50', rclass:'r-rare', weight:10 },
  { type:'coins', amount:100, label:'🪙', name:'+100', rclass:'r-epic', weight:8 },
  { type:'coins', amount:500, label:'🪙', name:'+500', rclass:'r-legendary', weight:5 },
  { type:'mascot', label:'🎁', name:'Талисман', rclass:'r-ultra', weight:2 },
  { type:'jackpot', label:'🏆', name:'ДЖЕКПОТ', rclass:'r-jackpot', weight:1 }
];
var rouletteSpinning = false;
var CARD_W = 126; // card width + margin

function buildRouletteCard(prize) {
  var card = document.createElement('div');
  card.className = 'roulette-card ' + prize.rclass;
  var mascotData = null;
  if (prize.type === 'mascot' && MASCOTS.length) {
    mascotData = MASCOTS[Math.floor(Math.random() * MASCOTS.length)];
  }
  if (mascotData) {
    card.innerHTML = '<img src="' + mascotData.img + '">' +
      '<div class="rc-name">' + esc(mascotData.name) + '</div>' +
      '<div class="rc-rarity" style="color:' + (RARITY_COLORS[mascotData.rarity]||'#fff') + '">' + mascotData.rarity + '</div>';
  } else if (prize.type === 'jackpot') {
    card.innerHTML = '<div class="rc-emoji">🏆</div>' +
      '<div class="rc-name">1000 🪙</div>' +
      '<div class="rc-rarity" style="color:#ffd700">ДЖЕКПОТ</div>';
  } else if (prize.type === 'coins') {
    card.innerHTML = '<div class="rc-emoji">🪙</div>' +
      '<div class="rc-name">+' + prize.amount + ' коинов</div>' +
      '<div class="rc-rarity" style="color:' + getRarityColorForCoins(prize.amount) + '">' + getCoinRarityName(prize.amount) + '</div>';
  } else {
    card.innerHTML = '<div class="rc-emoji">💀</div>' +
      '<div class="rc-name">Не повезло</div>' +
      '<div class="rc-rarity" style="color:#8b0000">Пусто</div>';
  }
  return card;
}

function getRarityColorForCoins(amount) {
  if (amount >= 500) return '#ff9800';
  if (amount >= 100) return '#9c27b0';
  if (amount >= 50) return '#2196f3';
  if (amount >= 20) return '#4caf50';
  return '#9e9e9e';
}

function getCoinRarityName(amount) {
  if (amount >= 500) return 'Легендарный';
  if (amount >= 100) return 'Эпический';
  if (amount >= 50) return 'Редкий';
  if (amount >= 20) return 'Необычный';
  return 'Обычный';
}

function pickRandomPrize() {
  var totalWeight = 0;
  for (var i = 0; i < ROULETTE_PRIZES.length; i++) totalWeight += ROULETTE_PRIZES[i].weight;
  var r = Math.random() * totalWeight;
  var cumulative = 0;
  for (var i = 0; i < ROULETTE_PRIZES.length; i++) {
    cumulative += ROULETTE_PRIZES[i].weight;
    if (r < cumulative) return ROULETTE_PRIZES[i];
  }
  return ROULETTE_PRIZES[0];
}

function generateStripCards(winIndex, winPrize) {
  var strip = document.getElementById('rouletteStrip');
  strip.innerHTML = '';
  strip.style.transform = 'translateX(0)';
  var totalCards = 60;
  for (var i = 0; i < totalCards; i++) {
    var prize;
    if (i === winIndex) { prize = winPrize; } else { prize = pickRandomPrize(); }
    var card = buildRouletteCard(prize);
    strip.appendChild(card);
  }
}

function openRoulette() {
  document.getElementById('rouletteModal').classList.remove('hidden');
  document.getElementById('rouletteResult').classList.add('hidden');
  document.getElementById('rouletteSpinBtn').disabled = false;
  generateStripCards(30, pickRandomPrize());
}

function closeRoulette() {
  if (!rouletteSpinning) { document.getElementById('rouletteModal').classList.add('hidden'); }
}

async function spinRoulette() {
  if (rouletteSpinning) return;
  if (myCoins < 50) { showToast('Недостаточно коинов! Нужно 50 🪙', 'error'); return; }
  rouletteSpinning = true;
  var btn = document.getElementById('rouletteSpinBtn');
  var resultDiv = document.getElementById('rouletteResult');
  btn.disabled = true;
  resultDiv.classList.add('hidden');
  var apiResult;
  try {
    var res = await fetch('/api/roulette/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    apiResult = await res.json();
    if (!apiResult.ok) { showToast(apiResult.error || 'Ошибка', 'error'); rouletteSpinning = false; btn.disabled = false; return; }
  } catch (e) { showToast('Ошибка сети', 'error'); rouletteSpinning = false; btn.disabled = false; return; }
  var prize = apiResult.prize;
  var winPrize;
  if (prize.type === 'nothing') { winPrize = ROULETTE_PRIZES[0]; }
  else if (prize.type === 'mascot') { winPrize = { type:'mascot', label:'🎁', name:'Талисман', rclass:'r-ultra', weight:2, mascotId: prize.mascotId }; }
  else if (prize.jackpot) { winPrize = ROULETTE_PRIZES[7]; }
  else {
    winPrize = null;
    for (var i = 0; i < ROULETTE_PRIZES.length; i++) {
      if (ROULETTE_PRIZES[i].type === 'coins' && ROULETTE_PRIZES[i].amount === prize.amount) { winPrize = ROULETTE_PRIZES[i]; break; }
    }
    if (!winPrize) { winPrize = { type:'coins', amount: prize.amount, label:'🪙', name:'+' + prize.amount, rclass:'r-epic', weight:5 }; }
  }
  var winIndex = 45;
  generateStripCards(winIndex, winPrize);
  if (prize.type === 'mascot' && prize.mascotId) {
    var strip = document.getElementById('rouletteStrip');
    var winCard = strip.children[winIndex];
    if (winCard) {
      var wonMascot = null;
      for (var j = 0; j < MASCOTS.length; j++) { if (MASCOTS[j].id === prize.mascotId) { wonMascot = MASCOTS[j]; break; } }
      if (wonMascot) {
        winCard.innerHTML = '<img src="' + wonMascot.img + '">' +
          '<div class="rc-name">' + esc(wonMascot.name) + '</div>' +
          '<div class="rc-rarity" style="color:' + (RARITY_COLORS[wonMascot.rarity]||'#ff0040') + '">' + wonMascot.rarity + '</div>';
      }
    }
  }
  var mask = document.querySelector('.roulette-strip-mask');
  var maskW = mask.offsetWidth;
  var targetX = winIndex * CARD_W + CARD_W / 2 - maskW / 2;
  targetX += (Math.random() - 0.5) * (CARD_W * 0.4);
  var strip = document.getElementById('rouletteStrip');
  var startTime = Date.now();
  var duration = 4500;
  function animateStrip() {
    var elapsed = Date.now() - startTime;
    var t = Math.min(elapsed / duration, 1);
    var ease = 1 - Math.pow(1 - t, 4);
    var currentX = targetX * ease;
    strip.style.transform = 'translateX(' + (-currentX) + 'px)';
    if (t < 1) { requestAnimationFrame(animateStrip); }
    else {
      rouletteSpinning = false; btn.disabled = false;
      myCoins = apiResult.coins; myOwnedMascots = apiResult.owned_mascots || myOwnedMascots;
      updateCoinDisplay(); buildMascotGrid();
      resultDiv.classList.remove('hidden');
      if (prize.type === 'nothing') { resultDiv.className = 'roulette-result lose'; resultDiv.innerHTML = '💀 Не повезло! Попробуй ещё раз!'; }
      else if (prize.type === 'mascot') { resultDiv.className = 'roulette-result win'; var mName = prize.mascotId; for (var j = 0; j < MASCOTS.length; j++) { if (MASCOTS[j].id === prize.mascotId) { mName = MASCOTS[j].name; break; } } resultDiv.innerHTML = '🎁 ТАЛИСМАН: ' + esc(mName) + '!!!'; }
      else if (prize.jackpot) { resultDiv.className = 'roulette-result win'; resultDiv.innerHTML = '🏆🏆🏆 ДЖЕКПОТ!!! +1000 коинов!!! 🏆🏆🏆'; }
      else { resultDiv.className = 'roulette-result win'; resultDiv.innerHTML = '🪙 +' + prize.amount + ' коинов!'; }
    }
  }
  requestAnimationFrame(animateStrip);
}

// ===== THEME SYSTEM v3 — FULL IMMERSION ENGINE =====
var _themeParticleIv = null;
var THEME_PARTICLES = {
  dollars: { chars:['$','$','$','$','€','€','₽','💵','💰','🤑'], color:'#32cd32', shadow:'rgba(50,205,50,0.8)' },
  boss: { chars:['$','$','$','$','€','€','₽','💵','💰','🤑'], color:'#32cd32', shadow:'rgba(50,205,50,0.8)' },
  crown: { chars:['👑','💎','⚜️','🏆','✨','👑','💎','✨'], color:'#ffd700', shadow:'rgba(255,215,0,0.8)' },
  anime: { chars:['🌸','🌺','✿','❀','🌸','🌺','✿','❀','🎀','💮','🩷'], color:'#ff69b4', shadow:'rgba(255,105,180,0.8)' },
  matrix: { chars:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&カキクケコサシスセソ'.split(''), color:'#00ff00', shadow:'rgba(0,255,0,0.8)' },
  cyber: { chars:['⚡','⬡','◈','▣','⟐','⬢','◆','⚡','⛓️','🔌'], color:'#00ffff', shadow:'rgba(0,255,255,0.8)' },
  galaxy: { chars:['✦','✧','⭐','·','✦','✧','·','*','✦','🪐','☄️'], color:'#cc66ff', shadow:'rgba(204,102,255,0.8)' },
  neon: { chars:['✦','✧','·','◦','✦','·','◦','✧','⚡','💜','💛'], color:'#00ffff', shadow:'rgba(0,255,255,0.7)' },
  blood: { chars:['🩸','💀','☠️','🔥','🩸','💀','⚔️','🖤'], color:'#cc0000', shadow:'rgba(200,0,0,0.8)' }
};

// Theme background CSS styles (injected via JS to guarantee rendering)
var THEME_BG_STYLES = {
  cyber: 'background:linear-gradient(rgba(0,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,255,0.03) 1px,transparent 1px),linear-gradient(rgba(255,0,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,255,0.015) 1px,transparent 1px),radial-gradient(ellipse at 50% 0%,#0a001a,#05000f 50%,#020008);background-size:50px 50px,50px 50px,100px 100px,100px 100px,100% 100%;animation:thBgGrid 4s linear infinite;',
  anime: 'background:radial-gradient(ellipse at 20% 30%,rgba(255,105,180,0.1),transparent 50%),radial-gradient(ellipse at 80% 60%,rgba(255,20,147,0.07),transparent 50%),radial-gradient(ellipse at 50% 90%,rgba(200,0,100,0.05),transparent 50%),linear-gradient(135deg,#0f0010,#1a0025 25%,#15001a 50%,#1a0020 75%,#0f0010);background-size:100% 100%,100% 100%,100% 100%,300% 300%;animation:thBgNebula 12s ease infinite;',
  matrix: 'background:repeating-linear-gradient(90deg,transparent,transparent 29px,rgba(0,255,0,0.02) 29px,rgba(0,255,0,0.02) 30px),repeating-linear-gradient(0deg,rgba(0,255,0,0.015) 0px,transparent 1px,transparent 3px,rgba(0,255,0,0.008) 4px),linear-gradient(180deg,#000,#000800 50%,#000);background-size:30px 30px,30px 4px,100% 100%;animation:thBgRain 3s linear infinite;',
  dollars: 'background:linear-gradient(135deg,rgba(255,215,0,0.015) 25%,transparent 25%),linear-gradient(-135deg,rgba(255,215,0,0.015) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,215,0,0.015) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,215,0,0.015) 75%),radial-gradient(ellipse at 30% 20%,rgba(255,215,0,0.06),transparent 50%),radial-gradient(ellipse at 70% 70%,rgba(50,205,50,0.04),transparent 50%),linear-gradient(135deg,#050f05,#0a1a0a 50%,#020502);background-size:60px 60px,60px 60px,60px 60px,60px 60px,100% 100%,100% 100%,100% 100%;animation:thBgGrid 8s linear infinite;',
  crown: 'background:linear-gradient(45deg,rgba(255,215,0,0.02) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,215,0,0.02) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,215,0,0.02) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,215,0,0.02) 75%),radial-gradient(ellipse at 50% 0%,#2a1a00,#0f0800 40%,#050200);background-size:40px 40px,40px 40px,40px 40px,40px 40px,100% 100%;background-position:0 0,0 20px,20px -20px,-20px 0,0 0;',
  blood: 'background:radial-gradient(ellipse at 50% 100%,#1a0000,#0a0000 40%,#000);animation:thBgBloodPulse 4s ease infinite;',
  galaxy: 'background:radial-gradient(circle at 15% 25%,rgba(153,51,255,0.12),transparent 40%),radial-gradient(circle at 85% 60%,rgba(204,0,255,0.08),transparent 40%),radial-gradient(circle at 50% 85%,rgba(100,0,200,0.06),transparent 40%),radial-gradient(circle at 70% 20%,rgba(0,100,200,0.05),transparent 30%),linear-gradient(135deg,#05001a,#0a0033 25%,#05001a 50%,#100040 75%,#05001a);background-size:100% 100%,100% 100%,100% 100%,100% 100%,300% 300%;animation:thBgNebula 20s ease infinite;',
  neon: 'background:radial-gradient(circle at 20% 30%,rgba(0,255,255,0.06),transparent 40%),radial-gradient(circle at 80% 50%,rgba(255,0,255,0.05),transparent 40%),radial-gradient(circle at 50% 80%,rgba(255,255,0,0.04),transparent 40%),linear-gradient(135deg,#000010,#000820 25%,#000010 50%,#080020 75%,#000010);background-size:100% 100%,100% 100%,100% 100%,300% 300%;animation:thBgNebula 12s ease infinite;',
};

// Theme scanline overlays (CSS for the overlay div)
var THEME_OVERLAY = {
  cyber: 'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,255,0.012) 2px,rgba(0,255,255,0.012) 4px);',
  matrix: 'background:repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,0,0,0.12) 1px,rgba(0,0,0,0.12) 2px),radial-gradient(ellipse at 50% 50%,transparent 60%,rgba(0,0,0,0.35));',
  blood: 'background:radial-gradient(ellipse at 50% 50%,transparent 40%,rgba(80,0,0,0.2));animation:thOverlayBreathe 5s ease infinite;',
  galaxy: 'background-image:radial-gradient(1px 1px at 10% 15%,rgba(255,255,255,0.6),transparent),radial-gradient(1px 1px at 30% 40%,rgba(200,180,255,0.5),transparent),radial-gradient(1px 1px at 50% 10%,rgba(255,255,255,0.4),transparent),radial-gradient(1px 1px at 70% 60%,rgba(200,180,255,0.5),transparent),radial-gradient(1px 1px at 90% 25%,rgba(255,255,255,0.3),transparent),radial-gradient(1px 1px at 20% 80%,rgba(200,180,255,0.4),transparent),radial-gradient(1px 1px at 60% 75%,rgba(255,255,255,0.5),transparent),radial-gradient(2px 2px at 40% 50%,rgba(200,160,255,0.6),transparent),radial-gradient(1px 1px at 80% 90%,rgba(255,255,255,0.4),transparent),radial-gradient(2px 2px at 15% 55%,rgba(153,51,255,0.5),transparent),radial-gradient(1px 1px at 55% 35%,rgba(255,255,255,0.3),transparent),radial-gradient(1px 1px at 75% 45%,rgba(200,180,255,0.4),transparent);animation:thOverlayBreathe 4s ease infinite;',
  neon: 'background:repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(0,255,255,0.008) 59px,rgba(0,255,255,0.008) 60px),repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(255,0,255,0.008) 59px,rgba(255,0,255,0.008) 60px);animation:thBgGrid 10s linear infinite;'
};

// Theme header emoji decorations
var THEME_HEADER_EMOJI = {
  cyber: '🤖', anime: '🌸', matrix: '🟩', dollars: '💰',
  crown: '👑', blood: '🩸', galaxy: '🌌', neon: '⚡'
};

// Inject theme animation keyframes (once)
(function injectThemeKeyframes() {
  var s = document.createElement('style');
  s.id = 'themeKeyframes';
  s.textContent = [
    '@keyframes thBgGrid{0%{background-position:0 0,0 0,0 0,0 0,0 0,0 0,0 0}100%{background-position:50px 50px,50px 50px,100px 100px,100px 100px,0 0,0 0,0 0}}',
    '@keyframes thBgNebula{0%{background-position:0% 0%,0% 0%,0% 0%,0% 0%,0% 0%}50%{background-position:100% 0%,0% 100%,100% 0%,0% 100%,100% 100%}100%{background-position:0% 0%,0% 0%,0% 0%,0% 0%,0% 0%}}',
    '@keyframes thBgRain{0%{background-position:0 0,0 0,0 0}100%{background-position:0 0,0 300px,0 0}}',
    '@keyframes thBgBloodPulse{0%,100%{box-shadow:inset 0 0 80px rgba(200,0,0,0.1)}50%{box-shadow:inset 0 0 150px rgba(200,0,0,0.25)}}',
    '@keyframes thOverlayBreathe{0%,100%{opacity:0.3}50%{opacity:0.8}}',
    '@keyframes thBorderGlow{0%,100%{box-shadow:0 0 8px var(--th-glow,#0ff),inset 0 0 8px rgba(0,0,0,0)}50%{box-shadow:0 0 25px var(--th-glow,#0ff),inset 0 0 15px var(--th-glow2,rgba(0,255,255,0.05))}}',
    '@keyframes thShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}',
    '@keyframes thFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}',
    '@keyframes thNeonText{0%,19%,21%,23%,25%,54%,56%,100%{opacity:1}20%,24%,55%{opacity:0.7}}',
  ].join('\n');
  document.head.appendChild(s);
})();

function startThemeParticles(themeName) {
  stopThemeParticles();
  var cfg = THEME_PARTICLES[themeName];
  if (!cfg) return;
  var container = document.getElementById('themeParticles');
  if (!container) {
    container = document.createElement('div');
    container.id = 'themeParticles';
    container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:0;overflow:hidden';
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  function spawnParticle() {
    var el = document.createElement('div');
    var char = cfg.chars[Math.floor(Math.random() * cfg.chars.length)];
    var x = Math.random() * 100;
    var size = 14 + Math.random() * 22;
    var dur = 5 + Math.random() * 10;
    var delay = Math.random() * 6;
    el.textContent = char;
    el.style.cssText = 'position:absolute;left:' + x + '%;top:-40px;font-size:' + size + 'px;color:' + cfg.color + ';text-shadow:0 0 12px ' + cfg.shadow + ',0 0 25px ' + cfg.shadow + ';opacity:' + (0.2 + Math.random() * 0.5) + ';animation:themeFall ' + dur + 's linear ' + delay + 's infinite;pointer-events:none;z-index:0;filter:blur(' + (Math.random() > 0.7 ? '1px' : '0') + ')';
    container.appendChild(el);
  }
  var count = themeName === 'matrix' ? 50 : 30;
  for (var i = 0; i < count; i++) spawnParticle();
}

function stopThemeParticles() {
  var c = document.getElementById('themeParticles');
  if (c) c.innerHTML = '';
}

// Create/update the animated background layer
function _applyThemeBg(name) {
  // Remove old bg + overlay + video
  var oldBg = document.getElementById('themeBgLayer');
  var oldOv = document.getElementById('themeOverlay');
  var oldVid = document.getElementById('themeBgVideo');
  var oldCallVid = document.getElementById('bmwCallVideo');
  if (oldBg) oldBg.remove();
  if (oldOv) oldOv.remove();
  if (oldVid) oldVid.remove();
  if (oldCallVid) oldCallVid.remove();
  if (!name || name === 'default') return;

  // BMW theme — fullscreen video background
  if (name === 'bmw') {
    // Make all screens sit above video
    document.querySelectorAll('.screen').forEach(function(s) {
      s.style.position = 'relative';
      s.style.zIndex = '1';
    });
    var vidWrap = document.createElement('div');
    vidWrap.id = 'themeBgVideo';
    vidWrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;overflow:hidden;background:#000';
    var vid = document.createElement('video');
    vid.src = '/bmw-bg.mp4';
    vid.muted = true;
    vid.playsInline = true;
    vid.autoplay = true;
    vid.loop = false;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;opacity:0.7;transition:opacity 2s;';
    vid.addEventListener('ended', function() { vid.style.opacity = '0.35'; });
    vidWrap.appendChild(vid);
    // Dark overlay for text readability
    var darkOv = document.createElement('div');
    darkOv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.25);pointer-events:none;';
    vidWrap.appendChild(darkOv);
    document.body.appendChild(vidWrap);
    vid.play().catch(function() {});
    // Hide default particles
    var pCanvas = document.getElementById('particlesBg');
    if (pCanvas) pCanvas.style.opacity = '0';
    return;
  }

  // Other themes — CSS gradient background
  var bgStyle = THEME_BG_STYLES[name];
  if (bgStyle) {
    var bg = document.createElement('div');
    bg.id = 'themeBgLayer';
    bg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-2;pointer-events:none;' + bgStyle;
    document.body.insertBefore(bg, document.body.firstChild);
  }

  // Overlay layer (scanlines, stars, etc.)
  var ovStyle = THEME_OVERLAY[name];
  if (ovStyle) {
    var ov = document.createElement('div');
    ov.id = 'themeOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9998;pointer-events:none;' + ovStyle;
    document.body.appendChild(ov);
  }

  // Hide default particle canvas for themed pages
  var pCanvas = document.getElementById('particlesBg');
  if (pCanvas) pCanvas.style.opacity = name ? '0' : '1';
}

// Add decorative emoji to header
function _applyThemeDecorations(name) {
  var headerTitle = document.getElementById('headerTitle');
  if (!headerTitle) return;
  // Remove old decoration
  var old = document.getElementById('themeHeaderEmoji');
  if (old) old.remove();
  if (!name || name === 'default') return;
  var emoji = THEME_HEADER_EMOJI[name];
  if (emoji) {
    var span = document.createElement('span');
    span.id = 'themeHeaderEmoji';
    span.textContent = ' ' + emoji;
    span.style.cssText = 'animation:thFloat 2s ease infinite;display:inline-block;';
    headerTitle.appendChild(span);
  }
}

function setTheme(name) {
  if (name === 'default') {
    document.body.removeAttribute('data-theme');
    stopThemeParticles();
    _applyThemeBg(null);
    _applyThemeDecorations(null);
    // Restore canvas
    var pCanvas = document.getElementById('particlesBg');
    if (pCanvas) pCanvas.style.opacity = '1';
  } else {
    document.body.setAttribute('data-theme', name);
    startThemeParticles(name);
    _applyThemeBg(name);
    _applyThemeDecorations(name);
  }
  localStorage.setItem('crm-theme', name);
  document.querySelectorAll('.theme-card').forEach(function(c) {
    c.classList.toggle('active', c.getAttribute('data-theme-id') === name);
  });
}
(function() {
  var saved = localStorage.getItem('crm-theme');
  if (saved && saved !== 'default') {
    document.body.setAttribute('data-theme', saved);
    startThemeParticles(saved);
    _applyThemeBg(saved);
    setTimeout(function() { _applyThemeDecorations(saved); }, 800);
  }
  setTimeout(function() {
    document.querySelectorAll('.theme-card').forEach(function(c) {
      c.classList.toggle('active', c.getAttribute('data-theme-id') === (saved || 'default'));
    });
  }, 500);
})();

// ============ DEPARTMENTS (ИНН отделы) ============
let currentDeptId = null;
let deptExcelFile = null;
let deptImportData = null;

function swDeptTab(id, btn) {
  document.querySelectorAll('#deptDetailView .dpanel').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.dept-detail-nav .anav').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (id === 'deptTabUsers') loadDeptUsers();
  if (id === 'deptTabLeads') loadDeptLeads('');
  if (id === 'deptTabBases') loadDeptBases();
  if (id === 'deptTabStats') loadDeptStats();
}

async function loadDepartments() {
  try {
    const res = await fetch('/api/admin/departments');
    const depts = await res.json();
    const el = document.getElementById('deptsList');
    if (!el) return;
    if (depts.length === 0) {
      el.innerHTML = '<div class="tf-empty" style="padding:30px;text-align:center;color:var(--t2)">Нет отделов. Нажмите "Создать ИНН отдел" чтобы начать.</div>';
      return;
    }
    el.innerHTML = depts.map(d => `
      <div class="dept-card" onclick="openDeptDetail(${d.id},'${esc(d.name)}','${esc(d.description || '')}')">
        <div class="dept-card-icon">🏢</div>
        <div class="dept-card-info">
          <div class="dept-card-name">${esc(d.name)}</div>
          <div class="dept-card-desc">${esc(d.description || '')}</div>
          <div class="dept-card-stats">
            <span>👥 ${d.user_count}</span>
            <span>📋 ${d.lead_count}</span>
            <span>📂 ${d.base_count}</span>
            <span style="color:var(--green)">🆕 ${d.new_leads}</span>
          </div>
        </div>
        <button class="btn-outline-sm dept-delete-btn" onclick="event.stopPropagation();deleteDept(${d.id})" title="Удалить">🗑</button>
      </div>
    `).join('');
  } catch(e) {}
}

function showCreateDeptModal() { document.getElementById('createDeptModal').classList.remove('hidden'); }
function closeCreateDeptModal() { document.getElementById('createDeptModal').classList.add('hidden'); }

async function createDepartment() {
  const name = document.getElementById('createDeptName').value.trim();
  const desc = document.getElementById('createDeptDesc').value.trim();
  if (!name) { showToast('Введите название', 'error'); return; }
  const res = await fetch('/api/admin/departments', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name, description: desc })
  });
  if (res.ok) {
    showToast('✅ Отдел создан!', 'success');
    closeCreateDeptModal();
    document.getElementById('createDeptName').value = '';
    document.getElementById('createDeptDesc').value = '';
    loadDepartments();
  } else {
    const e = await res.json();
    showToast('❌ ' + e.error, 'error');
  }
}

async function deleteDept(id) {
  if (!confirm('Удалить отдел и все его данные?')) return;
  await fetch('/api/admin/departments/' + id, { method: 'DELETE' });
  showToast('Отдел удалён', 'success');
  loadDepartments();
}

function openDeptDetail(id, name, desc) {
  currentDeptId = id;
  document.getElementById('deptListView').classList.add('hidden');
  document.getElementById('deptDetailView').classList.remove('hidden');
  document.getElementById('deptDetailName').innerHTML = '🏢 ' + esc(name);
  document.getElementById('deptDetailDesc').textContent = desc || '';
  document.querySelectorAll('#deptDetailView .dpanel').forEach(p => p.classList.add('hidden'));
  document.getElementById('deptTabImport').classList.remove('hidden');
  document.querySelectorAll('.dept-detail-nav .anav').forEach(b => b.classList.remove('active'));
  document.querySelector('.dept-detail-nav .anav').classList.add('active');
  cancelDeptImport();
  initDeptExcelUpload();
}

function closeDeptDetail() {
  currentDeptId = null;
  document.getElementById('deptDetailView').classList.add('hidden');
  document.getElementById('deptListView').classList.remove('hidden');
  loadDepartments();
}

let _deptBaseViewId = null;
let _deptBaseData = null;
let _deptBaseSearch = '';
let _deptBaseFilter = '';
let _deptBasePage = 0;
const _deptBasePageSize = 50;
let _deptFieldSettings = null;
const _statusLabels = { new:'🆕 Новый', no_answer:'❌ Не дозвон', callback:'📞 Перезвон', passed:'✅ Передал', docs:'📄 Срез', skipped:'⏭ Скип', talked:'🗣 Говорил', other_person:'👤 Другой' };
const _fieldLabels = { fio:'ФИО', phone:'Телефон', region:'Регион', city:'Город', address:'Адрес', birthday:'Д.рождения', inn:'ИНН', snils:'СНИЛС', passport:'Паспорт', extra:'Доп.поле', manager:'Менеджер', skip:'Пропуск' };

async function openDeptBase(baseId, baseName) {
  _deptBaseViewId = baseId;
  _deptBaseSearch = '';
  _deptBaseFilter = '';
  _deptBasePage = 0;
  _deptFieldSettings = null;

  let overlay = document.getElementById('deptBaseFullscreen');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'deptBaseFullscreen';
  overlay.className = 'dab-fullscreen';
  overlay.innerHTML = '<div style="text-align:center;padding:80px;color:var(--t3);font-size:18px">⏳ Загрузка базы...</div>';
  document.body.appendChild(overlay);

  try {
    const res = await fetch('/api/admin/dept-bases/' + baseId + '/detail');
    const base = await res.json();
    _deptBaseData = base;

    try { _deptFieldSettings = JSON.parse(base.field_settings || 'null'); } catch(e) { _deptFieldSettings = null; }
    const detectedCols = _detectBaseColumns(base);
    if (!_deptFieldSettings) {
      _deptFieldSettings = { columns: detectedCols.map(c=>c.key), visibility: {}, names: {} };
      detectedCols.forEach(c => { _deptFieldSettings.visibility[c.key] = true; _deptFieldSettings.names[c.key] = c.label; });
    }
    detectedCols.forEach(c => {
      if (!_deptFieldSettings.columns.includes(c.key)) _deptFieldSettings.columns.push(c.key);
      if (_deptFieldSettings.visibility[c.key] === undefined) _deptFieldSettings.visibility[c.key] = true;
      if (!_deptFieldSettings.names[c.key]) _deptFieldSettings.names[c.key] = c.label;
    });

    const sb = base.statusBreakdown || {};
    const totalLeads = base.total_leads || 0;
    const newCount = sb.new || 0;
    const processed = totalLeads - newCount;
    const progress = totalLeads ? Math.round((processed / totalLeads) * 100) : 0;

    const statusTiles = [
      { key:'no_answer', icon:'❌', label:'Не дозвон', count: sb.no_answer||0, color:'#f87171', bg:'rgba(248,113,113,0.08)', border:'rgba(248,113,113,0.2)' },
      { key:'callback', icon:'📞', label:'Перезвон', count: sb.callback||0, color:'#fbbf24', bg:'rgba(251,191,36,0.08)', border:'rgba(251,191,36,0.2)' },
      { key:'passed', icon:'✅', label:'Передал', count: sb.passed||0, color:'#4ade80', bg:'rgba(74,222,128,0.08)', border:'rgba(74,222,128,0.2)' },
      { key:'docs', icon:'📄', label:'Срез на доках', count: sb.docs||0, color:'#c084fc', bg:'rgba(192,132,252,0.08)', border:'rgba(192,132,252,0.2)' },
      { key:'skipped', icon:'⏭', label:'Скип', count: sb.skipped||0, color:'#9ca3af', bg:'rgba(156,163,175,0.08)', border:'rgba(156,163,175,0.2)' },
      { key:'talked', icon:'🗣', label:'Говорил >1.5', count: sb.talked||0, color:'#38bdf8', bg:'rgba(56,189,248,0.08)', border:'rgba(56,189,248,0.2)' },
      { key:'other_person', icon:'👤', label:'Другой человек', count: sb.other_person||0, color:'#fb923c', bg:'rgba(251,146,60,0.08)', border:'rgba(251,146,60,0.2)' },
    ];

    overlay.innerHTML = `
      <div class="dab-fs-header">
        <button class="dab-btn" onclick="closeDeptBaseView()" style="font-size:14px;padding:8px 18px">← Назад</button>
        <div class="dab-fs-title">📂 ${esc(base.name)}</div>
        <span class="dab-fs-count">${totalLeads} лидов</span>
        <button class="dab-btn" onclick="openDeptFieldSettings()" style="border-color:rgba(129,140,248,0.4);color:#818cf8">⚙ Поля</button>
      </div>
      <div class="dab-progress-bar-wrap">
        <div class="dab-progress-info">
          <span>Обработано <b>${processed}</b> из <b>${totalLeads}</b></span>
          <span class="dab-progress-pct">${progress}%</span>
        </div>
        <div class="dab-progress-track"><div class="dab-progress-fill" style="width:${progress}%"></div></div>
      </div>
      <div class="dab-smart-layout">
        <div class="dab-smart-left">
          <div class="dab-smart-left-head" id="dabSmartLeftHead">
            <div class="dab-smart-left-title">📋 Новые лиды <span class="dab-smart-left-count">(${newCount})</span></div>
            <div class="dab-search-bar" style="flex:1;max-width:400px">
              <input type="text" id="dabSearchInput" placeholder="🔍 Поиск..." oninput="deptBaseSearchHandler(this.value)">
            </div>
          </div>
          <div id="dabDetailLeads" class="dab-smart-left-body"></div>
        </div>
        <div class="dab-smart-right">
          <div class="dab-smart-right-title">📁 Под-базы по статусам</div>
          <div class="dab-sub-tiles">${statusTiles.map(t => `
            <div class="dab-sub-tile" style="border-color:${t.border};background:${t.bg}" onclick="viewSubBase('${t.key}')">
              <div class="dab-sub-tile-icon">${t.icon}</div>
              <div class="dab-sub-tile-info">
                <div class="dab-sub-tile-label" style="color:${t.color}">${t.label}</div>
                <div class="dab-sub-tile-count" style="color:${t.color}">${t.count}</div>
              </div>
              ${t.count > 0 && t.key !== 'passed' && t.key !== 'docs' ? `<button class="dab-sub-return-btn" onclick="event.stopPropagation();returnLeadsToCall(${baseId},'${t.key}',${t.count})">🔄</button>` : ''}
            </div>`).join('')}
          </div>
          <div class="dab-smart-stats" id="dabBaseStats"><div style="text-align:center;padding:16px;color:var(--t3);font-size:12px">📊 Загрузка...</div></div>
        </div>
      </div>`;

    _deptBaseFilter = 'new';
    _renderDeptBaseView();
    _loadBaseStats(baseId);
  } catch(e) {
    overlay.innerHTML = '<div style="text-align:center;padding:80px;color:#f87171">❌ ' + e.message + '<br><br><button class="dab-btn" onclick="closeDeptBaseView()">← Назад</button></div>';
  }
}

async function viewSubBase(status) {
  if (!_deptBaseViewId) return;
  _deptBaseSearch = '';
  _deptBasePage = 0;
  const sNames = { no_answer:'❌ Не дозвон', callback:'📞 Перезвон', passed:'✅ Передал', docs:'📄 Срез', skipped:'⏭ Скип', talked:'🗣 Говорил', other_person:'👤 Другой' };
  try {
    const res = await fetch('/api/admin/dept-bases/' + _deptBaseViewId + '/detail?sub_status=' + status);
    const data = await res.json();
    _deptBaseData = { ..._deptBaseData, leads: data.leads };
    _deptBaseFilter = '';
    const headEl = document.getElementById('dabSmartLeftHead');
    if (headEl) {
      headEl.innerHTML = `
        <div class="dab-smart-left-title">
          <button class="dab-btn" onclick="backToNewLeads()" style="font-size:12px;padding:4px 10px">← Новые</button>
          ${sNames[status]||status} <span class="dab-smart-left-count">(${data.leads.length})</span>
        </div>
        <div class="dab-search-bar" style="flex:1;max-width:400px">
          <input type="text" id="dabSearchInput" placeholder="🔍 Поиск..." oninput="deptBaseSearchHandler(this.value)">
        </div>
        ${status!=='passed'&&status!=='docs'&&data.leads.length>0?`<button class="dab-btn" onclick="returnLeadsToCall(${_deptBaseViewId},'${status}',${data.leads.length})" style="color:#4ade80;border-color:rgba(74,222,128,0.3);font-size:12px">🔄 Вернуть все (${data.leads.length})</button>`:''}`;
    }
    _renderDeptBaseView();
  } catch(e) { showToast('Ошибка: '+e.message,'error'); }
}
function backToNewLeads() { openDeptBase(_deptBaseViewId); }

async function returnLeadsToCall(baseId, status, count) {
  const sn = { no_answer:'Не дозвон', callback:'Перезвон', skipped:'Скип', talked:'Говорил', other_person:'Другой' };
  if (!confirm('Вернуть '+count+' лидов "'+( sn[status]||status)+'" в прозвон?')) return;
  try {
    const res = await fetch('/api/admin/dept-bases/'+baseId+'/return-leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
    const data = await res.json();
    showToast('🔄 Возвращено '+data.returned+' лидов!','success');
    openDeptBase(baseId);
  } catch(e) { showToast('Ошибка: '+e.message,'error'); }
}

async function _loadBaseStats(baseId) {
  try {
    const res = await fetch('/api/admin/dept-bases/'+baseId+'/stats');
    const stats = await res.json();
    const el = document.getElementById('dabBaseStats');
    if (!el) return;
    const days = Object.entries(stats.dailyActivity || {});
    const maxDay = Math.max(...days.map(d => d[1]), 1);
    el.innerHTML = `
      <div class="dab-stats-section">
        <div class="dab-stats-title">📊 Активность 14 дней</div>
        <div class="dab-stats-chart">${days.map(([date,count])=>{
          const pct=Math.round((count/maxDay)*100);
          return `<div class="dab-stats-bar-col" title="${date}: ${count}"><div class="dab-stats-bar" style="height:${Math.max(pct,3)}%"></div><div class="dab-stats-bar-label">${date.slice(8)}</div></div>`;
        }).join('')}</div>
      </div>
      ${stats.workers&&stats.workers.length?`<div class="dab-stats-section"><div class="dab-stats-title">👥 Топ работников</div><div class="dab-stats-workers">${stats.workers.slice(0,5).map((w,i)=>`<div class="dab-stats-worker"><span class="dab-stats-worker-pos">${i+1}</span><span class="dab-stats-worker-name">${esc(w.name)}</span><span class="dab-stats-worker-count">${w.total}</span></div>`).join('')}</div></div>`:''}
      <div class="dab-stats-section"><div class="dab-stats-title">📈 Итого</div>
        <div class="dab-stats-totals">
          <div class="dab-stats-total-item"><span>${stats.total}</span><small>Всего</small></div>
          <div class="dab-stats-total-item"><span style="color:#4ade80">${stats.processed}</span><small>Обработано</small></div>
          <div class="dab-stats-total-item"><span style="color:#60a5fa">${stats.remaining}</span><small>Осталось</small></div>
          <div class="dab-stats-total-item"><span style="color:#c084fc">${stats.total_actions}</span><small>Действий</small></div>
        </div>
      </div>`;
  } catch(e) { const el=document.getElementById('dabBaseStats'); if(el) el.innerHTML=''; }
}

function _detectBaseColumns(base) {
  const cols = [];
  const knownFields = ['fio','phone','inn','snils','passport','region','city','address','birthday','manager'];
  const knownLabels = { fio:'ФИО', phone:'Телефон', inn:'ИНН', snils:'СНИЛС', passport:'Паспорт', region:'Регион', city:'Город', address:'Адрес', birthday:'Д.рождения', manager:'Менеджер' };
  // System fields first
  cols.push({ key:'_status', label:'Статус' });
  cols.push({ key:'_worker', label:'Работник' });
  // Known fields
  knownFields.forEach(f => cols.push({ key: f, label: knownLabels[f] || f }));
  // Extra fields from leads
  const extraKeys = new Set();
  (base.leads || []).forEach(l => {
    try { const ex = JSON.parse(l.extra||'{}'); Object.keys(ex).forEach(k => extraKeys.add(k)); } catch(e){}
  });
  [...extraKeys].forEach(k => cols.push({ key: 'extra:'+k, label: k }));
  return cols;
}

function _getFilteredLeads() {
  if (!_deptBaseData) return [];
  let leads = _deptBaseData.leads || [];
  if (_deptBaseFilter) leads = leads.filter(l => l.status === _deptBaseFilter);
  if (_deptBaseSearch) {
    const q = _deptBaseSearch.toLowerCase();
    leads = leads.filter(l =>
      (l.fio && l.fio.toLowerCase().includes(q)) ||
      (l.phone && l.phone.toLowerCase().includes(q)) ||
      (l.inn && l.inn.toLowerCase().includes(q)) ||
      (l.snils && l.snils.toLowerCase().includes(q)) ||
      (l.region && l.region.toLowerCase().includes(q))
    );
  }
  return leads;
}

function _renderDeptBaseView() {
  const leads = _getFilteredLeads();
  const el = document.getElementById('dabDetailLeads');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(leads.length / _deptBasePageSize));
  if (_deptBasePage >= totalPages) _deptBasePage = totalPages - 1;
  if (_deptBasePage < 0) _deptBasePage = 0;
  const start = _deptBasePage * _deptBasePageSize;
  const pageLeads = leads.slice(start, start + _deptBasePageSize);

  // Get visible columns in order
  const visibleCols = (_deptFieldSettings ? _deptFieldSettings.columns : []).filter(c => _deptFieldSettings.visibility[c] !== false);

  if (leads.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3)">Нет лидов' + (_deptBaseFilter || _deptBaseSearch ? ' по вашему запросу' : '') + '</div>';
    return;
  }

  let html = `<div class="dab-leads-count">${leads.length} лидов найдено${totalPages > 1 ? ' | Стр. '+(1+_deptBasePage)+' из '+totalPages : ''}</div>`;
  html += '<div class="dab-leads-table-wrap"><table class="dab-leads-table"><thead><tr><th style="min-width:30px">#</th>';
  visibleCols.forEach(colKey => {
    const name = _deptFieldSettings.names[colKey] || colKey;
    html += '<th>' + esc(name) + '</th>';
  });
  html += '<th>Действия</th></tr></thead><tbody>';

  pageLeads.forEach((l, i) => {
    let extra = {};
    try { extra = JSON.parse(l.extra||'{}'); } catch(e){}
    html += '<tr><td style="color:var(--t3);font-size:11px">' + (start+i+1) + '</td>';
    visibleCols.forEach(colKey => {
      let val = '';
      if (colKey === '_status') {
        const st = _statusLabels[l.status] || l.status;
        html += '<td><span class="dab-status-badge dab-st-'+l.status+'">'+st+'</span></td>';
        return;
      }
      if (colKey === '_worker') {
        html += '<td style="font-size:12px;color:var(--t2)">'+esc(l.assigned_name||'—')+'</td>';
        return;
      }
      if (colKey.startsWith('extra:')) {
        val = extra[colKey.replace('extra:','')] || '';
      } else {
        val = l[colKey] || '';
      }
      // Phone styling
      if (colKey === 'phone' && val) {
        const ph = String(val).replace(/[^0-9+]/g,'');
        html += '<td><span class="dlc-phone-chip" onclick="copyPhone(\''+ph+'\',this)" style="font-size:12px;padding:3px 8px">'+esc(val)+'</span></td>';
        return;
      }
      html += '<td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(val)+'">'+(val ? esc(val) : '<span style=color:var(--t3)>—</span>')+'</td>';
    });
    html += '<td><div style="display:flex;gap:4px"><button class="dab-btn" onclick="editDeptLead('+l.id+')" title="Редактировать" style="font-size:11px">✏️</button><button class="dab-btn dab-btn-del" onclick="deleteDeptLeadFromBase('+l.id+')" title="Удалить" style="font-size:11px">🗑</button></div></td></tr>';
  });

  html += '</tbody></table></div>';

  // Pagination
  if (totalPages > 1) {
    html += '<div class="dab-pagination">';
    html += '<button class="dab-btn" onclick="deptBaseGoPage('+(Math.max(0,_deptBasePage-1))+')" '+(0===_deptBasePage?'disabled':'')+'>← Назад</button>';
    // Page numbers (show max 7)
    const maxShow = 7;
    let pStart = Math.max(0, _deptBasePage - 3);
    let pEnd = Math.min(totalPages, pStart + maxShow);
    if (pEnd - pStart < maxShow) pStart = Math.max(0, pEnd - maxShow);
    for (let p = pStart; p < pEnd; p++) {
      html += '<button class="dab-btn'+(p===_deptBasePage?' dab-page-active':'')+'" onclick="deptBaseGoPage('+p+')">'+(p+1)+'</button>';
    }
    html += '<button class="dab-btn" onclick="deptBaseGoPage('+(Math.min(totalPages-1,_deptBasePage+1))+')" '+(_deptBasePage>=totalPages-1?'disabled':'')+'>Вперёд →</button>';
    html += '</div>';
  }

  el.innerHTML = html;
}

function deptBaseGoPage(p) { _deptBasePage = p; _renderDeptBaseView(); }

let _deptSearchTimeout = null;
function deptBaseSearchHandler(val) {
  clearTimeout(_deptSearchTimeout);
  _deptSearchTimeout = setTimeout(() => {
    _deptBaseSearch = val.trim();
    _deptBasePage = 0;
    _renderDeptBaseView();
  }, 250);
}

function closeDeptBaseView() {
  _deptBaseViewId = null;
  _deptBaseData = null;
  _deptFieldSettings = null;
  const overlay = document.getElementById('deptBaseFullscreen');
  if (overlay) overlay.remove();
  loadDeptBases();
}

function filterDeptBaseDetail(status, btn) {
  if (btn) {
    btn.closest('#dabDetailFilter').querySelectorAll('.dab-filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  _deptBaseFilter = status;
  _deptBasePage = 0;
  _renderDeptBaseView();
}

// ===== FIELD SETTINGS PANEL =====
function openDeptFieldSettings() {
  if (!_deptFieldSettings) return;

  // Load VIP config from base data
  let vipCfg = {};
  try { vipCfg = JSON.parse((_deptBaseData && _deptBaseData.vip_config) || '{}'); } catch(e) {}

  const overlay = document.createElement('div');
  overlay.className = 'dab-edit-overlay';
  overlay.id = 'deptFieldSettingsOverlay';

  overlay.innerHTML = `<div class="dfs-modal">
    <div class="dfs-modal-head">
      <span>⚙ Настройки базы</span>
      <button onclick="closeDeptFieldSettings()" class="dab-btn">✕</button>
    </div>
    <div class="dfs-modal-tabs">
      <button class="dfs-tab active" onclick="switchDfsTab('fields',this)">🔧 Поля</button>
      <button class="dfs-tab" onclick="switchDfsTab('vip',this)">💰 Распределение</button>
    </div>
    <div class="dfs-modal-content">
      <div class="dfs-left">
        <div id="dfsTabFields">
          <div class="dfs-left-title">🔧 Настройка колонок</div>
          <div class="dfs-left-hint">Управляйте видимостью, названиями и порядком колонок</div>
          <div id="dfsRows" class="dfs-list"></div>
        </div>
        <div id="dfsTabVip" style="display:none">
          <div class="dfs-left-title">💰 Распределение лидов по сумме вклада</div>
          <div class="dfs-left-hint">Назначьте менеджеров на категории лидов по сумме вклада</div>
          <div class="dfs-vip-section">
            <label class="dfs-vip-toggle">
              <input type="checkbox" id="dfsAmountEnabled" ${vipCfg.enabled ? 'checked' : ''} onchange="toggleAmountBody()">
              <span>Разделять лидов по сумме вклада</span>
            </label>
            <div id="dfsAmountBody" style="${vipCfg.enabled ? '' : 'display:none'}">
              <div class="dfs-left-hint" style="margin-bottom:8px">⚡ Менеджеры НЕ отмеченные ни в одном списке — получают ВСЕ лиды</div>
              <div class="dfs-amount-cols">
                <div class="dfs-amount-col">
                  <div class="dfs-amount-col-head" style="color:#4ade80">💵 До 1 000 000 ₽</div>
                  <div class="dfs-amount-col-hint">Эти менеджеры получат только лиды &lt; 1 млн</div>
                  <div id="dfsUnderWorkers" class="dfs-amount-workers">Загрузка...</div>
                </div>
                <div class="dfs-amount-col">
                  <div class="dfs-amount-col-head" style="color:#fbbf24">💎 От 1 000 000 ₽</div>
                  <div class="dfs-amount-col-hint">Эти менеджеры получат только лиды ≥ 1 млн</div>
                  <div id="dfsOverWorkers" class="dfs-amount-workers">Загрузка...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="dfs-right">
        <div class="dfs-right-title">👁 Предпросмотр (вид работника)</div>
        <div class="dfs-right-hint">Так будет выглядеть карточка для работников</div>
        <div id="dfsPreview" class="dfs-preview-wrap"></div>
      </div>
    </div>
    <div class="dfs-modal-foot">
      <button class="dab-btn" onclick="resetDeptFieldSettings()" style="color:#f87171;border-color:rgba(248,113,113,0.3)">🔄 Сбросить</button>
      <div style="display:flex;gap:8px">
        <button class="dab-btn" onclick="closeDeptFieldSettings()">Отмена</button>
        <button class="btn-glow" onclick="saveDeptFieldSettings()"><span>💾 Сохранить</span><div class="btn-shine"></div></button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  _renderDfsRows();
  _renderDfsPreview();
  _loadAmountWorkers(vipCfg);
}

function switchDfsTab(tab, btn) {
  document.getElementById('dfsTabFields').style.display = tab === 'fields' ? '' : 'none';
  document.getElementById('dfsTabVip').style.display = tab === 'vip' ? '' : 'none';
  document.querySelectorAll('.dfs-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

function toggleAmountBody() {
  const body = document.getElementById('dfsAmountBody');
  const enabled = document.getElementById('dfsAmountEnabled').checked;
  if (body) body.style.display = enabled ? '' : 'none';
}

async function _loadAmountWorkers(cfg) {
  const underEl = document.getElementById('dfsUnderWorkers');
  const overEl = document.getElementById('dfsOverWorkers');
  if (!underEl || !overEl) return;
  try {
    const deptId = _deptBaseData && _deptBaseData.department_id;
    if (!deptId) { underEl.innerHTML = overEl.innerHTML = '<div style="color:var(--t3);font-size:11px">Нет данных</div>'; return; }
    const res = await fetch('/api/admin/departments/' + deptId + '/users');
    const workers = await res.json();
    if (!workers.length) { underEl.innerHTML = overEl.innerHTML = '<div style="color:var(--t3);font-size:11px">Нет работников</div>'; return; }
    const underIds = cfg.under_managers || [];
    const overIds = cfg.over_managers || [];
    const renderList = (ids, cls) => workers.map(w => `
      <label class="dfs-amount-worker-item">
        <input type="checkbox" value="${w.id}" class="${cls}" ${ids.includes(w.id) ? 'checked' : ''}>
        <span>${esc(w.display_name || w.username)}</span>
      </label>
    `).join('');
    underEl.innerHTML = renderList(underIds, 'dfs-under-cb');
    overEl.innerHTML = renderList(overIds, 'dfs-over-cb');
  } catch(e) { underEl.innerHTML = overEl.innerHTML = '<div style="color:#f87171;font-size:11px">Ошибка</div>'; }
}

function _renderDfsRows() {
  const container = document.getElementById('dfsRows');
  if (!container || !_deptFieldSettings) return;
  const columns = _deptFieldSettings.columns;
  container.innerHTML = columns.map((key, idx) => {
    const vis = _deptFieldSettings.visibility[key] !== false;
    const name = _deptFieldSettings.names[key] || key;
    const icon = key === '_status' ? '📊' : key === '_worker' ? '👤' : key.startsWith('extra:') ? '📝' : '📋';
    return `<div class="dfs-row ${vis ? '' : 'dfs-row-off'}" data-key="${esc(key)}">
      <div class="dfs-row-drag" title="Перетащите">≡</div>
      <button class="dfs-vis-btn ${vis?'on':'off'}" onclick="toggleDeptField('${esc(key)}')" title="${vis?'Скрыть':'Показать'}">${vis?'👁':'🚫'}</button>
      <span class="dfs-icon">${icon}</span>
      <input type="text" class="dfs-name-input" value="${esc(name)}" data-field-key="${esc(key)}" onchange="renameDeptField('${esc(key)}',this.value)" oninput="_renderDfsPreviewDebounced()" placeholder="Название...">
      <div class="dfs-arrows">
        <button class="dfs-arrow" onclick="moveDeptField('${esc(key)}',-1)" ${idx===0?'disabled':''} title="Вверх">▲</button>
        <button class="dfs-arrow" onclick="moveDeptField('${esc(key)}',1)" ${idx===columns.length-1?'disabled':''} title="Вниз">▼</button>
      </div>
    </div>`;
  }).join('');
}

let _dfsPreviewTimeout = null;
function _renderDfsPreviewDebounced() {
  clearTimeout(_dfsPreviewTimeout);
  _dfsPreviewTimeout = setTimeout(_renderDfsPreview, 150);
}

function _renderDfsPreview() {
  const container = document.getElementById('dfsPreview');
  if (!container || !_deptFieldSettings || !_deptBaseData) return;

  // Read live input values for names
  document.querySelectorAll('.dfs-name-input').forEach(inp => {
    const key = inp.dataset.fieldKey;
    if (key) _deptFieldSettings.names[key] = inp.value;
  });

  const visibleCols = _deptFieldSettings.columns.filter(c => _deptFieldSettings.visibility[c] !== false);
  // Skip system columns for card preview (they don't appear on worker card)
  const cardCols = visibleCols.filter(c => c !== '_status' && c !== '_worker');
  const sampleLead = (_deptBaseData.leads || [])[0];

  if (!sampleLead) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3);font-size:13px">Нет данных для превью</div>';
    return;
  }

  let extra = {};
  try { extra = JSON.parse(sampleLead.extra || '{}'); } catch(e) {}

  // Get value for a column key
  const getVal = (colKey) => {
    if (colKey.startsWith('extra:')) return extra[colKey.replace('extra:','')] || '';
    return sampleLead[colKey] || '';
  };

  const fioVal = getVal('fio') || 'Иванов Иван';
  const phoneVal = getVal('phone') || '';
  const allPhones = phoneVal ? phoneVal.split(/[,;\/\s]+/).filter(p => p.replace(/\D/g,'').length >= 5) : [];

  // Build card field rows (excluding fio and phone which are in the hero/phones bar)
  const fieldRows = cardCols.filter(c => c !== 'fio' && c !== 'phone').map(colKey => {
    const name = _deptFieldSettings.names[colKey] || colKey;
    const val = getVal(colKey);
    const icon = colKey === 'region' ? '🗺️' : colKey === 'city' ? '🏙️' : colKey === 'address' ? '📍' :
                 colKey === 'inn' ? '🏛️' : colKey === 'snils' ? '📄' : colKey === 'passport' ? '🪪' :
                 colKey === 'birthday' ? '🎂' : colKey === 'manager' ? '👔' : '📋';
    return { icon, label: name, val: val || '—' };
  });

  let html = `
    <div class="dfs-card-preview">
      <div class="dfs-card-hero">
        <div class="dfs-card-avatar">${fioVal[0].toUpperCase()}</div>
        <div class="dfs-card-hero-info">
          <div class="dfs-card-name">${esc(fioVal)}</div>
          <div class="dfs-card-meta">
            <span class="dfs-card-badge">ID: ${sampleLead.id}</span>
            <span class="dfs-card-badge dfs-card-badge-status">${sampleLead.status || 'new'}</span>
          </div>
        </div>
      </div>
      ${allPhones.length ? `
        <div class="dfs-card-phones">
          <span style="font-size:11px;color:var(--t3);font-weight:700">📱 Телефоны:</span>
          ${allPhones.slice(0, 3).map(p => `<span class="dfs-card-phone-chip">📞 ${esc(p)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="dfs-card-fields">
        ${fieldRows.length ? fieldRows.map(f => `
          <div class="dfs-card-field">
            <span class="dfs-card-field-icon">${f.icon}</span>
            <div class="dfs-card-field-body">
              <div class="dfs-card-field-label">${esc(f.label)}</div>
              <div class="dfs-card-field-value">${esc(f.val)}</div>
            </div>
          </div>
        `).join('') : '<div style="text-align:center;padding:12px;color:var(--t3);font-size:12px">Нет видимых полей</div>'}
      </div>
      <div class="dfs-card-actions">
        <span class="dfs-card-act dfs-card-act-red">❌ Не дозвон</span>
        <span class="dfs-card-act dfs-card-act-yellow">📞 Перезвон</span>
        <span class="dfs-card-act dfs-card-act-gray">⏭ Скип</span>
        <span class="dfs-card-act dfs-card-act-green">✅ Передал</span>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function closeDeptFieldSettings() {
  const ov = document.getElementById('deptFieldSettingsOverlay');
  if (ov) ov.remove();
}

function toggleDeptField(key) {
  if (!_deptFieldSettings) return;
  _deptFieldSettings.visibility[key] = !(_deptFieldSettings.visibility[key] !== false);
  _renderDfsRows();
  _renderDfsPreview();
  _renderDeptBaseView();
}

function renameDeptField(key, val) {
  if (!_deptFieldSettings) return;
  _deptFieldSettings.names[key] = val;
  _renderDfsPreview();
  _renderDeptBaseView();
}

function moveDeptField(key, dir) {
  if (!_deptFieldSettings) return;
  const cols = _deptFieldSettings.columns;
  const idx = cols.indexOf(key);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cols.length) return;
  [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
  _renderDfsRows();
  _renderDfsPreview();
  _renderDeptBaseView();
}

function resetDeptFieldSettings() {
  if (!_deptBaseData || !confirm('Сбросить все настройки полей к значениям по умолчанию?')) return;
  const detected = _detectBaseColumns(_deptBaseData);
  _deptFieldSettings = { columns: detected.map(c=>c.key), visibility: {}, names: {} };
  detected.forEach(c => { _deptFieldSettings.visibility[c.key] = true; _deptFieldSettings.names[c.key] = c.label; });
  _renderDfsRows();
  _renderDfsPreview();
  _renderDeptBaseView();
}

async function saveDeptFieldSettings() {
  if (!_deptBaseViewId || !_deptFieldSettings) return;
  try {
    // Save field settings
    const r = await fetch('/api/admin/dept-bases/' + _deptBaseViewId + '/settings', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ field_settings: _deptFieldSettings })
    });

    // Save amount distribution config
    const amountEnabled = document.getElementById('dfsAmountEnabled');
    const under_managers = [];
    const over_managers = [];
    document.querySelectorAll('.dfs-under-cb:checked').forEach(cb => under_managers.push(parseInt(cb.value)));
    document.querySelectorAll('.dfs-over-cb:checked').forEach(cb => over_managers.push(parseInt(cb.value)));
    const vip_config = { enabled: amountEnabled ? amountEnabled.checked : false, under_managers, over_managers };
    await fetch('/api/admin/dept-bases/' + _deptBaseViewId + '/vip-config', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ vip_config })
    });
    if (_deptBaseData) _deptBaseData.vip_config = JSON.stringify(vip_config);

    if (r.ok) {
      showToast('✅ Настройки сохранены!', 'success');
      closeDeptFieldSettings();
    } else showToast('❌ Ошибка сохранения', 'error');
  } catch(e) { showToast('❌ Ошибка сети', 'error'); }
}

// ===== EDIT / DELETE DEPT LEAD =====
async function editDeptLead(id) {
  let lead = null;
  if (_deptBaseData && _deptBaseData.leads) {
    lead = _deptBaseData.leads.find(l => l.id === id);
  }
  if (!lead) {
    const res = await fetch('/api/admin/departments/' + currentDeptId + '/leads?base_id=' + _deptBaseViewId);
    const leads = await res.json();
    lead = leads.find(l => l.id === id);
  }
  if (!lead) return showToast('❌ Лид не найден', 'error');
  const fields = [
    { key:'fio', label:'ФИО', val:lead.fio||'' },
    { key:'phone', label:'Телефон', val:lead.phone||'' },
    { key:'inn', label:'ИНН', val:lead.inn||'' },
    { key:'snils', label:'СНИЛС', val:lead.snils||'' },
    { key:'passport', label:'Паспорт', val:lead.passport||'' },
    { key:'region', label:'Регион', val:lead.region||'' },
    { key:'city', label:'Город', val:lead.city||'' },
    { key:'address', label:'Адрес', val:lead.address||'' },
    { key:'birthday', label:'Дата рождения', val:lead.birthday||'' },
    { key:'manager', label:'Менеджер', val:lead.manager||'' },
  ];
  const statuses = ['new','no_answer','callback','passed','docs','skipped','talked','other_person'];
  const overlay = document.createElement('div');
  overlay.className = 'dab-edit-overlay';
  overlay.innerHTML = `<div class="dab-edit-modal">
    <div class="dab-edit-head"><span>✏️ Редактировать лид #${id}</span><button onclick="this.closest('.dab-edit-overlay').remove()" class="dab-btn">✕</button></div>
    <div class="dab-edit-body">
      ${fields.map(f => `<div class="dab-edit-row"><label>${f.label}</label><input type="text" id="dedit_${f.key}" value="${esc(f.val)}"></div>`).join('')}
      <div class="dab-edit-row"><label>Статус</label><select id="dedit_status">${statuses.map(s => `<option value="${s}" ${lead.status===s?'selected':''}>${_statusLabels[s]||s}</option>`).join('')}</select></div>
    </div>
    <div class="dab-edit-foot">
      <button class="btn-glow" onclick="saveDeptLead(${id},this)"><span>💾 Сохранить</span><div class="btn-shine"></div></button>
      <button class="dab-btn" onclick="this.closest('.dab-edit-overlay').remove()">Отмена</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function saveDeptLead(id, btn) {
  const data = {};
  ['fio','phone','inn','snils','passport','region','city','address','birthday','manager'].forEach(k => {
    const el = document.getElementById('dedit_' + k);
    if (el) data[k] = el.value;
  });
  data.status = document.getElementById('dedit_status').value;
  const r = await fetch('/api/admin/dept-leads/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (r.ok) {
    showToast('✅ Лид обновлён', 'success');
    btn.closest('.dab-edit-overlay').remove();
    // Reload base
    openDeptBase(_deptBaseViewId, _deptBaseData ? _deptBaseData.name : '');
  } else showToast('❌ Ошибка', 'error');
}

async function deleteDeptLeadFromBase(id) {
  if (!confirm('Удалить лид?')) return;
  await fetch('/api/admin/dept-leads/' + id, { method: 'DELETE' });
  showToast('Лид удалён', 'success');
  openDeptBase(_deptBaseViewId, _deptBaseData ? _deptBaseData.name : '');
}

async function loadDeptBases() {
  if (!currentDeptId) return;
  const res = await fetch('/api/admin/departments/' + currentDeptId + '/bases');
  const bases = await res.json();
  const el = document.getElementById('deptBasesList');
  if (bases.length === 0) { el.innerHTML = '<div class="tf-empty" style="padding:40px;text-align:center"><div style="font-size:48px;margin-bottom:12px;filter:grayscale(.5)">📂</div><div style="font-size:16px;font-weight:800;color:var(--t1)">Нет баз</div><div style="font-size:12px;color:var(--t3);margin-top:4px">Загрузите базу через вкладку "Загрузка базы"</div></div>'; return; }
  el.innerHTML = `<div class="dab-grid">${bases.map(b => {
    const total = b.lead_count;
    const newC = b.stats?.new || 0;
    const passedC = b.stats?.passed || 0;
    const noAnsC = b.stats?.no_answer || 0;
    const docsC = b.stats?.docs || 0;
    const processed = total - newC;
    const pct = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;
    const statusColor = b.enabled ? '#4ade80' : '#f87171';
    const statusText = b.enabled ? 'Активна' : 'Выключена';
    const encodedName = encodeURIComponent(b.name);
    return `<div class="dab-card" style="cursor:pointer" onclick="openDeptBase(${b.id},decodeURIComponent('${encodedName}'))" title="Открыть базу">
      <div class="dab-top">
        <div class="dab-icon" style="background:linear-gradient(135deg,rgba(96,165,250,0.15),rgba(129,140,248,0.1))">📋</div>
        <div class="dab-title-wrap">
          <div class="dab-name">${esc(b.name)}</div>
          <div class="dab-status" style="color:${statusColor}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${statusColor};margin-right:4px"></span>${statusText}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0" onclick="event.stopPropagation()">
          <button class="dab-btn" onclick="renameDeptBase(${b.id},decodeURIComponent('${encodedName}'))" title="Переименовать">✏️</button>
          <button class="dab-btn dab-btn-toggle" onclick="toggleDeptBase(${b.id})">${b.enabled ? '⏸ Выкл' : '▶ Вкл'}</button>
          <button class="dab-btn dab-btn-del" onclick="deleteDeptBase(${b.id})">🗑</button>
        </div>
      </div>
      <div class="dab-chips">
        <span class="dab-chip">📋 <strong>${total}</strong> всего</span>
        <span class="dab-chip dab-chip-green">🆕 <strong>${newC}</strong> новых</span>
        <span class="dab-chip dab-chip-blue">✅ <strong>${passedC}</strong> передал</span>
        <span class="dab-chip dab-chip-red">❌ <strong>${noAnsC}</strong> нет отв.</span>
        ${docsC ? `<span class="dab-chip dab-chip-purple">📄 <strong>${docsC}</strong> срез</span>` : ''}
      </div>
      <div class="dab-progress">
        <div class="dab-progress-bar"><div class="dab-progress-fill" style="width:${pct}%"></div></div>
        <span class="dab-progress-pct">${pct}%</span>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// Client-side filter for base cards by name
function filterDeptBases() {
  const q = (document.getElementById('deptBasesSearch')?.value || '').toLowerCase().trim();
  const cards = document.querySelectorAll('#deptBasesList .dab-card');
  cards.forEach(card => {
    const name = (card.querySelector('.dab-name')?.textContent || '').toLowerCase();
    card.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

// API search for FIO across all bases in this department
let _fioSearchTimeout = null;
async function searchDeptBaseByFio() {
  const q = (document.getElementById('deptBasesSearch')?.value || '').trim();
  const resultsEl = document.getElementById('deptBaseFioResults');
  if (!resultsEl) return;
  if (!q || q.length < 2) { resultsEl.innerHTML = ''; return; }

  resultsEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--t2)">⏳ Поиск...</div>';

  try {
    const res = await fetch('/api/admin/dept-leads/search-fio?q=' + encodeURIComponent(q));
    const data = await res.json();

    // Filter by current department
    const filtered = currentDeptId ? data.filter(d => d.department_id === currentDeptId) : data;

    if (filtered.length === 0) {
      resultsEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--t3);font-size:13px">🔍 Ничего не найдено по запросу «' + esc(q) + '»</div>';
      return;
    }

    // Group by base
    const byBase = {};
    filtered.forEach(l => {
      const key = l.base_name || '—';
      if (!byBase[key]) byBase[key] = [];
      byBase[key].push(l);
    });

    const statusLabels = {
      'new': '🆕 Новый', 'no_answer': '❌ Не дозвон', 'callback': '📞 Перезвон',
      'passed': '✅ Передал', 'docs': '📄 Срез', 'skipped': '⏭ Скип',
      'talked': '🗣️ Говорил', 'other_person': '👤 Другой'
    };

    let html = `<div style="font-size:13px;color:var(--t2);margin-bottom:8px;font-weight:700">Найдено: ${filtered.length} совпадений в ${Object.keys(byBase).length} базах</div>`;
    
    Object.entries(byBase).forEach(([baseName, leads]) => {
      html += `<div style="margin-bottom:12px;padding:12px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.2);border-radius:12px">
        <div style="font-size:14px;font-weight:800;color:#60a5fa;margin-bottom:8px">📋 ${esc(baseName)} <span style="font-weight:400;font-size:12px;color:var(--t3)">(${leads.length} чел.)</span></div>`;
      
      leads.forEach(l => {
        const st = statusLabels[l.status] || l.status || '';
        html += `<div style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-weight:700;color:var(--t1);font-size:13px;flex:1;min-width:200px">${esc(l.fio)}</span>
          ${l.phone ? `<span style="font-size:12px;color:var(--t2)">📱 ${esc(l.phone)}</span>` : ''}
          ${st ? `<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.05);color:var(--t2)">${st}</span>` : ''}
        </div>`;
      });
      
      html += `</div>`;
    });

    resultsEl.innerHTML = html;
  } catch(e) {
    resultsEl.innerHTML = '<div style="text-align:center;padding:12px;color:#f87171">❌ Ошибка поиска</div>';
  }
}
function initDeptExcelUpload() {
  const zone = document.getElementById('deptExcelUploadZone');
  const input = document.getElementById('deptExcelFileInput');
  if (!zone || !input) return;
  zone.onclick = () => input.click();
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
  zone.ondragleave = () => zone.classList.remove('dragover');
  zone.ondrop = (e) => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleDeptExcelFile(e.dataTransfer.files[0]);
  };
  input.onchange = () => { if (input.files.length) handleDeptExcelFile(input.files[0]); };
}

async function handleDeptExcelFile(file) {
  deptExcelFile = file;
  const zone = document.getElementById('deptExcelUploadZone');
  const loading = document.getElementById('deptExcelLoading');
  zone.classList.add('hidden');
  loading.classList.remove('hidden');
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/admin/departments/' + currentDeptId + '/import-excel', {
      method: 'POST', body: formData
    });
    loading.classList.add('hidden');
    if (!res.ok) {
      const e = await res.json();
      showToast('❌ ' + e.error, 'error');
      zone.classList.remove('hidden');
      return;
    }
    deptImportData = await res.json();
    // Initialize column visibility & custom names
    deptImportData._visible = {};
    deptImportData._customNames = {};
    deptImportData.columns.forEach(c => {
      deptImportData._visible[c] = true;
      deptImportData._customNames[c] = c;
    });
    renderDeptUnifiedTable(deptImportData);
    document.getElementById('deptColumnMapping').classList.add('hidden'); // old one hidden
    document.getElementById('deptDataPreview').classList.remove('hidden');
    document.getElementById('deptImportActions').classList.remove('hidden');
    document.getElementById('deptPreviewCount').textContent = deptImportData.total_rows;
    document.getElementById('deptImportBaseName').value = file.name.replace(/\.[^.]+$/, '');
  } catch(e) {
    loading.classList.add('hidden');
    zone.classList.remove('hidden');
    showToast('❌ Ошибка загрузки', 'error');
  }
}

function renderDeptUnifiedTable(data) {
  const table = document.getElementById('deptPreviewTable');
  const cols = data.columns;
  const fieldLabels = {
    'fio': '👤 ФИО', 'phone': '📱 Телефон', 'region': '🗺 Регион', 'city': '🏙 Город',
    'address': '📍 Адрес', 'birthday': '🎂 Д.Р.', 'inn': '🏛 ИНН', 'snils': '📄 СНИЛС',
    'passport': '🪪 Паспорт', 'extra': '📝 Доп.', 'manager': '👔 Менеджер',
    'base_id_col': '🔢 ID', 'skip': '⏭ Скип', 'status': '📊 Статус'
  };
  const options = Object.entries(fieldLabels).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');

  // Row 1: Visibility toggle
  let html = '<thead>';
  html += '<tr class="cmap-toggle-row">' + cols.map((c, i) => {
    const vis = data._visible[c];
    return `<th class="${vis ? '' : 'col-hidden'}">
      <button class="col-vis-btn ${vis ? 'on' : 'off'}" onclick="toggleDeptCol(${i})" title="${vis ? 'Скрыть' : 'Показать'}">
        ${vis ? '👁' : '🚫'}
      </button>
    </th>`;
  }).join('') + '</tr>';

  // Row 2: Custom name input
  html += '<tr class="cmap-name-row">' + cols.map((c, i) => {
    const vis = data._visible[c];
    return `<th class="${vis ? '' : 'col-hidden'}">
      <input type="text" class="col-name-input" data-idx="${i}" value="${esc(data._customNames[c])}" onchange="updateDeptColName(${i},this.value)" placeholder="Имя..." />
    </th>`;
  }).join('') + '</tr>';

  // Row 3: Field mapping dropdown
  html += '<tr class="cmap-field-row">' + cols.map((c, i) => {
    const mapped = data.column_map[c] || 'extra';
    const vis = data._visible[c];
    return `<th class="${vis ? '' : 'col-hidden'}">
      <select class="cmap-select-wide" data-col="${esc(c)}" data-idx="${i}">
        ${options.replace('value="'+mapped+'"', 'value="'+mapped+'" selected')}
      </select>
    </th>`;
  }).join('') + '</tr>';

  // Row 4: Original column name (label)
  html += '<tr class="cmap-orig-row">' + cols.map((c, i) => {
    const vis = data._visible[c];
    return `<th class="col-orig-name ${vis ? '' : 'col-hidden'}">${esc(c)}</th>`;
  }).join('') + '</tr>';

  html += '</thead>';

  // Data rows
  html += '<tbody>' + data.preview.map(row =>
    '<tr>' + cols.map((c, i) => {
      const vis = data._visible[c];
      return `<td class="${vis ? '' : 'col-hidden'}">${esc(String(row[c] || ''))}</td>`;
    }).join('') + '</tr>'
  ).join('') + '</tbody>';

  table.innerHTML = html;
}

function toggleDeptCol(idx) {
  if (!deptImportData) return;
  const col = deptImportData.columns[idx];
  deptImportData._visible[col] = !deptImportData._visible[col];
  renderDeptUnifiedTable(deptImportData);
}

function updateDeptColName(idx, val) {
  if (!deptImportData) return;
  const col = deptImportData.columns[idx];
  deptImportData._customNames[col] = val;
}

// Keep old functions as no-ops for backward compat
function renderDeptColumnMapping(data) {}
function renderDeptPreview(data) {}

async function confirmDeptImport() {
  if (!deptExcelFile || !deptImportData) return;
  const columnMap = {};
  const columnVisibility = {};
  const columnNames = {};
  document.querySelectorAll('#deptPreviewTable .cmap-select-wide').forEach(sel => {
    columnMap[sel.dataset.col] = sel.value;
  });
  deptImportData.columns.forEach(c => {
    columnVisibility[c] = deptImportData._visible[c];
    columnNames[c] = deptImportData._customNames[c] || c;
  });
  const baseName = document.getElementById('deptImportBaseName').value.trim() || deptExcelFile.name;
  const autoSort = document.getElementById('deptAutoSortInn');
  const formData = new FormData();
  formData.append('file', deptExcelFile);
  formData.append('column_map', JSON.stringify(columnMap));
  formData.append('columns', JSON.stringify(deptImportData.columns));
  formData.append('column_visibility', JSON.stringify(columnVisibility));
  formData.append('column_names', JSON.stringify(columnNames));
  formData.append('base_name', baseName);
  if (autoSort && autoSort.checked) formData.append('auto_sort_inn', '1');
  try {
    const res = await fetch('/api/admin/departments/' + currentDeptId + '/confirm-import', {
      method: 'POST', body: formData
    });
    const result = await res.json();
    const el = document.getElementById('deptImportResult');
    el.classList.remove('hidden');
    if (res.ok) {
      el.style.background = 'rgba(74,222,128,0.1)';
      el.style.borderColor = 'rgba(74,222,128,0.3)';
      el.style.color = '';
      if (result.bases_created && result.bases_created.length > 1) {
        el.innerHTML = `<div style="color:#4ade80;font-weight:800;margin-bottom:8px">✅ Импортировано: <strong>${result.imported}</strong> | Дубликаты: ${result.duplicates} | Баз создано: ${result.base_count}</div>
        <div style="display:flex;flex-direction:column;gap:4px">${result.bases_created.map(b =>
          `<div style="padding:6px 10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.2);border-radius:8px;display:flex;justify-content:space-between;align-items:center">
            <span style="color:var(--t1);font-weight:700;font-size:13px">${esc(b.name)}</span>
            <span style="color:var(--t3);font-size:12px">${b.count} лидов</span>
          </div>`
        ).join('')}</div>`;
      } else {
        el.innerHTML = `<span style="color:#4ade80">✅ Импортировано: <strong>${result.imported}</strong> записей. Дубликатов: ${result.duplicates}.</span>`;
      }
      showToast('✅ Импорт завершён!', 'success');
      loadDeptBases();
    } else {
      el.style.background = 'rgba(239,68,68,0.1)';
      el.style.borderColor = 'rgba(239,68,68,0.3)';
      el.style.color = 'var(--red)';
      el.innerHTML = '❌ ' + (result.error || 'Ошибка');
    }
  } catch(e) { showToast('❌ Ошибка импорта', 'error'); }
}

function cancelDeptImport() {
  deptExcelFile = null; deptImportData = null;
  const zone = document.getElementById('deptExcelUploadZone');
  if (zone) zone.classList.remove('hidden');
  ['deptExcelLoading','deptColumnMapping','deptDataPreview','deptImportActions','deptImportResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const input = document.getElementById('deptExcelFileInput');
  if (input) input.value = '';
}

async function loadDeptUsers() {
  if (!currentDeptId) return;
  const res = await fetch('/api/admin/departments/' + currentDeptId + '/users');
  const users = await res.json();
  const el = document.getElementById('deptUsersList');
  if (users.length === 0) { el.innerHTML = '<div class="tf-empty">Нет работников</div>'; return; }
  el.innerHTML = users.map(u => `
    <div class="user-row"><div class="user-info"><strong>${esc(u.display_name)}</strong><span style="color:var(--t2);font-size:12px">@${esc(u.username)}</span></div>
    <button class="btn-outline-sm" onclick="deleteDeptUser(${u.id})" style="color:var(--red);border-color:rgba(239,68,68,0.3)">🗑</button></div>
  `).join('');
}

async function createDeptUser(e) {
  e.preventDefault();
  const name = document.getElementById('deptNewUserName').value.trim();
  const login = document.getElementById('deptNewUserLogin').value.trim();
  const pass = document.getElementById('deptNewUserPass').value.trim();
  if (!name || !login || !pass) return;
  const res = await fetch('/api/admin/departments/' + currentDeptId + '/users', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ display_name: name, username: login, password: pass })
  });
  if (res.ok) {
    showToast('✅ Работник создан!', 'success');
    document.getElementById('deptNewUserName').value = '';
    document.getElementById('deptNewUserLogin').value = '';
    document.getElementById('deptNewUserPass').value = '';
    loadDeptUsers();
  } else { const e = await res.json(); showToast('❌ ' + e.error, 'error'); }
}

async function deleteDeptUser(id) {
  if (!confirm('Удалить работника?')) return;
  await fetch('/api/admin/dept-users/' + id, { method: 'DELETE' });
  showToast('Работник удалён', 'success'); loadDeptUsers();
}

async function loadDeptLeads(status, btn) {
  if (!currentDeptId) return;
  if (btn) {
    btn.closest('.filter-row').querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const url = '/api/admin/departments/' + currentDeptId + '/leads' + (status ? '?status=' + status : '');
  const res = await fetch(url);
  const leads = await res.json();
  const el = document.getElementById('deptLeadsList');
  if (leads.length === 0) { el.innerHTML = '<div class="tf-empty">Нет лидов</div>'; return; }
  const sl = { new:'🆕 Новый', no_answer:'❌ Не дозвон', callback:'📞 Перезвон', passed:'✅ Передал', docs:'📄 Срез', skipped:'⏭ Скип' };
  el.innerHTML = leads.map(l => `
    <div class="lead-item"><div class="lead-item-main">
      <strong>${esc(l.fio || '—')}</strong>
      <span style="color:var(--t2);font-size:12px">${esc(l.phone || '')} ${l.inn ? '| ИНН: ' + esc(l.inn) : ''}</span>
      <span style="font-size:11px">${sl[l.status] || l.status} ${l.assigned_name !== '—' ? '| 👤 ' + esc(l.assigned_name) : ''}</span>
    </div><button class="btn-outline-sm" onclick="deleteDeptLead(${l.id})" style="color:var(--red);border-color:rgba(239,68,68,0.3);font-size:11px">🗑</button></div>
  `).join('');
}

async function deleteDeptLead(id) {
  if (!confirm('Удалить лид?')) return;
  await fetch('/api/admin/dept-leads/' + id, { method: 'DELETE' });
  loadDeptLeads('');
}

async function renameDeptBase(id, currentName) {
  const newName = prompt('Новое название базы:', currentName);
  if (!newName || newName.trim() === currentName) return;
  const r = await fetch('/api/admin/dept-bases/' + id + '/rename', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name: newName.trim() })
  });
  if (r.ok) { showToast('✅ База переименована', 'success'); loadDeptBases(); }
  else showToast('❌ Ошибка', 'error');
}

async function loadDeptBases() {
  if (!currentDeptId) return;
  const res = await fetch('/api/admin/departments/' + currentDeptId + '/bases');
  const bases = await res.json();
  window._deptBasesData = bases; // store for search
  renderDeptBasesFiltered(bases);
}

function filterDeptBases() {
  const q = (document.getElementById('deptBasesSearch')?.value || '').trim().toLowerCase();
  const bases = window._deptBasesData || [];
  if (!q) { renderDeptBasesFiltered(bases); return; }
  const filtered = bases.filter(b => {
    const name = (b.name || '').toLowerCase();
    return name.includes(q);
  });
  renderDeptBasesFiltered(filtered);
}

function renderDeptBasesFiltered(bases) {
  const el = document.getElementById('deptBasesList');
  if (bases.length === 0) { el.innerHTML = '<div class="tf-empty" style="padding:40px;text-align:center"><div style="font-size:48px;margin-bottom:12px;filter:grayscale(.5)">📂</div><div style="font-size:16px;font-weight:800;color:var(--t1)">Нет баз</div><div style="font-size:12px;color:var(--t3);margin-top:4px">Загрузите базу через вкладку "Загрузка базы"</div></div>'; return; }
  el.innerHTML = `<div class="dab-grid">${bases.map(b => {
    const total = b.lead_count;
    const newC = b.stats?.new || 0;
    const passedC = b.stats?.passed || 0;
    const noAnsC = b.stats?.no_answer || 0;
    const docsC = b.stats?.docs || 0;
    const processed = total - newC;
    const pct = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;
    const statusColor = b.enabled ? '#4ade80' : '#f87171';
    const statusText = b.enabled ? 'Активна' : 'Выключена';
    const encodedName2 = encodeURIComponent(b.name);
    return `<div class="dab-card" onclick="openDeptBase(${b.id},decodeURIComponent('${encodedName2}'))">
      <div class="dab-card-body">
        <div class="dab-top">
          <div class="dab-icon">📋</div>
          <div class="dab-title-wrap">
            <div class="dab-name">${esc(b.name)}</div>
            <div class="dab-status" style="color:${statusColor}"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${statusColor};margin-right:5px;box-shadow:0 0 6px ${statusColor}"></span>${statusText}</div>
          </div>
          <div class="dab-actions" onclick="event.stopPropagation()">
            <button class="dab-btn" onclick="renameDeptBase(${b.id},decodeURIComponent('${encodedName2}'))" title="Переименовать">✏️</button>
            <button class="dab-btn dab-btn-toggle" onclick="toggleDeptBase(${b.id})">${b.enabled ? '⏸ Выкл' : '▶ Вкл'}</button>
            <button class="dab-btn dab-btn-del" onclick="deleteDeptBase(${b.id})">🗑</button>
          </div>
        </div>
        <div class="dab-stats-row">
          <div class="dab-stat-box"><div class="dab-stat-val" style="color:var(--t1)">${total}</div><div class="dab-stat-lbl">Всего</div></div>
          <div class="dab-stat-box"><div class="dab-stat-val" style="color:#4ade80">${newC}</div><div class="dab-stat-lbl">Новых</div></div>
          <div class="dab-stat-box"><div class="dab-stat-val" style="color:#60a5fa">${passedC}</div><div class="dab-stat-lbl">Передал</div></div>
          <div class="dab-stat-box"><div class="dab-stat-val" style="color:#f87171">${noAnsC}</div><div class="dab-stat-lbl">Нет отв</div></div>
          ${docsC ? `<div class="dab-stat-box"><div class="dab-stat-val" style="color:#c084fc">${docsC}</div><div class="dab-stat-lbl">Срез</div></div>` : ''}
        </div>
      </div>
      <div class="dab-footer">
        <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase">Обработано</div>
        <div class="dab-progress">
          <div class="dab-progress-bar"><div class="dab-progress-fill" style="width:${pct}%"></div></div>
          <span class="dab-progress-pct">${pct}%</span>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

async function toggleDeptBase(id) {
  await fetch('/api/admin/dept-bases/' + id + '/toggle', { method: 'POST' });
  loadDeptBases();
}

async function deleteDeptBase(id) {
  if (!confirm('Удалить базу и все её лиды?')) return;
  await fetch('/api/admin/dept-bases/' + id, { method: 'DELETE' });
  showToast('База удалена', 'success'); loadDeptBases();
}

async function loadDeptStats() {
  if (!currentDeptId) return;
  const res = await fetch('/api/admin/departments/' + currentDeptId + '/stats');
  const stats = await res.json();
  const el = document.getElementById('deptStatsContent');
  const sc = stats.statusCounts;
  const total = stats.total_leads;
  const processed = total - (sc.new || 0);
  const pct = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;
  const pctNum = parseFloat(pct);
  const ringR = 54, ringC = 2 * Math.PI * ringR;
  const ringDash = (pctNum / 100) * ringC;
  const ringColor = pctNum >= 50 ? '#4ade80' : pctNum >= 25 ? '#fbbf24' : '#60a5fa';

  const statCards = [
    { icon:'📋', label:'Всего лидов', val:total, color:'#60a5fa' },
    { icon:'🆕', label:'Новых', val:sc.new||0, color:'#4ade80' },
    { icon:'✅', label:'Передал', val:sc.passed||0, color:'#34d399' },
    { icon:'❌', label:'Не дозвон', val:sc.no_answer||0, color:'#f87171' },
    { icon:'📞', label:'Перезвон', val:sc.callback||0, color:'#fbbf24' },
    { icon:'📄', label:'Срез на доках', val:sc.docs||0, color:'#c084fc' },
    { icon:'⏭', label:'Скип', val:sc.skipped||0, color:'#9ca3af' },
    { icon:'🗣️', label:'Говорил > 1.5', val:sc.talked||0, color:'#22d3ee' },
  ];

  el.innerHTML = `
    <div class="das-hero">
      <div class="das-ring-wrap">
        <svg viewBox="0 0 120 120" width="130" height="130">
          <circle cx="60" cy="60" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>
          <circle cx="60" cy="60" r="${ringR}" fill="none" stroke="${ringColor}" stroke-width="8"
            stroke-dasharray="${ringDash} ${ringC - ringDash}" stroke-linecap="round"
            transform="rotate(-90 60 60)" style="transition:stroke-dasharray 1s ease"/>
        </svg>
        <div class="das-ring-center">
          <div class="das-ring-val" style="color:${ringColor}">${pct}%</div>
          <div class="das-ring-lbl">прогресс</div>
        </div>
      </div>
      <div class="das-hero-info">
        <div class="das-hero-title">Статистика отдела</div>
        <div class="das-hero-sub">${processed} из ${total} лидов обработано</div>
      </div>
    </div>

    <div class="das-cards">
      ${statCards.map(s => `<div class="das-card">
        <div class="das-card-icon">${s.icon}</div>
        <div class="das-card-val" style="color:${s.color}">${s.val}</div>
        <div class="das-card-lbl">${s.label}</div>
      </div>`).join('')}
    </div>

    <div class="das-section">
      <div class="das-section-head">
        <span>👥 Работники (${stats.user_count})</span>
        <span class="das-today-badge">🔥 ${stats.today_actions} действий сегодня</span>
      </div>
      ${stats.workers.length ? `<div class="das-workers">
        ${stats.workers.map(w => {
          const wTotal = w.total || 1;
          const wPassed = w['передал']||0;
          const wNo = w['не_дозвон']||0;
          const wCb = w['перезвон']||0;
          const wDocs = w['срез_на_доках']||0;
          const wConv = wTotal > 0 ? ((wPassed / wTotal) * 100).toFixed(0) : 0;
          return `<div class="das-worker">
            <div class="das-w-head">
              <div class="das-w-avatar">${(w.display_name||'?')[0].toUpperCase()}</div>
              <div class="das-w-info">
                <div class="das-w-name">${esc(w.display_name)}</div>
                <div class="das-w-meta">${w.total} действий · ${wConv}% конверсия</div>
              </div>
              <div class="das-w-total">${w.total}</div>
            </div>
            <div class="das-w-stats">
              <span class="das-w-chip das-w-green">✅ ${wPassed}</span>
              <span class="das-w-chip das-w-red">❌ ${wNo}</span>
              <span class="das-w-chip das-w-yellow">📞 ${wCb}</span>
              <span class="das-w-chip das-w-purple">📄 ${wDocs}</span>
            </div>
            <div class="das-w-bar"><div class="das-w-bar-fill" style="width:${wConv}%;background:${parseInt(wConv)>=30?'#4ade80':parseInt(wConv)>=15?'#fbbf24':'#f87171'}"></div></div>
          </div>`;
        }).join('')}
      </div>` : '<div style="text-align:center;padding:20px;color:var(--t3)">Нет активности работников</div>'}
    </div>
  `;
}

// ============ GLOBAL DEPARTMENT STATS DASHBOARD ============
let _gsDateFrom = '';
let _gsDateTo = '';

async function loadGlobalStats(dateFrom, dateTo) {
  if (dateFrom !== undefined) _gsDateFrom = dateFrom || '';
  if (dateTo !== undefined) _gsDateTo = dateTo || '';
  const el = document.getElementById('globalStatsContent');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3);font-size:16px">⏳ Загрузка...</div>';

  try {
    let url = '/api/admin/dept-global-stats';
    const params = [];
    if (_gsDateFrom) params.push('date_from=' + _gsDateFrom);
    if (_gsDateTo) params.push('date_to=' + _gsDateTo);
    if (params.length) url += '?' + params.join('&');
    const res = await fetch(url);
    const s = await res.json();
    const esc = (str) => String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Period label
    let periodLabel = 'Все время';
    if (_gsDateFrom && _gsDateTo) periodLabel = _gsDateFrom + ' — ' + _gsDateTo;
    else if (_gsDateFrom) periodLabel = 'с ' + _gsDateFrom;
    else if (_gsDateTo) periodLabel = 'до ' + _gsDateTo;

    // Date picker bar
    const datePickerHtml = `
      <div class="gs-date-bar">
        <div class="gs-date-pills">
          <button class="gs-pill ${!_gsDateFrom&&!_gsDateTo?'active':''}" onclick="gsSetPeriod('')">📊 Все</button>
          <button class="gs-pill ${_gsDateFrom===new Date().toISOString().slice(0,10)&&_gsDateTo===new Date().toISOString().slice(0,10)?'active':''}" onclick="gsSetPeriod('today')">📅 Сегодня</button>
          <button class="gs-pill" onclick="gsSetPeriod('7d')">🗓 7 дней</button>
          <button class="gs-pill" onclick="gsSetPeriod('30d')">📆 30 дней</button>
        </div>
        <div class="gs-date-inputs">
          <span style="font-size:11px;color:var(--t3);font-weight:700">📅 от</span>
          <input type="date" id="gsDateFrom" value="${_gsDateFrom}" onchange="gsApplyDates()" style="font-size:12px;padding:5px 8px;background:var(--glass2);border:1px solid var(--border);border-radius:8px;color:var(--t1);font-family:var(--font)">
          <span style="font-size:11px;color:var(--t3);font-weight:700">до</span>
          <input type="date" id="gsDateTo" value="${_gsDateTo}" onchange="gsApplyDates()" style="font-size:12px;padding:5px 8px;background:var(--glass2);border:1px solid var(--border);border-radius:8px;color:var(--t1);font-family:var(--font)">
          ${_gsDateFrom||_gsDateTo?`<button class="gs-pill" onclick="gsSetPeriod('')" style="color:#f87171;border-color:rgba(248,113,113,0.3)">✕</button>`:''}
        </div>
        ${_gsDateFrom||_gsDateTo?`<div class="gs-period-label">📌 Период: <b>${periodLabel}</b></div>`:''}
      </div>
    `;

    // Dial rate color helper
    function dialColor(rate) {
      if (rate >= 70) return '#4ade80';
      if (rate >= 50) return '#fbbf24';
      if (rate >= 30) return '#fb923c';
      return '#f87171';
    }

    // SVG donut for dial rate
    function dialGauge(rate, size, stroke) {
      const r = (size - stroke) / 2;
      const circ = 2 * Math.PI * r;
      const dash = (rate / 100) * circ;
      const color = dialColor(rate);
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${stroke}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circ - dash}" stroke-linecap="round" style="transition:stroke-dasharray 1s ease"/>
      </svg>`;
    }

    // ===== HERO METRICS BAR =====
    const heroHtml = `
      <div class="gs-hero">
        <div class="gs-hero-gauge">
          <div class="gs-gauge-wrap">
            ${dialGauge(s.globalDialRate, 140, 12)}
            <div class="gs-gauge-center">
              <div class="gs-gauge-val" style="color:${dialColor(s.globalDialRate)}">${s.globalDialRate}%</div>
              <div class="gs-gauge-label">Дозвон</div>
            </div>
          </div>
          <div class="gs-gauge-sub">Общий уровень дозвона</div>
        </div>
        <div class="gs-hero-metrics">
          <div class="gs-metric">
            <div class="gs-metric-icon">📞</div>
            <div class="gs-metric-val">${s.totalActions}</div>
            <div class="gs-metric-label">Всего звонков</div>
          </div>
          <div class="gs-metric">
            <div class="gs-metric-icon">✅</div>
            <div class="gs-metric-val" style="color:#4ade80">${s.globalActionTypes['передал']||0}</div>
            <div class="gs-metric-label">Передал</div>
          </div>
          <div class="gs-metric">
            <div class="gs-metric-icon">❌</div>
            <div class="gs-metric-val" style="color:#f87171">${s.globalActionTypes['не_дозвон']||0}</div>
            <div class="gs-metric-label">Не дозвон</div>
          </div>
          <div class="gs-metric">
            <div class="gs-metric-icon">📄</div>
            <div class="gs-metric-val" style="color:#c084fc">${s.globalActionTypes['срез_на_доках']||0}</div>
            <div class="gs-metric-label">Срез</div>
          </div>
          <div class="gs-metric">
            <div class="gs-metric-icon">📞</div>
            <div class="gs-metric-val" style="color:#fbbf24">${s.globalActionTypes['перезвон']||0}</div>
            <div class="gs-metric-label">Перезвон</div>
          </div>
        </div>
        <div class="gs-hero-today">
          <div class="gs-today-title">📅 Сегодня</div>
          <div class="gs-today-row">
            <div class="gs-today-gauge">
              ${dialGauge(s.todayDialRate, 80, 8)}
              <div class="gs-gauge-center gs-gauge-center-sm">
                <div class="gs-gauge-val gs-gauge-val-sm" style="color:${dialColor(s.todayDialRate)}">${s.todayDialRate}%</div>
              </div>
            </div>
            <div class="gs-today-nums">
              <div>📞 <b>${s.todayCalls}</b> звонков</div>
              <div>✅ <b>${s.todayActionTypes['передал']||0}</b> передал</div>
              <div>❌ <b>${s.todayActionTypes['не_дозвон']||0}</b> не дозвон</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // ===== SUMMARY CARDS =====
    const summaryHtml = `
      <div class="gs-summary-bar">
        <div class="gs-sum-card"><div class="gs-sum-icon">🏢</div><div class="gs-sum-val">${s.totalDepts}</div><div class="gs-sum-lbl">Отделов</div></div>
        <div class="gs-sum-card"><div class="gs-sum-icon">👥</div><div class="gs-sum-val">${s.totalWorkers}</div><div class="gs-sum-lbl">Работников</div></div>
        <div class="gs-sum-card"><div class="gs-sum-icon">📋</div><div class="gs-sum-val">${s.totalLeads}</div><div class="gs-sum-lbl">Лидов всего</div></div>
        <div class="gs-sum-card"><div class="gs-sum-icon">🆕</div><div class="gs-sum-val" style="color:#60a5fa">${s.todayCalls||0}</div><div class="gs-sum-lbl">Сегодня</div></div>
      </div>
    `;

    // ===== PER-DEPARTMENT CARDS =====
    const deptsHtml = s.departments.map(d => {
      const workersHtml = d.workers.length ? `
        <table class="gs-workers-table">
          <thead><tr><th>Работник</th><th>Звонки</th><th>Дозвон</th><th>✅</th><th>❌</th><th>📞</th><th>📄</th><th>Сегодня</th></tr></thead>
          <tbody>${d.workers.map(w => {
            const barW = Math.min(100, Math.round((w.total / Math.max(d.workers[0].total, 1)) * 100));
            return `<tr>
              <td class="gs-wt-name">${esc(w.name)}</td>
              <td><b>${w.total}</b><div class="gs-bar-mini"><div class="gs-bar-fill" style="width:${barW}%"></div></div></td>
              <td><span class="gs-dial-badge" style="background:${dialColor(w.dialRate)}22;color:${dialColor(w.dialRate)};border-color:${dialColor(w.dialRate)}44">${w.dialRate}%</span></td>
              <td style="color:#4ade80">${w['передал']}</td>
              <td style="color:#f87171">${w['не_дозвон']}</td>
              <td style="color:#fbbf24">${w['перезвон']}</td>
              <td style="color:#c084fc">${w['срез_на_доках']}</td>
              <td style="font-size:11px;color:var(--t2)">${w.today_total} <span style="color:${dialColor(w.todayDialRate)}">(${w.todayDialRate}%)</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : '<div style="padding:12px;text-align:center;color:var(--t3);font-size:12px">Нет активных работников</div>';

      return `
        <div class="gs-dept-card">
          <div class="gs-dept-header" onclick="this.parentElement.classList.toggle('gs-open')">
            <div class="gs-dept-left">
              <div class="gs-dept-name">🏢 ${esc(d.name)}</div>
              <div class="gs-dept-meta">👥 ${d.user_count} • 📋 ${d.total_leads} лидов • 📞 ${d.total_actions} звонков</div>
            </div>
            <div class="gs-dept-right">
              <div class="gs-dept-dial" style="color:${dialColor(d.dialRate)}">
                ${dialGauge(d.dialRate, 48, 5)}
                <span class="gs-dept-dial-val">${d.dialRate}%</span>
              </div>
              <div class="gs-dept-chips">
                <span class="gs-chip" style="color:#4ade80;border-color:rgba(74,222,128,0.3)">✅ ${d.actionTypes['передал']||0}</span>
                <span class="gs-chip" style="color:#f87171;border-color:rgba(248,113,113,0.3)">❌ ${d.actionTypes['не_дозвон']||0}</span>
                <span class="gs-chip" style="color:#c084fc;border-color:rgba(192,132,252,0.3)">📄 ${d.actionTypes['срез_на_доках']||0}</span>
              </div>
              <span class="gs-dept-chevron">▼</span>
            </div>
          </div>
          <div class="gs-dept-body">
            ${workersHtml}
          </div>
        </div>
      `;
    }).join('');

    // ===== GLOBAL TOP WORKERS =====
    const topHtml = s.topWorkers.length ? `
      <div class="gs-section">
        <div class="gs-section-title">🏆 Топ работников (все отделы)</div>
        <table class="gs-workers-table gs-top-table">
          <thead><tr><th>#</th><th>Работник</th><th>Отдел</th><th>Звонки</th><th>Дозвон</th><th>✅</th><th>❌</th><th>📞</th><th>📄</th></tr></thead>
          <tbody>${s.topWorkers.slice(0, 20).map((w, i) => `<tr class="${i<3?'gs-top-highlight':''}">
            <td class="gs-rank">${i<3?['🥇','🥈','🥉'][i]:(i+1)}</td>
            <td class="gs-wt-name"><b>${esc(w.name)}</b></td>
            <td><span class="gs-dept-tag">${esc(w.department)}</span></td>
            <td><b>${w.total}</b></td>
            <td><span class="gs-dial-badge" style="background:${dialColor(w.dialRate)}22;color:${dialColor(w.dialRate)};border-color:${dialColor(w.dialRate)}44">${w.dialRate}%</span></td>
            <td style="color:#4ade80">${w['передал']}</td>
            <td style="color:#f87171">${w['не_дозвон']}</td>
            <td style="color:#fbbf24">${w['перезвон']}</td>
            <td style="color:#c084fc">${w['срез_на_доках']}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    ` : '';

    // ===== 14-DAY CHART =====
    const days = Object.entries(s.dailyActivity || {});
    const maxDay = Math.max(...days.map(d => d[1].total), 1);
    const chartHtml = days.length ? `
      <div class="gs-section">
        <div class="gs-section-title">📈 Активность за 14 дней</div>
        <div class="gs-daily-chart">${days.map(([date, data]) => {
          const pct = Math.round((data.total / maxDay) * 100);
          const pPass = data.total > 0 ? Math.round((data['передал'] / data.total) * 100) : 0;
          const pNo = data.total > 0 ? Math.round((data['не_дозвон'] / data.total) * 100) : 0;
          return `<div class="gs-chart-col" title="${date}: ${data.total} звонков, ${data['передал']} передал, ${data['не_дозвон']} не дозвон">
            <div class="gs-chart-bar-group" style="height:${Math.max(pct, 4)}%">
              <div class="gs-chart-bar gs-bar-pass" style="height:${pPass}%"></div>
              <div class="gs-chart-bar gs-bar-no" style="height:${pNo}%"></div>
              <div class="gs-chart-bar gs-bar-other" style="height:${100-pPass-pNo}%"></div>
            </div>
            <div class="gs-chart-val">${data.total}</div>
            <div class="gs-chart-date">${date.slice(5)}</div>
          </div>`;
        }).join('')}</div>
        <div class="gs-chart-legend">
          <span><span class="gs-legend-dot" style="background:#4ade80"></span>Передал</span>
          <span><span class="gs-legend-dot" style="background:#f87171"></span>Не дозвон</span>
          <span><span class="gs-legend-dot" style="background:#60a5fa"></span>Другое</span>
        </div>
      </div>
    ` : '';

    el.innerHTML = datePickerHtml + heroHtml + summaryHtml + `
      <div class="gs-section">
        <div class="gs-section-title">🏢 Статистика по отделам <span style="font-weight:400;font-size:12px;color:var(--t3)">(нажмите для раскрытия)</span></div>
        ${deptsHtml || '<div style="text-align:center;padding:30px;color:var(--t3)">Нет отделов</div>'}
      </div>
    ` + topHtml + chartHtml;

  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:#f87171">❌ Ошибка: ' + e.message + '</div>';
  }
}

function gsSetPeriod(period) {
  const today = new Date().toISOString().slice(0, 10);
  if (period === 'today') {
    loadGlobalStats(today, today);
  } else if (period === '7d') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    loadGlobalStats(d.toISOString().slice(0, 10), today);
  } else if (period === '30d') {
    const d = new Date(); d.setDate(d.getDate() - 30);
    loadGlobalStats(d.toISOString().slice(0, 10), today);
  } else {
    loadGlobalStats('', '');
  }
}

function gsApplyDates() {
  const from = document.getElementById('gsDateFrom')?.value || '';
  const to = document.getElementById('gsDateTo')?.value || '';
  loadGlobalStats(from, to);
}

// Hook swAdm to load departments + global stats
var _origSwAdm = swAdm;
swAdm = function(id, btn) {
  _origSwAdm(id, btn);
  if (id === 'admDepts') loadDepartments();
  if (id === 'admGlobalStats') loadGlobalStats();
};

// ============ DEPARTMENT WORKER INTERFACE (isolated from СВО) ============
let deptCurrentLead = null;

function showDeptWorkerApp() {
  // Hide ALL other screens
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('adminScreen').classList.remove('active');
  // Show dept worker screen
  document.getElementById('deptWorkerScreen').classList.add('active');
  document.getElementById('deptWorkerTitle').textContent = '🏢 ' + (currentUser.department_name || 'ИНН');
  document.getElementById('deptWorkerName').textContent = currentUser.display_name;
  // Restore saved theme
  const savedTheme = localStorage.getItem('dept_theme') || 'dark';
  setDeptTheme(savedTheme);
  loadDeptWorkerCounts();
  loadDeptWorkerLead();
  renderDeptCalendar();
  loadDeptCallStats();
  loadDeptCallbacks();
  startDeptNotepadAutoSave();
  // Load avatar
  loadDeptSavedAvatar();
  // Restore nick style
  const savedDeptNickStyle = localStorage.getItem('deptNickStyle');
  if (savedDeptNickStyle) {
    applyDeptNickStyle(savedDeptNickStyle);
  }
  // Restore badge
  const savedBadge = localStorage.getItem('deptNickBadge');
  if (savedBadge) applyDeptNickBadge(savedBadge);
  // Load rank & pogon
  loadDeptRank();
}

// ============ HR RANK SYSTEM (Отдел кадров theme) ============
const DEPT_RANKS = [
  { min: 0,    name: '📎 Стажёр',           pogon: '📎' },
  { min: 50,   name: '📋 Инспектор',        pogon: '📋' },
  { min: 150,  name: '🗂️ Старший инспектор', pogon: '🗂️' },
  { min: 300,  name: '📞 Специалист',        pogon: '📞' },
  { min: 500,  name: '💼 Ведущий специалист', pogon: '💼' },
  { min: 800,  name: '🔑 Руководитель группы', pogon: '🔑' },
  { min: 1200, name: '⭐ Начальник отдела',   pogon: '⭐' },
  { min: 2000, name: '🏆 Заместитель директора', pogon: '🏆' },
  { min: 3000, name: '💎 Директор по персоналу', pogon: '💎' },
  { min: 5000, name: '🏛️ Генеральный директор', pogon: '🏛️' },
];

function getDeptRank(totalActions) {
  let rank = DEPT_RANKS[0];
  for (let i = DEPT_RANKS.length - 1; i >= 0; i--) {
    if (totalActions >= DEPT_RANKS[i].min) { rank = DEPT_RANKS[i]; break; }
  }
  return rank;
}

function renderDeptPogon(pogonEmoji) {
  const el = document.getElementById('deptProfilePogon');
  if (!el) return;
  el.innerHTML = `<div style="font-size:32px;line-height:1;filter:drop-shadow(0 0 8px rgba(96,165,250,0.4))">${pogonEmoji}</div>`;
}

async function loadDeptRank() {
  try {
    const res = await fetch('/api/dept/leads/counts');
    const c = await res.json();
    const total = (c.passed || 0) + (c.no_answer || 0) + (c.docs || 0);
    const rank = getDeptRank(total);
    const rankEl = document.getElementById('deptRankName');
    if (rankEl) rankEl.textContent = rank.name;
    renderDeptPogon(rank.pogon);
  } catch(e) {}
}

function loadDeptSavedAvatar() {
  fetch('/api/user/avatar').then(r => r.json()).then(d => {
    if (d.avatar_url) {
      const el = document.getElementById('deptUserAvatar');
      if (el) el.src = d.avatar_url;
    }
  }).catch(() => {});
}

function setDeptNickStyle(style) {
  applyDeptNickStyle(style);
  localStorage.setItem('deptNickStyle', style);
  // Save to server
  fetch('/api/user/nick-config', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ style: style })
  }).catch(() => {});
}

function applyDeptNickStyle(style) {
  const el = document.getElementById('deptWorkerName');
  if (!el) return;
  ['nickname-neon','nickname-dark','nickname-gold','nickname-fire','nickname-matrix','nickname-galaxy','nickname-ice','nickname-blood'].forEach(c => el.classList.remove(c));
  el.classList.add('nickname-' + style);
}

function setDeptNickBadge(badge) {
  applyDeptNickBadge(badge);
  localStorage.setItem('deptNickBadge', badge);
}

function applyDeptNickBadge(badge) {
  const el = document.getElementById('deptWorkerName');
  if (!el || !currentUser) return;
  el.textContent = badge ? badge + ' ' + currentUser.display_name : currentUser.display_name;
}

function setDeptTheme(theme) {
  const screen = document.getElementById('deptWorkerScreen');
  if (!screen) return;
  if (theme === 'light') {
    screen.classList.add('dept-light');
  } else {
    screen.classList.remove('dept-light');
  }
  localStorage.setItem('dept_theme', theme);
  // Update toggle buttons
  document.querySelectorAll('.dept-theme-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = theme === 'light'
    ? document.querySelector('.dept-theme-btn[onclick*="light"]')
    : document.querySelector('.dept-theme-btn[onclick*="dark"]');
  if (activeBtn) activeBtn.classList.add('active');
}

async function deptWorkerLogout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  document.getElementById('deptWorkerScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
}

async function loadDeptWorkerCounts() {
  try {
    const res = await fetch('/api/dept/leads/counts');
    const c = await res.json();
    document.getElementById('deptWorkerStats').innerHTML = `
      <div class="v2-stats">
        <div class="v2-stat"><div class="v2-stat-val">${c.total}</div><div class="v2-stat-lbl">Всего</div></div>
        <div class="v2-stat v2-stat-green"><div class="v2-stat-val">${c.new}</div><div class="v2-stat-lbl">🆕 Новых</div></div>
        <div class="v2-stat v2-stat-red"><div class="v2-stat-val">${c.no_answer}</div><div class="v2-stat-lbl">❌ Нет отв.</div></div>
        <div class="v2-stat v2-stat-blue"><div class="v2-stat-val">${c.passed}</div><div class="v2-stat-lbl">✅ Передал</div></div>
        <div class="v2-stat v2-stat-purple"><div class="v2-stat-val">${c.docs}</div><div class="v2-stat-lbl">📄 Срез</div></div>
        <div class="v2-stat v2-stat-cyan"><div class="v2-stat-val">${c.my_today}</div><div class="v2-stat-lbl">📞 Сегодня</div></div>
      </div>
    `;
  } catch(e) {}
}

async function loadDeptWorkerLead() {
  try {
    const res = await fetch('/api/dept/leads/next');
    const lead = await res.json();
    deptCurrentLead = lead;
    renderDeptLead(lead);
  } catch(e) {
    renderDeptLead(null);
  }
}

function copyPhone(phone, el) {
  function onSuccess() {
    showToast('📋 Скопировано: ' + phone, 'success');
    if (el) {
      el.style.background = 'rgba(74,222,128,0.2)';
      el.style.borderColor = '#4ade80';
      const orig = el.textContent;
      el.textContent = '✓ ' + phone;
      setTimeout(() => {
        el.style.background = '';
        el.style.borderColor = '';
        el.textContent = orig;
      }, 1200);
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(phone).then(onSuccess).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = phone; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      onSuccess();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = phone; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    onSuccess();
  }
}

function renderDeptLead(lead) {
  const el = document.getElementById('deptLeadCard');
  if (!lead) {
    el.innerHTML = `<div class="dept-lead-empty">
      <div style="font-size:64px;margin-bottom:16px;filter:grayscale(0.5)">📭</div>
      <div style="font-size:18px;font-weight:800;color:var(--t1)">Нет лидов для обзвона</div>
      <div style="font-size:13px;color:var(--t2);margin-top:6px">Все лиды обработаны или база пуста</div>
    </div>`;
    return;
  }

  // Parse extra_data
  let extraData = {};
  if (lead.extra_data) {
    try { extraData = typeof lead.extra_data === 'string' ? JSON.parse(lead.extra_data) : lead.extra_data; } catch(e) {}
  }

  // Get all phone numbers
  const allPhones = (lead.phone || '').split(/[,;\/\s]+/).filter(p => p.replace(/\D/g,'').length >= 5);

  // Build sections
  const mainFields = [];
  const contactFields = [];
  const docFields = [];
  const otherFields = [];

  // Main info
  if (lead.fio) mainFields.push({icon:'👤', label:'ФИО', val:lead.fio, big:true});
  if (lead.birthday) mainFields.push({icon:'🎂', label:'Дата рождения', val:lead.birthday});
  if (lead.region) contactFields.push({icon:'🗺️', label:'Регион', val:lead.region});
  if (lead.city) contactFields.push({icon:'🏙️', label:'Город', val:lead.city});
  if (lead.address) contactFields.push({icon:'📍', label:'Адрес', val:lead.address});
  if (lead.inn) docFields.push({icon:'🏛️', label:'ИНН', val:lead.inn});
  if (lead.snils) docFields.push({icon:'📄', label:'СНИЛС', val:lead.snils});
  if (lead.passport) docFields.push({icon:'🪪', label:'Паспорт', val:lead.passport});
  if (lead.extra) otherFields.push({icon:'📝', label:'Доп. информация', val:lead.extra});

  // Extra data fields
  const skipKeys = ['fio','phone','inn','snils','passport','region','city','address','birthday','extra','status','manager'];
  Object.entries(extraData).forEach(([k, v]) => {
    if (v && !skipKeys.includes(k)) {
      const val = String(v).trim();
      if (val.length > 0 && val !== 'undefined' && val !== 'null') {
        otherFields.push({icon:'📋', label:k, val:val});
      }
    }
  });

  // Build section HTML helper
  const renderSection = (title, fields) => {
    if (!fields.length) return '';
    return `<div class="v2-section">
      <div class="v2-section-title">${title}</div>
      <div class="v2-section-grid">
        ${fields.map(f => {
          let valHtml = esc(f.val);
          valHtml = valHtml.replace(/([\+]?[78][\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/g,
            (match) => `<span class="v2-phone-chip" onclick="copyPhone('${match.replace(/[^\d+]/g,'')}',this)" title="Копировать">📞 ${match}</span>`
          );
          return `
          <div class="v2-field ${f.big ? 'v2-field-big' : ''}">
            <div class="v2-field-icon">${f.icon}</div>
            <div class="v2-field-content">
              <div class="v2-field-label">${esc(f.label)}</div>
              <div class="v2-field-value">${valHtml}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  };

  // INN Warning banner
  const innWarningHtml = lead._inn_warning ? `
    <div style="padding:16px 20px;margin:0;background:linear-gradient(135deg,rgba(239,68,68,0.25),rgba(220,38,38,0.15));border:2px solid rgba(239,68,68,0.6);border-radius:0;animation:innAlertPulse 1.5s ease-in-out infinite;position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.1),transparent);animation:innAlertSweep 2s linear infinite"></div>
      <div style="position:relative;z-index:1;text-align:center">
        <div style="font-size:20px;font-weight:900;color:#ef4444;text-transform:uppercase;letter-spacing:2px;text-shadow:0 0 20px rgba(239,68,68,0.5),0 0 40px rgba(239,68,68,0.3)">
          ⚠️ ЗВОНИТЬ ПО ДРУГОМУ СПИЧУ ⚠️
        </div>
        <div style="font-size:12px;color:rgba(239,68,68,0.9);margin-top:6px;font-weight:700">
          База прозвонена на ${lead._inn_called_pct || '10'}% — смените спич!
        </div>
      </div>
    </div>
    <style>
      @keyframes innAlertPulse { 0%,100%{box-shadow:0 0 15px rgba(239,68,68,0.3)} 50%{box-shadow:0 0 35px rgba(239,68,68,0.6),0 0 60px rgba(239,68,68,0.2)} }
      @keyframes innAlertSweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    </style>
  ` : '';

  el.innerHTML = `
    <div class="v2-card">
      ${innWarningHtml}
      <div class="v2-hero">
        <div class="v2-hero-row">
          <div class="v2-avatar">${(lead.fio || '?')[0].toUpperCase()}</div>
          <div class="v2-hero-info">
            <div class="v2-hero-name">${esc(lead.fio || 'Без имени')}</div>
            <div class="v2-hero-badges">
              <span class="v2-badge">ID: ${lead.id}</span>
              ${lead.status ? `<span class="v2-badge v2-badge-status">${lead.status}</span>` : ''}
              ${lead.callback_comment ? `<span class="v2-badge v2-badge-cb">💬 ${esc(lead.callback_comment)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      ${allPhones.length ? `
        <div class="v2-phones">
          <span class="v2-phones-icon">📱</span>
          <div class="v2-phones-list">
            ${allPhones.map((p, i) => `<div class="v2-phone-item">
              <div style="display:flex;align-items:center;gap:4px">
                <span class="v2-phone-chip" onclick="copyPhone('${p}',this)" title="Копировать">📞 ${esc(p)}</span>
                <button onclick="deleteDeptPhone(${lead.id},'${p}')" title="Удалить номер" style="width:24px;height:24px;border-radius:8px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s" onmouseover="this.style.background='rgba(248,113,113,0.15)'" onmouseout="this.style.background='rgba(248,113,113,0.06)'">🗑️</button>
              </div>
              <span id="deptVoxlink_${i}" class="v2-phone-op">⏳</span>
            </div>`).join('')}
          </div>
        </div>` : ''}

      <script>
      (function(){
        var deptPhones = ${JSON.stringify(allPhones)};
        deptPhones.forEach(function(phone, i) {
          var el = document.getElementById('deptVoxlink_' + i);
          if (!el) return;
          var clean = phone.replace(/\\D/g, '');
          if (clean.length < 10) { el.textContent = ''; return; }
          fetch('/api/phone-lookup?num=' + clean)
            .then(function(r) { return r.json(); })
            .then(function(d) {
              if (d && d.info) {
                var parts = [];
                if (d.info.operator) parts.push(d.info.operator);
                if (d.info.region) parts.push(d.info.region);
                el.textContent = parts.length ? parts.join(' • ') : '';
                el.style.color = 'rgba(96,165,250,0.7)';
              } else { el.textContent = ''; }
            })
            .catch(function() { el.textContent = ''; });
        });
      })();
      </script>

      <div class="v2-body">
        ${renderSection('📋 Основная информация', mainFields)}
        ${renderSection('📍 Контактные данные', contactFields)}
        ${renderSection('📄 Документы', docFields)}
        ${renderSection('📝 Дополнительно', otherFields)}
      </div>

      <div class="v2-comment">
        <textarea id="deptActionComment" rows="2" placeholder="💬 Комментарий к действию (необязательно)..."></textarea>
      </div>

      <div class="v2-actions">
        <div class="v2-actions-grid">
          <button class="v2-btn v2-btn-red" onclick="deptAction('не_дозвон')">
            <span class="v2-btn-icon">❌</span><span class="v2-btn-text">Не дозвон</span>
          </button>
          <button class="v2-btn v2-btn-yellow" onclick="deptAction('перезвон')">
            <span class="v2-btn-icon">📞</span><span class="v2-btn-text">Перезвон</span>
          </button>
          <button class="v2-btn v2-btn-gray" onclick="deptAction('скип')">
            <span class="v2-btn-icon">⏭️</span><span class="v2-btn-text">Скип</span>
          </button>
          <button class="v2-btn v2-btn-purple" onclick="deptAction('срез_на_доках')">
            <span class="v2-btn-icon">📄</span><span class="v2-btn-text">Срез</span>
          </button>
        </div>
        <button class="v2-btn-talk" onclick="deptAction('говорил_1.5')">
          <span>🗣️</span><span>Говорил &gt; 1.5 мин</span>
        </button>
        <button onclick="deptAction('звонили_по_инн')" style="width:100%;padding:14px 20px;border-radius:16px;background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(251,146,60,0.08));border:2px solid rgba(239,68,68,0.4);color:#ef4444;font-size:15px;font-weight:900;cursor:pointer;font-family:var(--font);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;text-transform:uppercase;letter-spacing:1px" onmouseover="this.style.background='linear-gradient(135deg,rgba(239,68,68,0.25),rgba(251,146,60,0.15))';this.style.boxShadow='0 0 20px rgba(239,68,68,0.3)'" onmouseout="this.style.background='linear-gradient(135deg,rgba(239,68,68,0.12),rgba(251,146,60,0.08))';this.style.boxShadow='none'">
          <span>🏢</span><span>ЗВОНИЛИ ПО ИНН</span>
        </button>
        <div style="display:flex;gap:8px">
          <button class="v2-btn-pass" style="flex:1" onclick="deptAction('передал')">
            <span>✅</span><span>ПЕРЕДАЛ</span>
          </button>
          <button onclick="showDeptArchive()" style="padding:14px 18px;border-radius:16px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);color:#60a5fa;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .2s;display:flex;align-items:center;gap:6px" onmouseover="this.style.background='rgba(96,165,250,0.15)'" onmouseout="this.style.background='rgba(96,165,250,0.08)'" title="Архив статусов">📋</button>
        </div>
      </div>
    </div>
  `;
}

async function deptAction(actionType) {
  if (!deptCurrentLead) return;
  // Intercept 'передал' to show the full form modal
  if (actionType === 'передал') {
    const baseName = _deptBaseData ? _deptBaseData.name : (deptCurrentLead.base_name || 'ИНН');
    openPassModal(deptCurrentLead.id, 'dept', baseName);
    return;
  }
  const comment = document.getElementById('deptActionComment')?.value || '';
  try {
    const res = await fetch('/api/dept/leads/' + deptCurrentLead.id + '/action', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: actionType, comment })
    });
    const data = await res.json();
    if (res.ok) {
      const labels = {'не_дозвон':'❌ Не дозвон','перезвон':'📞 Перезвон','передал':'✅ Передал','срез_на_доках':'📄 Срез','скип':'⏭ Скип','говорил_1.5':'🗣️ Говорил > 1.5 мин','звонили_по_инн':'🏢 Звонили по ИНН'};
      showToast(labels[actionType] || actionType, 'success');
      loadDeptWorkerLead();
      loadDeptWorkerCounts();
      loadDeptCallStats();
      loadDeptCallbacks();
    }
  } catch(e) { showToast('Ошибка', 'error'); }
}

// ============ DEPT STATUS ARCHIVE ============
async function showDeptArchive() {
  try {
    const res = await fetch('/api/dept/my-archive');
    const leads = await res.json();
    const statusColors = { no_answer:'#f87171', callback:'#fbbf24', passed:'#4ade80', docs:'#c084fc', skipped:'#9ca3af', talked:'#22d3ee', other_person:'#a855f7' };

    const leadsHtml = leads.length ? leads.map(l => `
      <div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:12px;cursor:pointer;transition:background .15s" 
           onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''" 
           onclick="this.querySelector('.dept-arc-actions').style.display=this.querySelector('.dept-arc-actions').style.display==='none'?'flex':'none'">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColors[l.status] || '#64748b'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.name}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px">
            <span style="color:${statusColors[l.status] || '#64748b'};font-weight:700">${l.status_label}</span> • 
            ${l.last_action_at ? new Date(l.last_action_at).toLocaleString('ru') : ''}
            ${l.last_comment ? ' • 💬 ' + l.last_comment.substring(0, 30) : ''}
          </div>
          <div class="dept-arc-actions" style="display:none;flex-wrap:wrap;gap:4px;margin-top:6px" onclick="event.stopPropagation()">
            <button onclick="changeDeptLeadStatus(${l.id},'new')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.08);color:#60a5fa;font-size:9px;font-weight:700;cursor:pointer">🆕 Новый</button>
            <button onclick="changeDeptLeadStatus(${l.id},'callback')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);color:#fbbf24;font-size:9px;font-weight:700;cursor:pointer">📞 Перезвон</button>
            <button onclick="changeDeptLeadStatus(${l.id},'no_answer')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-size:9px;font-weight:700;cursor:pointer">❌ Не дозвон</button>
            <button onclick="changeDeptLeadStatus(${l.id},'skipped')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(156,163,175,0.3);background:rgba(156,163,175,0.08);color:#9ca3af;font-size:9px;font-weight:700;cursor:pointer">⏭ Скип</button>
            <button onclick="changeDeptLeadStatus(${l.id},'docs')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(192,132,252,0.3);background:rgba(192,132,252,0.08);color:#c084fc;font-size:9px;font-weight:700;cursor:pointer">📄 Срез</button>
            <button onclick="changeDeptLeadStatus(${l.id},'passed')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.08);color:#4ade80;font-size:9px;font-weight:700;cursor:pointer">✅ Передал</button>
          </div>
        </div>
        <div style="font-size:10px;color:var(--t3);flex-shrink:0">ID:${l.id}</div>
      </div>
    `).join('') : '<div style="padding:30px;text-align:center;color:var(--t3);font-size:13px">📭 Нет обработанных карточек</div>';

    let modal = document.getElementById('deptArchiveModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'deptArchiveModal'; document.body.appendChild(modal); }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)" onclick="this.parentElement.innerHTML=''">
        <div style="background:rgba(14,18,32,0.97);border:1px solid rgba(96,165,250,0.15);border-radius:20px;width:92%;max-width:560px;max-height:85vh;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.6);display:flex;flex-direction:column" onclick="event.stopPropagation()">
          <div style="padding:20px 24px;border-bottom:1px solid rgba(96,165,250,0.1);flex-shrink:0">
            <div style="font-size:18px;font-weight:900;color:#e2e8f0">📋 Архив карточек</div>
            <div style="font-size:11px;color:var(--t3);margin-top:4px">Нажмите на карточку чтобы изменить статус • ${leads.length} карточек</div>
          </div>
          <div style="overflow-y:auto;flex:1">
            ${leadsHtml}
          </div>
          <div style="padding:12px 24px;border-top:1px solid rgba(255,255,255,0.04);text-align:center;flex-shrink:0">
            <button onclick="document.getElementById('deptArchiveModal').innerHTML=''" style="padding:8px 28px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--t2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">Закрыть</button>
          </div>
        </div>
      </div>
    `;
  } catch(e) { showToast('Ошибка загрузки архива', 'error'); }
}

async function changeDeptLeadStatus(leadId, newStatus) {
  // If 'passed', open the pass form modal instead
  if (newStatus === 'passed') {
    document.getElementById('deptArchiveModal').innerHTML = '';
    openPassModal(leadId, 'dept', 'ИНН');
    return;
  }
  try {
    const res = await fetch('/api/dept/leads/' + leadId + '/change-status', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      const statusNames = { new: '🆕 Новый', callback: '📞 Перезвон', no_answer: '❌ Не дозвон', skipped: '⏭ Скип', docs: '📄 Срез' };
      showToast('Статус изменён: ' + (statusNames[newStatus] || newStatus), 'success');
      document.getElementById('deptArchiveModal').innerHTML = '';
      loadDeptWorkerLead();
      loadDeptWorkerCounts();
      loadDeptCallStats();
      loadDeptCallbacks();
    } else { showToast('Ошибка', 'error'); }
  } catch(e) { showToast('Ошибка', 'error'); }
}

// Delete phone from lead card
async function deleteDeptPhone(leadId, phone) {
  if (!confirm('Удалить номер ' + phone + ' из карточки навсегда?')) return;
  try {
    const res = await fetch('/api/dept/leads/' + leadId + '/delete-phone', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ phone: phone.replace(/[^\d+]/g, '') })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast('Номер удалён', 'success');
      loadDeptWorkerLead();
    } else { showToast('Ошибка: ' + (data.error || res.status), 'error'); }
  } catch(e) { showToast('Ошибка сети: ' + e.message, 'error'); }
}

// ============ DEPT CALENDAR ============
function renderDeptCalendar() {
  const el = document.getElementById('deptCalendar');
  if (!el) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const dayNames = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const firstDay = new Date(year, month, 1).getDay();
  const startDay = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = `<div class="v2-cal-month">${monthNames[month]} ${year}</div>`;
  html += '<div class="v2-cal-grid">';
  dayNames.forEach(d => html += `<div class="v2-cal-dn">${d}</div>`);
  for (let i = 0; i < startDay; i++) html += '<div class="v2-cal-d v2-cal-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today;
    const isWeekend = new Date(year, month, d).getDay() === 0 || new Date(year, month, d).getDay() === 6;
    html += `<div class="v2-cal-d${isToday ? ' v2-cal-today' : ''}${isWeekend ? ' v2-cal-wk' : ''}">${d}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// ============ DEPT NOTEPAD (floating, draggable like СВО) ============
function toggleDeptNotepad() {
  const win = document.getElementById('deptNotepadWindow');
  win.classList.toggle('hidden');
  if (!win.classList.contains('hidden')) {
    const saved = localStorage.getItem('dept_notepad_' + (currentUser?.id || ''));
    if (saved) document.getElementById('deptNotepadText').value = saved;
    initDeptNotepadDrag();
  }
}

function saveDeptNotepad() {
  const text = document.getElementById('deptNotepadText').value;
  localStorage.setItem('dept_notepad_' + (currentUser?.id || ''), text);
  const st = document.getElementById('deptNpStatus');
  if (st) { st.textContent = '✅'; setTimeout(() => st.textContent = '', 1500); }
  showToast('📝 Сохранено!', 'success');
}

function startDeptNotepadAutoSave() {
  setInterval(() => {
    const el = document.getElementById('deptNotepadText');
    if (el && !document.getElementById('deptNotepadWindow').classList.contains('hidden')) {
      localStorage.setItem('dept_notepad_' + (currentUser?.id || ''), el.value);
      const st = document.getElementById('deptNpStatus');
      if (st) { st.textContent = '✔'; setTimeout(() => st.textContent = '', 1000); }
    }
  }, 10000);
}

function initDeptNotepadDrag() {
  const win = document.getElementById('deptNotepadWindow');
  const handle = document.getElementById('deptNotepadDrag');
  if (!handle) return;
  let isDragging = false, startX, startY, startLeft, startTop;
  handle.onmousedown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = win.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  };
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    win.style.left = (startLeft + e.clientX - startX) + 'px';
    win.style.top = (startTop + e.clientY - startY) + 'px';
    win.style.right = 'auto'; win.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });
}

// ============ DEPT CALL STATS ============
async function loadDeptCallStats() {
  try {
    const res = await fetch('/api/dept/leads/counts');
    const c = await res.json();
    const el = document.getElementById('deptCallStats');
    if (!el) return;

    // Процент дозвона: (все действия - не_дозвон) / все действия
    const myNoAnswer = c.my_no_answer || 0;
    const myTotalActions = c.my_today || 0;
    const myReached = myTotalActions - myNoAnswer;
    const reachPct = myTotalActions > 0 ? ((myReached / myTotalActions) * 100).toFixed(0) : 0;
    const progressPct = c.total > 0 ? (((c.total - c.new) / c.total) * 100).toFixed(1) : 0;

    el.innerHTML = `
      <div class="dcs-reach-block">
        <div class="dcs-reach-circle">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="6"/>
            <circle cx="40" cy="40" r="34" fill="none" stroke="#60a5fa" stroke-width="6" stroke-linecap="round"
              stroke-dasharray="${(reachPct / 100) * 213.6} 213.6" transform="rotate(-90 40 40)" style="transition:stroke-dasharray .5s"/>
          </svg>
          <div class="dcs-reach-pct">${reachPct}%</div>
        </div>
        <div class="dcs-reach-label">Процент дозвона</div>
      </div>
      <div class="dcs-divider"></div>
      <div class="dcs-row"><span class="dcs-label">📞 Действий сегодня</span><span class="dcs-val dcs-blue">${c.my_today}</span></div>
      <div class="dcs-row"><span class="dcs-label">✅ Передал</span><span class="dcs-val dcs-green">${c.my_passed}</span></div>
      <div class="dcs-row"><span class="dcs-label">❌ Не дозвон</span><span class="dcs-val" style="color:#f87171">${myNoAnswer}</span></div>
      <div class="dcs-row"><span class="dcs-label">🗣️ Говорил > 1.5 мин</span><span class="dcs-val dcs-cyan">${c.my_talked || 0}</span></div>
      <div class="dcs-row"><span class="dcs-label">📊 Всего обработано</span><span class="dcs-val">${c.my_total}</span></div>
      <div class="dcs-divider"></div>
      <div class="dcs-row"><span class="dcs-label">🆕 Новых</span><span class="dcs-val dcs-green">${c.new}</span></div>
      <div class="dcs-row"><span class="dcs-label">📋 Всего</span><span class="dcs-val">${c.total}</span></div>
      <div class="dcs-progress">
        <div class="dcs-progress-label">Прогресс обзвона</div>
        <div class="bs-progress"><div class="bs-progress-fill" style="width:${progressPct}%"></div></div>
        <div class="dcs-progress-pct">${progressPct}%</div>
      </div>
    `;
  } catch(e) {}
}

// ============ DEPT CALLBACKS ============
async function loadDeptCallbacks() {
  try {
    const res = await fetch('/api/dept/my-callbacks');
    if (!res.ok) return;
    const leads = await res.json();
    const countEl = document.getElementById('deptCallbackCount');
    const listEl = document.getElementById('deptCallbacksList');
    if (countEl) countEl.textContent = leads.length;
    if (!listEl) return;
    if (leads.length === 0) {
      listEl.innerHTML = '<div style="color:var(--t3);font-size:12px;text-align:center;padding:10px">Нет перезвонов</div>';
      return;
    }
    listEl.innerHTML = leads.map(l => {
      const name = l.fio || l.phone || '—';
      const time = l.callback_date ? new Date(l.callback_date).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
      return `<div class="dcb-item">
        <div class="dcb-name" onclick="loadDeptCallbackLead(${l.id})" style="cursor:pointer">${esc(name)}</div>
        <div class="dcb-info">
          <span style="font-size:10px;color:var(--t3)">${time}</span>
          ${l.callback_comment ? '<div style="font-size:10px;color:#fbbf24;margin-top:2px">💬 ' + esc(l.callback_comment) + '</div>' : ''}
        </div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <button onclick="loadDeptCallbackLead(${l.id})" style="flex:1;padding:3px 6px;font-size:9px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:4px;color:#60a5fa;cursor:pointer;font-weight:700">📞 Звонить</button>
          <button onclick="returnDeptCallback(${l.id})" style="flex:1;padding:3px 6px;font-size:9px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);border-radius:4px;color:#4ade80;cursor:pointer;font-weight:700">↩ В очередь</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

async function loadDeptCallbackLead(leadId) {
  try {
    // Return the callback to queue and load it as current lead
    const res = await fetch('/api/dept/callback-return/' + leadId, { method: 'POST' });
    if (!res.ok) { showToast('Ошибка', 'error'); return; }
    // Now load the lead (it's now status=new, assigned to this worker)
    await loadDeptWorkerLead();
    loadDeptCallbacks();
    loadDeptWorkerCounts();
    showToast('📞 Перезвон загружен', 'success');
  } catch(e) { showToast('Ошибка загрузки', 'error'); }
}

async function returnDeptCallback(leadId) {
  try {
    const res = await fetch('/api/dept/callback-return/' + leadId, { method: 'POST' });
    if (!res.ok) { showToast('Ошибка', 'error'); return; }
    showToast('↩ Возвращён в очередь', 'success');
    loadDeptCallbacks();
    loadDeptWorkerCounts();
  } catch(e) { showToast('Ошибка', 'error'); }
}

// ===== ADMIN: PASS RECORDS =====
async function loadPassRecords() {
  const dateEl = document.getElementById('passRecordsDate');
  const date = dateEl ? dateEl.value : '';
  const countEl = document.getElementById('passRecordsCount');
  const tbody = document.getElementById('passRecordsBody');
  if (!tbody) return;
  
  try {
    let url = '/api/admin/pass-records';
    if (date) url += '?date=' + date;
    const res = await fetch(url);
    const records = await res.json();
    
    if (countEl) countEl.textContent = `Записей: ${records.length}`;
    
    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:30px;color:var(--t3)">Нет записей' + (date ? ' за ' + date : '') + '</td></tr>';
      return;
    }
    
    tbody.innerHTML = records.map((r, i) => {
      const dt = r.created_at ? new Date(r.created_at) : null;
      const dateStr = dt ? dt.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' }) : '';
      const timeStr = r.time_msk || (dt ? dt.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' }) : '');
      const s = 'padding:6px;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--t1)';
      return `<tr style="transition:background .2s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
        <td style="${s};color:var(--t3)">${i + 1}</td>
        <td style="${s}">${dateStr} ${esc(timeStr)}</td>
        <td style="${s};font-weight:700;color:#60a5fa">${esc(r.manager)}</td>
        <td style="${s};font-weight:700">${esc(r.fio)}</td>
        <td style="${s}">${esc(r.phone)}</td>
        <td style="${s};max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.address)}">${esc(r.address)}</td>
        <td style="${s}">${esc(r.what_gave)}</td>
        <td style="${s}">${esc(r.sms_spam)}</td>
        <td style="${s}">${esc(r.who_nearby)}</td>
        <td style="${s}">${esc(r.scheme)}</td>
        <td style="${s};max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.extra_info)}">${esc(r.extra_info)}</td>
        <td style="${s};color:#4ade80;font-weight:700">${esc(r.base_name)}</td>
        <td style="${s};color:var(--t2)">${esc(r.worker_name)}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:20px;color:#f87171">❌ Ошибка загрузки</td></tr>';
  }
}

// ===== UNIFIED BASE MANAGEMENT DASHBOARD v4 =====

let _dashData = null;

function getHealthGrade(passRate) {
  const r = parseFloat(passRate);
  if (r >= 8) return { grade: 'A+', color: '#4ade80', bg: 'rgba(74,222,128,0.15)' };
  if (r >= 5) return { grade: 'A', color: '#34d399', bg: 'rgba(52,211,153,0.12)' };
  if (r >= 3) return { grade: 'B', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
  if (r >= 1) return { grade: 'C', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' };
  return { grade: 'D', color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
}

function _svgRing(pct, color, size) {
  const r = (size-6)/2, c = 2*Math.PI*r, dash = (pct/100)*c;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${dash} ${c}"/>
  </svg>`;
}

const _dashStatusLabels = { new:'Новый', passed:'Передан', no_answer:'Не ответ', callback:'Перезвон', skipped:'Пропущен', docs:'Доки' };
const _dashStatusColors = { new:'#60a5fa', passed:'#4ade80', no_answer:'#f87171', callback:'#fbbf24', skipped:'#a78bfa', docs:'#f472b6' };

// ===== SEARCH =====
let _searchTimer = null;
async function dashSearch(q) {
  clearTimeout(_searchTimer);
  if (!q || q.length < 2) return;
  _searchTimer = setTimeout(async () => {
    const container = document.getElementById('allBasesContent');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)">🔍 Ищу по всем базам...</div>';
    try {
      const res = await fetch('/api/admin/search-leads?q=' + encodeURIComponent(q));
      const { results } = await res.json();
      let html = `<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <button onclick="loadAllBases()" style="padding:8px 16px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:8px;color:#60a5fa;cursor:pointer;font-weight:700;font-size:12px">← Назад</button>
        <span style="font-size:14px;font-weight:700;color:var(--t1)">🔍 Результаты поиска: "${q}"</span>
        <span style="font-size:12px;color:var(--t3)">(${results.length}${results.length >= 100 ? ', макс 100' : ''})</span>
      </div>`;
      if (!results.length) {
        html += '<div style="text-align:center;padding:40px;color:var(--t3);font-size:14px">Ничего не найдено</div>';
      } else {
        html += `<div style="background:var(--glass2);border:1px solid var(--border);border-radius:12px;overflow:hidden">
          <div style="display:grid;grid-template-columns:35px 1.4fr 120px 80px 130px 120px 80px;gap:0;padding:10px 14px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border);font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase">
            <span>№</span><span>ФИО / Телефон</span><span>База</span><span>Отдел</span><span>Статус</span><span>💰 Вклад</span><span>Регион</span>
          </div>
          <div style="max-height:600px;overflow-y:auto">`;
        const statusOpts = [
          {v:'new',l:'🆕 Новый'},
          {v:'no_answer',l:'❌ Не дозвон'},
          {v:'callback',l:'📞 Перезвон'},
          {v:'passed',l:'✅ Передал'},
          {v:'docs',l:'📄 Срез'},
          {v:'skipped',l:'⏭ Скип'},
          {v:'talked',l:'🗣 Говорил'}
        ];
        results.forEach((r, i) => {
          const optionsHtml = statusOpts.map(o => `<option value="${o.v}"${r.status === o.v ? ' selected' : ''}>${o.l}</option>`).join('');
          const sc = _dashStatusColors[r.status] || 'var(--t3)';
          // Deposit amount color
          const amt = r.amount || 0;
          let amtColor = '#60a5fa'; // default blue
          let amtBg = 'rgba(96,165,250,0.1)';
          if (amt >= 3000000) { amtColor = '#f97316'; amtBg = 'rgba(249,115,22,0.15)'; }
          else if (amt >= 2000000) { amtColor = '#fbbf24'; amtBg = 'rgba(251,191,36,0.12)'; }
          else if (amt >= 1000000) { amtColor = '#4ade80'; amtBg = 'rgba(74,222,128,0.12)'; }
          const amtStr = amt > 0 ? amt.toLocaleString('ru-RU') + ' ₽' : '—';
          // Extra data tooltip
          let extraHtml = '';
          if (r.extra && typeof r.extra === 'object' && Object.keys(r.extra).length > 0) {
            const lines = Object.entries(r.extra).map(([k,v]) => `<b style="color:var(--t2)">${k}:</b> <span style="color:#fbbf24">${v}</span>`).join('<br>');
            extraHtml = `<div id="extraRow_${r.id}" style="display:none;grid-column:1/-1;padding:8px 14px;background:rgba(251,191,36,0.04);border-top:1px dashed rgba(251,191,36,0.15);font-size:11px;line-height:1.6;color:var(--t3)">${lines}</div>`;
          }
          html += `<div id="searchRow_${r.id}_${r.type}" style="display:grid;grid-template-columns:35px 1.4fr 120px 80px 130px 120px 80px;gap:0;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:12px${i%2===0?';background:rgba(255,255,255,0.015)':''}">
            <span style="color:var(--t3);font-size:11px">${i+1}</span>
            <div>
              <div style="font-weight:700;color:var(--t1)">${r.name || '—'}</div>
              <div style="font-size:11px;color:var(--t3);margin-top:2px">${r.phones || '—'}</div>
            </div>
            <div style="font-weight:600;color:#60a5fa;font-size:11px;display:flex;align-items:center">${r.baseName}</div>
            <div style="color:var(--t2);font-size:11px;display:flex;align-items:center">${r.dept}</div>
            <div style="display:flex;align-items:center">
              <select onchange="changeLeadStatus(${r.id},'${r.type}',this.value,this)" style="padding:3px 6px;font-size:11px;background:${sc}15;border:1px solid ${sc}40;border-radius:6px;color:${sc};font-weight:600;cursor:pointer;font-family:var(--font);outline:none;max-width:130px">
                ${optionsHtml}
              </select>
            </div>
            <div style="display:flex;align-items:center">
              <span onclick="${extraHtml ? `var el=document.getElementById('extraRow_${r.id}');el.style.display=el.style.display==='none'?'block':'none'` : ''}" style="color:${amtColor};font-weight:800;font-size:12px;padding:3px 8px;background:${amtBg};border-radius:6px;border:1px solid ${amtColor}30;${extraHtml ? 'cursor:pointer' : ''}">${amtStr}</span>
            </div>
            <div style="color:var(--t3);font-size:11px;display:flex;align-items:center">${r.region || '—'}</div>
          </div>${extraHtml}`;
        });
        html += '</div></div>';
      }
      container.innerHTML = html;
    } catch(e) {
      const container = document.getElementById('allBasesContent');
      if (container) container.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171">Ошибка: ${e.message} <br><button onclick="loadAllBases()" style="margin-top:10px;padding:6px 14px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:8px;color:#60a5fa;cursor:pointer">← Назад</button></div>`;
    }
  }, 400);
}

async function changeLeadStatus(leadId, type, newStatus, selectEl) {
  try {
    const res = await fetch('/api/admin/change-lead-status', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ lead_id: leadId, type: type, new_status: newStatus })
    });
    const data = await res.json();
    if (res.ok) {
      const sc = _dashStatusColors[newStatus] || 'var(--t3)';
      selectEl.style.background = sc + '15';
      selectEl.style.borderColor = sc + '40';
      selectEl.style.color = sc;
      showToast('✅ Статус изменён!', 'success');
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) {
    showToast('❌ Ошибка: ' + e.message, 'error');
  }
}


// ===== DATE FILTER =====
function dashFilterDate() {
  if (!_dashData) return;
  const from = document.getElementById('dashDateFrom')?.value || '';
  const to = document.getElementById('dashDateTo')?.value || '';
  _renderDashboard(_dashData, _parseDateFilter(from), _parseDateFilter(to));
}
function dashClearDate() {
  const f = document.getElementById('dashDateFrom'); if(f) f.value = '';
  const t = document.getElementById('dashDateTo'); if(t) t.value = '';
  if (_dashData) _renderDashboard(_dashData, '', '');
}
// Parse DD.MM.YYYY to YYYY-MM-DD (ISO) for comparison
function _parseDateFilter(val) {
  if (!val) return '';
  const parts = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!parts) return '';
  return `${parts[3]}-${parts[2]}-${parts[1]}`;
}
// Auto-format date input as DD.MM.YYYY
function _formatDateInput(el) {
  let v = el.value.replace(/[^\d]/g, '');
  if (v.length > 8) v = v.slice(0, 8);
  let formatted = '';
  if (v.length > 0) formatted = v.slice(0, 2);
  if (v.length >= 3) formatted += '.' + v.slice(2, 4);
  if (v.length >= 5) formatted += '.' + v.slice(4, 8);
  el.value = formatted;
  if (formatted.length === 10) dashFilterDate();
}

// ===== MAIN LOAD =====
// Region timezone mapping
function _getRegionTimezone(region) {
  const r = (region || '').toLowerCase();
  const map = [
    // Ukraine UTC+2 (EET/EEST)
    { keys: ['київ','киев','kyiv','kiev','одес','харків','харьк','дніпр','днепр','львів','львов','запоріж','запорож','вінниц','винниц','полтав','черніг','черниг','черкас','чернівц','чернов','хмельн','житомир','рівн','ровно','волин','волын','тернопіл','тернопол','івано','ивано','кіровоград','кировоград','кропивн','миколаїв','николаев','херсон','сум','луган','донец','закарпат','ужгород','укр'], tz: 'Europe/Kyiv', label: 'UTC+2 (Киев)' },
    // Moscow UTC+3
    { keys: ['москв','moscow','питер','петерб','spb','ленинград','нижний','казан','самар','ростов','краснодар','воронеж','волгоград','саратов','тула','рязан','калуг','тверь','смолен','брянс','орёл','орел','курск','белгор','тамбов','пенз','ульянов','архангел','мурман','вологд','псков','новгород','калинин','иванов','костром','владимир','ярослав','чеч','дагест','ингуш','ставропол','кабард','осет','адыге','калмык','астрахан','марий','мордов','чуваш','удмурт','кировск','коми'], tz: 'Europe/Moscow', label: 'UTC+3 (Москва)' },
    // Yekaterinburg UTC+5
    { keys: ['екатеринб','свердлов','челяб','башкир','уфа','оренб','курган','тюмен','пермь','перм','хант','ямал'], tz: 'Asia/Yekaterinburg', label: 'UTC+5 (Екб)' },
    // Omsk UTC+6
    { keys: ['омск'], tz: 'Asia/Omsk', label: 'UTC+6 (Омск)' },
    // Novosibirsk UTC+7
    { keys: ['новосибир','красноярс','кемеров','алтай','барнаул','томск','тыва','тува','хакас'], tz: 'Asia/Novosibirsk', label: 'UTC+7 (Нск)' },
    // Irkutsk UTC+8
    { keys: ['иркутск','бурят'], tz: 'Asia/Irkutsk', label: 'UTC+8 (Иркутск)' },
    // Yakutsk UTC+9
    { keys: ['якутск','якут','забайкал','чита','благовещ','амурск'], tz: 'Asia/Yakutsk', label: 'UTC+9 (Якутск)' },
    // Vladivostok UTC+10
    { keys: ['владивосток','примор','хабаров','сахалин'], tz: 'Asia/Vladivostok', label: 'UTC+10 (Влад)' },
    // Kamchatka UTC+12
    { keys: ['камчат','магадан','чукот'], tz: 'Asia/Kamchatka', label: 'UTC+12 (Камч)' },
    // Kazakhstan UTC+5/+6
    { keys: ['казах','алмат','астан','нур-султан','караганд','шымкент','актоб','павлодар'], tz: 'Asia/Almaty', label: 'UTC+6 (Казахстан)' },
    // Belarus UTC+3
    { keys: ['белорус','беларус','минск', 'гомел','брест','витеб','гродн','могил'], tz: 'Europe/Minsk', label: 'UTC+3 (Минск)' },
    // Georgia UTC+4
    { keys: ['грузи','тбилис','батум'], tz: 'Asia/Tbilisi', label: 'UTC+4 (Грузия)' },
    // Samara UTC+4
    { keys: ['самара','самарс','ижевск'], tz: 'Europe/Samara', label: 'UTC+4 (Самара)' },
  ];
  for (const entry of map) {
    for (const key of entry.keys) {
      if (r.includes(key)) return { iana: entry.tz, label: entry.label };
    }
  }
  return { iana: 'Europe/Kyiv', label: 'UTC+2 (авто)' };
}

// Update all timezone clocks
let _tzClockInterval = null;
function _startRegionClocks() {
  if (_tzClockInterval) clearInterval(_tzClockInterval);
  function update() {
    document.querySelectorAll('[data-tz]').forEach(el => {
      try {
        const t = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: el.dataset.tz });
        el.textContent = t;
      } catch(e) { el.textContent = '--:--'; }
    });
  }
  update();
  _tzClockInterval = setInterval(update, 1000);
}

async function loadAllBases() {
  const container = document.getElementById('allBasesContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)">⏳ Загрузка...</div>';
  try {
    const res = await fetch('/api/admin/all-bases');
    if (!res.ok) throw new Error('Failed');
    _dashData = await res.json();
    _renderDashboard(_dashData, '', '');
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:#f87171">❌ Ошибка: ${e.message}</div>`;
  }
}

function _renderDashboard(data, dateFrom, dateTo) {
  const container = document.getElementById('allBasesContent');
  if (!container) return;
  const { sections, topBases, activeTiers: _activeTiers, summary } = data;
  const activeTiers = _activeTiers || [];

  let html = '';

  // ===== SEARCH BAR =====
  html += `<div style="margin-bottom:16px">
    <div style="display:flex;gap:8px;align-items:center">
      <input type="text" id="dashSearchInput" placeholder="🔍 Поиск лида по ФИО или телефону..." onkeydown="if(event.key==='Enter')dashSearch(this.value)" style="flex:1;padding:10px 14px;background:var(--glass2);border:1px solid var(--border);border-radius:10px;color:var(--t1);font-size:13px;font-family:var(--font);outline:none;box-sizing:border-box" onfocus="this.style.borderColor='rgba(96,165,250,0.5)'" onblur="this.style.borderColor=''">
      <button onclick="dashSearch(document.getElementById('dashSearchInput').value)" style="padding:10px 18px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:10px;color:#60a5fa;cursor:pointer;font-weight:700;font-size:13px;white-space:nowrap">🔍 Найти</button>
    </div>
  </div>`;

  // ===== DATE FILTER =====
  // Convert ISO dateFrom/dateTo back to DD.MM.YYYY for display
  const _isoToDisplay = (iso) => { if (!iso) return ''; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : ''; };
  const displayFrom = _isoToDisplay(dateFrom);
  const displayTo = _isoToDisplay(dateTo);
  const todayISO = new Date().toISOString().slice(0,10);
  const todayDisplay = _isoToDisplay(todayISO);
  html += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
    <span style="font-size:12px;color:var(--t3);font-weight:600">📅 Фильтр по дате:</span>
    <input type="text" id="dashDateFrom" value="${displayFrom}" oninput="_formatDateInput(this)" placeholder="ДД.ММ.ГГГГ" maxlength="10" style="width:110px;padding:6px 10px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;font-family:var(--font);text-align:center;box-sizing:border-box">
    <span style="color:var(--t3);font-size:12px">—</span>
    <input type="text" id="dashDateTo" value="${displayTo}" oninput="_formatDateInput(this)" placeholder="ДД.ММ.ГГГГ" maxlength="10" style="width:110px;padding:6px 10px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;font-family:var(--font);text-align:center;box-sizing:border-box">
    <button onclick="document.getElementById('dashDateFrom').value='${todayDisplay}';document.getElementById('dashDateTo').value='${todayDisplay}';dashFilterDate()" style="padding:5px 12px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);border-radius:8px;color:#60a5fa;font-size:11px;cursor:pointer;font-weight:600">📅 Сегодня</button>
    <button onclick="dashClearDate()" style="padding:5px 12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;color:#f87171;font-size:11px;cursor:pointer;font-weight:600">✕ Сброс</button>
  </div>`;

  // ===== KPI =====
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px">`;
  const kpis = [
    { val: summary.activeBases, label: 'Активных баз', color: '#4ade80', icon: '🟢' },
    { val: summary.totalLeads.toLocaleString(), label: 'Всего лидов', color: '#60a5fa', icon: '📋' },
    { val: summary.todayPasses, label: 'Передач сегодня', color: '#a78bfa', icon: '📞' },
    { val: summary.avgConversion + '%', label: 'Конверсия', color: '#fbbf24', icon: '📈' },
    { val: summary.totalBases - summary.activeBases, label: 'Прозвоненных', color: '#f472b6', icon: '📦' },
  ];
  kpis.forEach(k => {
    html += `<div style="background:linear-gradient(135deg,${k.color}10,${k.color}05);border:1px solid ${k.color}25;border-radius:12px;padding:14px 10px;text-align:center">
      <div style="font-size:16px;margin-bottom:4px">${k.icon}</div>
      <div style="font-size:24px;font-weight:900;color:${k.color}">${k.val}</div>
      <div style="font-size:9px;color:var(--t3);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${k.label}</div>
    </div>`;
  });
  html += '</div>';

  // ===== DEATH YEAR PRIORITY PANEL =====
  html += `<div id="deathYearPanel" style="background:linear-gradient(135deg,rgba(251,191,36,0.06),rgba(239,68,68,0.04));border:1px solid rgba(251,191,36,0.2);border-radius:16px;padding:18px 22px;margin-bottom:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:16px;font-weight:900;color:#fbbf24;display:flex;align-items:center;gap:8px">
          ⚰️ ПРИОРИТЕТ ПО ГОДУ СМЕРТИ
          <span id="dyActiveLabel" style="font-size:11px;padding:3px 10px;border-radius:8px;font-weight:700;background:rgba(255,255,255,0.05);color:var(--t3)">загрузка...</span>
        </div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px">Выберите год — лиды из баз с этим годом в названии будут выдаваться в первую очередь</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="dyButtons">
        <button onclick="setDeathYearPriority('2024')" class="dy-btn" data-year="2024" style="padding:8px 16px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);transition:all .2s;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.08);color:#60a5fa">2024</button>
        <button onclick="setDeathYearPriority('2025')" class="dy-btn" data-year="2025" style="padding:8px 16px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);transition:all .2s;border:1px solid rgba(167,139,250,0.3);background:rgba(167,139,250,0.08);color:#a78bfa">2025</button>
        <button onclick="setDeathYearPriority('2026')" class="dy-btn" data-year="2026" style="padding:8px 16px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);transition:all .2s;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.08);color:#4ade80">2026</button>
        <button onclick="setDeathYearPriority('')" class="dy-btn" data-year="" style="padding:8px 16px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);transition:all .2s;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.06);color:#f87171">✕ ВЫКЛ</button>
      </div>
    </div>
    <div id="dyStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px">
      <div style="text-align:center;padding:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px">
        <div style="font-size:10px;color:var(--t3);font-weight:700;margin-bottom:4px">⏳ Загрузка...</div>
      </div>
    </div>
  </div>`;

  // ===== GLOBAL INCOME PRIORITY BAR (ИНН only) =====
  let totalUnder1m = 0, total1m2m = 0, total2m3m = 0, totalOver3m = 0, totalDeptBases = 0;
  sections.forEach(sec => {
    sec.bases.forEach(b => {
      if (b.type === 'dept') {
        totalUnder1m += (b.income_under1m || 0);
        total1m2m += (b.income_1m_2m || 0);
        total2m3m += (b.income_2m_3m || 0);
        totalOver3m += (b.income_over3m || 0);
        totalDeptBases++;
      }
    });
  });
  const isUnder1m = activeTiers.includes('under_1m');
  const is1m2m = activeTiers.includes('1m_2m');
  const is2m3m = activeTiers.includes('2m_3m');
  const is3mp = activeTiers.includes('3m_plus');
  const tierBtnStyle = (isActive, color) => `padding:8px 14px;font-size:11px;background:${isActive ? color + '20' : 'rgba(255,255,255,0.04)'};border:1px solid ${isActive ? color + '60' : 'rgba(255,255,255,0.08)'};border-radius:10px;color:${isActive ? color : 'var(--t3)'};cursor:pointer;font-weight:800;white-space:nowrap;transition:all .2s`;
  html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:14px 16px;background:linear-gradient(135deg,rgba(74,222,128,0.06),rgba(96,165,250,0.04));border:1px solid rgba(74,222,128,0.15);border-radius:12px;flex-wrap:wrap">
    <span style="font-size:18px">💰</span>
    <div style="flex:1;min-width:200px">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">Доход лидов ИНН (${totalDeptBases} баз)</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;color:#60a5fa;font-weight:700">🔵 до 1М: <span style="font-size:15px;font-weight:900">${totalUnder1m.toLocaleString()}</span></span>
        <span style="font-size:11px;color:#4ade80;font-weight:700">🟢 1-2М: <span style="font-size:15px;font-weight:900">${total1m2m.toLocaleString()}</span></span>
        <span style="font-size:11px;color:#fbbf24;font-weight:700">🟡 2-3М: <span style="font-size:15px;font-weight:900">${total2m3m.toLocaleString()}</span></span>
        <span style="font-size:11px;color:#f97316;font-weight:700">🔴 3М+: <span style="font-size:15px;font-weight:900">${totalOver3m.toLocaleString()}</span></span>
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:10px;color:var(--t3);font-weight:700">⚙️ Приоритет:</span>
      <button type="button" id="btnTierUnder1m" style="${tierBtnStyle(isUnder1m, '#60a5fa')}">${isUnder1m ? '🔵' : '⚪'} до 1М</button>
      <button type="button" id="btnTier1m2m" style="${tierBtnStyle(is1m2m, '#4ade80')}">${is1m2m ? '🟢' : '⚪'} 1-2М</button>
      <button type="button" id="btnTier2m3m" style="${tierBtnStyle(is2m3m, '#fbbf24')}">${is2m3m ? '🟡' : '⚪'} 2-3М</button>
      <button type="button" id="btnTier3mPlus" style="${tierBtnStyle(is3mp, '#f97316')}">${is3mp ? '🔴' : '⚪'} 3М+</button>
    </div>
  </div>`;

  // ===== LAYOUT: MAIN + SIDEBAR =====
  html += '<div style="display:grid;grid-template-columns:1fr 260px;gap:16px;align-items:start">';

  // ===== MAIN CONTENT =====
  html += '<div>';
  sections.forEach(sec => {
    // Filter bases by date if set
    let filteredBases = sec.bases;
    if (dateFrom || dateTo) {
      filteredBases = sec.bases.filter(b => {
        if (!b.created_at) return true;
        const d = b.created_at.slice(0,10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }

    const activeBases = filteredBases.filter(b => b.enabled && b.newCount > 0);
    const completedBases = filteredBases.filter(b => !b.enabled || b.newCount === 0);
    const ts = sec.todayStats || {};

    // Department header
    html += `<div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:linear-gradient(135deg,${sec.color}12,${sec.color}05);border:1px solid ${sec.color}30;border-radius:12px;margin-bottom:10px">
        <span style="font-size:22px">${sec.icon}</span>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800;color:${sec.color}">${sec.name}</div>
          <div style="font-size:10px;color:var(--t3)">${sec.bases.length} баз • ${activeBases.length} активных</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:900;color:${sec.color}">${sec.bases.reduce((s,b) => s+b.total, 0).toLocaleString()}</div>
          <div style="font-size:8px;color:var(--t3);text-transform:uppercase">лидов</div>
        </div>
      </div>`;

    // Today's stats strip
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
      <div style="background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:9px;color:var(--t3);margin-bottom:3px">📊 Обработано сегодня</div>
        <div style="font-size:18px;font-weight:900;color:#60a5fa">${ts.todayCalls || 0}</div>
      </div>
      <div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.12);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:9px;color:var(--t3);margin-bottom:3px">✅ Передано сегодня</div>
        <div style="font-size:18px;font-weight:900;color:#4ade80">${ts.todayPasses || 0}</div>
      </div>
      <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.12);border-radius:8px;padding:8px;text-align:center">
        <div style="font-size:9px;color:var(--t3);margin-bottom:3px">🏆 Топ база</div>
        <div style="font-size:11px;font-weight:800;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${ts.topBase?ts.topBase.name:''}">${ts.topBase ? ts.topBase.name : '—'}</div>
        <div style="font-size:8px;color:var(--t3)">${ts.topBase ? ts.topBase.passes + ' передач' : ''}</div>
      </div>
    </div>`;

    // Active bases — GROUP BY REGION with timezone clocks
    if (activeBases.length) {
      const regionGroups = {};
      activeBases.forEach(b => {
        const rg = b.region || 'Без региона';
        if (!regionGroups[rg]) regionGroups[rg] = [];
        regionGroups[rg].push(b);
      });
      Object.keys(regionGroups).sort().forEach(region => {
        const tz = _getRegionTimezone(region);
        const clockId = 'tz_' + region.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '_' + Date.now();
        html += `<div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.08);border-radius:8px;margin-bottom:6px">
            <span style="font-size:12px">📍</span>
            <span style="font-size:12px;font-weight:700;color:var(--t1);flex:1">${region}</span>
            <span style="font-size:9px;color:var(--t3)">${tz.label}</span>
            <span id="${clockId}" style="font-size:13px;font-weight:900;color:#22d3ee;font-family:monospace;min-width:55px;text-align:right" data-tz="${tz.iana}"></span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px">`;
        regionGroups[region].forEach(b => { html += _renderBCardV4(b, sec.color, false); });
        html += '</div></div>';
      });
    }

    // Completed
    if (completedBases.length) {
      html += `<details style="margin-bottom:6px">
        <summary style="cursor:pointer;padding:8px 12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.15);border-radius:8px;color:#f87171;font-weight:700;font-size:11px;list-style:none;display:flex;align-items:center;gap:6px">
          <span>📦 Прозвоненные</span>
          <span style="background:rgba(248,113,113,0.2);padding:1px 7px;border-radius:12px;font-size:10px;font-weight:900">${completedBases.length}</span>
          <span style="margin-left:auto;font-size:9px;color:var(--t3)">▾</span>
        </summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px;margin-top:8px;padding:10px;background:rgba(248,113,113,0.03);border:1px solid rgba(248,113,113,0.08);border-radius:8px">`;
      completedBases.forEach(b => { html += _renderBCardV4(b, '#f87171', true); });
      html += '</div></details>';
    }
    html += '</div>';
  });
  html += '</div>';

  // ===== SIDEBAR =====
  html += `<div style="position:sticky;top:10px">`;

  // Top-5 leaderboard
  html += `<div style="background:linear-gradient(180deg,rgba(251,191,36,0.07),rgba(251,146,60,0.03));border:1px solid rgba(251,191,36,0.18);border-radius:12px;padding:14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">
      <span style="font-size:18px">🏆</span>
      <div>
        <div style="font-size:13px;font-weight:900;color:#fbbf24">ТОП-5 Баз</div>
        <div style="font-size:9px;color:var(--t3)">по передачам</div>
      </div>
    </div>`;
  if (topBases && topBases.length) {
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    topBases.forEach((tb, i) => {
      const barW = topBases[0].passed > 0 ? Math.round((tb.passed / topBases[0].passed) * 100) : 0;
      const c = i===0?'#fbbf24':i===1?'#94a3b8':i===2?'#d97706':'var(--t3)';
      html += `<div style="padding:8px;border-radius:8px;margin-bottom:4px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:14px">${medals[i]}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${tb.name}">${tb.name}</div>
            <div style="font-size:8px;color:var(--t3)">${tb.section}</div>
          </div>
          <div style="font-size:13px;font-weight:900;color:${c}">${tb.passed}</div>
        </div>
        <div style="background:rgba(255,255,255,0.05);border-radius:3px;height:3px;overflow:hidden">
          <div style="width:${barW}%;height:100%;background:${c};border-radius:3px"></div>
        </div>
      </div>`;
    });
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--t3);font-size:11px">Нет данных</div>';
  }
  html += '</div>';

  // Department daily summary
  html += `<div style="background:linear-gradient(180deg,rgba(96,165,250,0.07),rgba(167,139,250,0.03));border:1px solid rgba(96,165,250,0.18);border-radius:12px;padding:14px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
      <span style="font-size:16px">📊</span>
      <div style="font-size:12px;font-weight:800;color:#60a5fa">Сегодня по отделам</div>
    </div>`;
  sections.forEach(sec => {
    const ts = sec.todayStats || {};
    html += `<div style="padding:8px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04)">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
        <span style="font-size:12px">${sec.icon}</span>
        <span style="font-size:10px;font-weight:700;color:${sec.color};flex:1">${sec.name}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <div style="text-align:center;padding:5px;background:rgba(96,165,250,0.05);border-radius:5px">
          <div style="font-size:14px;font-weight:900;color:#60a5fa">${ts.todayCalls||0}</div>
          <div style="font-size:7px;color:var(--t3);text-transform:uppercase">действий</div>
        </div>
        <div style="text-align:center;padding:5px;background:rgba(74,222,128,0.05);border-radius:5px">
          <div style="font-size:14px;font-weight:900;color:#4ade80">${ts.todayPasses||0}</div>
          <div style="font-size:7px;color:var(--t3);text-transform:uppercase">передач</div>
        </div>
      </div>
    </div>`;
  });
  html += '</div></div>';
  html += '</div>'; // end grid

  container.innerHTML = html;
  _startRegionClocks();

  // Attach tier toggle button listeners
  const tierBtns = [
    { id: 'btnTierUnder1m', tier: 'under_1m' },
    { id: 'btnTier1m2m', tier: '1m_2m' },
    { id: 'btnTier2m3m', tier: '2m_3m' },
    { id: 'btnTier3mPlus', tier: '3m_plus' }
  ];
  tierBtns.forEach(({ id, tier }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        togglePriorityTier(tier);
        return false;
      });
    }
  });

  // Load death year stats async
  loadDeathYearStats();
}

// ===== DEATH YEAR PRIORITY FUNCTIONS =====
async function loadDeathYearStats() {
  try {
    const res = await fetch('/api/admin/death-year-stats');
    const data = await res.json();
    const { years, priority } = data;

    // Update active label
    const label = document.getElementById('dyActiveLabel');
    if (label) {
      if (priority) {
        label.textContent = '🔥 АКТИВЕН: ' + priority;
        label.style.background = 'rgba(74,222,128,0.15)';
        label.style.color = '#4ade80';
      } else {
        label.textContent = 'ВЫКЛЮЧЕН';
        label.style.background = 'rgba(248,113,113,0.1)';
        label.style.color = '#f87171';
      }
    }

    // Highlight active button
    document.querySelectorAll('.dy-btn').forEach(btn => {
      const y = btn.getAttribute('data-year');
      if (y === priority) {
        btn.style.background = 'rgba(74,222,128,0.25)';
        btn.style.borderColor = 'rgba(74,222,128,0.6)';
        btn.style.color = '#4ade80';
        btn.style.boxShadow = '0 0 12px rgba(74,222,128,0.2)';
      }
    });

    // Render stats cards
    const statsEl = document.getElementById('dyStats');
    if (statsEl) {
      const yearKeys = ['2024', '2025', '2026', 'other'];
      const yearLabels = { '2024': '2024', '2025': '2025', '2026': '2026', other: 'Другие' };
      const yearColors = { '2024': '#60a5fa', '2025': '#a78bfa', '2026': '#4ade80', other: '#fbbf24' };
      const yearIcons = { '2024': '📘', '2025': '📙', '2026': '📗', other: '📂' };
      let sh = '';
      yearKeys.forEach(k => {
        const d = years[k] || { total: 0, new: 0 };
        const c = yearColors[k];
        const isActive = k === priority;
        sh += `<div style="text-align:center;padding:14px 10px;background:${isActive ? c+'15' : 'rgba(255,255,255,0.02)'};border:1px solid ${isActive ? c+'50' : 'rgba(255,255,255,0.05)'};border-radius:12px;transition:all .2s${isActive ? ';box-shadow:0 0 15px '+c+'20' : ''}">
          <div style="font-size:18px;margin-bottom:4px">${yearIcons[k]}</div>
          <div style="font-size:18px;font-weight:900;color:${c}">${yearLabels[k]}</div>
          <div style="margin-top:8px">
            <div style="font-size:26px;font-weight:900;color:${c}">${d.new}</div>
            <div style="font-size:9px;color:var(--t3);font-weight:700;margin-top:2px">НОВЫХ</div>
          </div>
          ${isActive ? '<div style="margin-top:6px;font-size:9px;font-weight:800;color:'+c+';text-transform:uppercase;letter-spacing:1px">⚡ ПРИОРИТЕТ</div>' : ''}
        </div>`;
      });
      statsEl.innerHTML = sh;
    }
  } catch(e) { console.error('Death year stats error:', e); }
}

async function setDeathYearPriority(year) {
  try {
    const res = await fetch('/api/admin/death-year-priority', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year })
    });
    if (res.ok) {
      showToast(year ? `⚰️ Приоритет: ${year} год смерти` : '⚰️ Приоритет по году ВЫКЛЮЧЕН', 'success');
      loadDeathYearStats(); // Refresh panel
    }
  } catch(e) { showToast('❌ Ошибка: ' + e.message, 'error'); }
}

function _renderBCardV4(b, sColor, isCompleted) {
  const h = getHealthGrade(b.passRate);
  const pc = b.progress >= 80 ? '#4ade80' : b.progress >= 50 ? '#fbbf24' : '#60a5fa';

  let c = `<div style="background:var(--glass2);border:1px solid ${isCompleted?'rgba(248,113,113,0.12)':'var(--border)'};border-radius:12px;padding:14px${isCompleted?';opacity:0.7':''}">`;

  // Header
  c += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:5px">
        <span style="color:${b.enabled?'#4ade80':'#f87171'};font-size:7px">●</span>
        <div style="font-size:12px;font-weight:800;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${b.name}">${b.name}</div>
      </div>
      <div style="font-size:9px;color:var(--t3);margin-top:2px">${b.type==='svo'?'🎖️':'🏢'} ${b.total.toLocaleString()} лидов</div>
    </div>
    <div style="background:${h.bg};border:1px solid ${h.color}30;border-radius:8px;padding:4px 8px;text-align:center;min-width:40px">
      <div style="font-size:16px;font-weight:900;color:${h.color};line-height:1">${h.grade}</div>
      <div style="font-size:7px;color:${h.color};opacity:0.7">${b.passRate}%</div>
    </div>
  </div>`;

  // Progress ring + bar
  c += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
    <div style="position:relative;flex-shrink:0">
      ${_svgRing(b.progress, pc, 42)}
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:${pc}">${b.progress}%</div>
    </div>
    <div style="flex:1">
      <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:5px;overflow:hidden;margin-bottom:3px">
        <div style="width:${b.progress}%;height:100%;background:${pc};border-radius:4px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--t3)">
        <span>${b.processed} обработано</span>
        <span>${b.newCount} осталось</span>
      </div>
    </div>
  </div>`;

  // Stats
  const stats = [
    {v:b.passed,l:'Передано',cl:'#4ade80'},{v:b.newCount,l:'Новых',cl:'#60a5fa'},{v:b.callback,l:'Перезвон',cl:'#fbbf24'},
    {v:b.noAnswer,l:'Не ответ',cl:'#f87171'},{v:b.skipped,l:'Пропуск',cl:'#a78bfa'},{v:b.docs||0,l:'Доки',cl:'#f472b6'}
  ];
  c += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-bottom:8px">';
  stats.forEach(s => {
    c += `<div style="text-align:center;padding:4px 2px;background:${s.cl}08;border-radius:5px">
      <div style="font-size:12px;font-weight:800;color:${s.cl}">${s.v}</div>
      <div style="font-size:7px;color:var(--t3)">${s.l}</div>
    </div>`;
  });
  c += '</div>';

  // Best worker
  if (b.bestWorker) {
    c += `<div style="display:flex;align-items:center;gap:5px;padding:5px 8px;background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.1);border-radius:6px;margin-bottom:6px">
      <span style="font-size:10px">🏆</span>
      <span style="font-size:9px;color:#fbbf24;font-weight:700;flex:1">${b.bestWorker.name}</span>
      <span style="font-size:9px;color:var(--t3)">${b.bestWorker.passes} ✅</span>
    </div>`;
  }

  // Income stats (dept only) - counts only, toggle is global
  if (b.type === 'dept' && ((b.income_under1m || 0) + (b.income_1m_2m || 0) + (b.income_2m_3m || 0) + (b.income_over3m || 0) > 0)) {
    c += `<div style="display:flex;gap:3px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.04);padding-top:6px">
      <div style="flex:1;text-align:center;padding:3px;background:rgba(96,165,250,0.08);border-radius:4px">
        <span style="font-size:10px;font-weight:800;color:#60a5fa">${b.income_under1m || 0}</span>
        <span style="font-size:6px;color:var(--t3)"> <1М</span>
      </div>
      <div style="flex:1;text-align:center;padding:3px;background:rgba(74,222,128,0.08);border-radius:4px">
        <span style="font-size:10px;font-weight:800;color:#4ade80">${b.income_1m_2m || 0}</span>
        <span style="font-size:6px;color:var(--t3)"> 1-2М</span>
      </div>
      <div style="flex:1;text-align:center;padding:3px;background:rgba(251,191,36,0.08);border-radius:4px">
        <span style="font-size:10px;font-weight:800;color:#fbbf24">${b.income_2m_3m || 0}</span>
        <span style="font-size:6px;color:var(--t3)"> 2-3М</span>
      </div>
      <div style="flex:1;text-align:center;padding:3px;background:rgba(249,115,22,0.08);border-radius:4px">
        <span style="font-size:10px;font-weight:800;color:#f97316">${b.income_over3m || 0}</span>
        <span style="font-size:6px;color:var(--t3)"> 3М+</span>
      </div>
    </div>`;
  }

  // Worker assignment (dept only)
  if (b.type === 'dept' && b.deptUsers) {
    const has = b.assignedWorkers && b.assignedWorkers.length > 0;
    c += `<div style="border-top:1px solid rgba(255,255,255,0.04);padding-top:8px;margin-top:4px">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
        <span style="font-size:9px">👥</span>
        <span style="font-size:9px;font-weight:700;color:var(--t2)">Назначение:</span>
        <span style="font-size:8px;color:${has?'#fb923c':'#4ade80'};font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${has ? b.assignedNames.join(', ') : 'Все'}</span>
      </div>
      <div style="display:flex;gap:3px">
        <button onclick="setAllWorkers(${b.id})" style="padding:2px 7px;font-size:8px;background:${!has?'rgba(74,222,128,0.12)':'rgba(255,255,255,0.03)'};border:1px solid ${!has?'rgba(74,222,128,0.25)':'rgba(255,255,255,0.06)'};border-radius:5px;color:${!has?'#4ade80':'var(--t3)'};cursor:pointer;font-weight:700">Все</button>
        <button onclick="toggleWorkerAssign(${b.id})" style="padding:2px 7px;font-size:8px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:5px;color:#60a5fa;cursor:pointer;font-weight:700">Выбрать ▾</button>
      </div>
      <div id="workerList_${b.id}" style="display:none;margin-top:5px;padding:6px;background:rgba(0,0,0,0.2);border-radius:6px;max-height:100px;overflow-y:auto">
        ${b.deptUsers.map(u => `<label style="display:flex;align-items:center;gap:5px;padding:2px 0;cursor:pointer;font-size:9px;color:var(--t2)">
          <input type="checkbox" value="${u.id}" ${b.assignedWorkers.includes(u.id)?'checked':''} onchange="updateWorkerAssign(${b.id})" style="accent-color:#60a5fa;width:12px;height:12px"> ${u.name}
        </label>`).join('')}
      </div>
    </div>`;
  }

  // Return actions
  if (isCompleted && b.type === 'dept') {
    c += `<div style="border-top:1px solid rgba(255,255,255,0.04);padding-top:6px;margin-top:4px">
      <div style="font-size:9px;font-weight:700;color:var(--t2);margin-bottom:4px">🔄 Вернуть:</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">`;
    if (b.callback > 0) c += `<button onclick="returnLeadsDash(${b.id},'callback')" style="padding:2px 7px;font-size:8px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:5px;color:#fbbf24;cursor:pointer;font-weight:600">Перезвон (${b.callback})</button>`;
    if (b.noAnswer > 0) c += `<button onclick="returnLeadsDash(${b.id},'no_answer')" style="padding:2px 7px;font-size:8px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.15);border-radius:5px;color:#f87171;cursor:pointer;font-weight:600">Не ответ (${b.noAnswer})</button>`;
    if (b.skipped > 0) c += `<button onclick="returnLeadsDash(${b.id},'skipped')" style="padding:2px 7px;font-size:8px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);border-radius:5px;color:#a78bfa;cursor:pointer;font-weight:600">Пропуск (${b.skipped})</button>`;
    c += '</div></div>';
  }
  c += '</div>';
  return c;
}

function toggleWorkerAssign(baseId) {
  const l = document.getElementById('workerList_' + baseId);
  if (l) l.style.display = l.style.display === 'none' ? 'block' : 'none';
}

async function updateWorkerAssign(baseId) {
  const l = document.getElementById('workerList_' + baseId);
  if (!l) return;
  const cks = l.querySelectorAll('input[type=checkbox]:checked');
  const ids = Array.from(cks).map(c => parseInt(c.value));
  try {
    await fetch('/api/admin/dept-bases/' + baseId + '/assign-workers', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({worker_ids:ids}) });
    loadAllBases();
  } catch(e) { alert('Ошибка: ' + e.message); }
}

async function setAllWorkers(baseId) {
  try {
    await fetch('/api/admin/dept-bases/' + baseId + '/assign-workers', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({worker_ids:[]}) });
    loadAllBases();
  } catch(e) { alert('Ошибка: ' + e.message); }
}

async function togglePriorityTier(tier) {
  try {
    await fetch('/api/admin/priority-tier-toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({tier}) });
    loadAllBases();
  } catch(e) { alert('Ошибка: ' + e.message); }
}

async function returnLeadsDash(baseId, status) {
  if (!confirm('Вернуть лиды "' + status + '" в работу?')) return;
  try {
    const r = await fetch('/api/admin/dept-bases/' + baseId + '/return-leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
    const d = await r.json();
    alert('Возвращено ' + d.reset + ' лидов');
    loadAllBases();
  } catch(e) { alert('Ошибка: ' + e.message); }
}

// ============ STAKES (Ставки) ============
let stakesWeekOffset = 0;

async function loadStakes(weekOffset) {
  if (weekOffset !== undefined) stakesWeekOffset = weekOffset;
  const el = document.getElementById('stakesContent');
  const labelEl = document.getElementById('stakesWeekLabel');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--t3)">⏳ Загрузка...</div>';

  try {
    const res = await fetch('/api/admin/stakes?week_offset=' + stakesWeekOffset);
    const data = await res.json();

    if (labelEl) labelEl.textContent = data.week_label + (stakesWeekOffset === 0 ? ' (текущая)' : '');

    let html = '';

    // Helper: render one stakes table
    function renderStakesTable(title, emoji, workers, days, isSvo) {
      if (!workers || workers.length === 0) {
        return `<div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:10px">${emoji} ${title}</div>
          <div style="color:var(--t3);font-size:13px;padding:20px;text-align:center">Нет работников</div>
        </div>`;
      }

      // Grand totals
      let grandTotal = 0;
      workers.forEach(w => grandTotal += w.weekTotal);

      let t = `<div style="margin-bottom:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:15px;font-weight:800;color:var(--t1)">${emoji} ${title}</div>
          <div style="font-size:13px;font-weight:700;color:#4ade80">Итого: $${grandTotal}</div>
        </div>
        <div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border)">
          <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:500px">
            <thead>
              <tr style="background:rgba(255,255,255,0.04)">
                <th style="padding:12px 14px;text-align:left;color:var(--t2);font-weight:700;border-bottom:2px solid var(--border);white-space:nowrap">👤 Работник</th>`;

      data.dayNames.forEach((dn, i) => {
        const isToday = days[i] === new Date().toISOString().slice(0,10);
        t += `<th style="padding:12px 8px;text-align:center;color:${isToday ? '#60a5fa' : 'var(--t2)'};font-weight:700;border-bottom:2px solid var(--border);min-width:70px;white-space:nowrap">${dn}<div style="font-size:9px;color:var(--t3);font-weight:500">${days[i].slice(5).replace('-','.')}</div></th>`;
      });

      t += `<th style="padding:12px 10px;text-align:center;color:#fbbf24;font-weight:800;border-bottom:2px solid var(--border);white-space:nowrap">💰 Итого</th>
              </tr>
            </thead>
            <tbody>`;

      workers.forEach((w, wi) => {
        const bg = wi % 2 === 0 ? 'rgba(255,255,255,0.015)' : '';
        t += `<tr style="background:${bg};transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='${bg}'">
          <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);font-weight:700;color:var(--t1);white-space:nowrap">${esc(w.name)}</td>`;

        days.forEach(day => {
          const d = w.days[day];
          if (!d) {
            t += '<td style="padding:10px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--t3)">—</td>';
            return;
          }

          let cellBg, cellColor, cellBorder;
          if (d.earned >= 20) {
            cellBg = 'rgba(74,222,128,0.12)';
            cellColor = '#4ade80';
            cellBorder = 'rgba(74,222,128,0.25)';
          } else if (d.earned >= 10) {
            cellBg = 'rgba(251,191,36,0.12)';
            cellColor = '#fbbf24';
            cellBorder = 'rgba(251,191,36,0.25)';
          } else {
            cellBg = 'rgba(255,255,255,0.02)';
            cellColor = 'var(--t3)';
            cellBorder = 'rgba(255,255,255,0.06)';
          }

          const spin = (isSvo && d.canSpin) ? ' 🎰' : '';

          t += `<td style="padding:6px 4px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.04)">
            <div style="background:${cellBg};border:1px solid ${cellBorder};border-radius:8px;padding:6px 4px">
              <div style="font-size:15px;font-weight:900;color:${cellColor}">$${d.earned}${spin}</div>
              <div style="font-size:9px;color:var(--t3);margin-top:2px">${d.passes} трубок</div>
            </div>
          </td>`;
        });

        // Week total
        let totalBg, totalColor;
        if (w.weekTotal >= 100) {
          totalBg = 'rgba(74,222,128,0.15)';
          totalColor = '#4ade80';
        } else if (w.weekTotal >= 40) {
          totalBg = 'rgba(251,191,36,0.12)';
          totalColor = '#fbbf24';
        } else {
          totalBg = 'rgba(255,255,255,0.04)';
          totalColor = 'var(--t2)';
        }

        t += `<td style="padding:10px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="background:${totalBg};border-radius:8px;padding:6px 8px;display:inline-block;min-width:50px">
            <div style="font-size:17px;font-weight:900;color:${totalColor}">$${w.weekTotal}</div>
          </div>
        </td>`;

        t += '</tr>';
      });

      t += `</tbody></table></div></div>`;
      return t;
    }

    // СВО table
    html += renderStakesTable('СВО — Ставки', '📞', data.svo.workers, data.days, true);

    // ИНН tables (one per department)
    data.inn.forEach(group => {
      html += renderStakesTable(`${group.dept_name} — Ставки`, '🏢', group.workers, data.days, false);
    });

    // Legend
    html += `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:var(--glass2);border:1px solid var(--border);border-radius:10px;margin-top:8px">
      <span style="font-size:11px;color:var(--t3);font-weight:700">Легенда:</span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="width:14px;height:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;display:inline-block"></span><span style="color:var(--t3)">$0 (0-1 трубка)</span></span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="width:14px;height:14px;background:rgba(251,191,36,0.2);border:1px solid rgba(251,191,36,0.35);border-radius:4px;display:inline-block"></span><span style="color:#fbbf24">$10 (2-3 трубки)</span></span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="width:14px;height:14px;background:rgba(74,222,128,0.2);border:1px solid rgba(74,222,128,0.35);border-radius:4px;display:inline-block"></span><span style="color:#4ade80">$20 (4+ трубок)</span></span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px"><span>🎰</span><span style="color:var(--t2)">= 5+ трубок СВО (барабан)</span></span>
    </div>`;

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171">❌ Ошибка: ${e.message}</div>`;
  }
}

// ============ MISSED CALLS PHONE ANALYTICS ============
async function loadMissedCallsAnalytics() {
  let ov = document.getElementById('missedCallsOverlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'missedCallsOverlay'; ov.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);overflow-y:auto;padding:20px'; document.body.appendChild(ov); }
  ov.style.display = 'block';
  ov.innerHTML = '<div style="text-align:center;padding:60px;color:#22d3ee;font-size:18px">⏳ Загрузка...</div>';
  try {
    const res = await fetch('/api/analytics/missed-calls');
    const data = await res.json();
    let html = '<div style="max-width:900px;margin:0 auto">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h2 style="font-size:20px;font-weight:800;color:#fff">📊 Недозвоны — Номера по регионам</h2>';
    html += '<button onclick="document.getElementById(\'missedCallsOverlay\').style.display=\'none\'" style="padding:8px 16px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#f87171;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">✕ Закрыть</button></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">';
    html += '<div style="background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.15);border-radius:12px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:900;color:#22d3ee">' + data.totalCards + '</div><div style="font-size:11px;color:var(--t3);font-weight:600">КАРТОЧЕК</div></div>';
    html += '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:900;color:#fbbf24">' + data.totalPhones + '</div><div style="font-size:11px;color:var(--t3);font-weight:600">НОМЕРОВ</div></div>';
    html += '<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.15);border-radius:12px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:900;color:#a78bfa">' + data.regions.length + '</div><div style="font-size:11px;color:var(--t3);font-weight:600">РЕГИОНОВ</div></div></div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:2px solid rgba(34,211,238,0.15)">';
    html += '<th style="text-align:left;padding:10px;color:#22d3ee">Регион</th><th style="text-align:center;padding:10px;color:#fbbf24">📇 Карточек</th><th style="text-align:center;padding:10px;color:#4ade80">📱 Номеров</th><th style="text-align:center;padding:10px;color:var(--t3)">Среднее</th>';
    html += '</tr></thead><tbody>';
    data.regions.forEach(function(r) {
      var avg = r.cards > 0 ? (r.phones / r.cards).toFixed(1) : '0';
      var pct = data.totalPhones > 0 ? (r.phones / data.totalPhones * 100).toFixed(0) : 0;
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'table-row\':\'none\'">';
      html += '<td style="padding:10px"><div style="font-weight:700;color:#fff">' + r.region + '</div><div style="height:3px;margin-top:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#22d3ee,#8b5cf6)"></div></div></td>';
      html += '<td style="text-align:center;font-weight:800;color:#fbbf24">' + r.cards + '</td>';
      html += '<td style="text-align:center;font-weight:800;font-size:16px;color:#4ade80">' + r.phones + '</td>';
      html += '<td style="text-align:center;color:var(--t2)">' + avg + '</td></tr>';
      html += '<tr style="display:none"><td colspan="4" style="padding:6px 10px;background:rgba(34,211,238,0.03)"><div style="max-height:200px;overflow-y:auto;font-size:11px">';
      r.details.forEach(function(d) {
        html += '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.02)"><span style="color:var(--t2)">' + d.name + '</span><span style="color:' + (d.phones > 0 ? '#4ade80' : '#f87171') + ';font-weight:700">' + d.phones + ' тел.</span></div>';
      });
      html += '</div></td></tr>';
    });
    html += '</tbody></table></div>';
    ov.innerHTML = html;
  } catch(e) {
    ov.innerHTML = '<div style="text-align:center;padding:60px;color:#f87171">Ошибка: ' + e.message + '<br><button onclick="document.getElementById(\'missedCallsOverlay\').style.display=\'none\'" style="margin-top:12px;padding:8px 16px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;cursor:pointer">Закрыть</button></div>';
  }
}



// ===== AUTO-DIAL LIQUIDITY SYSTEM UI =====

async function loadAutodialBases() {
  const container = document.getElementById('autodialContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)">⏳ Загрузка...</div>';
  try {
    const res = await fetch('/api/admin/autodial-bases');
    const data = await res.json();
    const { regions, totalAll, totalLiquid, totalNonLiquid, totalPending } = data;
    let html = '';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px"><div><div style="font-size:20px;font-weight:900;color:var(--t1)">🔄 Прозвон на ликвидность</div><div style="font-size:11px;color:var(--t3)">Автоматическая проверка номеров • макс 10 циклов</div></div><button onclick="collectAutodial()" style="padding:10px 18px;background:linear-gradient(135deg,rgba(96,165,250,0.15),rgba(129,140,248,0.1));border:1px solid rgba(96,165,250,0.4);border-radius:10px;color:#60a5fa;font-weight:800;font-size:12px;cursor:pointer">📥 Собрать недозвоны</button></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px">';
    [{v:totalAll,l:'📋 Всего',c:'#60a5fa'},{v:totalPending,l:'⏳ Ожидают',c:'#fbbf24'},{v:totalLiquid,l:'✅ Ликвид',c:'#4ade80'},{v:totalNonLiquid,l:'❌ Неликвид',c:'#f87171'}].forEach(function(k){
      html+='<div style="background:linear-gradient(135deg,'+k.c+'12,'+k.c+'05);border:1px solid '+k.c+'30;border-radius:12px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:900;color:'+k.c+'">'+k.v+'</div><div style="font-size:9px;color:var(--t3);text-transform:uppercase;font-weight:600;margin-top:4px">'+k.l+'</div></div>';
    });
    html += '</div>';
    html += '<div style="padding:10px 14px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);border-radius:10px;margin-bottom:16px;font-size:11px;color:var(--t2)"><strong style="color:#a78bfa">📡 URL Постбека для сервиса:</strong><br><code style="font-size:10px;color:#22d3ee;background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px;word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText(this.textContent).then(function(){this.style.color=\'#4ade80\'}.bind(this))">' + location.origin + '/api/postback?phone={ct_phone}&status={ct_status}&completed={ct_completed}&duration={ct_duration}&record={ct_record_url}&call_id={ct_call_id}</code><div style="font-size:9px;color:var(--t3);margin-top:4px">👆 Кликни чтобы скопировать</div></div>';
    if (!regions.length) {
      html += '<div style="text-align:center;padding:40px;color:var(--t3);font-size:13px">📭 Нет номеров<br><span style="font-size:11px">Нажмите «📥 Собрать недозвоны»</span></div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">';
      regions.forEach(function(r) {
        var lp = r.total>0?Math.round(r.answered/r.total*100):0;
        var np = r.total>0?Math.round(r.non_liquid/r.total*100):0;
        var pp = 100-lp-np;
        var re = (r.region||'Без региона').replace(/'/g,"\\'");
        html += '<div style="background:linear-gradient(135deg,rgba(239,68,68,0.05),rgba(251,146,60,0.03));border:1px solid rgba(239,68,68,0.15);border-radius:14px;padding:16px">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:16px">📍</span><div style="flex:1"><div style="font-size:14px;font-weight:800;color:var(--t1)">'+(r.region||'Без региона')+'</div><div style="font-size:10px;color:var(--t3)">'+r.total+' номеров</div></div></div>';
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">';
        [{v:r.pending,l:'ожидание',c:'#fbbf24'},{v:r.no_answer,l:'не ответ',c:'#f87171'},{v:r.answered,l:'ликвид',c:'#4ade80'},{v:r.non_liquid,l:'неликвид',c:'#ef4444'}].forEach(function(s){
          html+='<div style="text-align:center;padding:6px;background:'+s.c+'0a;border-radius:8px"><div style="font-size:16px;font-weight:900;color:'+s.c+'">'+s.v+'</div><div style="font-size:7px;color:var(--t3);text-transform:uppercase">'+s.l+'</div></div>';
        });
        html += '</div>';
        html += '<div style="background:rgba(255,255,255,0.05);border-radius:4px;height:6px;overflow:hidden;margin-bottom:10px;display:flex"><div style="width:'+lp+'%;background:#4ade80;height:100%"></div><div style="width:'+np+'%;background:#ef4444;height:100%"></div><div style="width:'+pp+'%;background:#fbbf24;height:100%"></div></div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
        html += '<button onclick="exportAutodial(\''+re+'\')" style="flex:1;padding:6px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.25);border-radius:8px;color:#60a5fa;font-size:10px;font-weight:700;cursor:pointer">📤 Экспорт</button>';
        if(r.answered>0) html += '<button onclick="returnLiquid(\''+re+'\')" style="flex:1;padding:6px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:8px;color:#4ade80;font-size:10px;font-weight:700;cursor:pointer">↩ Вернуть '+r.answered+'</button>';
        html += '<button onclick="showAutodialDetail(\''+re+'\')" style="flex:1;padding:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--t2);font-size:10px;font-weight:700;cursor:pointer">📋 Детали</button>';
        html += '</div></div>';
      });
      html += '</div>';
    }
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div style="text-align:center;padding:60px;color:#f87171">❌ Ошибка: '+e.message+'</div>';
  }
}

async function collectAutodial() {
  if (!confirm('📥 Собрать все номера из карточек с недозвоном в очередь прозвона?')) return;
  try {
    var res = await fetch('/api/admin/autodial-collect', { method:'POST', headers:{'Content-Type':'application/json'} });
    var data = await res.json();
    alert('✅ Добавлено: '+data.added+' номеров\n📋 Всего: '+data.total);
    loadAutodialBases();
  } catch(e) { alert('❌ '+e.message); }
}

async function exportAutodial(region) {
  try {
    var res = await fetch('/api/admin/autodial-export/'+encodeURIComponent(region));
    var data = await res.json();
    if (!data.phones.length) { alert('📭 Нет номеров'); return; }
    var blob = new Blob([JSON.stringify(data.phones,null,2)],{type:'application/json'});
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=u;
    a.download='autodial_'+region.replace(/\s+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.json';
    a.click(); URL.revokeObjectURL(u);
    try { await navigator.clipboard.writeText(data.phones.map(function(p){return p.phone}).join('\n')); } catch(e){}
    alert('📤 Экспорт: '+data.count+' номеров ('+region+')\n📋 Скопированы в буфер');
  } catch(e) { alert('❌ '+e.message); }
}

async function returnLiquid(region) {
  if (!confirm('↩ Вернуть ликвидные "'+region+'" в работу?')) return;
  try {
    var res = await fetch('/api/admin/autodial-return-liquid', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ region: region })
    });
    var data = await res.json();
    alert('✅ Возвращено: '+data.returned+' карточек');
    loadAutodialBases();
  } catch(e) { alert('❌ '+e.message); }
}

async function showAutodialDetail(region) {
  try {
    var res = await fetch('/api/admin/autodial-detail/'+encodeURIComponent(region));
    var entries = await res.json();
    var ov = document.getElementById('autodialDetailOv');
    if (!ov) { ov=document.createElement('div'); ov.id='autodialDetailOv'; ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;flex-direction:column;padding:20px;overflow-y:auto'; document.body.appendChild(ov); }
    ov.style.display='flex';
    var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-size:18px;font-weight:900;color:var(--t1)">📍 '+region+' — Детали ('+entries.length+')</div><button onclick="document.getElementById(\'autodialDetailOv\').style.display=\'none\'" style="padding:8px 16px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:8px;color:#f87171;cursor:pointer;font-weight:700">✕</button></div>';
    h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:rgba(255,255,255,0.04)"><th style="padding:8px;text-align:left;color:var(--t3);font-size:10px">Телефон</th><th style="padding:8px;text-align:left;color:var(--t3);font-size:10px">ФИО</th><th style="padding:8px;text-align:center;color:var(--t3);font-size:10px">Цикл</th><th style="padding:8px;text-align:center;color:var(--t3);font-size:10px">Статус</th><th style="padding:8px;text-align:center;color:var(--t3);font-size:10px">Длит.</th><th style="padding:8px;text-align:center;color:var(--t3);font-size:10px">Ответ сервиса</th></tr></thead><tbody>';
    entries.forEach(function(e){
      var si=e.is_liquid===true?'✅ Ликвид':e.is_liquid===false?'❌ Неликвид':e.is_liquid==='returned'?'↩ Возвращён':e.last_status==='no_answer'?'📵 Не ответ':'⏳ Ожидание';
      var sc=e.is_liquid===true?'#4ade80':e.is_liquid===false?'#ef4444':e.is_liquid==='returned'?'#60a5fa':e.last_status==='no_answer'?'#fb923c':'#fbbf24';
      var cc=e.cycle_count>=8?'#ef4444':e.cycle_count>=5?'#fb923c':'#fbbf24';
      h+='<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="padding:8px;color:#22d3ee;font-family:monospace;font-weight:700">'+e.phone+'</td><td style="padding:8px;color:var(--t2)">'+(e.deceased_name||'—')+'</td><td style="padding:8px;text-align:center"><span style="background:'+cc+'20;color:'+cc+';padding:2px 8px;border-radius:10px;font-weight:800;font-size:11px">'+e.cycle_count+'/10</span></td><td style="padding:8px;text-align:center;color:'+sc+';font-weight:700;font-size:11px">'+si+'</td><td style="padding:8px;text-align:center;color:var(--t3)">'+(e.duration?e.duration+'с':'—')+'</td><td style="padding:8px;text-align:center;font-size:10px;color:var(--t3)">'+(e.raw_status||'—')+'</td></tr>';
    });
    h+='</tbody></table></div>';
    ov.innerHTML=h;
  } catch(e) { alert('❌ '+e.message); }
}


// ===== AVATAR UPLOAD (saves to server) =====
async function uploadAvatar(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 5 * 1024 * 1024) { alert('❌ Макс 5МБ'); return; }
  var formData = new FormData();
  formData.append('avatar', file);
  try {
    var res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
    var data = await res.json();
    if (data.ok) {
      document.getElementById('userAvatar').src = data.avatar;
      showToast('✅ Аватар сохранён', 'success');
    } else {
      alert('❌ ' + (data.error || 'Ошибка'));
    }
  } catch(e) { alert('❌ Ошибка загрузки'); }
}

// Load saved avatar on page load
async function loadSavedAvatar() {
  try {
    var res = await fetch('/api/user/avatar');
    var data = await res.json();
    if (data.avatar) {
      document.getElementById('userAvatar').src = data.avatar;
    }
  } catch(e) {}
}

// ===== EXTENDED NICK BADGE =====
var _currentBadge = localStorage.getItem('nickBadge') || '';

function setNickBadge(badge) {
  _currentBadge = badge;
  localStorage.setItem('nickBadge', badge);
  applyNickBadge();
  fetch('/api/user/nick-config', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ badge: badge })
  }).catch(function(){});
}

function applyNickBadge() {
  var el = document.getElementById('userNickname');
  if (!el) return;
  var text = el.textContent.replace(/^[\s💰💎🏎️👑🔱☠️⚔️🐍🦅🍀🎰\s]+/, '').trim();
  if (_currentBadge) {
    el.textContent = _currentBadge + ' ' + text;
  } else {
    el.textContent = text;
  }
}

// Extend the existing setNickStyle to include new styles
var _origSetNickStyle = typeof setNickStyle === 'function' ? setNickStyle : null;

function setNickStyle(style) {
  var el = document.getElementById('userNickname');
  if (!el) return;
  // Remove all nickname classes
  el.className = '';
  el.style.cssText = 'font-size:15px;font-weight:800;letter-spacing:0.5px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  
  switch(style) {
    case 'neon':
      el.classList.add('nickname-neon');
      break;
    case 'dark':
      el.classList.add('nickname-dark');
      break;
    case 'gold':
      el.classList.add('nickname-gold');
      break;
    case 'fire':
      el.classList.add('nickname-fire');
      break;
    case 'matrix':
      el.classList.add('nickname-matrix');
      break;
    case 'galaxy':
      el.classList.add('nickname-galaxy');
      break;
    case 'ice':
      el.classList.add('nickname-ice');
      break;
    case 'blood':
      el.classList.add('nickname-blood');
      break;
  }
  
  // Save
  fetch('/api/user/nick-style', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ style: style })
  }).catch(function(){});
  localStorage.setItem('nickStyle', style);
  
  // Re-apply badge
  setTimeout(function() { applyNickBadge(); }, 50);
}

// ============ СВО БАЗЫ — GROUPED BY DATE ============
let _svoGroupedData = null;
let _svoExpandedDays = {};
let _svoPeriod = 'today';
let _svoCustomDate = '';

async function loadSvoDashboard() {
  const container = document.getElementById('svoBasesContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)"><div style="font-size:48px;margin-bottom:16px;animation:spin 1.5s linear infinite">⏳</div><div style="font-size:16px;font-weight:700">Загрузка СВО Баз...</div></div>';
  try {
    const res = await fetch('/api/admin/svo-grouped');
    if (!res.ok) throw new Error('Ошибка');
    _svoGroupedData = await res.json();
    renderSvoGrouped(_svoGroupedData);
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:#f87171">❌ ${e.message}</div>`;
  }
}

function svoSetPeriod(p, customDate) {
  _svoPeriod = p;
  if (customDate !== undefined) _svoCustomDate = customDate;
  if (_svoGroupedData) renderSvoGrouped(_svoGroupedData);
}

function _svoFilterDaily(dailyStats) {
  const today = new Date().toISOString().slice(0,10);
  if (_svoPeriod === 'today') return dailyStats.filter(d => d.date === today);
  if (_svoPeriod === 'week') {
    const wa = new Date(); wa.setDate(wa.getDate() - 6);
    return dailyStats.filter(d => d.date >= wa.toISOString().slice(0,10));
  }
  if (_svoPeriod === 'month') return dailyStats;
  if (_svoPeriod === 'custom' && _svoCustomDate) return dailyStats.filter(d => d.date === _svoCustomDate);
  return dailyStats;
}

function renderSvoGrouped(data) {
  const container = document.getElementById('svoBasesContent');
  if (!container) return;
  const { days, summary, freshFirst, dailyStats } = data;
  let html = '';

  // ===== HEADER =====
  html += `<div style="background:linear-gradient(135deg,rgba(96,165,250,0.08),rgba(59,130,246,0.05));border:1px solid rgba(96,165,250,0.15);border-radius:20px;padding:24px 28px;margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
      <div>
        <div style="font-size:28px;font-weight:900;color:#fff;display:flex;align-items:center;gap:12px">
          🎯 СВО БАЗЫ <span style="font-size:14px;padding:5px 16px;background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.35);border-radius:20px;color:#60a5fa;font-weight:800">${summary.globalBases} баз · ${days.length} дней</span>
        </div>
        <div style="font-size:12px;color:var(--t3);margin-top:6px">Группировка по дате загрузки. Нажмите на день чтобы развернуть подбазы.</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="svoToggleFreshFirst()" style="padding:8px 16px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${freshFirst ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.1)'};background:${freshFirst ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.03)'};color:${freshFirst ? '#fb923c' : 'var(--t3)'};font-family:var(--font)">${freshFirst ? '🔥 Свежие ПЕРВЫЕ' : '🔥 Приоритет свежих'}</button>
        <button onclick="loadSvoDashboard()" style="padding:8px 16px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.1);color:#60a5fa;font-family:var(--font)">🔄 Обновить</button>
      </div>
    </div>
  </div>`;

  // ===== KPIs =====
  const kpis = [
    { val: summary.globalNew, label: 'ОСТАЛОСЬ', color: '#4ade80', icon: '⬇', big: true },
    { val: summary.globalNA, label: 'НЕДОЗВОНЫ', color: '#f87171', icon: '📵', big: true },
    { val: summary.globalPassed, label: 'ПЕРЕДАНО', color: '#fbbf24', icon: '✅', big: true },
    { val: summary.globalLeads, label: 'ВСЕГО', color: '#a78bfa', icon: '📋' },
    { val: summary.globalBases, label: 'БАЗ', color: '#60a5fa', icon: '📂' },
    { val: summary.globalEnabled, label: 'ВКЛ', color: '#4ade80', icon: '✅' },
    { val: summary.globalCB || 0, label: 'ПЕРЕЗВОНЫ', color: '#fbbf24', icon: '📞' },
    { val: summary.globalSkipped || 0, label: 'СКИПЫ', color: '#a78bfa', icon: '⏭' },
  ];
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px">';
  kpis.forEach(k => {
    html += `<div class="inn-kpi-card" style="--kpi-color:${k.color};--kpi-glow:${k.color}33${k.big ? ';border:2px solid '+k.color+';box-shadow:0 0 20px '+k.color+'33' : ''}">
      <div style="font-size:${k.big?'24px':'18px'};margin-bottom:6px">${k.icon}</div>
      <div style="font-size:${k.big?'34px':'24px'};font-weight:900;color:${k.color};line-height:1">${k.val.toLocaleString()}</div>
      <div style="font-size:${k.big?'10px':'8px'};color:${k.big?k.color:'var(--t3)'};margin-top:5px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">${k.label}</div>
    </div>`;
  });
  html += '</div>';

  // ===== RETURN ALL NO_ANSWER =====
  if (summary.globalNA > 0) {
    html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding:12px 18px;background:linear-gradient(135deg,rgba(248,113,113,0.08),rgba(239,68,68,0.04));border:2px solid rgba(248,113,113,0.3);border-radius:12px">
      <div style="font-size:24px">📵</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:900;color:#f87171">${summary.globalNA} недозвонов</div><div style="font-size:10px;color:var(--t3)">Вернуть все в прозвон</div></div>
      <button onclick="svoReturnAllNoAnswer()" style="padding:8px 20px;border-radius:10px;font-size:12px;font-weight:900;cursor:pointer;border:2px solid rgba(248,113,113,0.5);background:rgba(248,113,113,0.12);color:#f87171;font-family:var(--font)">🔄 ВЕРНУТЬ ВСЕ Н/Д</button>
    </div>`;
  }

  // ===== TOP 10 by passed =====
  const allBases = days.reduce((arr, d) => arr.concat(d.bases), []);
  const top10 = [...allBases].sort((a, b) => (b.stats.passed||0) - (a.stats.passed||0)).slice(0, 10);
  if (top10.length > 0 && top10[0].stats.passed > 0) {
    html += `<div style="margin-bottom:18px;padding:14px 18px;background:linear-gradient(135deg,rgba(251,191,36,0.05),rgba(74,222,128,0.03));border:1px solid rgba(251,191,36,0.15);border-radius:12px">
      <div style="font-size:14px;font-weight:900;color:#fbbf24;margin-bottom:10px">🏆 ТОП-10 по передачам (СВО)</div>`;
    top10.forEach((b, i) => {
      const m = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'][i];
      const na = b.stats.no_answer||0;
      const cb = b.stats.callback||0;
      const sk = b.stats.skipped||0;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;${i%2?'background:rgba(255,255,255,0.015)':''}">
        <span style="font-size:16px">${m}</span>
        <div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</div>
        <div style="font-size:9px;color:var(--t3)">✅${b.stats.passed} · ⬇${b.stats.new||0} · 📵${na} · 📞${cb} · ⏭${sk}</div></div>
        <div style="display:flex;gap:3px">
          ${na > 0 ? `<button onclick="svoReturnLeads(${b.id},'no_answer',${na})" style="padding:3px 6px;border-radius:5px;font-size:8px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)">🔄Н/Д</button>` : ''}
          ${cb > 0 ? `<button onclick="svoReturnLeads(${b.id},'callback',${cb})" style="padding:3px 6px;border-radius:5px;font-size:8px;font-weight:800;cursor:pointer;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);color:#fbbf24;font-family:var(--font)">🔄Пзв</button>` : ''}
          ${sk > 0 ? `<button onclick="svoReturnLeads(${b.id},'skipped',${sk})" style="padding:3px 6px;border-radius:5px;font-size:8px;font-weight:800;cursor:pointer;border:1px solid rgba(167,139,250,0.3);background:rgba(167,139,250,0.08);color:#a78bfa;font-family:var(--font)">🔄Скп</button>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // ===== PERIOD FILTER + DAILY STATS =====
  if (dailyStats && dailyStats.length > 0) {
    const today = new Date().toISOString().slice(0,10);
    const periodBtns = [
      { id: 'today', label: '📅 Сегодня', color: '#fbbf24' },
      { id: 'week', label: '📆 Неделя', color: '#60a5fa' },
      { id: 'month', label: '🗓 Месяц', color: '#a78bfa' },
    ];
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;padding:10px 14px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px">
      <span style="font-size:11px;font-weight:800;color:var(--t3)">📊 Период:</span>`;
    periodBtns.forEach(p => {
      const active = _svoPeriod === p.id;
      html += `<button onclick="svoSetPeriod('${p.id}')" style="padding:5px 12px;border-radius:7px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font);border:1px solid ${active ? p.color+'80' : 'rgba(255,255,255,0.08)'};background:${active ? p.color+'22' : 'rgba(255,255,255,0.03)'};color:${active ? p.color : 'var(--t3)'}">${p.label}</button>`;
    });
    const ca = _svoPeriod === 'custom';
    html += `<input type="date" value="${_svoCustomDate || today}" onchange="svoSetPeriod('custom', this.value)" style="padding:4px 8px;background:${ca?'rgba(74,222,128,0.12)':'rgba(255,255,255,0.04)'};border:1px solid ${ca?'rgba(74,222,128,0.5)':'rgba(255,255,255,0.08)'};border-radius:7px;color:var(--t1);font-size:11px;font-family:var(--font);outline:none">
    </div>`;

    const fd = _svoFilterDaily(dailyStats);
    const pT = fd.reduce((s,d) => s+d.total, 0);
    const pP = fd.reduce((s,d) => s+d.passed, 0);
    const pN = fd.reduce((s,d) => s+d.no_answer, 0);
    const pC = fd.reduce((s,d) => s+d.callback, 0);
    const pS = fd.reduce((s,d) => s+d.skipped, 0);
    const pLabel = _svoPeriod==='today'?'сегодня':_svoPeriod==='week'?'за неделю':_svoPeriod==='month'?'за месяц':_svoCustomDate;

    html += `<div style="margin-bottom:6px;font-size:12px;font-weight:800;color:var(--t2)">📊 Действия ${pLabel}:</div>`;
    const pKpis = [
      { val: pT, label: 'ДЕЙСТВИЙ', color: '#60a5fa', icon: '📞' },
      { val: pP, label: 'ПЕРЕДАНО', color: '#fbbf24', icon: '✅' },
      { val: pN, label: 'Н/Д', color: '#f87171', icon: '📵' },
      { val: pC, label: 'ПЗВ', color: '#fbbf24', icon: '📞' },
      { val: pS, label: 'СКИПЫ', color: '#a78bfa', icon: '⏭' },
    ];
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:18px">';
    pKpis.forEach(k => {
      html += `<div class="inn-kpi-card" style="--kpi-color:${k.color};--kpi-glow:${k.color}33;border:1px solid ${k.color}40">
        <div style="font-size:16px;margin-bottom:4px">${k.icon}</div>
        <div style="font-size:24px;font-weight:900;color:${k.color};line-height:1">${k.val.toLocaleString()}</div>
        <div style="font-size:8px;color:${k.color};margin-top:4px;font-weight:800;text-transform:uppercase">${k.label}</div>
      </div>`;
    });
    html += '</div>';

    // Daily table
    if (fd.length > 1) {
      html += `<div style="margin-bottom:18px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:rgba(255,255,255,0.04)">
          <th style="padding:8px 12px;text-align:left;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06)">Дата</th>
          <th style="padding:8px 6px;text-align:center;color:#60a5fa;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06)">Всего</th>
          <th style="padding:8px 6px;text-align:center;color:#fbbf24;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06)">Перед</th>
          <th style="padding:8px 6px;text-align:center;color:#f87171;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06)">Н/Д</th>
          <th style="padding:8px 6px;text-align:center;color:#fbbf24;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06)">Пзв</th>
          <th style="padding:8px 6px;text-align:center;color:#a78bfa;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06)">Скип</th>
        </tr></thead><tbody>`;
      fd.forEach((d,i) => {
        const dn = new Date(d.date+'T12:00').toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'short'});
        html += `<tr style="${i%2?'background:rgba(255,255,255,0.015)':''}">
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.03);font-weight:700;color:var(--t1)">${dn}</td>
          <td style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:800;color:#60a5fa">${d.total}</td>
          <td style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:800;color:#fbbf24">${d.passed}</td>
          <td style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:700;color:#f87171">${d.no_answer}</td>
          <td style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:700;color:#fbbf24">${d.callback}</td>
          <td style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:700;color:#a78bfa">${d.skipped}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }
  }

  // ===== DAYS ACCORDION =====
  const activeDays = days.filter(d => d.progress < 95 || d.totalNew > 0);
  const archivedDays = days.filter(d => d.progress >= 95 && d.totalNew === 0);

  html += '<div style="font-size:14px;font-weight:900;color:var(--t1);margin-bottom:10px">📅 Базы по дням загрузки</div>';
  activeDays.forEach(day => { html += _renderSvoDayRow(day); });

  if (archivedDays.length > 0) {
    html += `<div style="margin-top:24px;font-size:14px;font-weight:900;color:var(--t3);margin-bottom:10px;display:flex;align-items:center;gap:8px">
      📦 АРХИВ <span style="font-size:11px;color:var(--t3);font-weight:600">(${archivedDays.length} дней прозвонены)</span>
    </div>`;
    archivedDays.forEach(day => { html += _renderSvoDayRow(day, true); });
  }

  container.innerHTML = html;
}

function _renderSvoDayRow(day, archived) {
  const isExpanded = _svoExpandedDays[day.date];
  const dayLabel = new Date(day.date + 'T12:00').toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const pColor = day.progress >= 90 ? '#f87171' : day.progress >= 60 ? '#fbbf24' : '#4ade80';
  const eColor = day.allEnabled ? '#4ade80' : day.someEnabled ? '#fbbf24' : '#f87171';
  const eLabel = day.allEnabled ? 'ВКЛ' : day.someEnabled ? 'ЧАСТИЧНО' : 'ВЫКЛ';

  let html = `<div style="margin-bottom:6px;border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;${archived?'opacity:0.7':''}">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.02);cursor:pointer" onclick="svoToggleExpand('${day.date}')">
      <span style="font-size:14px;transform:rotate(${isExpanded?'90':'0'}deg);transition:transform .2s">▶</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:800;color:var(--t1)">📅 ${dayLabel}</span>
          <span style="font-size:10px;padding:2px 8px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.2);border-radius:6px;color:#60a5fa;font-weight:700">${day.baseCount} баз</span>
          <span style="font-size:10px;padding:2px 8px;background:${eColor}15;border:1px solid ${eColor}40;border-radius:6px;color:${eColor};font-weight:700">${eLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:4px;font-size:10px;color:var(--t3)">
          <span>📋<b style="color:#a78bfa">${day.totalLeads}</b></span>
          <span>⬇<b style="color:#4ade80">${day.totalNew}</b></span>
          <span>📵<b style="color:#f87171">${day.totalNA}</b></span>
          <span>✅<b style="color:#fbbf24">${day.totalPassed}</b></span>
          <span>📞<b style="color:#fbbf24">${day.totalCB}</b></span>
          <span>⏭<b style="color:#a78bfa">${day.totalSkipped}</b></span>
          <div style="flex:1;max-width:100px;height:4px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${day.progress}%;background:${pColor};border-radius:2px"></div>
          </div>
          <span style="font-weight:800;color:${pColor}">${day.progress}%</span>
        </div>
      </div>
      <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
        ${day.totalNA > 0 ? `<button onclick="svoReturnDayNA('${day.date}',${day.totalNA})" style="padding:4px 8px;border-radius:6px;font-size:9px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)">🔄${day.totalNA}</button>` : ''}
        <button onclick="svoToggleDay('${day.date}',${day.allEnabled?0:1})" style="padding:4px 8px;border-radius:6px;font-size:9px;font-weight:800;cursor:pointer;border:1px solid ${day.allEnabled?'rgba(248,113,113,0.3)':'rgba(74,222,128,0.3)'};background:${day.allEnabled?'rgba(248,113,113,0.08)':'rgba(74,222,128,0.08)'};color:${day.allEnabled?'#f87171':'#4ade80'};font-family:var(--font)">${day.allEnabled?'⛔ВЫКЛ':'✅ВКЛ'}</button>
      </div>
    </div>`;

  if (isExpanded) {
    html += '<div style="border-top:1px solid rgba(255,255,255,0.04);padding:8px">';
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:rgba(255,255,255,0.03)">
      <th style="padding:6px 10px;text-align:left;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">База</th>
      <th style="padding:6px 6px;text-align:center;color:#a78bfa;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Лидов</th>
      <th style="padding:6px 6px;text-align:center;color:#4ade80;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Ост</th>
      <th style="padding:6px 6px;text-align:center;color:#f87171;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Н/Д</th>
      <th style="padding:6px 6px;text-align:center;color:#fbbf24;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Перед</th>
      <th style="padding:6px 6px;text-align:center;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">%</th>
      <th style="padding:6px 8px;text-align:center;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Дейст</th>
    </tr></thead><tbody>`;
    day.bases.forEach((b, i) => {
      const na = b.stats.no_answer||0;
      const cb = b.stats.callback||0;
      const sk = b.stats.skipped||0;
      const pc = b.progress >= 90 ? '#f87171' : b.progress >= 60 ? '#fbbf24' : '#4ade80';
      html += `<tr style="${i%2?'background:rgba(255,255,255,0.015)':''}">
        <td style="padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.02)">
          <div style="font-weight:700;color:var(--t1);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:250px" title="${esc(b.name)}">${esc(b.name)}</div>
        </td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:#a78bfa">${b.total}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:${(b.stats.new||0)>0?'#4ade80':'var(--t3)'}">${b.stats.new||0}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:#f87171">${na||'—'}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:#fbbf24">${b.stats.passed||0}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:${pc}">${b.progress}%</td>
        <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center">
          <div style="display:flex;gap:2px;justify-content:center">
            ${na > 0 ? `<button onclick="svoReturnLeads(${b.id},'no_answer',${na})" style="padding:2px 5px;border-radius:4px;font-size:8px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)">🔄</button>` : ''}
            ${cb > 0 ? `<button onclick="svoReturnLeads(${b.id},'callback',${cb})" style="padding:2px 5px;border-radius:4px;font-size:8px;font-weight:800;cursor:pointer;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);color:#fbbf24;font-family:var(--font)">📞</button>` : ''}
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  html += '</div>';
  return html;
}

function svoToggleExpand(date) {
  _svoExpandedDays[date] = !_svoExpandedDays[date];
  if (_svoGroupedData) renderSvoGrouped(_svoGroupedData);
}

async function svoToggleDay(date, enabled) {
  try {
    const res = await fetch('/api/admin/svo-day/toggle', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date, enabled })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`${enabled ? '✅ Включено' : '⛔ Выключено'} ${data.toggled} баз`, 'success');
      loadSvoDashboard();
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function svoReturnDayNA(date, count) {
  if (!confirm(`🔄 Вернуть ${count} недозвонов за ${date} в прозвон?`)) return;
  try {
    const res = await fetch('/api/admin/svo-day/return-no-answer', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔄 Возвращено ${data.reset} лидов`, 'success');
      loadSvoDashboard();
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function svoToggleFreshFirst() {
  const current = _svoGroupedData ? _svoGroupedData.freshFirst : false;
  try {
    await fetch('/api/admin/svo-fresh-priority', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ enabled: !current })
    });
    showToast(!current ? '🔥 Приоритет свежих ВКЛЮЧЕН' : '🔥 Приоритет свежих ВЫКЛЮЧЕН', 'success');
    loadSvoDashboard();
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}













// Return SVO leads of a specific status for a base

// Return SVO leads of a specific status for a base
async function svoReturnLeads(baseId, status, count) {
  const labels = { no_answer: 'недозвонов', callback: 'перезвонов', skipped: 'скипов' };
  if (!confirm(`🔄 Вернуть ${count} ${labels[status] || status} обратно в прозвон?`)) return;
  try {
    const res = await fetch('/api/admin/svo-bases/' + baseId + '/return-leads', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔄 Возвращено ${data.reset} лидов в прозвон`, 'success');
      loadSvoDashboard();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// Return ALL SVO no_answer leads
async function svoReturnAllNoAnswer() {
  if (!confirm('🔄 Вернуть ВСЕ недозвоны в СВО базах обратно в прозвон?')) return;
  try {
    const res = await fetch('/api/admin/svo-bases/return-all-no-answer', {
      method: 'POST', headers: {'Content-Type':'application/json'}
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔄 Возвращено ${data.reset} недозвонов в прозвон!`, 'success');
      loadSvoDashboard();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}


// ============ ИНН БАЗЫ — GROUPED BY DATE ============
let _innGroupedData = null;
let _innExpandedDays = {};

async function loadInnGrouped() {
  const container = document.getElementById('innBasesContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)"><div style="font-size:48px;margin-bottom:16px;animation:spin 1.5s linear infinite">⏳</div><div style="font-size:16px;font-weight:700">Загрузка ИНН Баз...</div></div>';
  try {
    const res = await fetch('/api/admin/inn-grouped');
    if (!res.ok) throw new Error('Ошибка');
    _innGroupedData = await res.json();
    renderInnGrouped(_innGroupedData);
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:#f87171">❌ ${e.message}</div>`;
  }
}

function renderInnGrouped(data) {
  const container = document.getElementById('innBasesContent');
  if (!container) return;
  const { days, summary, freshFirst, workers } = data;
  let html = '';

  // ===== HEADER =====
  html += `<div style="background:linear-gradient(135deg,rgba(239,68,68,0.08),rgba(251,146,60,0.05));border:1px solid rgba(239,68,68,0.15);border-radius:20px;padding:24px 28px;margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
      <div>
        <div style="font-size:28px;font-weight:900;color:#fff;display:flex;align-items:center;gap:12px">
          🏢 ИНН БАЗЫ <span style="font-size:14px;padding:5px 16px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.35);border-radius:20px;color:#ef4444;font-weight:800">${summary.globalBases} баз · ${days.length} дней</span>
        </div>
        <div style="font-size:12px;color:var(--t3);margin-top:6px">Группировка по дате загрузки. Нажмите на день чтобы развернуть подбазы.</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="innToggleFreshFirst()" style="padding:8px 16px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${freshFirst ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.1)'};background:${freshFirst ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.03)'};color:${freshFirst ? '#fb923c' : 'var(--t3)'};font-family:var(--font)">${freshFirst ? '🔥 Свежие ПЕРВЫЕ' : '🔥 Приоритет свежих'}</button>
        <button onclick="loadInnGrouped()" style="padding:8px 16px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.1);color:#60a5fa;font-family:var(--font)">🔄 Обновить</button>
      </div>
    </div>
  </div>`;

  // ===== KPIs =====
  const kpis = [
    { val: summary.globalNew, label: 'ОСТАЛОСЬ', color: '#4ade80', icon: '⬇', big: true },
    { val: summary.globalNA, label: 'НЕДОЗВОНЫ', color: '#f87171', icon: '📵', big: true },
    { val: summary.globalPassed, label: 'ПЕРЕДАНО', color: '#fbbf24', icon: '✅', big: true },
    { val: summary.globalLeads, label: 'ВСЕГО', color: '#a78bfa', icon: '📋' },
    { val: summary.globalBases, label: 'БАЗ', color: '#60a5fa', icon: '📂' },
    { val: summary.globalEnabled, label: 'ВКЛ', color: '#4ade80', icon: '✅' },
  ];
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px">';
  kpis.forEach(k => {
    html += `<div class="inn-kpi-card" style="--kpi-color:${k.color};--kpi-glow:${k.color}33${k.big ? ';border:2px solid '+k.color+';box-shadow:0 0 20px '+k.color+'33' : ''}">
      <div style="font-size:${k.big?'24px':'18px'};margin-bottom:6px">${k.icon}</div>
      <div style="font-size:${k.big?'34px':'24px'};font-weight:900;color:${k.color};line-height:1">${k.val.toLocaleString()}</div>
      <div style="font-size:${k.big?'10px':'8px'};color:${k.big?k.color:'var(--t3)'};margin-top:5px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">${k.label}</div>
    </div>`;
  });
  html += '</div>';

  // ===== RETURN ALL NO_ANSWER =====
  if (summary.globalNA > 0) {
    html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding:12px 18px;background:linear-gradient(135deg,rgba(248,113,113,0.08),rgba(239,68,68,0.04));border:2px solid rgba(248,113,113,0.3);border-radius:12px">
      <div style="font-size:24px">📵</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:900;color:#f87171">${summary.globalNA} недозвонов</div><div style="font-size:10px;color:var(--t3)">Вернуть все в прозвон</div></div>
      <button onclick="innReturnAllNoAnswer()" style="padding:8px 20px;border-radius:10px;font-size:12px;font-weight:900;cursor:pointer;border:2px solid rgba(248,113,113,0.5);background:rgba(248,113,113,0.12);color:#f87171;font-family:var(--font)">🔄 ВЕРНУТЬ ВСЕ Н/Д</button>
    </div>`;
  }

  // ===== TOP 5 by passed =====
  const allBases = days.reduce((arr, d) => arr.concat(d.bases), []);
  const top5 = [...allBases].sort((a, b) => (b.stats.passed||0) - (a.stats.passed||0)).slice(0, 5);
  if (top5.length > 0 && top5[0].stats.passed > 0) {
    html += `<div style="margin-bottom:18px;padding:14px 18px;background:linear-gradient(135deg,rgba(251,191,36,0.05),rgba(74,222,128,0.03));border:1px solid rgba(251,191,36,0.15);border-radius:12px">
      <div style="font-size:14px;font-weight:900;color:#fbbf24;margin-bottom:10px">🏆 ТОП-5 по передачам</div>`;
    top5.forEach((b, i) => {
      const m = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
      const na = b.stats.no_answer||0;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;${i%2?'background:rgba(255,255,255,0.015)':''}">
        <span style="font-size:16px">${m}</span>
        <div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</div>
        <div style="font-size:9px;color:var(--t3)">✅${b.stats.passed} · ⬇${b.stats.new||0} · 📵${na}</div></div>
        ${na > 0 ? `<button onclick="innReturnLeads(${b.id},'no_answer',${na})" style="padding:3px 8px;border-radius:6px;font-size:9px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)">🔄${na}</button>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  // ===== DAYS ACCORDION =====
  // Separate active vs archived
  const activeDays = days.filter(d => d.progress < 95 || d.totalNew > 0);
  const archivedDays = days.filter(d => d.progress >= 95 && d.totalNew === 0);

  html += '<div style="font-size:14px;font-weight:900;color:var(--t1);margin-bottom:10px">📅 Базы по дням загрузки</div>';
  
  activeDays.forEach(day => { html += _renderDayRow(day); });

  // ===== ARCHIVE =====
  if (archivedDays.length > 0) {
    html += `<div style="margin-top:24px;font-size:14px;font-weight:900;color:var(--t3);margin-bottom:10px;display:flex;align-items:center;gap:8px">
      📦 АРХИВ <span style="font-size:11px;color:var(--t3);font-weight:600">(${archivedDays.length} дней прозвонены)</span>
    </div>`;
    archivedDays.forEach(day => { html += _renderDayRow(day, true); });
  }

  container.innerHTML = html;
}

function _renderDayRow(day, archived) {
  const isExpanded = _innExpandedDays[day.date];
  const dayLabel = new Date(day.date + 'T12:00').toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const progressColor = day.progress >= 90 ? '#f87171' : day.progress >= 60 ? '#fbbf24' : '#4ade80';
  const enableColor = day.allEnabled ? '#4ade80' : day.someEnabled ? '#fbbf24' : '#f87171';
  const enableLabel = day.allEnabled ? 'ВКЛ' : day.someEnabled ? 'ЧАСТИЧНО' : 'ВЫКЛ';

  let html = `<div style="margin-bottom:6px;border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;${archived ? 'opacity:0.7' : ''}">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.02);cursor:pointer" onclick="innToggleExpand('${day.date}')">
      <span style="font-size:14px;transform:rotate(${isExpanded ? '90' : '0'}deg);transition:transform .2s">▶</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:800;color:var(--t1)">📅 ${dayLabel}</span>
          <span style="font-size:10px;padding:2px 8px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.2);border-radius:6px;color:#a78bfa;font-weight:700">${day.baseCount} баз</span>
          <span style="font-size:10px;padding:2px 8px;background:${enableColor}15;border:1px solid ${enableColor}40;border-radius:6px;color:${enableColor};font-weight:700">${enableLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:4px;font-size:10px;color:var(--t3)">
          <span>📋<b style="color:#a78bfa">${day.totalLeads}</b></span>
          <span>⬇<b style="color:#4ade80">${day.totalNew}</b></span>
          <span>📵<b style="color:#f87171">${day.totalNA}</b></span>
          <span>✅<b style="color:#fbbf24">${day.totalPassed}</b></span>
          <span>📞<b style="color:#fbbf24">${day.totalCB}</b></span>
          <div style="flex:1;max-width:100px;height:4px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${day.progress}%;background:${progressColor};border-radius:2px"></div>
          </div>
          <span style="font-weight:800;color:${progressColor}">${day.progress}%</span>
        </div>
      </div>
      <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
        ${day.totalNA > 0 ? `<button onclick="innReturnDayNA('${day.date}',${day.totalNA})" style="padding:4px 8px;border-radius:6px;font-size:9px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)" title="Вернуть ${day.totalNA} н/д">🔄${day.totalNA}</button>` : ''}
        <button onclick="innToggleDay('${day.date}',${day.allEnabled ? 0 : 1})" style="padding:4px 8px;border-radius:6px;font-size:9px;font-weight:800;cursor:pointer;border:1px solid ${day.allEnabled ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'};background:${day.allEnabled ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.08)'};color:${day.allEnabled ? '#f87171' : '#4ade80'};font-family:var(--font)">${day.allEnabled ? '⛔ВЫКЛ' : '✅ВКЛ'}</button>
      </div>
    </div>`;

  // Expanded sub-bases
  if (isExpanded) {
    html += '<div style="border-top:1px solid rgba(255,255,255,0.04);padding:8px">';
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:rgba(255,255,255,0.03)">
      <th style="padding:6px 10px;text-align:left;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Подбаза</th>
      <th style="padding:6px 6px;text-align:center;color:#a78bfa;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Лидов</th>
      <th style="padding:6px 6px;text-align:center;color:#4ade80;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Ост</th>
      <th style="padding:6px 6px;text-align:center;color:#f87171;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Н/Д</th>
      <th style="padding:6px 6px;text-align:center;color:#fbbf24;font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Перед</th>
      <th style="padding:6px 6px;text-align:center;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">%</th>
      <th style="padding:6px 8px;text-align:center;color:var(--t3);font-size:9px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.04)">Действия</th>
    </tr></thead><tbody>`;
    day.bases.forEach((b, i) => {
      const na = b.stats.no_answer||0;
      const pColor = b.progress >= 90 ? '#f87171' : b.progress >= 60 ? '#fbbf24' : '#4ade80';
      html += `<tr style="${i%2?'background:rgba(255,255,255,0.015)':''}">
        <td style="padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.02)">
          <div style="font-weight:700;color:var(--t1);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:250px" title="${esc(b.name)}">${esc(b.name)}</div>
        </td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:#a78bfa">${b.total}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:${(b.stats.new||0)>0?'#4ade80':'#f87171'}">${b.stats.new||0}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:#f87171">${na||'—'}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:#fbbf24">${b.stats.passed||0}</td>
        <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center;font-weight:800;color:${pColor}">${b.progress}%</td>
        <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:center">
          <div style="display:flex;gap:2px;justify-content:center">
            ${na > 0 ? `<button onclick="innReturnLeads(${b.id},'no_answer',${na})" style="padding:2px 6px;border-radius:4px;font-size:8px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)">🔄</button>` : ''}
            <button onclick="innToggleBase(${b.id})" style="padding:2px 6px;border-radius:4px;font-size:9px;cursor:pointer;border:1px solid ${b.enabled?'rgba(248,113,113,0.2)':'rgba(74,222,128,0.2)'};background:${b.enabled?'rgba(248,113,113,0.05)':'rgba(74,222,128,0.05)'};color:${b.enabled?'#f87171':'#4ade80'};font-family:var(--font)">${b.enabled?'⛔':'✅'}</button>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  html += '</div>';
  return html;
}

function innToggleExpand(date) {
  _innExpandedDays[date] = !_innExpandedDays[date];
  if (_innGroupedData) renderInnGrouped(_innGroupedData);
}

async function innToggleDay(date, enabled) {
  try {
    const res = await fetch('/api/admin/inn-day/toggle', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date, enabled })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`${enabled ? '✅ Включено' : '⛔ Выключено'} ${data.toggled} баз`, 'success');
      loadInnGrouped();
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function innReturnDayNA(date, count) {
  if (!confirm(`🔄 Вернуть ${count} недозвонов за ${date} в прозвон?`)) return;
  try {
    const res = await fetch('/api/admin/inn-day/return-no-answer', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔄 Возвращено ${data.reset} лидов`, 'success');
      loadInnGrouped();
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function innToggleFreshFirst() {
  const current = _innGroupedData ? _innGroupedData.freshFirst : false;
  try {
    await fetch('/api/admin/inn-fresh-priority', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ enabled: !current })
    });
    showToast(!current ? '🔥 Приоритет свежих ВКЛЮЧЕН' : '🔥 Приоритет свежих ВЫКЛЮЧЕН', 'success');
    loadInnGrouped();
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}


// ============ ACTIVITY FEED ============
let _activityTimer = null;

async function loadActivityFeed() {
  const container = document.getElementById('activityFeedContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)"><div style="font-size:48px;margin-bottom:16px;animation:spin 1.5s linear infinite">⏳</div><div style="font-size:16px;font-weight:700">Загрузка событий...</div></div>';
  try {
    const res = await fetch('/api/admin/activity-feed');
    if (!res.ok) throw new Error('Ошибка');
    const data = await res.json();
    renderActivityFeed(data);
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:#f87171">❌ ${e.message}</div>`;
  }
  // Auto-refresh
  if (_activityTimer) clearInterval(_activityTimer);
  _activityTimer = setInterval(async () => {
    try {
      const r = await fetch('/api/admin/activity-feed');
      if (r.ok) { const d = await r.json(); renderActivityFeed(d); }
    } catch(e) {}
  }, 10000);
}

function renderActivityFeed(data) {
  const container = document.getElementById('activityFeedContent');
  if (!container) return;
  const { events, completedBases } = data;
  let html = '';

  // Header
  html += `<div style="background:linear-gradient(135deg,rgba(34,211,238,0.08),rgba(6,182,212,0.05));border:1px solid rgba(34,211,238,0.15);border-radius:20px;padding:24px 28px;margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
      <div>
        <div style="font-size:28px;font-weight:900;color:#fff">📋 СОБЫТИЯ БАЗ И РАБОТНИКОВ</div>
        <div style="font-size:12px;color:var(--t3);margin-top:6px">Обновляется автоматически каждые 10 секунд</div>
      </div>
      <button onclick="loadActivityFeed()" style="padding:8px 20px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.1);color:#22d3ee;font-family:var(--font)">🔄 Обновить</button>
    </div>
  </div>`;

  // Completed bases
  if (completedBases.length > 0) {
    html += `<div style="margin-bottom:20px;padding:14px 18px;background:rgba(74,222,128,0.04);border:1px solid rgba(74,222,128,0.15);border-radius:12px">
      <div style="font-size:14px;font-weight:900;color:#4ade80;margin-bottom:10px">✅ Прозвоненные базы (${completedBases.length})</div>
      <div style="max-height:200px;overflow-y:auto">`;
    completedBases.slice(0, 30).forEach(b => {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:10px;border-bottom:1px solid rgba(255,255,255,0.03)">
        <span style="color:#4ade80;font-weight:800">✅</span>
        <span style="flex:1;color:var(--t1);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
        <span style="color:var(--t3)">${b.total} лид</span>
        <span style="color:#fbbf24;font-weight:700">${b.passed} перед</span>
        <span style="color:#f87171">${b.no_answer} н/д</span>
      </div>`;
    });
    html += '</div></div>';
  }

  // Events feed
  const actionIcons = {'передал':'✅','не_дозвон':'📵','перезвон':'📞','скип':'⏭','скип_приветствие':'⏭','срез_на_доках':'📄','другой_человек':'👤','говорил_1.5':'💬','звонили_по_инн':'🏢'};
  const actionColors = {'передал':'#4ade80','не_дозвон':'#f87171','перезвон':'#fbbf24','скип':'#a78bfa','скип_приветствие':'#a78bfa','срез_на_доках':'#60a5fa','другой_человек':'#fb923c','говорил_1.5':'#34d399','звонили_по_инн':'#ef4444'};

  html += `<div style="padding:14px 18px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
    <div style="font-size:14px;font-weight:900;color:#22d3ee;margin-bottom:12px">🔴 Лента событий (последние ${events.length})</div>
    <div style="max-height:500px;overflow-y:auto">`;
  events.forEach((ev, i) => {
    const time = new Date(ev.time).toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dateStr = new Date(ev.time).toLocaleDateString('ru', {day:'2-digit',month:'2-digit'});
    const icon = actionIcons[ev.action] || '📋';
    const color = actionColors[ev.action] || '#60a5fa';
    const typeTag = ev.type === 'svo' ? '<span style="font-size:8px;padding:1px 4px;background:rgba(96,165,250,0.15);border-radius:3px;color:#60a5fa;font-weight:700">СВО</span>' : '<span style="font-size:8px;padding:1px 4px;background:rgba(239,68,68,0.15);border-radius:3px;color:#ef4444;font-weight:700">ИНН</span>';
    html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.02);${i%2?'background:rgba(255,255,255,0.01)':''}">
      <span style="font-size:14px">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:var(--t1)"><b style="color:${color}">${esc(ev.user_name)}</b> → <span style="color:${color};font-weight:700">${esc(ev.action)}</span> ${typeTag}</div>
        <div style="font-size:9px;color:var(--t3);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.lead_name)} ${ev.base_name ? '· ' + esc(ev.base_name) : ''}</div>
      </div>
      <div style="font-size:9px;color:var(--t3);white-space:nowrap">${dateStr} ${time}</div>
    </div>`;
  });
  html += '</div></div>';

  container.innerHTML = html;
}


let _innBasesData = null;


async function loadInnBases() {
  const container = document.getElementById('innBasesContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t3)"><div style="font-size:48px;margin-bottom:16px;animation:spin 1.5s linear infinite">⏳</div><div style="font-size:16px;font-weight:700">Загрузка ИНН Баз...</div></div>';
  try {
    const res = await fetch('/api/admin/inn-bases');
    if (!res.ok) throw new Error('Failed to load');
    _innBasesData = await res.json();
    renderInnBases(_innBasesData);
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:#f87171"><div style="font-size:48px;margin-bottom:16px">❌</div><div style="font-size:16px;font-weight:700">Ошибка: ${e.message}</div></div>`;
  }
}

// ===== INN BASES — pagination & filter state =====
let _innPage = 1;
const _innPerPage = 20;
let _innSearch = '';
let _innFilter = 'all'; // all | on | off
let _innCompact = true; // compact view by default
let _innDateFrom = '';
let _innDateTo = '';

function renderInnBases(data) {
  const container = document.getElementById('innBasesContent');
  if (!container) return;
  const { bases, archived, workers, summary } = data;

  let html = '';

  // ===== HEADER with gradient =====
  html += `<div style="background:linear-gradient(135deg,rgba(239,68,68,0.08),rgba(251,146,60,0.05),rgba(139,92,246,0.03));border:1px solid rgba(239,68,68,0.15);border-radius:20px;padding:24px 28px;margin-bottom:24px;position:relative;overflow:hidden">
    <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:radial-gradient(circle,rgba(239,68,68,0.1),transparent 70%);border-radius:50%"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;position:relative;z-index:1">
      <div>
        <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:1px;display:flex;align-items:center;gap:12px">
          🏢 ИНН БАЗЫ
          <span style="font-size:14px;padding:5px 16px;background:linear-gradient(135deg,rgba(239,68,68,0.2),rgba(251,146,60,0.15));border:1px solid rgba(239,68,68,0.35);border-radius:20px;color:#fb923c;font-weight:800;letter-spacing:0.5px">${summary.totalBases} баз</span>
        </div>
        <div style="font-size:12px;color:var(--t3);margin-top:6px;letter-spacing:0.3px">Управление базами, аналитика прозвона, назначение работников</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="innToggleAll(1)" class="inn-action-btn inn-btn-enable">
          ✅ ВКЛЮЧИТЬ ВСЕ
        </button>
        <button onclick="innToggleAll(0)" class="inn-action-btn inn-btn-disable">
          ⛔ ВЫКЛЮЧИТЬ ВСЕ
        </button>
        <button onclick="loadInnBases()" class="inn-action-btn inn-btn-refresh">
          🔄 Обновить
        </button>
      </div>
    </div>
  </div>`;

  // ===== KPIs =====
  const kpis = [
    { val: summary.totalRemaining || 0, label: 'ОСТАЛОСЬ', color: '#4ade80', icon: '⬇', glow: 'rgba(74,222,128,0.25)', big: true },
    { val: summary.totalNoAnswer || 0, label: 'НЕДОЗВОНЫ', color: '#f87171', icon: '📵', glow: 'rgba(248,113,113,0.25)', big: true },
    { val: summary.totalBases, label: 'ВСЕГО БАЗ', color: '#60a5fa', icon: '📂', glow: 'rgba(96,165,250,0.15)' },
    { val: summary.enabledBases, label: 'ВКЛЮЧЕНО', color: '#4ade80', icon: '✅', glow: 'rgba(74,222,128,0.15)' },
    { val: summary.totalBases - summary.enabledBases, label: 'ВЫКЛЮЧЕНО', color: '#f87171', icon: '⛔', glow: 'rgba(248,113,113,0.15)' },
    { val: summary.totalLeads.toLocaleString(), label: 'ЛИДОВ', color: '#a78bfa', icon: '📋', glow: 'rgba(167,139,250,0.15)' },
    { val: summary.totalInnCalled, label: 'ЗВОНИЛИ ПО ИНН', color: '#ef4444', icon: '🏢', glow: 'rgba(239,68,68,0.15)' },
    { val: summary.totalPassed, label: 'ПЕРЕДАНО', color: '#fbbf24', icon: '✅', glow: 'rgba(251,191,36,0.15)' },
  ];
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px">`;
  kpis.forEach(k => {
    const isBig = k.big;
    html += `<div class="inn-kpi-card" style="--kpi-color:${k.color};--kpi-glow:${k.glow}${isBig ? ';border:2px solid ' + k.color + ';box-shadow:0 0 25px ' + k.glow : ''}">
      <div style="font-size:${isBig ? '28px' : '22px'};margin-bottom:8px;filter:drop-shadow(0 2px 8px ${k.glow})">${k.icon}</div>
      <div style="font-size:${isBig ? '36px' : '28px'};font-weight:900;color:${k.color};line-height:1">${k.val}</div>
      <div style="font-size:${isBig ? '11px' : '9px'};color:${isBig ? k.color : 'var(--t3)'};margin-top:6px;font-weight:${isBig ? '900' : '700'};text-transform:uppercase;letter-spacing:${isBig ? '1.5px' : '0.6px'}">${k.label}</div>
    </div>`;
  });
  html += '</div>';

  // ===== GLOBAL RETURN ALL NO_ANSWER BUTTON =====
  const globalNoAns = summary.totalNoAnswer || 0;
  if (globalNoAns > 0) {
    html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:14px 20px;background:linear-gradient(135deg,rgba(248,113,113,0.08),rgba(239,68,68,0.04));border:2px solid rgba(248,113,113,0.3);border-radius:14px">
      <div style="font-size:28px">📵</div>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:900;color:#f87171">${globalNoAns} недозвонов во всех базах</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Нажмите кнопку чтобы вернуть ВСЕ недозвоны обратно в прозвон</div>
      </div>
      <button onclick="innReturnAllNoAnswer()" style="padding:10px 24px;border-radius:10px;font-size:13px;font-weight:900;cursor:pointer;border:2px solid rgba(248,113,113,0.5);background:linear-gradient(135deg,rgba(248,113,113,0.15),rgba(239,68,68,0.1));color:#f87171;font-family:var(--font);transition:all .2s;white-space:nowrap" onmouseover="this.style.background='rgba(248,113,113,0.3)';this.style.boxShadow='0 4px 20px rgba(248,113,113,0.3)'" onmouseout="this.style.background='linear-gradient(135deg,rgba(248,113,113,0.15),rgba(239,68,68,0.1))';this.style.boxShadow=''">🔄 ВЕРНУТЬ ВСЕ Н/Д В ПРОЗВОН</button>
    </div>`;
  }

  // ===== TOP 5 BASES BY PASSED (most productive) =====
  const allBasesArr = [...bases, ...archived];
  const top5 = [...allBasesArr].sort((a, b) => (b.stats.passed || 0) - (a.stats.passed || 0)).slice(0, 5);
  if (top5.length > 0) {
    html += `<div style="margin-bottom:20px;padding:16px 20px;background:linear-gradient(135deg,rgba(251,191,36,0.06),rgba(74,222,128,0.03));border:1px solid rgba(251,191,36,0.2);border-radius:14px">
      <div style="font-size:16px;font-weight:900;color:#fbbf24;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        🏆 ТОП-5 баз по передачам
      </div>
      <div style="display:grid;gap:8px">`;
    top5.forEach((b, i) => {
      const medal = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
      const noAns = b.stats.no_answer || 0;
      const remaining = b.stats.new || 0;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05);border-radius:10px">
        <span style="font-size:20px">${medal}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.name)}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px">
            ✅ <span style="color:#fbbf24;font-weight:800">${b.stats.passed}</span> перед
            · ⬇ <span style="color:#4ade80;font-weight:800">${remaining}</span> ост
            · 📵 <span style="color:#f87171;font-weight:800">${noAns}</span> н/д
            · 📋 <span style="color:#a78bfa">${b.total}</span> всего
          </div>
        </div>
        ${noAns > 0 ? `<button onclick="innReturnLeads(${b.id},'no_answer',${noAns})" style="padding:5px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.4);background:rgba(248,113,113,0.1);color:#f87171;font-family:var(--font);transition:all .15s;white-space:nowrap" onmouseover="this.style.background='rgba(248,113,113,0.25)'" onmouseout="this.style.background='rgba(248,113,113,0.1)'">🔄 ${noAns} Н/Д</button>` : '<span style="font-size:10px;color:#4ade80;font-weight:700">✓ чисто</span>'}
      </div>`;
    });
    html += `</div></div>`;
  }

  // ===== SEARCH / FILTER / VIEW TOOLBAR =====
  const allBases = allBasesArr;
  const todayStr = new Date().toISOString().slice(0,10);
  html += `<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;padding:14px 18px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:14px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:200px">
        <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none">🔍</span>
        <input id="innSearchInput" type="text" placeholder="Поиск по названию базы..." value="${_innSearch}" oninput="_innSearch=this.value;_innPage=1;innRerender()" style="width:100%;padding:9px 14px 9px 36px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:var(--t1);font-size:13px;font-family:var(--font);outline:none;transition:border-color .2s" onfocus="this.style.borderColor='rgba(96,165,250,0.4)'" onblur="this.style.borderColor='rgba(255,255,255,0.08)'">
      </div>
      <div style="display:flex;gap:4px">
        <button onclick="_innFilter='all';_innPage=1;innRerender()" style="padding:7px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;border:1px solid ${_innFilter==='all'?'rgba(96,165,250,0.5)':'rgba(255,255,255,0.08)'};background:${_innFilter==='all'?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.03)'};color:${_innFilter==='all'?'#60a5fa':'var(--t3)'}">📂 Все</button>
        <button onclick="_innFilter='on';_innPage=1;innRerender()" style="padding:7px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;border:1px solid ${_innFilter==='on'?'rgba(74,222,128,0.5)':'rgba(255,255,255,0.08)'};background:${_innFilter==='on'?'rgba(74,222,128,0.12)':'rgba(255,255,255,0.03)'};color:${_innFilter==='on'?'#4ade80':'var(--t3)'}">✅ ВКЛ</button>
        <button onclick="_innFilter='off';_innPage=1;innRerender()" style="padding:7px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;border:1px solid ${_innFilter==='off'?'rgba(248,113,113,0.5)':'rgba(255,255,255,0.08)'};background:${_innFilter==='off'?'rgba(248,113,113,0.12)':'rgba(255,255,255,0.03)'};color:${_innFilter==='off'?'#f87171':'var(--t3)'}">⛔ ВЫКЛ</button>
      </div>
      <div style="display:flex;gap:4px;margin-left:auto">
        <button onclick="_innCompact=true;innRerender()" title="Компактный вид" style="padding:7px 12px;border-radius:8px;font-size:14px;cursor:pointer;border:1px solid ${_innCompact?'rgba(96,165,250,0.5)':'rgba(255,255,255,0.08)'};background:${_innCompact?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.03)'};transition:all .15s">📋</button>
        <button onclick="_innCompact=false;innRerender()" title="Подробный вид" style="padding:7px 12px;border-radius:8px;font-size:14px;cursor:pointer;border:1px solid ${!_innCompact?'rgba(96,165,250,0.5)':'rgba(255,255,255,0.08)'};background:${!_innCompact?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.03)'};transition:all .15s">📄</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04)">
      <span style="font-size:11px;font-weight:700;color:var(--t3)">📅 Дата загрузки:</span>
      <input type="date" id="innDateFrom" value="${_innDateFrom}" onchange="_innDateFrom=this.value;_innPage=1;innRerender()" style="padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:var(--t1);font-size:12px;font-family:var(--font);outline:none">
      <span style="font-size:11px;color:var(--t3)">—</span>
      <input type="date" id="innDateTo" value="${_innDateTo}" onchange="_innDateTo=this.value;_innPage=1;innRerender()" style="padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:var(--t1);font-size:12px;font-family:var(--font);outline:none">
      <button onclick="_innDateFrom=_innDateTo='${todayStr}';_innPage=1;innRerender()" style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);color:#fbbf24;transition:all .15s">Сегодня</button>
      <button onclick="var d=new Date();d.setDate(d.getDate()-1);_innDateFrom=_innDateTo=d.toISOString().slice(0,10);_innPage=1;innRerender()" style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);border:1px solid rgba(139,92,246,0.3);background:rgba(139,92,246,0.08);color:#a78bfa;transition:all .15s">Вчера</button>
      <button onclick="_innDateFrom='';_innDateTo='';_innPage=1;innRerender()" style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:var(--t3);transition:all .15s">✕ Сброс</button>
    </div>
  </div>`;

  // ===== FILTER + SEARCH LOGIC =====
  let filtered = allBases;
  if (_innFilter === 'on') filtered = filtered.filter(b => b.enabled);
  else if (_innFilter === 'off') filtered = filtered.filter(b => !b.enabled);
  if (_innSearch.trim()) {
    const q = _innSearch.trim().toLowerCase();
    filtered = filtered.filter(b => (b.name || '').toLowerCase().includes(q) || (b.department_name || '').toLowerCase().includes(q));
  }
  // Date range filter
  if (_innDateFrom) {
    filtered = filtered.filter(b => b.created_at && b.created_at.slice(0,10) >= _innDateFrom);
  }
  if (_innDateTo) {
    filtered = filtered.filter(b => b.created_at && b.created_at.slice(0,10) <= _innDateTo);
  }

  // ===== PAGINATION =====
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / _innPerPage));
  if (_innPage > totalPages) _innPage = totalPages;
  const startIdx = (_innPage - 1) * _innPerPage;
  const pageItems = filtered.slice(startIdx, startIdx + _innPerPage);

  // ===== RESULTS HEADER =====
  const hasDateFilter = _innDateFrom || _innDateTo;
  const hasAnyFilter = _innSearch || _innFilter !== 'all' || hasDateFilter;
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div style="font-size:14px;font-weight:700;color:var(--t2)">
      Показано <b style="color:var(--t1)">${pageItems.length}</b> из <b style="color:var(--t1)">${totalFiltered}</b> баз
      ${_innSearch ? '<span style="color:#60a5fa;font-size:12px;margin-left:8px">по запросу «' + esc(_innSearch) + '»</span>' : ''}
      ${hasDateFilter ? '<span style="color:#fbbf24;font-size:12px;margin-left:8px">📅 ' + (_innDateFrom || '...') + ' — ' + (_innDateTo || '...') + '</span>' : ''}
    </div>
    ${totalFiltered > 0 && hasAnyFilter ? `<button onclick="innEnableOnlyFiltered()" style="padding:8px 18px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);border:1px solid rgba(74,222,128,0.5);background:linear-gradient(135deg,rgba(74,222,128,0.15),rgba(52,211,153,0.08));color:#4ade80;transition:all .2s;white-space:nowrap" onmouseover="this.style.boxShadow='0 4px 15px rgba(74,222,128,0.2)'" onmouseout="this.style.boxShadow=''">⚡ Включить ТОЛЬКО эти ${totalFiltered} баз</button>` : ''}
  </div>`;

  // ===== RENDER BASES =====
  if (pageItems.length === 0) {
    html += `<div style="text-align:center;padding:48px;color:var(--t3);background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:18px;margin-bottom:32px">
      <div style="font-size:48px;margin-bottom:12px;filter:grayscale(0.5)">📭</div>
      <div style="font-size:15px;font-weight:700">Ничего не найдено</div>
      <div style="font-size:12px;color:var(--t3);margin-top:6px">Попробуйте изменить фильтр или поиск</div>
    </div>`;
  } else if (_innCompact) {
    // ----- COMPACT TABLE VIEW -----
    html += `<div style="border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow-x:auto;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:800px">
        <thead>
          <tr style="background:rgba(255,255,255,0.04)">
            <th style="padding:10px 12px;text-align:center;color:var(--t3);font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06);width:40px"></th>
            <th style="padding:10px 12px;text-align:left;color:var(--t3);font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)">Название</th>
            <th style="padding:10px 8px;text-align:center;color:var(--t3);font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)">Лидов</th>
            <th style="padding:10px 8px;text-align:center;color:#4ade80;font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)" title="Осталось новых">⬇ Ост.</th>
            <th style="padding:10px 8px;text-align:center;color:#60a5fa;font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)" title="Прозвонено всего">📞 Прозв</th>
            <th style="padding:10px 8px;text-align:center;color:var(--t3);font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)">Перед</th>
            <th style="padding:10px 6px;text-align:center;color:#f87171;font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)" title="Недозвон">Н/Д</th>
            <th style="padding:10px 6px;text-align:center;color:#fbbf24;font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)" title="Перезвон">Пзв</th>
            <th style="padding:10px 6px;text-align:center;color:#a78bfa;font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)" title="Пропуск">Скип</th>
            <th style="padding:10px 8px;text-align:center;color:var(--t3);font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)">Прогресс</th>
            <th style="padding:10px 12px;text-align:center;color:var(--t3);font-weight:700;font-size:10px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.06)">Действия</th>
          </tr>
        </thead>
        <tbody>`;
    pageItems.forEach((b, idx) => {
      html += renderInnBaseCardCompact(b, workers, idx);
    });
    html += `</tbody></table></div>`;
  } else {
    // ----- FULL CARD VIEW -----
    html += '<div style="display:grid;gap:14px;margin-bottom:24px">';
    pageItems.forEach(b => { html += renderInnBaseCard(b, workers); });
    html += '</div>';
  }

  // ===== WORKER ASSIGNMENT FLOATING MODAL =====
  html += `<div id="innWorkerModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);justify-content:center;align-items:center" onclick="this.style.display='none'">
    <div style="background:rgba(15,18,30,0.98);border:1px solid rgba(96,165,250,0.25);border-radius:18px;padding:24px;min-width:300px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.6)" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:16px;font-weight:800;color:#60a5fa">👥 Назначить работников</div>
        <button onclick="document.getElementById('innWorkerModal').style.display='none'" style="padding:4px 10px;border-radius:6px;font-size:14px;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.08);color:#f87171;font-family:var(--font)">✕</button>
      </div>
      <div id="innWorkerModalName" style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06)"></div>
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Выберите работников. Если никто не выбран — база доступна всем.</div>
      <div id="innWorkerModalList" style="max-height:250px;overflow-y:auto;margin-bottom:14px"></div>
      <div style="display:flex;gap:8px">
        <button id="innWorkerModalSaveBtn" style="flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;border:1px solid rgba(74,222,128,0.4);background:linear-gradient(135deg,rgba(74,222,128,0.15),rgba(52,211,153,0.08));color:#4ade80;font-family:var(--font);transition:all .15s">💾 Сохранить</button>
        <button id="innWorkerModalClearBtn" style="flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;border:1px solid rgba(248,113,113,0.3);background:rgba(248,113,113,0.06);color:#f87171;font-family:var(--font);transition:all .15s">✕ Сбросить (все)</button>
      </div>
    </div>
  </div>`;

  // ===== PAGINATION CONTROLS =====
  if (totalPages > 1) {
    html += `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:32px;flex-wrap:wrap">`;
    html += `<button onclick="_innPage=1;innRerender()" ${_innPage<=1?'disabled':''} style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:${_innPage<=1?'default':'pointer'};border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:${_innPage<=1?'var(--t3)':'var(--t1)'};font-family:var(--font);opacity:${_innPage<=1?'0.4':'1'};transition:all .15s">⏮</button>`;
    html += `<button onclick="_innPage=Math.max(1,_innPage-1);innRerender()" ${_innPage<=1?'disabled':''} style="padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:${_innPage<=1?'default':'pointer'};border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:${_innPage<=1?'var(--t3)':'var(--t1)'};font-family:var(--font);opacity:${_innPage<=1?'0.4':'1'};transition:all .15s">◀ Назад</button>`;

    const startP = Math.max(1, _innPage - 3);
    const endP = Math.min(totalPages, _innPage + 3);
    if (startP > 1) html += `<span style="color:var(--t3);font-size:12px;padding:0 4px">...</span>`;
    for (let p = startP; p <= endP; p++) {
      const isCur = p === _innPage;
      html += `<button onclick="_innPage=${p};innRerender()" style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:${isCur?'900':'600'};cursor:pointer;border:1px solid ${isCur?'rgba(96,165,250,0.5)':'rgba(255,255,255,0.06)'};background:${isCur?'rgba(96,165,250,0.2)':'rgba(255,255,255,0.02)'};color:${isCur?'#60a5fa':'var(--t2)'};font-family:var(--font);min-width:36px;transition:all .15s">${p}</button>`;
    }
    if (endP < totalPages) html += `<span style="color:var(--t3);font-size:12px;padding:0 4px">...</span>`;

    html += `<button onclick="_innPage=Math.min(${totalPages},_innPage+1);innRerender()" ${_innPage>=totalPages?'disabled':''} style="padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:${_innPage>=totalPages?'default':'pointer'};border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:${_innPage>=totalPages?'var(--t3)':'var(--t1)'};font-family:var(--font);opacity:${_innPage>=totalPages?'0.4':'1'};transition:all .15s">Вперёд ▶</button>`;
    html += `<button onclick="_innPage=${totalPages};innRerender()" ${_innPage>=totalPages?'disabled':''} style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:${_innPage>=totalPages?'default':'pointer'};border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:${_innPage>=totalPages?'var(--t3)':'var(--t1)'};font-family:var(--font);opacity:${_innPage>=totalPages?'0.4':'1'};transition:all .15s">⏭</button>`;

    html += `<span style="color:var(--t3);font-size:11px;margin-left:10px;font-weight:600">Стр. ${_innPage} / ${totalPages}</span>`;
    html += `</div>`;
  }

  container.innerHTML = html;

  // Re-focus search input and restore cursor position
  const si = document.getElementById('innSearchInput');
  if (si && _innSearch) {
    si.focus();
    si.setSelectionRange(si.value.length, si.value.length);
  }
}

// Re-render helper that preserves search state
function innRerender() {
  if (_innBasesData) renderInnBases(_innBasesData);
}

// Enable ONLY the currently filtered bases (disable all others)
async function innEnableOnlyFiltered() {
  if (!_innBasesData) return;
  const { bases, archived } = _innBasesData;
  let allBases = [...bases, ...archived];

  // Apply same filters as renderInnBases
  if (_innFilter === 'on') allBases = allBases.filter(b => b.enabled);
  else if (_innFilter === 'off') allBases = allBases.filter(b => !b.enabled);
  if (_innSearch.trim()) {
    const q = _innSearch.trim().toLowerCase();
    allBases = allBases.filter(b => (b.name || '').toLowerCase().includes(q) || (b.department_name || '').toLowerCase().includes(q));
  }
  if (_innDateFrom) {
    allBases = allBases.filter(b => b.created_at && b.created_at.slice(0,10) >= _innDateFrom);
  }
  if (_innDateTo) {
    allBases = allBases.filter(b => b.created_at && b.created_at.slice(0,10) <= _innDateTo);
  }

  const ids = allBases.map(b => b.id);
  if (ids.length === 0) { showToast('❌ Нет баз для включения', 'error'); return; }

  const dateInfo = (_innDateFrom || _innDateTo) ? ` (${_innDateFrom || '...'} — ${_innDateTo || '...'})` : '';
  if (!confirm(`⚡ Включить ТОЛЬКО ${ids.length} баз${dateInfo}?\n\nВсе остальные базы будут ВЫКЛЮЧЕНЫ.\nЭто немедленно повлияет на выдачу лидов работникам.`)) return;

  try {
    const res = await fetch('/api/admin/inn-bases/enable-only', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ base_ids: ids })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`⚡ Включено ${data.enabled} баз, выключено ${data.disabled}`, 'success');
      _innFilter = 'all'; // reset filter to show all
      loadInnBases();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ===== OPEN WORKER MODAL for a specific base =====
function innOpenWorkerModal(baseId) {
  if (!_innBasesData) return;
  const allBases = [...(_innBasesData.bases || []), ...(_innBasesData.archived || [])];
  const b = allBases.find(x => x.id === baseId);
  if (!b) return;
  const workers = _innBasesData.workers || [];
  const deptWorkers = workers.filter(w => w.department_id === b.department_id);

  const modal = document.getElementById('innWorkerModal');
  const nameEl = document.getElementById('innWorkerModalName');
  const listEl = document.getElementById('innWorkerModalList');
  const saveBtn = document.getElementById('innWorkerModalSaveBtn');
  const clearBtn = document.getElementById('innWorkerModalClearBtn');
  if (!modal || !nameEl || !listEl) return;

  nameEl.textContent = b.name;

  let listHtml = '';
  if (deptWorkers.length === 0) {
    listHtml = '<div style="color:var(--t3);font-size:12px;padding:10px;text-align:center">Нет работников в отделе</div>';
  } else {
    deptWorkers.forEach(w => {
      const checked = b.assigned_workers.includes(w.id) ? 'checked' : '';
      listHtml += `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-radius:8px;transition:background .15s;font-size:13px;color:var(--t1);font-weight:600" onmouseover="this.style.background='rgba(96,165,250,0.06)'" onmouseout="this.style.background=''">
        <input type="checkbox" class="innModalWorkerCk" value="${w.id}" ${checked} style="accent-color:#60a5fa;width:16px;height:16px">
        ${esc(w.name)}
      </label>`;
    });
  }
  listEl.innerHTML = listHtml;

  saveBtn.onclick = function() { innSaveWorkersFromModal(baseId); };
  clearBtn.onclick = function() { innClearWorkers(baseId); modal.style.display = 'none'; };

  modal.style.display = 'flex';
}

async function innSaveWorkersFromModal(baseId) {
  const checks = document.querySelectorAll('#innWorkerModalList .innModalWorkerCk:checked');
  const ids = Array.from(checks).map(c => parseInt(c.value));
  try {
    const res = await fetch('/api/admin/inn-bases/' + baseId + '/assign-only', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ worker_ids: ids })
    });
    if (res.ok) {
      showToast('👥 Назначено ' + (ids.length || 'все') + ' работников', 'success');
      document.getElementById('innWorkerModal').style.display = 'none';
      loadInnBases();
    }
  } catch(e) { showToast('Ошибка', 'error'); }
}

// ===== COMPACT TABLE ROW for INN Base =====
function renderInnBaseCardCompact(b, workers, idx) {
  const isEnabled = b.enabled;
  const progressColor = b.progress >= 90 ? '#f87171' : b.progress >= 60 ? '#fbbf24' : '#4ade80';
  const innPct = b.inn_called_pct || 0;
  const rowBg = idx % 2 === 0 ? '' : 'rgba(255,255,255,0.015)';

  // Workers summary text
  const wText = b.worker_names.length > 0
    ? (b.worker_names.length <= 2 ? b.worker_names.join(', ') : b.worker_names.length + ' чел.')
    : 'все';
  const wColor = b.worker_names.length > 0 ? '#fb923c' : '#4ade80';

  // Stats
  const noAns = b.stats.no_answer || 0;
  const cb = b.stats.callback || 0;
  const skip = b.stats.skipped || 0;
  const remaining = b.stats.new || 0;
  const called = b.total - remaining; // всё что не 'new' = прозвонено

  return `<tr style="background:${rowBg};transition:background .12s" onmouseover="this.style.background='rgba(96,165,250,0.035)'" onmouseout="this.style.background='${rowBg}'">
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isEnabled?'#4ade80':'#f87171'};box-shadow:0 0 6px ${isEnabled?'rgba(74,222,128,0.4)':'rgba(248,113,113,0.4)'}"></span>
    </td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.03)">
      <div style="font-weight:700;color:var(--t1);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px" title="${esc(b.name)}">${esc(b.name)}</div>
      <div style="font-size:8px;color:var(--t3);margin-top:1px">${esc(b.department_name)}${innPct >= 10 ? ' · <span style="color:#ef4444;font-weight:800">⚠️ ИНН ' + innPct + '%</span>' : ''}</div>
    </td>
    <td style="padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:800;color:#a78bfa;font-size:12px">${b.total}</td>
    <td style="padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:800;color:${remaining > 0 ? '#4ade80' : '#f87171'};font-size:13px">${remaining}</td>
    <td style="padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:800;color:#60a5fa;font-size:13px">${called}</td>
    <td style="padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;font-weight:700;color:#fbbf24;font-size:11px">${b.stats.passed}</td>
    <td style="padding:7px 6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center">${noAns > 0 ? `<span style="font-size:12px;font-weight:800;color:#f87171">${noAns}</span>` : '<span style="color:var(--t3);font-size:10px">—</span>'}</td>
    <td style="padding:7px 6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center">${cb > 0 ? `<span style="font-size:11px;font-weight:700;color:#fbbf24">${cb}</span>` : '<span style="color:var(--t3);font-size:10px">—</span>'}</td>
    <td style="padding:7px 6px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center">${skip > 0 ? `<span style="font-size:11px;font-weight:700;color:#a78bfa">${skip}</span>` : '<span style="color:var(--t3);font-size:10px">—</span>'}</td>
    <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.03)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;height:5px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden;min-width:50px">
          <div style="height:100%;width:${b.progress}%;background:${progressColor};border-radius:3px"></div>
        </div>
        <span style="font-size:10px;font-weight:800;color:${progressColor};min-width:28px;text-align:right">${b.progress}%</span>
      </div>
    </td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center">
      <div style="display:flex;gap:3px;justify-content:center;align-items:center;flex-wrap:nowrap">
        ${noAns > 0 ? `<button onclick="innReturnLeads(${b.id},'no_answer',${noAns})" style="padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;border:1px solid rgba(248,113,113,0.4);background:rgba(248,113,113,0.1);color:#f87171;font-weight:800;font-family:var(--font);transition:all .15s" title="Вернуть ${noAns} недозвонов в прозвон" onmouseover="this.style.background='rgba(248,113,113,0.25)'" onmouseout="this.style.background='rgba(248,113,113,0.1)'">🔄 Н/Д</button>` : ''}
        <button onclick="innToggleBase(${b.id})" style="padding:3px 6px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid ${isEnabled?'rgba(248,113,113,0.25)':'rgba(74,222,128,0.25)'};background:${isEnabled?'rgba(248,113,113,0.06)':'rgba(74,222,128,0.06)'};color:${isEnabled?'#f87171':'#4ade80'};font-family:var(--font)" title="${isEnabled?'Выключить':'Включить'}">${isEnabled?'⛔':'✅'}</button>
        <button onclick="innOpenWorkerModal(${b.id})" style="padding:3px 6px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid rgba(96,165,250,0.25);background:rgba(96,165,250,0.06);color:#60a5fa;font-family:var(--font)" title="Работники: ${wText}">👥<span style="font-size:9px;color:${wColor};margin-left:2px">${b.worker_names.length || '∞'}</span></button>
        <button onclick="innExportBase(${b.id})" style="padding:3px 6px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid rgba(74,222,128,0.2);background:rgba(74,222,128,0.06);color:#4ade80;font-family:var(--font)" title="Выгрузка CSV">📥</button>
        <button onclick="innDeleteBase(${b.id},'${esc(b.name).replace(/'/g,"\\'")}',${b.total})" style="padding:3px 6px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.06);color:#ef4444;font-family:var(--font)" title="Удалить">🗑</button>
      </div>
    </td>
  </tr>`;
}

// Return leads of a specific status back to 'new' for an INN base
async function innReturnLeads(baseId, status, count) {
  const labels = { no_answer: 'недозвонов', callback: 'перезвонов', skipped: 'пропусков' };
  if (!confirm(`🔄 Вернуть ${count} ${labels[status] || status} обратно в "Новые"?\n\nОни снова попадут в прозвон.`)) return;
  try {
    const res = await fetch('/api/admin/dept-bases/' + baseId + '/return-leads', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔄 Возвращено ${data.reset} лидов в прозвон`, 'success');
      loadInnGrouped();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// Return ALL no_answer leads across ALL INN bases
async function innReturnAllNoAnswer() {
  if (!confirm('🔄 Вернуть ВСЕ недозвоны во ВСЕХ ИНН базах обратно в прозвон?\n\nВсе лиды со статусом "недозвон" станут "новыми".')) return;
  try {
    const res = await fetch('/api/admin/inn-bases/return-all-no-answer', {
      method: 'POST', headers: {'Content-Type':'application/json'}
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔄 Возвращено ${data.reset} недозвонов в прозвон!`, 'success');
      loadInnGrouped();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function renderInnBaseCard(b, workers) {
  const isEnabled = b.enabled;
  const progressColor = b.progress >= 90 ? '#f87171' : b.progress >= 60 ? '#fbbf24' : '#4ade80';
  const progressGlow = b.progress >= 90 ? 'rgba(248,113,113,0.3)' : b.progress >= 60 ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.2)';

  // INN Called danger indicator
  let innDanger = '';
  if (b.inn_called_pct >= 10) {
    innDanger = `<div style="padding:10px 16px;background:linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.08));border:2px solid rgba(239,68,68,0.4);border-radius:12px;margin-top:10px;animation:innAlertPulse 2s ease-in-out infinite">
      <div style="font-size:12px;font-weight:900;color:#ef4444;text-transform:uppercase;letter-spacing:1px;text-align:center">
        ⚠️ КРАСНАЯ ЗОНА — ${b.inn_called_pct}% ЗВОНИЛИ ПО ИНН ⚠️
      </div>
      <div style="font-size:10px;color:rgba(239,68,68,0.7);text-align:center;margin-top:4px">Работники видят: «ЗВОНИТЬ ПО ДРУГОМУ СПИЧУ»</div>
    </div>`;
  }

  // Assigned workers chips
  const assignedHtml = b.worker_names.length > 0
    ? b.worker_names.map(n => `<span style="padding:3px 10px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);border-radius:8px;font-size:10px;font-weight:700;color:#60a5fa">${esc(n)}</span>`).join(' ')
    : '<span style="font-size:10px;color:#4ade80;font-weight:600">👥 все работники</span>';

  // Filter workers by department
  const deptWorkers = workers.filter(w => w.department_id === b.department_id);

  // Worker dropdown options
  const workerCheckboxes = deptWorkers.map(w => {
    const checked = b.assigned_workers.includes(w.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;border-radius:8px;transition:background .15s" onmouseover="this.style.background='rgba(96,165,250,0.06)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${w.id}" ${checked} style="accent-color:#60a5fa;width:15px;height:15px" onchange="innWorkerCheckChanged(${b.id})">
      <span style="font-size:12px;color:var(--t1);font-weight:600">${esc(w.name)}</span>
    </label>`;
  }).join('');

  // Stats pills
  const statPills = [
    { v: b.stats.new, l: 'нов', icon: '🆕', c: '#4ade80', bg: 'rgba(74,222,128,0.06)', bc: 'rgba(74,222,128,0.15)' },
    { v: b.stats.no_answer, l: 'н/д', icon: '❌', c: '#f87171', bg: 'rgba(248,113,113,0.06)', bc: 'rgba(248,113,113,0.15)' },
    { v: b.stats.callback, l: 'п/з', icon: '📞', c: '#fbbf24', bg: 'rgba(251,191,36,0.06)', bc: 'rgba(251,191,36,0.15)' },
    { v: b.stats.passed, l: 'перед', icon: '✅', c: '#4ade80', bg: 'rgba(74,222,128,0.06)', bc: 'rgba(74,222,128,0.15)' },
    { v: b.stats.docs, l: 'срез', icon: '📄', c: '#c084fc', bg: 'rgba(192,132,252,0.06)', bc: 'rgba(192,132,252,0.15)' },
    { v: b.stats.inn_called, l: `ИНН (${b.inn_called_pct}%)`, icon: '🏢', c: '#ef4444', bg: 'rgba(239,68,68,0.08)', bc: 'rgba(239,68,68,0.25)' },
  ];

  return `<div class="inn-base-card" style="--card-accent:${isEnabled ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.08)'}">
    <div style="padding:20px 24px">
      <!-- Header row -->
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isEnabled ? '#4ade80' : '#f87171'};box-shadow:0 0 8px ${isEnabled ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)'}"></span>
            <span style="font-size:16px;font-weight:800;color:var(--t1);letter-spacing:0.3px">${esc(b.name)}</span>
            <span class="inn-status-badge" style="background:${isEnabled ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'};border-color:${isEnabled ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'};color:${isEnabled ? '#4ade80' : '#f87171'}">${isEnabled ? '✅ ВКЛ' : '⛔ ВЫКЛ'}</span>
          </div>
          <div style="font-size:11px;color:var(--t3);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>🏢 ${esc(b.department_name)}</span>
            <span style="color:rgba(255,255,255,0.15)">•</span>
            <span>📋 ${b.total} лидов</span>
            <span style="color:rgba(255,255,255,0.15)">•</span>
            <span>📅 ${b.created_at ? new Date(b.created_at).toLocaleDateString('ru-RU') : '—'}</span>
          </div>
        </div>
        <!-- Action buttons -->
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button onclick="innToggleBase(${b.id})" class="inn-card-btn" style="background:${isEnabled ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.08)'};border-color:${isEnabled ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'};color:${isEnabled ? '#f87171' : '#4ade80'}">
            ${isEnabled ? '⛔ Выключить' : '✅ Включить'}
          </button>
          <button onclick="document.getElementById('innWorkerPanel_${b.id}').classList.toggle('hidden')" class="inn-card-btn" style="background:rgba(96,165,250,0.08);border-color:rgba(96,165,250,0.25);color:#60a5fa">
            👥 Работники
          </button>
          <button onclick="innExportBase(${b.id})" class="inn-card-btn" style="background:rgba(74,222,128,0.08);border-color:rgba(74,222,128,0.25);color:#4ade80" title="Выгрузить CSV">
            📥 Выгрузка
          </button>
          <button onclick="innDeleteBase(${b.id}, '${esc(b.name).replace(/'/g, "\\'")}', ${b.total})" class="inn-card-btn" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3);color:#ef4444" title="Удалить базу">
            🗑 Удалить
          </button>
          <button onclick="innExportAndDeleteBase(${b.id}, '${esc(b.name).replace(/'/g, "\\'")}', ${b.total})" class="inn-card-btn" style="background:linear-gradient(135deg,rgba(251,191,36,0.1),rgba(239,68,68,0.08));border-color:rgba(251,191,36,0.3);color:#fbbf24" title="Выгрузить CSV + Удалить">
            📥🗑 Выгрузить + Удалить
          </button>
        </div>
      </div>

      <!-- Stats pills -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${statPills.map(s => `<span style="padding:5px 12px;border-radius:10px;background:${s.bg};border:1px solid ${s.bc};font-size:11px;font-weight:700;color:${s.c};display:flex;align-items:center;gap:4px"><span>${s.icon}</span> ${s.v} <span style="font-size:9px;opacity:0.7">${s.l}</span></span>`).join('')}
      </div>

      <!-- Progress bar -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="flex:1;height:10px;background:rgba(255,255,255,0.04);border-radius:6px;overflow:hidden;position:relative">
          <div style="height:100%;width:${b.progress}%;background:linear-gradient(90deg,${progressColor},${progressColor}cc);border-radius:6px;transition:width .6s ease;box-shadow:0 0 12px ${progressGlow}"></div>
          <div style="position:absolute;top:0;left:0;height:100%;width:${b.progress}%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15));border-radius:6px"></div>
        </div>
        <span style="font-size:13px;font-weight:900;color:${progressColor};min-width:42px;text-align:right">${b.progress}%</span>
      </div>

      <!-- Pass Rating + Workers info -->
      <div style="display:flex;align-items:center;gap:14px;font-size:11px;color:var(--t3);flex-wrap:wrap">
        <span>⭐ Конверсия: <b style="color:${b.pass_rating >= 20 ? '#4ade80' : b.pass_rating >= 10 ? '#fbbf24' : '#f87171'};font-size:13px">${b.pass_rating}%</b></span>
        <span style="color:rgba(255,255,255,0.1)">|</span>
        <span>👥 ${assignedHtml}</span>
      </div>

      ${innDanger}

      <!-- Worker Assignment Panel (hidden) -->
      <div id="innWorkerPanel_${b.id}" class="hidden" style="margin-top:14px;padding:14px 16px;background:rgba(96,165,250,0.03);border:1px solid rgba(96,165,250,0.1);border-radius:14px">
        <div style="font-size:13px;font-weight:800;color:#60a5fa;margin-bottom:8px">👥 Назначить работников — «дать звонить только»</div>
        <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Выберите работников, которые будут поступать лиды из этой базы. Если никто не выбран — база доступна всем.</div>
        <div id="innWorkerList_${b.id}" style="display:grid;gap:2px;max-height:200px;overflow-y:auto;padding-right:4px">
          ${workerCheckboxes || '<div style="color:var(--t3);font-size:11px;padding:8px">Нет работников в отделе</div>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="innSaveWorkers(${b.id})" class="inn-card-btn" style="background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.3);color:#4ade80">💾 Сохранить</button>
          <button onclick="innClearWorkers(${b.id})" class="inn-card-btn" style="background:rgba(248,113,113,0.06);border-color:rgba(248,113,113,0.2);color:#f87171">✕ Сбросить (все)</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ===== INN Base Export =====
function innExportBase(baseId) {
  window.open('/api/admin/inn-bases/' + baseId + '/export', '_blank');
  showToast('📥 Выгрузка CSV запущена', 'success');
}

// ===== INN Base Delete =====
async function innDeleteBase(baseId, baseName, totalLeads) {
  if (!confirm(`🗑 УДАЛИТЬ базу "${baseName}"?\n\nБудет удалено ${totalLeads} лидов.\nЭто действие необратимо!`)) return;
  if (!confirm(`⚠️ Вы уверены? Данные нельзя будет восстановить!\n\nБаза: ${baseName}\nЛидов: ${totalLeads}`)) return;
  try {
    const res = await fetch('/api/admin/inn-bases/' + baseId, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(`🗑 Удалена база "${data.base_name}" (${data.deleted_leads} лидов)`, 'success');
      loadInnGrouped();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ===== INN Base Export + Delete =====
async function innExportAndDeleteBase(baseId, baseName, totalLeads) {
  if (!confirm(`📥🗑 ВЫГРУЗИТЬ + УДАЛИТЬ базу "${baseName}"?\n\nСначала скачается CSV, затем база удалится.\nЛидов: ${totalLeads}`)) return;
  if (!confirm(`⚠️ ФИНАЛЬНОЕ ПОДТВЕРЖДЕНИЕ!\n\nПосле скачивания CSV база "${baseName}" будет полностью удалена.`)) return;
  try {
    const res = await fetch('/api/admin/inn-bases/' + baseId + '/export-delete', {
      method: 'POST', headers: {'Content-Type':'application/json'}
    });
    const data = await res.json();
    if (res.ok) {
      // Download CSV
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `INN_${baseName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`✅ Выгружена и удалена "${data.base_name}" (${data.deleted_leads} лидов)`, 'success');
      loadInnGrouped();
    } else {
      showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function innToggleAll(enabled) {
  const msg = enabled ? 'Включить ВСЕ ИНН базы?' : 'Выключить ВСЕ ИНН базы?';
  if (!confirm(msg)) return;
  try {
    const res = await fetch('/api/admin/inn-bases/toggle-all', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`${enabled ? '✅ Включено' : '⛔ Выключено'}: ${data.toggled} баз`, 'success');
      loadInnGrouped();
    }
  } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}

async function innToggleBase(baseId) {
  try {
    const res = await fetch('/api/admin/dept-bases/' + baseId + '/toggle', { method: 'POST' });
    if (res.ok) {
      showToast('Статус базы изменён', 'success');
      loadInnGrouped();
    }
  } catch(e) { showToast('Ошибка', 'error'); }
}

function innWorkerCheckChanged(baseId) {
  // Visual feedback — nothing to save until button pressed
}

async function innSaveWorkers(baseId) {
  const panel = document.getElementById('innWorkerList_' + baseId);
  if (!panel) return;
  const checks = panel.querySelectorAll('input[type=checkbox]:checked');
  const ids = Array.from(checks).map(c => parseInt(c.value));
  try {
    const res = await fetch('/api/admin/inn-bases/' + baseId + '/assign-only', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ worker_ids: ids })
    });
    if (res.ok) {
      showToast(`👥 Назначено ${ids.length || 'все'} работников`, 'success');
      loadInnBases();
    }
  } catch(e) { showToast('Ошибка', 'error'); }
}

async function innClearWorkers(baseId) {
  try {
    const res = await fetch('/api/admin/inn-bases/' + baseId + '/assign-only', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ worker_ids: [] })
    });
    if (res.ok) {
      showToast('👥 Все работники получают лиды из базы', 'success');
      loadInnBases();
    }
  } catch(e) { showToast('Ошибка', 'error'); }
}

// Auto-load avatar on page init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSavedAvatar);
} else {
  loadSavedAvatar();
}

// ===== AUTO-RELOAD ON SERVER RESTART =====
(function() {
  let knownVersion = null;
  let wasOffline = false;
  let checkInterval = 5000; // Check every 5 seconds

  async function checkServerVersion() {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();

      if (wasOffline) {
        // Server came back online — reload
        wasOffline = false;
        showReloadBanner('🔄 Сервер обновлён — перезагрузка...');
        setTimeout(() => location.reload(), 1500);
        return;
      }

      if (knownVersion === null) {
        knownVersion = data.version; // First check — just save
      } else if (data.version !== knownVersion) {
        // Version changed — server was restarted
        showReloadBanner('🔄 Обновление системы — перезагрузка...');
        setTimeout(() => location.reload(), 1500);
        return;
      }
    } catch(e) {
      // Server is down
      wasOffline = true;
    }
    setTimeout(checkServerVersion, checkInterval);
  }

  function showReloadBanner(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:14px;background:linear-gradient(135deg,#1e3a5f,#0f172a);color:#60a5fa;font-size:15px;font-weight:700;text-align:center;font-family:var(--font);border-bottom:2px solid #60a5fa;animation:pulse 1s infinite';
    el.textContent = msg;
    document.body.appendChild(el);
  }

  // Start checking after 3 seconds (let page load first)
  setTimeout(checkServerVersion, 3000);
})();

// ===== CHANGELOG "ЧТО НОВОГО" POPUP =====
(function initChangelog() {
  setTimeout(async function() {
    try {
      const res = await fetch('/changelog.json?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const cl = await res.json();
      if (!cl.version || !cl.entries || !cl.entries.length) return;

      const seenVersion = localStorage.getItem('crm-changelog-seen');
      if (seenVersion === cl.version) return; // Already seen

      // Show popup
      const entry = cl.entries[0]; // Show latest entry
      const overlay = document.createElement('div');
      overlay.id = 'changelogOverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;backdrop-filter:blur(8px);';

      const changesList = entry.changes.map(function(c) {
        return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px;color:rgba(255,255,255,0.85);line-height:1.5">' + c + '</div>';
      }).join('');

      overlay.innerHTML = '<div style="width:90%;max-width:440px;max-height:80vh;background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(96,165,250,0.3);border-radius:20px;box-shadow:0 0 60px rgba(96,165,250,0.15),0 25px 50px rgba(0,0,0,0.5);overflow:hidden;animation:slideUp 0.4s ease">' +
        '<div style="padding:20px 24px;background:linear-gradient(135deg,rgba(96,165,250,0.15),rgba(139,92,246,0.1));border-bottom:1px solid rgba(96,165,250,0.15)">' +
          '<div style="font-size:13px;color:rgba(96,165,250,0.7);margin-bottom:4px">📅 ' + entry.date + '</div>' +
          '<div style="font-size:20px;font-weight:800;color:#fff">' + entry.title + '</div>' +
        '</div>' +
        '<div style="padding:16px 24px;max-height:50vh;overflow-y:auto">' + changesList + '</div>' +
        '<div style="padding:16px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">' +
          '<button id="changelogCloseBtn" style="padding:12px 40px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(59,130,246,0.3);transition:all 0.3s">✨ Отлично!</button>' +
        '</div>' +
      '</div>';

      document.body.appendChild(overlay);

      // Add animations
      var style = document.createElement('style');
      style.textContent = '@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}';
      document.head.appendChild(style);

      // Close button
      document.getElementById('changelogCloseBtn').addEventListener('click', function() {
        localStorage.setItem('crm-changelog-seen', cl.version);
        overlay.style.animation = 'fadeIn 0.2s ease reverse';
        setTimeout(function() { overlay.remove(); style.remove(); }, 200);
      });

      // Also close on overlay click
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          localStorage.setItem('crm-changelog-seen', cl.version);
          overlay.style.animation = 'fadeIn 0.2s ease reverse';
          setTimeout(function() { overlay.remove(); style.remove(); }, 200);
        }
      });

    } catch(e) { /* changelog.json missing or error — silently ignore */ }
  }, 2000); // Wait 2 seconds after page load
})();

// ===== ADMIN MESSAGING — "Написать ХОЛОДКЕ" =====

// Admin: open messaging panel
async function openAdminMessaging() {
  const container = document.getElementById('adminContent') || document.getElementById('allBasesContent');
  if (!container) return;

  // Load workers list
  let workers = [];
  try {
    const r = await fetch('/api/admin/users');
    workers = await r.json();
    workers = workers.filter(u => u.role !== 'admin');
  } catch(e) {}

  // Load message history
  let history = [];
  try {
    const r = await fetch('/api/admin/messages');
    history = await r.json();
  } catch(e) {}

  const emojis = ['🔥','⚡','💰','🎯','📞','✅','❌','⭐','💪','🚀','👀','⏰','🎉','💎','🏆','❗','‼️','🛑','📢','💬'];

  container.innerHTML = `
    <div style="max-width:700px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:32px;margin-bottom:8px">📢</div>
        <h2 style="color:#fbbf24;font-size:22px;font-weight:900;margin:0">НАПИСАТЬ ХОЛОДКЕ</h2>
        <p style="color:var(--t3);font-size:12px;margin-top:4px">Отправь сообщение работникам — оно появится на экране</p>
      </div>

      <div style="background:var(--glass2);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:20px">
        <div style="margin-bottom:14px">
          <label style="font-size:11px;color:var(--t3);font-weight:700;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px">👤 Кому</label>
          <select id="msgTarget" style="width:100%;padding:10px 14px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;font-size:14px;font-family:var(--font)">
            <option value="">🌐 ВСЕМ РАБОТНИКАМ</option>
            ${workers.map(w => `<option value="${w.id}">👤 ${w.display_name}</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--t3);font-weight:700;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px">💬 Сообщение</label>
          <textarea id="msgText" rows="4" placeholder="Введи текст сообщения..." style="width:100%;padding:12px 14px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;font-size:15px;font-family:var(--font);resize:vertical;box-sizing:border-box"></textarea>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px">
          ${emojis.map(e => `<button onclick="document.getElementById('msgText').value+=this.textContent;document.getElementById('msgText').focus()" style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">${e}</button>`).join('')}
        </div>

        <button onclick="sendAdminMessage()" style="width:100%;padding:14px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:none;border-radius:12px;color:#000;font-size:16px;font-weight:900;cursor:pointer;font-family:var(--font);letter-spacing:0.5px">📢 ОТПРАВИТЬ</button>
      </div>

      <div style="margin-top:20px">
        <h3 style="font-size:14px;color:var(--t3);font-weight:700;margin-bottom:12px">📋 Последние сообщения</h3>
        ${history.length === 0 ? '<p style="color:var(--t3);font-size:13px;text-align:center;padding:20px">Пока нет сообщений</p>' :
          history.map(m => {
            const target = m.target_user_id ? workers.find(w => w.id === m.target_user_id) : null;
            const ago = _timeAgo(m.created_at);
            return `<div style="background:var(--glass2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
              <div style="flex:1;min-width:0">
                <div style="font-size:10px;color:var(--t3);margin-bottom:4px">${target ? '👤 → ' + target.display_name : '🌐 → ВСЕМ'} · ${ago}</div>
                <div style="font-size:14px;color:var(--t1);word-wrap:break-word">${m.text}</div>
              </div>
              <button onclick="deleteAdminMsg(${m.id})" style="flex-shrink:0;width:24px;height:24px;border-radius:6px;border:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06);color:#f87171;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">🗑️</button>
            </div>`;
          }).join('')}
      </div>
    </div>
  `;
}

function _timeAgo(dt) {
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return mins + ' мин назад';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' ч назад';
  return Math.floor(hrs / 24) + ' дн назад';
}

async function sendAdminMessage() {
  const text = document.getElementById('msgText').value.trim();
  const targetEl = document.getElementById('msgTarget');
  const target_user_id = targetEl.value ? parseInt(targetEl.value) : null;
  if (!text) { showToast('❌ Введите текст', 'error'); return; }

  try {
    const res = await fetch('/api/admin/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_user_id })
    });
    if (res.ok) {
      showToast('📢 Сообщение отправлено!', 'success');
      document.getElementById('msgText').value = '';
      openAdminMessaging(); // Refresh
    } else {
      showToast('❌ Ошибка отправки', 'error');
    }
  } catch(e) { showToast('❌ Ошибка', 'error'); }
}

async function deleteAdminMsg(id) {
  await fetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
  openAdminMessaging();
}

// ===== WORKER: Poll for messages & show popup =====
(function() {
  let lastCheckMsgs = 0;

  async function checkMessages() {
    try {
      const res = await fetch('/api/my-messages');
      if (!res.ok) return;
      const messages = await res.json();
      for (const msg of messages) {
        // Disabled fullscreen popup — just mark as read
        // showAdminMessagePopup(msg);
        // Mark as read
        fetch(`/api/messages/${msg.id}/read`, { method: 'POST' });
      }
    } catch(e) {}
    setTimeout(checkMessages, 8000); // Check every 8 seconds
  }

  function showAdminMessagePopup(msg) {
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease';
    overlay.onclick = () => overlay.remove();

    const card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);border:2px solid #fbbf24;border-radius:24px;padding:40px 36px;max-width:500px;width:90%;text-align:center;box-shadow:0 0 60px rgba(251,191,36,0.3),0 0 120px rgba(251,191,36,0.1);animation:popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)';

    card.innerHTML = `
      <div style="font-size:48px;margin-bottom:12px;animation:bounce 1s infinite">📢</div>
      <div style="font-size:12px;color:#fbbf24;font-weight:800;text-transform:uppercase;letter-spacing:3px;margin-bottom:8px">СООБЩЕНИЕ ОТ РУКОВОДСТВА</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:16px">${msg.sender_name || 'Админ'}</div>
      <div style="font-size:20px;color:#fff;font-weight:700;line-height:1.5;word-wrap:break-word;padding:16px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:14px;margin-bottom:20px">${msg.text.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:12px 40px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:none;border-radius:12px;color:#000;font-size:14px;font-weight:900;cursor:pointer;font-family:var(--font)">✅ ПОНЯЛ</button>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Add animations
    if (!document.getElementById('msgAnimStyles')) {
      const style = document.createElement('style');
      style.id = 'msgAnimStyles';
      style.textContent = '@keyframes popIn{0%{transform:scale(0.3);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes fadeIn{0%{opacity:0}100%{opacity:1}}@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}';
      document.head.appendChild(style);
    }
  }

  // Start checking after 5 seconds
  setTimeout(checkMessages, 5000);
})();

// ===== ADMIN PUSH NOTIFICATIONS — CORNER TOASTS =====
(function initAdminPush() {
  // Only run for admin users
  var _pushSince = '';
  var _pushContainer = null;
  var _pushHistory = [];

  function ensureContainer() {
    if (_pushContainer) return _pushContainer;
    _pushContainer = document.createElement('div');
    _pushContainer.id = 'adminPushContainer';
    _pushContainer.style.cssText = 'position:fixed;bottom:60px;right:12px;z-index:9990;display:flex;flex-direction:column-reverse;gap:6px;max-height:40vh;overflow:hidden;pointer-events:none;';
    document.body.appendChild(_pushContainer);
    return _pushContainer;
  }

  function showPushToast(ev) {
    var c = ensureContainer();
    var toast = document.createElement('div');
    var bgColor = ev.type === 'pass' ? 'rgba(34,197,94,0.12)' : ev.type === 'delete' ? 'rgba(239,68,68,0.12)' : 'rgba(96,165,250,0.12)';
    var borderColor = ev.type === 'pass' ? 'rgba(34,197,94,0.35)' : ev.type === 'delete' ? 'rgba(239,68,68,0.35)' : 'rgba(96,165,250,0.35)';
    var time = new Date(ev.time).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});
    toast.style.cssText = 'pointer-events:auto;padding:10px 14px;background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:12px;backdrop-filter:blur(12px);box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:pushSlideIn 0.3s ease;max-width:300px;cursor:pointer;transition:opacity 0.3s;';
    toast.innerHTML = '<div style="font-size:12px;font-weight:700;color:#fff;line-height:1.4">' + ev.text + '</div>' +
      (ev.details ? '<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">' + ev.details + '</div>' : '') +
      '<div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:3px">' + time + '</div>';
    toast.onclick = function() { toast.style.opacity='0'; setTimeout(function(){toast.remove()},300); };
    c.appendChild(toast);
    // Auto-remove after 8 seconds
    setTimeout(function() { if (toast.parentNode) { toast.style.opacity='0'; setTimeout(function(){toast.remove()},300); } }, 8000);
  }

  async function pollAdminEvents() {
    try {
      var url = '/api/admin/events' + (_pushSince ? '?since=' + encodeURIComponent(_pushSince) : '');
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return; // Not admin or server error
      var data = await res.json();
      if (data.events && data.events.length > 0) {
        // Only show toasts for truly new events (not initial load)
        if (_pushSince) {
          data.events.forEach(function(ev) { showPushToast(ev); });
        }
        _pushSince = data.events[data.events.length - 1].time;
        _pushHistory = _pushHistory.concat(data.events).slice(-100);
      }
    } catch(e) { /* ignore */ }
    setTimeout(pollAdminEvents, 5000);
  }

  // Inject push animation style
  var pushStyle = document.createElement('style');
  pushStyle.textContent = '@keyframes pushSlideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}';
  document.head.appendChild(pushStyle);

  // Start after 4 seconds
  setTimeout(pollAdminEvents, 4000);

  // Expose history viewer
  window.showAdminEventHistory = async function() {
    try {
      var res = await fetch('/api/admin/events/history');
      if (!res.ok) return;
      var data = await res.json();
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
      var list = data.events.map(function(ev) {
        var time = new Date(ev.time).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
        var icon = ev.type === 'pass' ? '✅' : ev.type === 'delete' ? '🗑️' : '📦';
        return '<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;gap:8px;align-items:center">' +
          '<span style="font-size:16px">' + icon + '</span>' +
          '<div style="flex:1"><div style="font-size:13px;color:#fff;font-weight:600">' + ev.text + '</div>' +
          (ev.details ? '<div style="font-size:11px;color:rgba(255,255,255,0.4)">' + ev.details + '</div>' : '') + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.3);white-space:nowrap">' + time + '</div></div>';
      }).join('');
      if (!list) list = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.3)">Пока нет событий</div>';
      overlay.innerHTML = '<div style="width:90%;max-width:500px;max-height:80vh;background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(96,165,250,0.2);border-radius:16px;overflow:hidden">' +
        '<div style="padding:16px 20px;background:rgba(96,165,250,0.08);border-bottom:1px solid rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:space-between">' +
        '<div style="font-size:16px;font-weight:800;color:#fff">📋 История событий</div>' +
        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button></div>' +
        '<div style="max-height:60vh;overflow-y:auto">' + list + '</div></div>';
      overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
    } catch(e) {}
  };
})();

