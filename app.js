// ===================================================================
// Two-Do · 둘이 함께 채우는 버킷리스트 💕
// ===================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CFG = window.TWODO_CONFIG || {};
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');

const ICONS = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐼', '🐥', '🐧', '🐨', '🐹', '🦄', '🌷'];
const HEART = { pink: '#F29BB0', blue: '#8DB8E8' };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_PHOTOS = 5;

let sb = null;
let deferredInstall = null;

const S = {
  me: null, couple: null, profiles: [], categories: [], items: [],
  likes: [], photos: [], reviews: [], flags: [],
  tab: 'home',
  list: { q: '', author: 'all', cat: 'all', status: 'all', sort: 'new' },
  cal: { y: new Date().getFullYear(), m: new Date().getMonth(), sel: null },
  urls: new Map(),
  channel: null, loading: false, reloadAgain: false, lastLoad: 0,
};

// ------------------------------------------------------------------
// 유틸
// ------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parts = (s) => s.split('-').map(Number);
const parseD = (s) => { const [y, m, d] = parts(s); return new Date(y, m - 1, d); };
const dayDiff = (from, to) => { const a = parts(from), b = parts(to); return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000); };
const fmt = (s) => { if (!s) return ''; const d = parseD(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`; };
const fmtY = (s) => { if (!s) return ''; const d = parseD(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const fmtDot = (s) => { if (!s) return ''; const [y, m, d] = parts(s); return `${y}.${pad(m)}.${pad(d)}`; };
const createdDay = (ts) => ymd(new Date(ts));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

function josa(word, withJong, without) {
  const ch = String(word || '').trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? withJong : without;
  return without;
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } },
};

function heartSvg(color, filled = true, size = 14) {
  return `<svg class="hs" viewBox="0 0 24 22" width="${size}" height="${size}" aria-hidden="true"><path d="M12 20.5s-7.6-4.7-10-9.4C.3 7.8 2 3.6 5.9 2.9 8.3 2.4 10.6 3.7 12 5.8c1.4-2.1 3.7-3.4 6.1-2.9 3.9.7 5.6 4.9 3.9 8.2-2.4 4.7-10 9.4-10 9.4z" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="${filled ? 0 : 2}" stroke-linejoin="round"/></svg>`;
}

let meterId = 0;
function heartMeter(pct, size = 92) {
  const id = `hm${++meterId}`;
  const h = 90 * (pct / 100);
  const path = 'M50 86 C22 66 4 48 4 29 C4 14 15 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C85 4 96 14 96 29 C96 48 78 66 50 86 Z';
  return `<svg class="heart-meter" viewBox="0 0 100 90" width="${size}" height="${size * 0.9}" aria-label="달성률 ${pct}%">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#F29BB0"/><stop offset="1" stop-color="#FFC9B5"/></linearGradient>
      <clipPath id="${id}c"><rect x="0" y="${90 - h}" width="100" height="${h}"/></clipPath>
    </defs>
    <path d="${path}" fill="#F5F2FC"/>
    <path d="${path}" fill="url(#${id}g)" clip-path="url(#${id}c)"/>
    <path d="${path}" fill="none" stroke="#fff" stroke-width="3"/>
  </svg>`;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || '');
  if (/rate limit|too many|429/i.test(m)) return '잠깐! 너무 자주 요청했어. 1분 뒤에 다시 해줘 ⏳';
  if (/Invalid login credentials/i.test(m)) return '이메일이나 비밀번호가 달라 🔐';
  if (/already registered|already been registered/i.test(m)) return '이미 가입된 이메일이야. 로그인해줘 😊';
  if (/Email not confirmed|confirmation/i.test(m)) return 'Supabase에서 "Confirm email"을 꺼줘 (README 3단계) 📮';
  if (/Password should be|weak/i.test(m)) return '비밀번호를 더 길게 만들어줘 🔐';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '인터넷 연결을 확인해줘 📶';
  return m || '문제가 생겼어 😢 잠시 후 다시 해줘';
}

async function db(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

function burst(x, y) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = [HEART.pink, HEART.blue, '#FFC3A8', '#C9B8F0'];
  for (let i = 0; i < 7; i++) {
    const s = document.createElement('span');
    const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.5;
    const d = 46 + Math.random() * 34;
    s.className = 'burst';
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 24}px`;
    s.innerHTML = heartSvg(colors[i % colors.length], true, 12 + Math.round(Math.random() * 6));
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ------------------------------------------------------------------
// 데이터 도우미
// ------------------------------------------------------------------
const prof = (id) => S.profiles.find((p) => p.id === id);
const partner = () => S.profiles.find((p) => p.id !== S.me.id);
const colorOf = (uid) => HEART[prof(uid)?.heart] || '#C9C3D1';
const catOf = (id) => S.categories.find((c) => c.id === id) || { name: '기타', emoji: '🎈' };
const itemOf = (id) => S.items.find((i) => i.id === id);
const likesOf = (id) => S.likes.filter((l) => l.item_id === id);
const photosOf = (id) => S.photos.filter((p) => p.item_id === id).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
const urlOf = (path) => S.urls.get(path)?.url || '';
const bothWant = (it) => likesOf(it.id).some((l) => l.user_id !== it.author_id);
const hasReview = (itemId, uid) => S.flags.some((f) => f.item_id === itemId && f.user_id === uid);
const reviewOf = (itemId, uid) => S.reviews.find((r) => r.item_id === itemId && r.user_id === uid);
const doneSorted = () => S.items.filter((i) => i.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '') || b.updated_at.localeCompare(a.updated_at));
const isRecapSeason = () => new Date().getMonth() === 11 || new URLSearchParams(location.search).has('recap');

function stats() {
  const total = S.items.length;
  const done = S.items.filter((i) => i.done).length;
  return { total, done, left: total - done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function ddayText(date) {
  const d = dayDiff(today(), date);
  if (d === 0) return 'D-DAY';
  return d > 0 ? `D-${d}` : `D+${-d}`;
}

// ------------------------------------------------------------------
// 시작
// ------------------------------------------------------------------
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY || /YOUR-/.test(CFG.SUPABASE_URL + CFG.SUPABASE_KEY)) {
    app.innerHTML = `<div class="auth"><div class="auth-hero"><img class="auth-logo" src="icon-192.png" alt=""><h1 class="brand-title">Two-Do</h1>
      <p>거의 다 왔어! 🛠️</p></div><div class="card"><p><b>config.js</b>에 Supabase 주소와 키를 넣어줘.<br><span class="muted small">README의 6단계를 보면 돼 💕</span></p></div></div>`;
    return;
  }

  sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') setTimeout(() => { resetState(); renderAuth(); }, 0);
  });

  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return renderAuth();
    await afterLogin();
  } catch (e) {
    console.error(e);
    renderAuth();
    toast(errMsg(e));
  }
}

function resetState() {
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  while (sheets.length) removeTopSheet();
  Object.assign(S, { me: null, couple: null, profiles: [], categories: [], items: [], likes: [], photos: [], reviews: [], flags: [], tab: 'home' });
  S.urls.clear();
}

async function afterLogin() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return renderAuth();
  const me = await db(sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
  if (!me) return renderSetup();
  S.me = me;
  await loadAll();
  subscribe();
  maybeShowInstallGuide();
}

// ------------------------------------------------------------------
// 로그인 (이메일 6자리 코드)
// ------------------------------------------------------------------
// 로그인: 이메일 + 비밀번호 (메일 발송 없음)
function renderAuth(mode = 'login', email = '') {
  const signup = mode === 'signup';
  app.innerHTML = `<div class="auth">
    <div class="auth-hero fade-in">
      <img class="auth-logo" src="icon-192.png" alt="">
      <h1 class="brand-title">Two-Do</h1>
      <p>둘이 함께 채우는 버킷리스트 💕</p>
    </div>
    <form id="f-auth" class="card form fade-in" novalidate>
      <div class="seg" style="align-self:center;margin-bottom:6px">
        <button type="button" class="${signup ? '' : 'on'}" data-mode="login">로그인</button>
        <button type="button" class="${signup ? 'on' : ''}" data-mode="signup">처음이야 (가입)</button>
      </div>
      <label class="lbl" for="em">이메일</label>
      <input id="em" class="input" type="email" name="email" autocomplete="${signup ? 'email' : 'username'}" inputmode="email" autocapitalize="off" required placeholder="you@example.com" value="${esc(email)}">
      <label class="lbl" for="pw">비밀번호 ${signup ? '<span class="muted">(6자 이상)</span>' : ''}</label>
      <input id="pw" class="input" type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required placeholder="••••••">
      ${signup ? `<label class="lbl" for="pw2">비밀번호 확인</label>
      <input id="pw2" class="input" type="password" name="password2" autocomplete="new-password" minlength="6" required placeholder="한 번 더">` : ''}
      <button class="btn primary block mt" type="submit">${signup ? '가입하기 💕' : '로그인'}</button>
      <p class="hint center">${signup ? '비밀번호는 꼭 기억해줘! 🔐' : '처음이면 위에서 <b>가입</b>을 눌러줘 😊'}</p>
    </form>
  </div>`;

  const f = document.getElementById('f-auth');
  f.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.mode, f.email.value.trim())));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = f.email.value.trim();
    const pw = f.password.value;
    if (!/^\S+@\S+\.\S+$/.test(em)) return toast('이메일을 다시 확인해줘 ✉️');
    if (pw.length < 6) return toast('비밀번호는 6자 이상이야 🔐');
    if (signup && pw !== f.password2.value) return toast('비밀번호가 서로 달라. 다시 확인해줘 🙏');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (signup) {
        const { data, error } = await sb.auth.signUp({ email: em, password: pw });
        if (error) throw error;
        if (!data.session) throw new Error('Supabase에서 "Confirm email"을 꺼줘 (README 3단계) 📮');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
      }
      await afterLogin();
    } catch (err) { toast(errMsg(err)); btn.disabled = false; }
  });
}

// ------------------------------------------------------------------
// 처음 설정: 닉네임·하트·아이콘 → 공간 만들기 / 연결하기
// ------------------------------------------------------------------
function renderSetup() {
  const st = { nickname: '', heart: 'pink', icon: ICONS[0] };
  app.innerHTML = `<div class="auth">
    <div class="auth-hero fade-in"><h1 class="brand-title">반가워! 👋</h1><p>나를 소개해줘</p></div>
    <div class="card form fade-in">
      <label class="lbl" for="nick">내 닉네임</label>
      <input id="nick" class="input" maxlength="12" placeholder="예: 하선, 오빠" autocomplete="nickname">
      <div class="lbl">내 하트 색</div>
      <div class="heart-pick">
        <button type="button" class="heart-opt pink on" data-h="pink">${heartSvg(HEART.pink, true, 20)} 분홍 하트</button>
        <button type="button" class="heart-opt blue" data-h="blue">${heartSvg(HEART.blue, true, 20)} 파란 하트</button>
      </div>
      <div class="lbl">프로필 아이콘</div>
      <div class="icon-pick">${ICONS.map((ic, i) => `<button type="button" class="icon-opt ${i === 0 ? 'on' : ''}" data-ic="${ic}">${ic}</button>`).join('')}</div>
      <div class="choice">
        <button class="btn primary block" id="create">✨ 새 공간 만들기</button>
        <button class="btn soft block" id="join-toggle">💌 초대 코드로 연결하기</button>
        <div id="join-box" hidden class="form">
          <input id="code" class="input code" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="ABC123">
          <button class="btn primary block" id="join">연결하기 💞</button>
        </div>
      </div>
      <button class="btn ghost block" id="out">다른 이메일로 로그인</button>
    </div>
  </div>`;

  app.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => {
    st.heart = b.dataset.h;
    app.querySelectorAll('[data-h]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  app.querySelectorAll('[data-ic]').forEach((b) => b.addEventListener('click', () => {
    st.icon = b.dataset.ic;
    app.querySelectorAll('[data-ic]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.getElementById('join-toggle').addEventListener('click', () => {
    const box = document.getElementById('join-box');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('code').focus();
  });
  document.getElementById('out').addEventListener('click', () => sb.auth.signOut());

  const run = async (btn, fn) => {
    st.nickname = document.getElementById('nick').value.trim();
    if (!st.nickname) { toast('닉네임을 적어줘 😊'); document.getElementById('nick').focus(); return; }
    btn.disabled = true;
    try { await fn(); await afterLogin(); } catch (err) { toast(errMsg(err)); btn.disabled = false; }
  };
  document.getElementById('create').addEventListener('click', (e) => run(e.currentTarget, () =>
    db(sb.rpc('create_couple', { p_nickname: st.nickname, p_heart: st.heart, p_icon: st.icon }))));
  document.getElementById('join').addEventListener('click', (e) => {
    const code = document.getElementById('code').value.trim().toUpperCase();
    if (code.length < 6) return toast('초대 코드 6자리를 입력해줘 🔑');
    run(e.currentTarget, () => db(sb.rpc('join_couple', { p_code: code, p_nickname: st.nickname, p_heart: st.heart, p_icon: st.icon })));
  });
}

// ------------------------------------------------------------------
// 데이터 불러오기 + 실시간 동기화
// ------------------------------------------------------------------
async function loadAll() {
  if (S.loading) { S.reloadAgain = true; return; }
  S.loading = true;
  try {
    const cid = S.me.couple_id;
    const [couple, profiles, categories, items, likes, photos, reviews, flags] = await Promise.all([
      db(sb.from('couples').select('*').eq('id', cid).single()),
      db(sb.from('profiles').select('*').eq('couple_id', cid)),
      db(sb.from('categories').select('*').eq('couple_id', cid).order('sort').order('created_at')),
      db(sb.from('items').select('*').eq('couple_id', cid).order('created_at', { ascending: false })),
      db(sb.from('likes').select('*').eq('couple_id', cid)),
      db(sb.from('photos').select('*').eq('couple_id', cid)),
      db(sb.from('reviews').select('*').eq('couple_id', cid)),
      db(sb.rpc('review_flags')),
    ]);
    Object.assign(S, { couple, profiles, categories, items, likes, photos, reviews, flags: flags || [] });
    S.me = profiles.find((p) => p.id === S.me.id) || S.me;
    S.lastLoad = Date.now();
    await ensureUrls();
    render();
    sheets.forEach((s) => s.refresh && s.refresh(s.body));
  } catch (e) {
    console.error(e);
    if (!document.querySelector('.shell')) app.innerHTML = `<div class="auth"><div class="card center"><p>불러오지 못했어 😢</p><p class="hint">${esc(errMsg(e))}</p><button class="btn primary block mt" onclick="location.reload()">다시 시도</button></div></div>`;
    else toast(errMsg(e));
  } finally {
    S.loading = false;
    if (S.reloadAgain) { S.reloadAgain = false; loadAll(); }
  }
}

async function ensureUrls() {
  const now = Date.now();
  const ttl = 6 * 3600;
  const need = S.photos.map((p) => p.path).filter((p) => { const u = S.urls.get(p); return !u || u.exp < now + 10 * 60000; });
  for (let i = 0; i < need.length; i += 100) {
    const { data, error } = await sb.storage.from('photos').createSignedUrls(need.slice(i, i + 100), ttl);
    if (error) { console.warn(error); continue; }
    data.forEach((d) => { if (d.signedUrl) S.urls.set(d.path, { url: d.signedUrl, exp: now + ttl * 1000 }); });
  }
}

let reloadTimer = null;
function queueReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadAll, 350); }

function subscribe() {
  if (S.channel) sb.removeChannel(S.channel);
  const cid = S.me.couple_id;
  const ch = sb.channel(`couple-${cid}`);
  ['items', 'likes', 'photos', 'categories', 'profiles', 'reviews'].forEach((t) => {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: t, filter: `couple_id=eq.${cid}` }, queueReload);
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t, filter: `couple_id=eq.${cid}` }, queueReload);
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, queueReload);
  });
  ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${cid}` }, queueReload);
  ch.subscribe();
  S.channel = ch;
}

// 앱으로 돌아왔을 때 최신 상태로 (아이폰은 백그라운드에서 연결이 끊길 수 있어)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me && Date.now() - S.lastLoad > 20000) loadAll();
});

// ------------------------------------------------------------------
// 시트 (아래에서 올라오는 창) — 안드로이드 뒤로가기로도 닫혀
// ------------------------------------------------------------------
const sheets = [];
let skipPop = 0;

function openSheet(html, { cls = '', onMount, refresh } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `sheet-wrap ${cls}`;
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grip"></div>
      ${cls.includes('full') ? '' : '<button class="sheet-x" data-close aria-label="닫기">✕</button>'}
      <div class="sheet-body">${html}</div>
    </div>`;
  sheetRoot.appendChild(wrap);
  const entry = { wrap, body: wrap.querySelector('.sheet-body'), refresh };
  sheets.push(entry);
  document.documentElement.classList.add('lock');
  history.pushState({ twodoSheet: sheets.length }, '');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  if (onMount) onMount(entry.body, entry);
  return entry;
}

function removeTopSheet() {
  const e = sheets.pop();
  if (!e) return;
  e.wrap.classList.remove('open');
  setTimeout(() => e.wrap.remove(), 300);
  if (!sheets.length) document.documentElement.classList.remove('lock');
}

function closeSheet() {
  if (!sheets.length) return;
  removeTopSheet();
  skipPop++;
  history.back();
}

// 위 시트를 닫지 않고 내용만 바꿔 끼우기 (완료 → 추억 기록)
function replaceSheet(html, { onMount, refresh } = {}) {
  const top = sheets[sheets.length - 1];
  if (!top) return openSheet(html, { onMount, refresh });
  top.refresh = refresh;
  top.body.innerHTML = html;
  top.wrap.querySelector('.sheet').scrollTop = 0;
  if (onMount) onMount(top.body, top);
  return top;
}

window.addEventListener('popstate', () => {
  if (skipPop > 0) { skipPop--; return; }
  if (sheets.length) removeTopSheet();
});

// ------------------------------------------------------------------
// 메인 화면
// ------------------------------------------------------------------
const NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  album: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2"/><rect x="7" y="6.5" width="10" height="9" rx="1"/></svg>',
};

function navHtml() {
  const b = (tab, label) => `<button class="nav-btn ${S.tab === tab ? 'on' : ''}" data-act="tab" data-tab="${tab}" aria-label="${label}">${NAV_ICONS[tab]}<span>${label}</span></button>`;
  return `<nav class="nav">${b('home', '홈')}${b('list', '리스트')}
    <div class="fab-wrap"><button class="fab" data-act="add" aria-label="버킷 추가">＋</button></div>
    ${b('cal', '달력')}${b('album', '앨범')}</nav>`;
}

function topBar(title) {
  return `<header class="top">${title}<button class="avatar" data-act="settings" aria-label="우리 공간">${esc(S.me.icon)}</button></header>`;
}

function render(keepScroll = true) {
  if (!S.me) return;
  const y = window.scrollY;
  const focusedSearch = document.activeElement && document.activeElement.id === 'q';
  const views = { home: homeHtml, list: listHtml, cal: calHtml, album: albumHtml };
  app.innerHTML = `<div class="shell">${views[S.tab]()}</div>${navHtml()}`;
  if (S.tab === 'list') bindList(focusedSearch);
  window.scrollTo(0, keepScroll ? y : 0);
}

// ---------- 공통 카드 ----------
function itemCard(it, { showDate = true } = {}) {
  const c = catOf(it.category_id);
  const a = prof(it.author_id);
  const isPartnerItem = it.author_id && it.author_id !== S.me.id;
  const liked = S.likes.some((l) => l.item_id === it.id && l.user_id === S.me.id);
  const meta = [`${c.emoji} ${esc(c.name)}`];
  if (showDate && it.target_date) meta.push(`📅 ${fmt(it.target_date)}${it.done ? '' : ` · ${ddayText(it.target_date)}`}`);
  if (it.done && it.done_at) meta.push(`✓ ${fmtDot(it.done_at)}`);
  return `<button class="item-card ${it.done ? 'done' : ''}" data-act="detail" data-id="${it.id}">
    <span class="ic-heart ${a?.heart === 'blue' ? 'blue' : ''}">${heartSvg(colorOf(it.author_id), true, 18)}</span>
    <span class="ic-body">
      <span class="ic-title" style="display:block">${esc(it.title)}${it.done ? '<span class="done-badge">완료</span>' : ''}${bothWant(it) ? '<span class="both-badge">💞</span>' : ''}</span>
      <span class="ic-meta" style="display:block">${meta.join(' · ')}</span>
    </span>
    ${isPartnerItem && !it.done ? `<span class="like-btn ${liked ? 'on' : ''}" role="button" data-act="like" data-id="${it.id}" aria-label="나도 하고 싶어">${liked ? '💕' : '🤍'}</span>` : ''}
  </button>`;
}

function emptyBox(emoji, text) {
  return `<div class="empty"><span class="em">${emoji}</span>${text}</div>`;
}

function polaroid(it, idx = 0, big = false) {
  const ph = photosOf(it.id);
  const first = ph[0] && urlOf(ph[0].path);
  const c = catOf(it.category_id);
  const rot = big ? 0 : [-2, 1.5, -1, 2.2][idx % 4];
  const p = partner();
  const rvCount = (hasReview(it.id, S.me.id) ? 1 : 0) + (p && hasReview(it.id, p.id) ? 1 : 0);
  return `<button class="polaroid ${big ? 'big' : ''}" style="--r:${rot}deg" data-act="memory" data-id="${it.id}">
    <div class="pol-img">${first ? `<img src="${esc(first)}" alt="" loading="lazy">` : `<div class="pol-ph">${c.emoji}</div>`}
      ${ph.length > 1 ? `<span class="pol-count">+${ph.length - 1}</span>` : ''}</div>
    <div class="pol-title">${esc(it.title)}</div>
    <div class="pol-date"><span>${fmtDot(it.done_at)}</span><span>${rvCount ? '💌'.repeat(rvCount) : ''}</span></div>
  </button>`;
}

function recapBanner() {
  if (!isRecapSeason()) return '';
  return `<section class="card recap-banner" data-act="recap">🎁 <div><b>${new Date().getFullYear()}년 우리의 결산</b>이 도착했어!</div><span>보러 가기 ›</span></section>`;
}

// ---------- 홈 ----------
function homeHtml() {
  const p = partner();
  const t = today();
  const st = stats();
  const names = p ? `${esc(S.me.nickname)} & ${esc(p.nickname)}` : esc(S.me.nickname);
  const upcoming = S.items.filter((i) => !i.done && i.target_date && i.target_date >= t).sort((a, b) => a.target_date.localeCompare(b.target_date));
  const next = upcoming[0];
  const met = S.couple?.met_date;
  const together = met ? dayDiff(met, t) + 1 : null;
  const lastMem = doneSorted()[0];
  const d = new Date();

  return `${topBar('<div class="brand">Two-<b>Do</b></div>')}
  <div class="hello fade-in"><h1>${names}의 Two-Do 💕</h1><p>${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일 · 오늘도 함께해서 좋아</p></div>

  <section class="card dday">
    <div class="dd-col" ${met ? '' : 'data-act="set-met" role="button"'}>
      <div class="dd-label">함께한 지</div>
      <div class="dd-num">${together !== null ? (together > 0 ? `${together.toLocaleString()}일` : `D-${1 - together}`) : '<span class="small muted">만난 날 입력 ›</span>'}</div>
    </div>
    <div class="dd-sep"></div>
    <div class="dd-col" ${next ? `data-act="detail" data-id="${next.id}" role="button"` : ''}>
      <div class="dd-label">다음 데이트</div>
      <div class="dd-num">${next ? ddayText(next.target_date) : '<span class="small muted">아직 없어</span>'}</div>
      ${next ? `<div class="dd-sub">${esc(next.title)}</div>` : ''}
    </div>
  </section>

  ${p ? '' : `<section class="card invite">
    <div class="inv-title">💌 짝꿍을 초대해줘!</div>
    <p class="hint">짝꿍이 가입할 때 이 코드를 입력하면 연결돼</p>
    <div class="code-big">${esc(S.couple?.invite_code || '')}</div>
    <div class="row gap8"><button class="btn soft sm" data-act="copy-code">복사하기</button><button class="btn primary sm" data-act="share-code">보내기 💕</button></div>
  </section>`}

  ${recapBanner()}

  <section class="card progress" data-act="stats" role="button">
    ${heartMeter(st.pct)}
    <div class="pg-info">
      <div class="pg-pct">${st.pct}%</div>
      <div class="pg-text">${st.total ? `${st.total}개 중 <b>${st.done}개</b>를 함께 이뤘어` : '첫 버킷을 적어볼까? 🌱'}</div>
      <div class="pg-sub">앞으로 함께할 버킷 ${st.left}개 · 자세히 ›</div>
    </div>
  </section>

  <div class="sec-head"><div class="sec-title">📅 다가오는 데이트</div>${upcoming.length > 3 ? `<button class="sec-more" data-act="tab" data-tab="cal">더보기 ›</button>` : ''}</div>
  <div class="list">${upcoming.length ? upcoming.slice(0, 3).map((i) => itemCard(i)).join('') : emptyBox('🗓️', '날짜를 정한 버킷이 아직 없어.<br>버킷에 희망 날짜를 넣어볼까?')}</div>

  <div class="sec-head"><div class="sec-title">✨ 최근 추가한 버킷</div>${S.items.length > 3 ? `<button class="sec-more" data-act="tab" data-tab="list">전체 보기 ›</button>` : ''}</div>
  <div class="list">${S.items.length ? S.items.slice(0, 3).map((i) => itemCard(i)).join('') : emptyBox('📝', '아래 ＋ 버튼으로<br>함께 하고 싶은 걸 적어줘!')}</div>

  ${lastMem ? `<div class="sec-head"><div class="sec-title">📸 최근 추억</div><button class="sec-more" data-act="tab" data-tab="album">앨범 ›</button></div>
  <div style="padding:8px 0 4px">${polaroid(lastMem, 0, true)}</div>` : ''}`;
}

// ---------- 리스트 ----------
function filteredItems() {
  const L = S.list;
  const q = L.q.trim().toLowerCase();
  let arr = S.items.filter((it) => {
    if (L.author !== 'all' && it.author_id !== L.author) return false;
    if (L.cat !== 'all' && (it.category_id || 'none') !== L.cat) return false;
    if (L.status === 'todo' && it.done) return false;
    if (L.status === 'done' && !it.done) return false;
    if (q && !(`${it.title} ${it.description}`.toLowerCase().includes(q))) return false;
    return true;
  });
  if (L.sort === 'like') {
    arr = [...arr].sort((a, b) => (likesOf(b.id).length - likesOf(a.id).length) || b.created_at.localeCompare(a.created_at));
  }
  return arr;
}

function listBodyHtml() {
  const arr = filteredItems();
  if (!S.items.length) return emptyBox('🌱', '아직 버킷이 없어.<br>아래 ＋ 눌러서 첫 버킷을 적어볼까?');
  if (!arr.length) return emptyBox('🔍', '조건에 맞는 버킷이 없어');
  return `<div class="count">${arr.length}개</div><div class="list">${arr.map((i) => itemCard(i)).join('')}</div>`;
}

function listHtml() {
  const L = S.list;
  const chip = (act, val, cur, label) => `<button class="chip ${cur === val ? 'on' : ''}" data-act="${act}" data-v="${val}">${label}</button>`;
  const hasNone = S.items.some((i) => !i.category_id);
  return `${topBar('<div class="top-title">버킷리스트</div>')}
  <input id="q" class="input search-in" type="search" enterkeyhint="search" placeholder="버킷 검색" value="${esc(L.q)}" autocomplete="off">
  <div class="filters">
    <div class="chips scroll-x">
      ${chip('f-author', 'all', L.author, '모두')}
      ${S.profiles.map((p) => chip('f-author', p.id, L.author, `${heartSvg(HEART[p.heart], true, 13)} ${esc(p.nickname)}`)).join('')}
    </div>
    <div class="chips scroll-x">
      ${chip('f-cat', 'all', L.cat, '전체')}
      ${S.categories.map((c) => chip('f-cat', c.id, L.cat, `${esc(c.emoji)} ${esc(c.name)}`)).join('')}
      ${hasNone ? chip('f-cat', 'none', L.cat, '🎈 미분류') : ''}
    </div>
    <div class="row between">
      <div class="seg">
        <button class="${L.status === 'all' ? 'on' : ''}" data-act="f-status" data-v="all">전체</button>
        <button class="${L.status === 'todo' ? 'on' : ''}" data-act="f-status" data-v="todo">하고 싶은</button>
        <button class="${L.status === 'done' ? 'on' : ''}" data-act="f-status" data-v="done">완료</button>
      </div>
      <button class="sort-btn" data-act="f-sort">${L.sort === 'new' ? '최신순' : '공감순 💕'} ⇅</button>
    </div>
  </div>
  <div id="list-body">${listBodyHtml()}</div>`;
}

function bindList(refocus) {
  const q = document.getElementById('q');
  if (!q) return;
  q.addEventListener('input', () => {
    S.list.q = q.value;
    document.getElementById('list-body').innerHTML = listBodyHtml();
  });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') q.blur(); });
  if (refocus) { q.focus(); const v = q.value; q.value = ''; q.value = v; }
}

// ---------- 달력 ----------
function dateKeyOf(it) { return it.target_date || (it.done ? it.done_at : null); }

function monthGrid(y, m, { marks = new Map(), selected = '', act = 'cal-pick' } = {}) {
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const t = today();
  let cells = WEEK.map((w, i) => `<div class="cw ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}">${w}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div class="cd empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = marks.get(ds) || [];
    const dots = list.slice(0, 3).map((it) => heartSvg(colorOf(it.author_id), it.done, 9)).join('') + (list.length > 3 ? `<i class="more">+${list.length - 3}</i>` : '');
    const dow = (first + d - 1) % 7;
    cells += `<button type="button" class="cd ${ds === t ? 'today' : ''} ${ds === selected ? 'sel' : ''} ${dow === 0 ? 'sun' : ''}" data-act="${act}" data-date="${ds}" aria-label="${m + 1}월 ${d}일${list.length ? `, 버킷 ${list.length}개` : ''}"><span class="dn">${d}</span><span class="dots">${dots}</span></button>`;
  }
  return `<div class="grid7">${cells}</div>`;
}

function calHtml() {
  const { y, m } = S.cal;
  const sel = S.cal.sel || today();
  const marks = new Map();
  S.items.forEach((it) => { const k = dateKeyOf(it); if (k) { if (!marks.has(k)) marks.set(k, []); marks.get(k).push(it); } });
  const dayItems = marks.get(sel) || [];
  const undated = S.items.filter((i) => !i.done && !i.target_date);
  return `${topBar('<div class="top-title">데이트 달력</div>')}
  <section class="card cal" style="margin-top:6px">
    <div class="cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="이전 달">‹</button>
      <button class="cal-month" data-act="cal-today">${y}년 ${m + 1}월</button>
      <button class="icon-btn" data-act="cal-next" aria-label="다음 달">›</button>
    </div>
    ${monthGrid(y, m, { marks, selected: sel })}
    <div class="cal-legend"><span>${heartSvg('#B8B1C2', false, 10)} 예정</span><span>${heartSvg('#B8B1C2', true, 10)} 완료</span></div>
  </section>

  <div class="sec-head"><div class="sec-title">${fmt(sel)}</div><button class="sec-more" data-act="add" data-date="${sel}">＋ 이 날 추가</button></div>
  <div class="list">${dayItems.length ? dayItems.map((i) => itemCard(i, { showDate: false })).join('') : emptyBox('☁️', '이 날은 아직 비어 있어')}</div>

  <div class="sec-head"><div class="sec-title">🗂️ 날짜 미정 보관함 <span class="muted small">${undated.length}</span></div></div>
  <div class="list">${undated.length ? undated.map((i) => itemCard(i)).join('') : emptyBox('✨', '날짜 미정 버킷이 없어')}</div>`;
}

// ---------- 앨범 ----------
function albumHtml() {
  const done = doneSorted();
  return `${topBar('<div class="top-title">추억 앨범</div>')}
  <p class="muted small" style="margin:2px 2px 0">우리가 함께한 추억 ${done.length}개 📸</p>
  ${recapBanner()}
  ${done.length ? `<div class="album-grid">${done.map((it, i) => polaroid(it, i)).join('')}</div>` : `<section>${emptyBox('📷', '버킷을 완료하면<br>여기에 폴라로이드로 차곡차곡 쌓여 💕')}</section>`}`;
}

// ------------------------------------------------------------------
// 상세
// ------------------------------------------------------------------
function detailHtml(id) {
  const it = itemOf(id);
  if (!it) return '';
  const a = prof(it.author_id);
  const c = catOf(it.category_id);
  const isMine = it.author_id === S.me.id;
  const liked = S.likes.some((l) => l.item_id === id && l.user_id === S.me.id);
  const partnerLiked = isMine && likesOf(id).some((l) => l.user_id !== S.me.id);
  const p = partner();
  return `<div class="d-author">${heartSvg(colorOf(it.author_id), true, 16)} ${a ? `${esc(a.nickname)}${josa(a.nickname, '이', '가')} 적었어` : '작성자 정보 없음'}</div>
    <h2 class="d-title">${esc(it.title)}</h2>
    <div class="row wrap gap8">
      <span class="pill">${esc(c.emoji)} ${esc(c.name)}</span>
      ${it.done ? '<span class="pill done">✓ 완료</span>' : ''}
      ${bothWant(it) ? '<span class="pill both">💞 둘 다 원해</span>' : ''}
    </div>
    ${it.description ? `<p class="d-desc">${esc(it.description)}</p>` : ''}
    <dl class="d-info">
      <div><dt>적은 날</dt><dd>${fmt(createdDay(it.created_at))}</dd></div>
      <div><dt>희망 날짜</dt><dd>${it.target_date ? `${fmt(it.target_date)}${it.done ? '' : ` · ${ddayText(it.target_date)}`}` : '미정'}</dd></div>
      ${it.done ? `<div><dt>함께한 날</dt><dd>${fmt(it.done_at)}</dd></div>` : ''}
    </dl>
    ${!isMine && !it.done ? `<button class="btn like-big ${liked ? 'on' : ''}" data-act="like" data-id="${id}">${liked ? '💕 나도 하고 싶어!' : '🤍 나도 하고 싶어'}</button>` : ''}
    ${partnerLiked && p ? `<div class="note">💞 ${esc(p.nickname)}도 하고 싶대!</div>` : ''}
    <div class="d-actions">
      ${it.done
        ? `<button class="btn primary block" data-act="memory" data-id="${id}">📸 추억 보기</button>`
        : `<button class="btn primary block" data-act="complete" data-id="${id}">🎉 우리 해냈어! 완료하기</button>`}
      <div class="row gap8">
        <button class="btn soft flex1" data-act="edit" data-id="${id}">✏️ 수정</button>
        ${it.done ? `<button class="btn soft flex1" data-act="undone" data-id="${id}">↩️ 완료 취소</button>` : ''}
        <button class="btn soft danger flex1" data-act="delete" data-id="${id}">🗑️ 삭제</button>
      </div>
    </div>`;
}

function openDetail(id) {
  openSheet(detailHtml(id), {
    refresh: (body) => { if (!itemOf(id)) return closeSheet(); body.innerHTML = detailHtml(id); },
  });
}

// ------------------------------------------------------------------
// 추가·수정
// ------------------------------------------------------------------
function openEditor(id, preset = {}) {
  const it = id ? itemOf(id) : null;
  const etc = S.categories.find((c) => c.name === '기타');
  const st = {
    category_id: it ? it.category_id : (etc?.id || S.categories[0]?.id || null),
    target_date: it ? it.target_date : (preset.date || null),
  };
  const html = `<h3 class="s-title">${it ? '버킷 수정 ✏️' : '새 버킷 추가 ✨'}</h3>
    <form class="form" id="ed" novalidate>
      <input class="input big" name="title" maxlength="60" placeholder="함께 하고 싶은 걸 적어줘" value="${esc(it?.title || '')}" enterkeyhint="next">
      <textarea class="input" name="description" maxlength="300" rows="3" placeholder="간단한 설명 (선택)">${esc(it?.description || '')}</textarea>
      <div class="lbl">카테고리</div>
      <div class="chips wrap" id="ed-cats">${S.categories.map((c) => `<button type="button" class="chip ${st.category_id === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>
      <div class="lbl">희망 날짜 <span class="muted">(선택)</span></div>
      <div class="row gap8" id="ed-date-row"></div>
      <button class="btn primary block mt" type="submit">${it ? '저장하기' : '추가하기 💕'}</button>
    </form>`;

  openSheet(html, {
    onMount: (body) => {
      const f = body.querySelector('#ed');
      const drawDate = () => {
        body.querySelector('#ed-date-row').innerHTML = `<button type="button" class="btn soft flex1" id="ed-date">${st.target_date ? `📅 ${fmtY(st.target_date)}` : '📅 날짜 정하기'}</button>
          ${st.target_date ? '<button type="button" class="btn ghost" id="ed-date-clear">미정으로</button>' : ''}`;
      };
      drawDate();
      body.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-cat]');
        if (chip) {
          st.category_id = chip.dataset.cat;
          body.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === chip));
        }
        if (e.target.closest('#ed-date')) openDatePicker(st.target_date, (d) => { st.target_date = d; drawDate(); }, { title: '언제 하고 싶어? 📅' });
        if (e.target.closest('#ed-date-clear')) { st.target_date = null; drawDate(); }
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = f.title.value.trim();
        if (!title) { toast('제목을 적어줘 😊'); f.title.focus(); return; }
        const btn = f.querySelector('button[type=submit]');
        btn.disabled = true;
        const row = { title, description: f.description.value.trim(), category_id: st.category_id, target_date: st.target_date };
        try {
          if (it) await db(sb.from('items').update(row).eq('id', it.id));
          else await db(sb.from('items').insert({ ...row, couple_id: S.me.couple_id, author_id: S.me.id }));
          closeSheet();
          toast(it ? '수정했어 ✨' : '버킷 추가 완료 💕');
          if (!it && S.tab === 'list') S.list.status = S.list.status === 'done' ? 'all' : S.list.status;
          await loadAll();
        } catch (err) { toast(errMsg(err)); btn.disabled = false; }
      });
    },
  });
}

// ------------------------------------------------------------------
// 귀여운 날짜 선택 (아이폰·갤럭시 똑같이 보이게 직접 만듦)
// ------------------------------------------------------------------
function openDatePicker(initial, onPick, { title = '날짜 선택' } = {}) {
  const base = initial ? parseD(initial) : new Date();
  let y = base.getFullYear();
  let m = base.getMonth();
  const draw = (body) => {
    body.innerHTML = `<h3 class="s-title">${title}</h3>
      <div class="cal-head">
        <button type="button" class="icon-btn" data-dp="prev" aria-label="이전 달">‹</button>
        <div class="cal-month">${y}년 ${m + 1}월</div>
        <button type="button" class="icon-btn" data-dp="next" aria-label="다음 달">›</button>
      </div>
      ${monthGrid(y, m, { selected: initial || '', act: 'dp' })}
      <div class="row gap8 mt">
        <button type="button" class="btn soft flex1" data-dp="today">오늘</button>
        <button type="button" class="btn soft flex1" data-dp="yprev">‹ 작년</button>
        <button type="button" class="btn soft flex1" data-dp="ynext">내년 ›</button>
      </div>`;
  };
  openSheet('', {
    onMount: (body) => {
      draw(body);
      body.addEventListener('click', (e) => {
        const day = e.target.closest('[data-act="dp"]');
        if (day) { onPick(day.dataset.date); closeSheet(); return; }
        const b = e.target.closest('[data-dp]');
        if (!b) return;
        const k = b.dataset.dp;
        if (k === 'today') { onPick(today()); closeSheet(); return; }
        if (k === 'prev') { m--; if (m < 0) { m = 11; y--; } }
        if (k === 'next') { m++; if (m > 11) { m = 0; y++; } }
        if (k === 'yprev') y--;
        if (k === 'ynext') y++;
        draw(body);
      });
    },
  });
}

// ------------------------------------------------------------------
// 추억 보기
// ------------------------------------------------------------------
function reviewBlock(it, person, isMe) {
  if (!person) return '';
  const color = HEART[person.heart];
  const who = `<div class="rv-who">${heartSvg(color, true, 14)} ${esc(person.nickname)}${isMe ? ' (나)' : ''}</div>`;
  if (isMe) {
    const r = reviewOf(it.id, person.id);
    return `<div class="rv" style="--c:${color}">${who}${r ? `<div class="rv-body">${esc(r.body)}</div>` : '<div class="rv-empty">아직 후기를 안 썼어. 그날 어땠는지 남겨볼까? ✍️</div>'}</div>`;
  }
  const partnerHas = hasReview(it.id, person.id);
  const iHave = hasReview(it.id, S.me.id);
  if (partnerHas && iHave) {
    const r = reviewOf(it.id, person.id);
    return `<div class="rv" style="--c:${color}">${who}<div class="rv-body">${esc(r ? r.body : '')}</div></div>`;
  }
  if (partnerHas) {
    return `<div class="rv locked" style="--c:${color}">${who}<div class="blur">오늘 정말 좋았어 우리 또 가자 너무 행복했던 하루</div>
      <p>💌 ${esc(person.nickname)}${josa(person.nickname, '이', '가')} 후기를 남겼어! 내 후기를 쓰면 열려</p></div>`;
  }
  return `<div class="rv" style="--c:${color}">${who}<div class="rv-empty">${esc(person.nickname)}의 후기를 기다리는 중 ⏳</div></div>`;
}

function memoryHtml(id) {
  const it = itemOf(id);
  if (!it) return '';
  const ph = photosOf(id).filter((p) => urlOf(p.path));
  const c = catOf(it.category_id);
  return `${ph.length
      ? `<div class="carousel" id="car">${ph.map((p) => `<div class="slide"><img src="${esc(urlOf(p.path))}" alt="" loading="lazy"></div>`).join('')}</div>
         ${ph.length > 1 ? `<div class="cdots">${ph.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}`
      : `<button class="mem-ph" style="width:100%" data-act="mem-edit" data-id="${id}"><div><span class="em">${esc(c.emoji)}</span>사진을 추가해볼까? 📸</div></button>`}
    <h2 class="mem-title">${esc(it.title)}</h2>
    <div class="mem-sub">${fmtY(it.done_at)} 함께했어 · ${esc(c.emoji)} ${esc(c.name)}</div>
    <div class="reviews">${reviewBlock(it, S.me, true)}${reviewBlock(it, partner(), false)}</div>
    <div class="d-actions">
      <button class="btn primary block" data-act="mem-edit" data-id="${id}">📸 사진·후기 ${hasReview(id, S.me.id) || ph.length ? '수정' : '남기기'}</button>
      <button class="btn soft block" data-act="detail" data-id="${id}">버킷 상세 보기</button>
    </div>`;
}

function bindCarousel(body) {
  const car = body.querySelector('#car');
  const dots = body.querySelectorAll('.cdots i');
  if (!car || !dots.length) return;
  car.addEventListener('scroll', () => {
    const i = Math.round(car.scrollLeft / car.clientWidth);
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}

function openMemory(id) {
  openSheet(memoryHtml(id), {
    onMount: bindCarousel,
    refresh: (body) => {
      const it = itemOf(id);
      if (!it || !it.done) return closeSheet();
      body.innerHTML = memoryHtml(id);
      bindCarousel(body);
    },
  });
}

// ------------------------------------------------------------------
// 추억 기록 (사진 최대 5장 + 내 후기)
// ------------------------------------------------------------------
async function compressImage(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    const max = 1600;
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * r));
    const h = Math.max(1, Math.round(img.naturalHeight * r));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('encode');
    return blob;
  } finally {
    URL.revokeObjectURL(src);
  }
}

function memoryEditorHtml(id, justDone) {
  const it = itemOf(id);
  const myR = reviewOf(id, S.me.id);
  const p = partner();
  return `<h3 class="s-title">${justDone ? '🎉 축하해! 그날의 추억을 남겨볼까?' : '추억 기록 📸'}</h3>
    <div class="form">
      <div class="lbl">함께한 날</div>
      <button type="button" class="btn soft block" id="me-date">📅 ${fmtY(it.done_at)}</button>
      <div class="lbl">사진 <span class="muted" id="me-count"></span></div>
      <div class="ph-grid" id="me-photos"></div>
      <input type="file" id="me-file" accept="image/*" multiple hidden>
      <div class="lbl">내 후기 ${p ? '<span class="muted">· 둘 다 쓰면 서로 공개돼 💌</span>' : ''}</div>
      <textarea class="input" id="me-review" maxlength="500" rows="4" placeholder="그날 어땠어? 기억하고 싶은 순간을 적어줘">${esc(myR?.body || '')}</textarea>
      <button type="button" class="btn primary block mt" id="me-save">저장하기 💕</button>
      ${justDone ? '<button type="button" class="btn ghost block" data-close>나중에 쓸래</button>' : ''}
    </div>`;
}

function mountMemoryEditor(id, body) {
  let pending = 0;
  const drawPhotos = () => {
    const ph = photosOf(id);
    const tiles = ph.map((p) => `<div class="ph-tile">${urlOf(p.path) ? `<img src="${esc(urlOf(p.path))}" alt="">` : ''}<button type="button" class="ph-del" data-del="${p.id}" aria-label="사진 삭제">✕</button></div>`);
    for (let i = 0; i < pending; i++) tiles.push('<div class="ph-tile loading"><div class="spin"></div></div>');
    if (ph.length + pending < MAX_PHOTOS) tiles.push('<button type="button" class="ph-tile ph-add" id="me-add"><b>＋</b>사진 추가</button>');
    body.querySelector('#me-photos').innerHTML = tiles.join('');
    body.querySelector('#me-count').textContent = `${ph.length}/${MAX_PHOTOS}`;
  };
  drawPhotos();

  const fileIn = body.querySelector('#me-file');
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files];
    fileIn.value = '';
    const room = MAX_PHOTOS - photosOf(id).length - pending;
    if (files.length > room) toast(`사진은 최대 ${MAX_PHOTOS}장까지야 📸`);
    const list = files.slice(0, Math.max(0, room));
    pending += list.length;
    drawPhotos();
    for (const file of list) {
      const path = `${S.me.couple_id}/${id}/${uuid()}.jpg`;
      try {
        const blob = await compressImage(file);
        const { error: upErr } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const sort = photosOf(id).reduce((mx, p) => Math.max(mx, p.sort), 0) + 1;
        try {
          const row = await db(sb.from('photos').insert({ couple_id: S.me.couple_id, item_id: id, path, sort }).select().single());
          S.photos.push(row);
          await ensureUrls();
        } catch (dbErr) {
          await sb.storage.from('photos').remove([path]);
          throw dbErr;
        }
      } catch (err) {
        console.error(err);
        toast(err && err.message === 'encode' || err instanceof Event ? '이 사진은 열 수 없어 😢 다른 사진으로 해볼래?' : errMsg(err));
      } finally {
        pending--;
        drawPhotos();
      }
    }
  });

  body.addEventListener('click', async (e) => {
    if (e.target.closest('#me-add')) { fileIn.click(); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm('이 사진을 지울까?')) return;
      const ph = S.photos.find((p) => p.id === del.dataset.del);
      if (!ph) return;
      try {
        await db(sb.from('photos').delete().eq('id', ph.id));
        await sb.storage.from('photos').remove([ph.path]);
        S.photos = S.photos.filter((p) => p.id !== ph.id);
        drawPhotos();
      } catch (err) { toast(errMsg(err)); }
      return;
    }
    if (e.target.closest('#me-date')) {
      const it = itemOf(id);
      openDatePicker(it.done_at, async (d) => {
        try {
          await db(sb.from('items').update({ done_at: d }).eq('id', id));
          it.done_at = d;
          const b = body.querySelector('#me-date');
          if (b) b.textContent = `📅 ${fmtY(d)}`;
        } catch (err) { toast(errMsg(err)); }
      }, { title: '언제 함께했어? 📅' });
      return;
    }
    if (e.target.closest('#me-save')) {
      const btn = e.target.closest('#me-save');
      if (pending) { toast('사진 올리는 중이야. 잠깐만 기다려줘 ⏳'); return; }
      const text = body.querySelector('#me-review').value.trim();
      btn.disabled = true;
      try {
        const mine = reviewOf(id, S.me.id);
        if (text) await db(sb.from('reviews').upsert({ item_id: id, user_id: S.me.id, couple_id: S.me.couple_id, body: text, updated_at: new Date().toISOString() }));
        else if (mine) await db(sb.from('reviews').delete().eq('item_id', id).eq('user_id', S.me.id));
        closeSheet();
        toast('추억 저장 완료 📸💕');
        await loadAll();
      } catch (err) { toast(errMsg(err)); btn.disabled = false; }
    }
  });
}

function openMemoryEditor(id, { justDone = false, replace = false } = {}) {
  const html = memoryEditorHtml(id, justDone);
  const opts = { onMount: (body) => mountMemoryEditor(id, body) };
  if (replace) replaceSheet(html, opts);
  else openSheet(html, opts);
}

// ------------------------------------------------------------------
// 달성률
// ------------------------------------------------------------------
function openStats() {
  const st = stats();
  const groups = S.categories.map((c) => ({ c, list: S.items.filter((i) => i.category_id === c.id) }));
  const none = S.items.filter((i) => !i.category_id);
  if (none.length) groups.push({ c: { emoji: '🎈', name: '미분류' }, list: none });
  const bars = groups.filter((g) => g.list.length).map(({ c, list }) => {
    const d = list.filter((i) => i.done).length;
    const pct = Math.round((d / list.length) * 100);
    return `<div class="bar-row"><div class="bar-top">${esc(c.emoji)} ${esc(c.name)}<span>${d}/${list.length} · ${pct}%</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  openSheet(`<h3 class="s-title">우리의 달성률 💕</h3>
    <div class="stat-hero">${heartMeter(st.pct, 150)}<div class="pg-pct">${st.pct}%</div>
      <p class="muted small">${st.done ? `벌써 ${st.done}개의 추억을 함께 만들었어 ✨` : '첫 추억을 기다리는 중이야 🌱'}</p></div>
    <div class="stat-grid">
      <div><b>${st.total}</b><span>전체 버킷</span></div>
      <div><b>${st.done}</b><span>함께 이룬</span></div>
      <div><b>${st.left}</b><span>앞으로 함께할</span></div>
    </div>
    <div class="sec-head"><div class="sec-title">카테고리별</div></div>
    <div class="bars">${bars || emptyBox('🌱', '버킷을 추가하면 보여줄게')}</div>`);
}

// ------------------------------------------------------------------
// 연말 결산
// ------------------------------------------------------------------
function openRecap() {
  const year = new Date().getFullYear();
  const done = S.items.filter((i) => i.done && i.done_at && i.done_at.startsWith(String(year))).sort((a, b) => a.done_at.localeCompare(b.done_at));
  const p = partner();
  const names = p ? `${esc(S.me.nickname)} & ${esc(p.nickname)}` : esc(S.me.nickname);
  const slides = [];
  slides.push(`<div class="em">🎁</div><div class="big">${year}년의<br>${names}</div><p>올해 우리가 함께한 이야기 보러 갈까?</p>`);
  if (!done.length) {
    slides.push(`<div class="em">🌱</div><div class="big">올해의 추억은<br>이제 시작이야</div><p>남은 날들도 함께 채워보자 💕</p>`);
  } else {
    slides.push(`<p>올해 함께 이룬 버킷</p><div class="huge">${done.length}개</div><p>하나하나 다 소중한 추억이야 ✨</p>`);
    const counts = new Map();
    done.forEach((i) => { const c = catOf(i.category_id); const k = `${c.emoji} ${c.name}`; counts.set(k, (counts.get(k) || 0) + 1); });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    slides.push(`<div class="em">🏆</div><div class="big">우리가 제일 많이 한 건</div>
      <div class="recap-list">${top.map(([k, n]) => `<div><span>${esc(k)}</span><b>${n}번</b></div>`).join('')}</div>`);
    const pics = done.flatMap((i) => photosOf(i.id).slice(0, 1)).map((ph) => urlOf(ph.path)).filter(Boolean).slice(0, 9);
    if (pics.length) slides.push(`<div class="big">올해의 우리 📸</div><div class="recap-collage">${pics.map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>`);
    const first = done[0];
    const last = done[done.length - 1];
    slides.push(`<div class="em">📖</div><div class="big">올해 첫 추억</div><p><b>${esc(first.title)}</b><br>${fmtY(first.done_at)}</p>
      ${done.length > 1 ? `<div class="big" style="margin-top:22px">가장 최근 추억</div><p><b>${esc(last.title)}</b><br>${fmtY(last.done_at)}</p>` : ''}`);
    const both = done.filter(bothWant).length;
    if (both) slides.push(`<div class="em">💞</div><div class="big">둘 다 하고 싶었던 버킷<br>${both}개를 이뤘어</div><p>마음이 통했네!</p>`);
  }
  const left = S.items.filter((i) => !i.done).length;
  slides.push(`<div class="em">💕</div><div class="big">내년에도<br>같이 하자</div><p>${left ? `아직 ${left}개의 버킷이 우리를 기다리고 있어` : '새로운 버킷을 함께 적어볼까?'}</p>`);

  let idx = 0;
  const draw = (body) => {
    body.innerHTML = `<div class="recap">
      <div class="recap-bars">${slides.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>
      <button class="recap-x" data-close aria-label="닫기">✕</button>
      <div class="recap-stage fade-in" id="rs">${slides[idx]}</div>
      <div class="recap-hint">${idx < slides.length - 1 ? '화면을 탭하면 다음으로 ›' : '탭하면 닫혀'}</div>
    </div>`;
  };
  openSheet('', {
    cls: 'full',
    onMount: (body) => {
      draw(body);
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) return;
        const left = e.clientX < window.innerWidth * 0.3;
        if (left) idx = Math.max(0, idx - 1);
        else if (idx < slides.length - 1) idx++;
        else { closeSheet(); return; }
        draw(body);
      });
    },
  });
}

// ------------------------------------------------------------------
// 우리 공간 (설정)
// ------------------------------------------------------------------
function settingsHtml() {
  const p = partner();
  const me = S.me;
  return `<h3 class="s-title">우리 공간 🏡</h3>
    <div class="set-label">내 프로필</div>
    <div class="guide-box form">
      <div class="icon-pick">${ICONS.map((ic) => `<button type="button" class="icon-opt ${me.icon === ic ? 'on' : ''}" data-sic="${ic}">${ic}</button>`).join('')}</div>
      <input class="input" id="s-nick" maxlength="12" value="${esc(me.nickname)}" placeholder="닉네임">
      <div class="heart-pick">
        <button type="button" class="heart-opt pink ${me.heart === 'pink' ? 'on' : ''}" data-sh="pink">${heartSvg(HEART.pink, true, 18)} 분홍</button>
        <button type="button" class="heart-opt blue ${me.heart === 'blue' ? 'on' : ''}" data-sh="blue">${heartSvg(HEART.blue, true, 18)} 파랑</button>
      </div>
      <button type="button" class="btn primary block" id="s-save">프로필 저장</button>
    </div>

    <div class="set-label">우리 둘</div>
    <div class="set-group">
      <div class="set-row"><span>연결 상태</span><span>${p ? `💞 ${esc(p.icon)} ${esc(p.nickname)}${josa(p.nickname, '과', '와')} 연결됨` : '⏳ 짝꿍을 기다리는 중'}</span></div>
      ${p ? '' : `<button class="set-row" data-act="share-code"><span>초대 코드 보내기</span><span><b>${esc(S.couple?.invite_code || '')}</b> ›</span></button>`}
      <button class="set-row" data-act="set-met"><span>만난 날</span><span>${S.couple?.met_date ? fmtY(S.couple.met_date) : '입력하기'} ›</span></button>
      <button class="set-row" data-act="categories"><span>카테고리 관리</span><span>${S.categories.length}개 ›</span></button>
    </div>

    <div class="set-label">앱</div>
    <div class="set-group">
      <button class="set-row" data-act="install-guide"><span>홈 화면에 추가하는 법</span><span>${isStandalone() ? '✅ 설치됨' : '›'}</span></button>
      <button class="set-row" data-act="export"><span>데이터 내보내기 (백업)</span><span>›</span></button>
      <button class="set-row" data-act="logout"><span>로그아웃</span><span>›</span></button>
    </div>
    <p class="foot">Two-Do · 우리 둘만 볼 수 있는 공간 🔒<br>광고·추적 없음</p>`;
}

function openSettings() {
  const st = { icon: S.me.icon, heart: S.me.heart };
  openSheet(settingsHtml(), {
    refresh: (body) => {
      const nick = body.querySelector('#s-nick')?.value;
      body.innerHTML = settingsHtml();
      if (nick != null) body.querySelector('#s-nick').value = nick;
      body.querySelectorAll('[data-sic]').forEach((x) => x.classList.toggle('on', x.dataset.sic === st.icon));
      body.querySelectorAll('[data-sh]').forEach((x) => x.classList.toggle('on', x.dataset.sh === st.heart));
    },
    onMount: (body) => {
      body.addEventListener('click', async (e) => {
        const ic = e.target.closest('[data-sic]');
        if (ic) { st.icon = ic.dataset.sic; body.querySelectorAll('[data-sic]').forEach((x) => x.classList.toggle('on', x === ic)); }
        const h = e.target.closest('[data-sh]');
        if (h) { st.heart = h.dataset.sh; body.querySelectorAll('[data-sh]').forEach((x) => x.classList.toggle('on', x === h)); }
        if (e.target.closest('#s-save')) {
          const nickname = body.querySelector('#s-nick').value.trim();
          if (!nickname) return toast('닉네임을 적어줘 😊');
          const btn = e.target.closest('#s-save');
          btn.disabled = true;
          try {
            await db(sb.from('profiles').update({ nickname, icon: st.icon, heart: st.heart }).eq('id', S.me.id));
            toast('프로필 저장 완료 ✨');
            await loadAll();
          } catch (err) { toast(errMsg(err)); }
          btn.disabled = false;
        }
      });
    },
  });
}

function openCategories() {
  const rows = () => S.categories.map((c) => `<div class="cat-row" data-cid="${c.id}">
      <input class="input emoji-in" value="${esc(c.emoji)}" maxlength="4" aria-label="이모지">
      <input class="input name-in" value="${esc(c.name)}" maxlength="12" aria-label="이름">
      <button type="button" class="icon-btn" data-cdel="${c.id}" aria-label="삭제">🗑️</button>
    </div>`).join('');
  const html = `<h3 class="s-title">카테고리 관리 🏷️</h3>
    <p class="hint" style="margin-bottom:12px">이모지나 이름을 바꾸면 바로 저장돼</p>
    <div id="cat-list">${rows()}</div>
    <div class="cat-row new">
      <input class="input emoji-in" id="nc-emoji" maxlength="4" placeholder="🎈" aria-label="새 이모지">
      <input class="input" id="nc-name" maxlength="12" placeholder="새 카테고리" aria-label="새 이름">
      <button type="button" class="btn primary sm" id="nc-add">추가</button>
    </div>`;
  openSheet(html, {
    onMount: (body) => {
      const redraw = () => { body.querySelector('#cat-list').innerHTML = rows(); };
      body.addEventListener('change', async (e) => {
        const row = e.target.closest('.cat-row[data-cid]');
        if (!row) return;
        const emoji = row.querySelector('.emoji-in').value.trim() || '🎈';
        const name = row.querySelector('.name-in').value.trim();
        if (!name) { toast('이름은 비워둘 수 없어'); redraw(); return; }
        try {
          await db(sb.from('categories').update({ emoji, name }).eq('id', row.dataset.cid));
          toast('저장했어 ✨');
          await loadAll();
        } catch (err) { toast(errMsg(err)); }
      });
      body.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-cdel]');
        if (del) {
          const n = S.items.filter((i) => i.category_id === del.dataset.cdel).length;
          if (!confirm(n ? `이 카테고리의 버킷 ${n}개는 '미분류'가 돼. 지울까?` : '이 카테고리를 지울까?')) return;
          try { await db(sb.from('categories').delete().eq('id', del.dataset.cdel)); await loadAll(); redraw(); } catch (err) { toast(errMsg(err)); }
        }
        if (e.target.closest('#nc-add')) {
          const name = body.querySelector('#nc-name').value.trim();
          const emoji = body.querySelector('#nc-emoji').value.trim() || '🎈';
          if (!name) return toast('이름을 적어줘 😊');
          const sort = S.categories.reduce((mx, c) => Math.max(mx, c.sort), 0) + 1;
          try {
            await db(sb.from('categories').insert({ couple_id: S.me.couple_id, name, emoji, sort }));
            body.querySelector('#nc-name').value = '';
            body.querySelector('#nc-emoji').value = '';
            await loadAll();
            redraw();
            toast('카테고리 추가 완료 🏷️');
          } catch (err) { toast(errMsg(err)); }
        }
      });
    },
  });
}

function openInstallGuide() {
  const ios = isIOS();
  const iosBox = `<div class="guide-box"><h4>🍎 아이폰</h4><ol class="guide-steps">
      <li><b>Safari</b>로 이 주소를 열어줘</li>
      <li>아래쪽 <b>공유 버튼</b>(네모에 화살표 ⬆️)을 눌러</li>
      <li><b>홈 화면에 추가</b>를 누르고 <b>추가</b>하면 끝!</li></ol>
      <p class="hint" style="margin-top:8px">Chrome 앱에서도 공유 버튼 → 홈 화면에 추가로 할 수 있어 (iOS 16.4 이상)</p></div>`;
  const andBox = `<div class="guide-box"><h4>🤖 갤럭시</h4>
      ${deferredInstall ? '<button class="btn primary block" id="do-install" style="margin-bottom:10px">바로 설치하기 📲</button>' : ''}
      <ol class="guide-steps">
      <li><b>삼성 인터넷</b>: 아래 메뉴(≡) → <b>현재 페이지 추가</b> → <b>홈 화면</b></li>
      <li><b>Chrome</b>: 오른쪽 위 ⋮ → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b></li></ol></div>`;
  openSheet(`<h3 class="s-title">홈 화면에 추가하기 📲</h3>
    <p class="hint">추가하면 앱처럼 전체 화면으로 열려. 로그인은 앱 안에서 한 번 더 해줘!</p>
    ${ios ? iosBox + andBox : andBox + iosBox}`, {
    onMount: (body) => {
      const b = body.querySelector('#do-install');
      if (b) b.addEventListener('click', async () => {
        deferredInstall.prompt();
        await deferredInstall.userChoice.catch(() => {});
        deferredInstall = null;
        closeSheet();
      });
    },
  });
}

function maybeShowInstallGuide() {
  if (isStandalone() || store.get('twodo-guide')) return;
  store.set('twodo-guide', '1');
  setTimeout(openInstallGuide, 900);
}

async function exportData() {
  const data = {
    app: 'Two-Do',
    exported_at: new Date().toISOString(),
    couple: { met_date: S.couple?.met_date },
    people: S.profiles.map((p) => ({ id: p.id, nickname: p.nickname, heart: p.heart, icon: p.icon })),
    categories: S.categories.map(({ id, name, emoji }) => ({ id, name, emoji })),
    items: S.items.map((i) => ({
      ...i,
      likes: likesOf(i.id).map((l) => l.user_id),
      photos: photosOf(i.id).map((p) => p.path),
      reviews: S.reviews.filter((r) => r.item_id === i.id).map((r) => ({ user_id: r.user_id, body: r.body })),
    })),
  };
  const name = `two-do-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Two-Do 백업' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('백업 파일을 저장했어 💾');
}

// ------------------------------------------------------------------
// 동작 모음 (data-act)
// ------------------------------------------------------------------
const ACT = {
  tab(el) { S.tab = el.dataset.tab; render(false); },
  add(el) { openEditor(null, { date: el.dataset.date }); },
  settings() { openSettings(); },
  stats() { openStats(); },
  detail(el) { openDetail(el.dataset.id); },
  memory(el) { openMemory(el.dataset.id); },
  'mem-edit'(el) { openMemoryEditor(el.dataset.id); },
  edit(el) { openEditor(el.dataset.id); },
  recap() { openRecap(); },
  categories() { openCategories(); },
  'install-guide'() { openInstallGuide(); },
  export() { return exportData(); },

  async like(el) {
    const id = el.dataset.id;
    const mine = S.likes.find((l) => l.item_id === id && l.user_id === S.me.id);
    if (mine) S.likes = S.likes.filter((l) => l !== mine);
    else S.likes.push({ item_id: id, user_id: S.me.id, couple_id: S.me.couple_id });
    render();
    sheets.forEach((s) => s.refresh && s.refresh(s.body));
    try {
      if (mine) await db(sb.from('likes').delete().eq('item_id', id).eq('user_id', S.me.id));
      else { await db(sb.from('likes').insert({ item_id: id, user_id: S.me.id, couple_id: S.me.couple_id })); toast('💕 나도 하고 싶다고 전했어!'); }
    } catch (err) { toast(errMsg(err)); await loadAll(); }
  },

  async complete(el) {
    const id = el.dataset.id;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    el.disabled = true;
    const t = today();
    try {
      await db(sb.from('items').update({ done: true, done_at: t }).eq('id', id));
      const it = itemOf(id);
      if (it) Object.assign(it, { done: true, done_at: t });
      render();
      setTimeout(() => openMemoryEditor(id, { justDone: true, replace: true }), 500);
      queueReload();
    } catch (err) { toast(errMsg(err)); el.disabled = false; }
  },

  async undone(el) {
    if (!confirm('완료를 취소할까?\n사진과 후기는 그대로 남아있어')) return;
    await db(sb.from('items').update({ done: false, done_at: null }).eq('id', el.dataset.id));
    toast('다시 하고 싶은 버킷으로 돌려놨어 ↩️');
    await loadAll();
  },

  async delete(el) {
    const id = el.dataset.id;
    const it = itemOf(id);
    if (!it || !confirm(`'${it.title}'을(를) 지울까?\n사진과 후기도 함께 지워져`)) return;
    const paths = photosOf(id).map((p) => p.path);
    await db(sb.from('items').delete().eq('id', id));
    if (paths.length) await sb.storage.from('photos').remove(paths);
    closeSheet();
    toast('지웠어 🗑️');
    await loadAll();
  },

  'f-author'(el) { S.list.author = el.dataset.v; render(); },
  'f-cat'(el) { S.list.cat = el.dataset.v; render(); },
  'f-status'(el) { S.list.status = el.dataset.v; render(); },
  'f-sort'() { S.list.sort = S.list.sort === 'new' ? 'like' : 'new'; render(); },

  'cal-prev'() { S.cal.m--; if (S.cal.m < 0) { S.cal.m = 11; S.cal.y--; } render(); },
  'cal-next'() { S.cal.m++; if (S.cal.m > 11) { S.cal.m = 0; S.cal.y++; } render(); },
  'cal-today'() { const d = new Date(); S.cal = { y: d.getFullYear(), m: d.getMonth(), sel: today() }; render(); },
  'cal-pick'(el) { S.cal.sel = el.dataset.date; render(); },

  'set-met'() {
    openDatePicker(S.couple?.met_date, async (d) => {
      try { await db(sb.from('couples').update({ met_date: d }).eq('id', S.me.couple_id)); toast('만난 날 저장 💕'); await loadAll(); } catch (err) { toast(errMsg(err)); }
    }, { title: '우리 언제 만났어? 💕' });
  },

  async 'copy-code'() {
    const code = S.couple?.invite_code || '';
    try { await navigator.clipboard.writeText(code); toast('초대 코드를 복사했어 📋'); } catch { toast(`초대 코드: ${code}`); }
  },
  async 'share-code'() {
    const code = S.couple?.invite_code || '';
    const text = `Two-Do에서 같이 버킷리스트 채우자 💕\n가입하고 초대 코드 [${code}] 를 입력해줘!\n${location.origin}${location.pathname}`;
    if (navigator.share) { try { await navigator.share({ title: 'Two-Do 초대', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('초대 메시지를 복사했어 📋'); } catch { toast(`초대 코드: ${code}`); }
  },

  async logout() {
    if (!confirm('로그아웃할까?')) return;
    await sb.auth.signOut();
  },
};

document.addEventListener('click', async (e) => {
  const top = sheets[sheets.length - 1];
  const closer = e.target.closest('[data-close]');
  if (closer && top && closer.closest('.sheet-wrap') === top.wrap) { closeSheet(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  try { await fn(el, e); } catch (err) { console.error(err); toast(errMsg(err)); }
});

boot();
