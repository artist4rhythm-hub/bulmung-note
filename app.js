// 불멍노트 — 모임 준비 · 준비물 · 예산 · 회비 · 공지
import { MODULES, PACKAGES, POOL, FIRE_SAFETY, FIRE_SNACKS, OFTEN_MISSED } from './pool.js';
import { firebaseConfig } from './firebase-config.js';

const VER = '1.0.0';
const FB_V = '10.14.1';
const LS_EV = 'bulmung-events-v1', LS_LIB = 'bulmung-lib-v1', LS_THEME = 'bulmung-theme';
const MOD = Object.fromEntries(MODULES.map(m => [m.k, m]));
const ACTS = MODULES.filter(m => m.g === 'a').map(m => m.k);
const KIND = { b: '살 것', d: '담당 준비', k: '챙길 것', p: '개인 준비물' };
const VARIANTS = { rice: [['hb', '햇반'], ['rc', '직접 짓기']], ramen: [['cup', '컵라면'], ['bag', '봉지라면']] };
const SECS = [['place', '장소'], ['move', '이동'], ['people', '인원'], ['time', '시간 계획'], ['fee', '회비'], ['personal', '개인 준비물'], ['duty', '담당']];
const SHOPS = [['coupang', '쿠팡'], ['naver', '네이버'], ['daiso', '다이소'], ['11st', '11번가'], ['gmarket', 'G마켓'], ['auction', '옥션'], ['ssg', 'SSG'], ['kurly', '컬리'], ['emart', '이마트'], ['homeplus', '홈플러스'], ['lotteon', '롯데ON'], ['oliveyoung', '올리브영']];

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Math.round(n || 0).toLocaleString('ko-KR');
const rid = () => Math.random().toString(36).slice(2, 10);
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : 0; };
const has = v => v !== '' && v != null;
const okUrl = u => /^https?:\/\//i.test(String(u || '').trim());
const shopOf = u => { const s = String(u).toLowerCase(); const f = SHOPS.find(([k]) => s.includes(k)); return f ? f[1] : ''; };
const clone = o => JSON.parse(JSON.stringify(o));
const qtyTxt = q => (Math.round(num(q) * 100) / 100).toLocaleString('ko-KR');

/* ───────────── 상태 ───────────── */
const S = { events: {}, lib: { items: [], prices: {}, links: {} }, view: 'home', cur: null, tab: 'sum', filter: 'all', onlyOn: false, q: '', open: {}, fold: {}, more: {}, user: null, mode: 'local', ready: false, wiz: null };
let FB = null;

/* ───────────── 계산 ───────────── */
function ruleQty(rule, unit, n) {
  const r = String(rule || '');
  if (!r) return 1;
  const x = parseFloat(r.slice(1));
  if (r[0] === 'f') return x;
  if (r[0] === 'p') { const v = n * x; return unit === 'kg' ? Math.max(0.5, Math.ceil(v * 2) / 2) : Math.max(1, Math.ceil(v)); }
  if (r[0] === 'd') return Math.max(1, Math.ceil(n / x));
  return 1;
}
function ruleTxt(rule, unit) {
  const r = String(rule || ''); if (!r) return '1' + (unit || '개');
  const x = r.slice(1);
  return r[0] === 'f' ? `${x}${unit || '개'} 고정` : r[0] === 'p' ? `1인당 ${x}${unit || '개'}` : `${x}명당 1${unit || '개'}`;
}
const pplOf = e => e.people.reduce((a, p) => a + num(p.count), 0);
const payersOf = e => e.people.filter(p => p.pays).reduce((a, p) => a + num(p.count), 0);
const visible = (e, i) => (e.mods[i.mod] || 'off') !== 'off' && (!i.v || e.variants[i.mod] === i.v);
const valOf = i => i.kind !== 'b' ? 0 : has(i.actual) ? num(i.actual) : num(i.price) * num(i.qty);
function calc(e) {
  const on = e.items.filter(i => i.on && visible(e, i));
  const buy = on.filter(i => i.kind === 'b');
  const est = buy.reduce((a, i) => a + num(i.price) * num(i.qty), 0);
  const real = buy.reduce((a, i) => a + valOf(i), 0);
  const byMod = MODULES.map(m => ({ k: m.k, v: buy.filter(i => i.mod === m.k).reduce((a, i) => a + valOf(i), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const ppl = pplOf(e), payers = payersOf(e);
  const per = payers ? real / payers : 0, r = num(e.fee.round) || 1000;
  const fee = has(e.fee.manual) ? num(e.fee.manual) : Math.ceil(per / r) * r;
  const collect = fee * payers;
  const bring = on.filter(i => i.kind === 'k'), duty = on.filter(i => i.kind === 'd'), personal = on.filter(i => i.kind === 'p');
  return {
    on, buy, est, real, byMod, ppl, payers, per, fee, collect, bal: collect - real, bring, duty, personal,
    ordered: buy.filter(i => i.st).length, got: buy.filter(i => i.st === '받음' || i.st === '현장 결제').length,
    packed: bring.filter(i => i.packed).length + duty.filter(i => i.packed).length,
    noPrice: buy.filter(i => !num(i.price) && !has(i.actual)).length,
    noWho: duty.filter(i => !i.who).length,
    actualN: buy.filter(i => has(i.actual)).length
  };
}
function fmtDate(d) { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); if (!y) return ''; return `${y}. ${m}. ${dd} (${'일월화수목금토'[new Date(y, m - 1, dd).getDay()]})`; }
function addMin(t, m) { const [h, mi] = String(t || '00:00').split(':').map(Number); const x = (((h || 0) * 60 + (mi || 0) + m) % 1440 + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); }
function times(e) { let t = e.start || '12:00'; return e.sched.map(s => { const a = t; t = addMin(t, num(s.mins)); return [a, t]; }); }

/* ───────────── 모임 만들기 ───────────── */
function poolRows() {
  const custom = (S.lib.items || []).map(c => [c.mod, c.name, c.def ? 1 : 0, c.kind, c.rule || '', c.unit || '개', num(c.price), c.note || '', '', true]);
  return [...POOL, ...custom];
}
function itemFromRow(r, e, checked) {
  const [mod, name, , kind, rule, unit, price, note, v] = r;
  const n = pplOf(e) || 1;
  const p = S.lib.prices && has(S.lib.prices[name]) ? num(S.lib.prices[name]) : num(price);
  return { id: rid(), mod, name, kind, on: !!checked, qty: ruleQty(rule, unit, n), auto: !!rule, rule: rule || '', unit: unit || '', price: kind === 'b' ? p : 0, actual: '', link: (S.lib.links && S.lib.links[name]) || '', shop: '', who: '', st: '', packed: false, note: note || '', v: v || '' };
}
function addModItems(e, mod) {
  const st = e.mods[mod];
  poolRows().filter(r => r[0] === mod).forEach(r => {
    if (e.items.some(i => i.mod === mod && i.name === r[1])) return;
    e.items.push(itemFromRow(r, e, st === 'on' && r[2] === 1));
  });
}
function applyFireLinks(e) {
  const fire = e.mods.fire === 'on' || e.mods.bbqgear === 'on';
  if (!fire) return;
  e.items.forEach(i => { if (FIRE_SAFETY.includes(i.name) && e.mods.safety !== 'off') i.on = true; });
  if (e.mods.fire === 'on') {
    if (e.mods.snack === 'off') { e.mods.snack = 'opt'; addModItems(e, 'snack'); }
    e.items.forEach(i => { if (FIRE_SNACKS.includes(i.name)) i.on = true; });
  }
}
function newEvent(w) {
  const P = PACKAGES[w.pkg];
  const e = {
    id: 'ev-' + Date.now().toString(36) + rid().slice(0, 4), title: w.title || '', target: '', date: w.date || '', pkg: w.pkg,
    mods: { ...P.mods }, variants: { rice: w.rice || 'hb', ramen: w.ramen || 'cup' },
    people: [{ id: rid(), name: '참석자', count: num(w.count) || 10, pays: true }], cap: 25,
    start: P.start, sched: P.sched.map(s => ({ id: rid(), label: s[0], mins: s[1] })),
    place: { name: '', addr: '', map: '' }, move: { mode: w.pkg === 'indoor' ? 'self' : 'bus', vehicle: '카운티 25인승', driver: '', mins: '', depart: '', meet: '' },
    secs: SECS.map(s => s[0]), memo: '', fee: { round: 1000, manual: '' }, items: [], created: Date.now(), updated: Date.now()
  };
  ACTS.forEach(a => { e.mods[a] = w.acts.includes(a) ? 'on' : 'off'; });
  if (w.pkg === 'indoor' || w.pkg === 'picnic') e.secs = e.secs.filter(s => s !== 'move' || w.pkg === 'picnic');
  MODULES.forEach(m => { if (e.mods[m.k] !== 'off') addModItems(e, m.k); });
  applyFireLinks(e);
  return e;
}
function reQty(e) { const n = pplOf(e) || 1; e.items.forEach(i => { if (i.auto && i.rule) i.qty = ruleQty(i.rule, i.unit, n); }); }

/* ───────────── 저장 (파이어베이스 / 이 기기) ───────────── */
const pend = {}, flying = {}, again = {};
function localSave() { try { if (S.mode === 'local') localStorage.setItem(LS_EV, JSON.stringify(Object.values(S.events))); localStorage.setItem(LS_LIB, JSON.stringify(S.lib)); } catch { } }
function save(e) {
  e.updated = Date.now(); localSave();
  if (S.mode !== 'cloud') return;
  clearTimeout(pend[e.id]); pend[e.id] = setTimeout(() => flush(e.id), 600); sync('저장 중…');
}
async function flush(id) {
  delete pend[id]; if (flying[id]) { again[id] = true; return; }
  const e = S.events[id]; if (!e || !FB) return; flying[id] = true;
  try { await FB.setDoc(FB.doc(FB.db, 'users', S.user.uid, 'events', id), clone(e)); sync('저장됨'); }
  catch (err) { sync('저장 실패 — 인터넷을 확인해 주세요'); console.warn(err); }
  flying[id] = false; if (again[id]) { again[id] = false; flush(id); }
}
let libT;
function saveLib() { localSave(); if (S.mode !== 'cloud') return; clearTimeout(libT); libT = setTimeout(() => FB.setDoc(FB.doc(FB.db, 'users', S.user.uid, 'meta', 'lib'), clone(S.lib)).catch(() => { }), 900); }
async function removeEvent(id) { delete S.events[id]; localSave(); if (S.mode === 'cloud') { try { await FB.deleteDoc(FB.doc(FB.db, 'users', S.user.uid, 'events', id)); } catch { } } }
function sync(t) { const el = $('#sync'); if (el) el.textContent = t; }
function loadLocal() {
  try { (JSON.parse(localStorage.getItem(LS_EV) || '[]')).forEach(e => { S.events[e.id] = e; }); } catch { }
  try { const l = JSON.parse(localStorage.getItem(LS_LIB) || 'null'); if (l) S.lib = { items: [], prices: {}, links: {}, ...l }; } catch { }
}
async function initFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) return null;
  const base = `https://www.gstatic.com/firebasejs/${FB_V}/`;
  const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const a = app.initializeApp(firebaseConfig);
  let db;
  try { db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); } catch { db = fs.getFirestore(a); }
  return { auth: auth.getAuth(a), db, GoogleAuthProvider: auth.GoogleAuthProvider, signInWithPopup: auth.signInWithPopup, signInWithRedirect: auth.signInWithRedirect, signOut: auth.signOut, onAuthStateChanged: auth.onAuthStateChanged, ...fs };
}
let unsubs = [];
function startCloud(user) {
  S.user = user; S.mode = 'cloud'; S.events = {};
  const col = FB.collection(FB.db, 'users', user.uid, 'events');
  let first = true;
  unsubs.push(FB.onSnapshot(col, snap => {
    snap.docChanges().forEach(ch => {
      const id = ch.doc.id; if (pend[id] || flying[id]) return;
      if (ch.type === 'removed') delete S.events[id]; else S.events[id] = clone(ch.doc.data());
    });
    if (first && !snap.metadata.fromCache) { first = false; migrateLocal(); }
    S.ready = true; sync('저장됨'); softRender();
  }, err => { console.warn(err); sync('불러오지 못했어요 — 보안 규칙·로그인을 확인해 주세요'); }));
  unsubs.push(FB.onSnapshot(FB.doc(FB.db, 'users', user.uid, 'meta', 'lib'), d => { if (d.exists()) S.lib = { items: [], prices: {}, links: {}, ...d.data() }; }));
}
function migrateLocal() {
  let old = []; try { old = JSON.parse(localStorage.getItem(LS_EV) || '[]'); } catch { }
  const add = old.filter(e => !S.events[e.id]);
  if (!add.length) return;
  add.forEach(e => { S.events[e.id] = e; flush(e.id); });
  try { localStorage.removeItem(LS_EV); } catch { }
  toast(`이 기기에 있던 모임 ${add.length}개를 계정으로 옮겼어요`);
}
function softRender() { const a = document.activeElement; if (!a || !/INPUT|TEXTAREA|SELECT/.test(a.tagName)) render(); }

/* ───────────── 화면: 공통 ───────────── */
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'e' && h[1]) { S.view = 'event'; S.cur = h[1]; S.tab = h[2] || S.tab || 'sum'; }
  else if (h[0] === 'new') { S.view = 'new'; if (!S.wiz) S.wiz = { step: 1, pkg: 'day', acts: [...PACKAGES.day.acts], rice: 'hb', ramen: 'cup', title: '', date: '', count: 15 }; }
  else if (h[0] === 'stats') S.view = 'stats';
  else if (h[0] === 'pool') S.view = 'pool';
  else S.view = 'home';
  render(); window.scrollTo(0, 0);
}
function go(p) { location.hash = '#/' + p; }
function render() {
  document.body.dataset.view = S.view;
  $('#nav').innerHTML = [['', '모임', 'M3 10.5 12 4l9 6.5V20H3z'], ['stats', '통계', 'M4 20V10M10 20V4M16 20v-7M22 20H2'], ['pool', '준비물 풀', 'M4 6h16M4 12h16M4 18h10']]
    .map(([k, n, d]) => `<a href="#/${k}" class="${(S.view === (k || 'home') || (k === '' && S.view === 'event')) ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${n}</span></a>`).join('');
  $('#acct').innerHTML = acctHtml();
  const app = $('#app');
  if (S.view === 'event' && !S.events[S.cur]) { app.innerHTML = S.ready || S.mode === 'local' ? `<div class="empty card">모임을 찾을 수 없어요. <a href="#/">목록으로</a></div>` : `<div class="empty">불러오는 중…</div>`; $('#bar').hidden = true; return; }
  app.innerHTML = ({ home: vHome, new: vNew, event: vEvent, stats: vStats, pool: vPool })[S.view]();
  if (S.view === 'event') bar(); else $('#bar').hidden = true;
}
function acctHtml() {
  if (S.mode === 'cloud' && S.user) return `<button class="acct-btn" data-act="acct" aria-label="계정">${S.user.photoURL ? `<img src="${esc(S.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((S.user.displayName || 'U')[0])}</button>`;
  return FB ? `<button class="btn sm" data-act="login">로그인</button>` : '';
}

/* ───────────── 화면: 홈 ───────────── */
function heroScene() {
  return `<div class="hero-art" aria-hidden="true">
  <svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2436"/><stop offset="1" stop-color="#3A3550"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFB45A" stop-opacity=".55"/><stop offset="1" stop-color="#FFB45A" stop-opacity="0"/></radialGradient></defs>
    <rect width="600" height="300" fill="url(#sky)"/>
    <g fill="#F4EBD9">${[[60, 40, 1.6], [140, 70, 1], [210, 30, 1.2], [330, 55, 1], [420, 25, 1.6], [520, 60, 1.1], [560, 30, .9], [270, 85, .8], [470, 90, .9], [95, 105, .8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
    <circle cx="500" cy="70" r="22" fill="#F4EBD9" opacity=".92"/><circle cx="510" cy="64" r="20" fill="#1F2739" opacity=".9"/>
    <path d="M0 210 L90 140 L160 190 L250 120 L340 185 L420 135 L520 195 L600 150 V300 H0z" fill="#2A3148"/>
    <path d="M0 240 L70 200 L150 232 L230 196 L320 236 L410 205 L500 238 L600 210 V300 H0z" fill="#232A3D"/>
    ${[40, 72, 560, 590].map((x, i) => `<path d="M${x} ${250 - i % 2 * 8} l14 -46 l14 46z" fill="#1A2030"/>`).join('')}
    <rect y="262" width="600" height="38" fill="#1A1F2C"/>
    <g transform="translate(118 200)"><path d="M0 64 L58 0 L116 64z" fill="#C0392B"/><path d="M58 0 L116 64 H82z" fill="#9B2C22"/><path d="M48 64 L58 30 L68 64z" fill="#2B1A16"/><path d="M-6 64h128" stroke="#5A3A2A" stroke-width="3"/></g>
    <circle cx="330" cy="250" r="70" fill="url(#glow)"/>
    <g transform="translate(330 262)"><path d="M-26 6 L26 -6 M-26 -6 L26 6" stroke="#7A4A2A" stroke-width="7" stroke-linecap="round"/>
    <path class="flame" d="M0 -58 C14 -38 22 -26 18 -12 C15 -2 8 2 0 2 C-8 2 -15 -2 -18 -12 C-22 -26 -10 -34 0 -58z" fill="#FF8A2B"/>
    <path class="flame f2" d="M0 -34 C7 -24 11 -18 9 -10 C7 -4 4 -2 0 -2 C-4 -2 -7 -4 -9 -10 C-11 -18 -5 -22 0 -34z" fill="#FFD36B"/></g>
    ${[[268, 268], [392, 268]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-14" y="-16" width="28" height="4" rx="2" fill="#3A4A6B"/><path d="M-12 -12 L-16 4 M12 -12 L16 4" stroke="#3A4A6B" stroke-width="3"/></g>`).join('')}
  </svg>
  <img class="hero-photo" src="img/hero-camp.png" alt="" onerror="this.remove()">
  <figure class="mascot"><img src="icons/character.png" alt="리듬하우스 캐릭터"><figcaption>장작은 챙기셨죠?</figcaption></figure>
  </div>`;
}
function eventCard(e) {
  const c = calc(e); const P = PACKAGES[e.pkg] || PACKAGES.day;
  const prog = c.buy.length ? Math.round(c.got / c.buy.length * 100) : 0;
  return `<article class="ev card" data-act="open" data-id="${esc(e.id)}" tabindex="0" role="link" aria-label="${esc(e.title || '제목 없는 모임')} 열기">
    <div class="ev-top"><span class="chip-s">${esc(P.n)}</span><span class="ev-date">${esc(fmtDate(e.date) || '날짜 미정')}</span></div>
    <h3>${esc(e.title || '제목 없는 모임')}</h3>
    <div class="ev-meta">${e.place && e.place.name ? esc(e.place.name) + ' · ' : ''}${c.ppl}명 · ${ACTS.filter(a => e.mods[a] === 'on').map(a => MOD[a].n).join(' · ') || '활동 미정'}</div>
    <div class="ev-nums"><div><small>예산</small><b>${won(c.real)}원</b></div><div><small>1인 회비</small><b>${won(c.fee)}원</b></div></div>
    <div class="meter" title="구매 진행 ${prog}%"><span style="width:${prog}%"></span></div>
    <div class="ev-foot"><span>구매 ${c.got}/${c.buy.length}</span><span>짐 ${c.packed}/${c.bring.length + c.duty.length}</span></div>
  </article>`;
}
function vHome() {
  const evs = Object.values(S.events).sort((a, b) => (b.date || '9').localeCompare(a.date || '9') || b.updated - a.updated);
  const today = new Date().toISOString().slice(0, 10);
  const up = evs.filter(e => !e.date || e.date >= today), past = evs.filter(e => e.date && e.date < today);
  return `<section class="hero">
    ${heroScene()}
    <div class="hero-txt"><h1>모임 준비,<br>한 번에 끝내기</h1>
    <p>패키지와 활동을 고르면 준비물이 채워지고, 체크한 만큼 예산과 1인 회비가 계산돼요.</p>
    <button class="btn pri lg" data-act="new">+ 새 모임 만들기</button>
    ${S.mode === 'local' ? `<p class="note">${FB ? '지금은 이 기기에만 저장돼요. <button class="link" data-act="login">구글로 로그인</button>하면 폰·컴퓨터 어디서나 이어서 써요.' : '이 기기에 저장 중'}</p>` : ''}</div>
  </section>
  ${evs.length ? `<h2 class="sec-h">다가오는 모임 <span>${up.length}</span></h2>
    ${up.length ? `<div class="grid">${up.map(eventCard).join('')}</div>` : `<p class="hint">다가오는 모임이 없어요.</p>`}
    ${past.length ? `<h2 class="sec-h">지난 모임 <span>${past.length}</span></h2><div class="grid">${past.map(eventCard).join('')}</div>` : ''}`
    : `<div class="card empty"><b>아직 모임이 없어요</b><p>‘새 모임 만들기’로 첫 모임을 준비해 보세요. 지난 모임은 복사해서 다시 쓸 수 있어요.</p></div>`}`;
}

/* ───────────── 화면: 새 모임 마법사 ───────────── */
function vNew() {
  const w = S.wiz;
  const steps = ['어디서', '무엇을', '기본 정보'];
  const head = `<div class="wiz-head"><a href="#/" class="back" aria-label="닫기">✕</a><ol class="steps">${steps.map((s, i) => `<li class="${w.step === i + 1 ? 'on' : w.step > i + 1 ? 'done' : ''}"><i>${i + 1}</i>${s}</li>`).join('')}</ol></div>`;
  let body = '';
  if (w.step === 1) body = `<h1>어떤 모임인가요?</h1><p class="sub">바탕 패키지가 공통 준비물(잠자리·주방·식기·안전 등)을 정해요.</p>
    <div class="pkgs">${Object.entries(PACKAGES).map(([k, p]) => `<button class="pkg" aria-pressed="${w.pkg === k}" data-act="wpkg" data-k="${k}">${pkgIcon(k)}<b>${p.n}</b><small>${p.d}</small></button>`).join('')}</div>`;
  if (w.step === 2) body = `<h1>무엇을 하나요?</h1><p class="sub">고른 활동의 준비물이 더해져요. 나중에도 바꿀 수 있어요.</p>
    <div class="chips">${ACTS.map(a => chip(w.acts.includes(a), 'wact', a, MOD[a].n, MOD[a].c)).join('')}</div>
    ${w.acts.includes('rice') ? `<div class="var"><span>밥은</span>${VARIANTS.rice.map(([v, n]) => `<button class="seg ${w.rice === v ? 'on' : ''}" data-act="wvar" data-k="rice" data-v="${v}">${n}</button>`).join('')}</div>` : ''}
    ${w.acts.includes('ramen') ? `<div class="var"><span>라면은</span>${VARIANTS.ramen.map(([v, n]) => `<button class="seg ${w.ramen === v ? 'on' : ''}" data-act="wvar" data-k="ramen" data-v="${v}">${n}</button>`).join('')}</div>` : ''}
    ${(w.acts.includes('fire') || w.acts.includes('bbqgear')) ? `<p class="hint">불을 쓰는 활동이라 소화기·장갑이 함께 체크돼요.</p>` : ''}`;
  if (w.step === 3) {
    const prev = newEvent(w); const c = calc(prev);
    body = `<h1>기본 정보</h1><p class="sub">인원에 맞춰 수량이 자동으로 잡혀요. 그룹별 인원은 모임 안에서 나눌 수 있어요.</p>
    <div class="form">
      <label class="f wide">모임 제목<input class="i" id="w-title" data-w="title" value="${esc(w.title)}" placeholder="예: 중2 여학생 리트릿"></label>
      <label class="f">날짜<input class="i" type="date" id="w-date" data-w="date" value="${esc(w.date)}"></label>
      <label class="f">예상 인원<span class="stepper"><button data-act="wcnt" data-d="-1" aria-label="한 명 빼기">−</button><input id="w-count" data-w="count" value="${esc(w.count)}" inputmode="numeric"><button data-act="wcnt" data-d="1" aria-label="한 명 더하기">+</button></span></label>
    </div>
    <div class="preview card"><div><small>불러올 준비물</small><b id="w-n">${c.on.length}개</b></div><div><small>살 것</small><b id="w-b">${c.buy.length}개</b></div><div><small>예상 예산</small><b id="w-e">${won(c.est)}원</b></div></div>`;
  }
  const foot = `<div class="wiz-foot">${w.step > 1 ? `<button class="btn" data-act="wstep" data-d="-1">이전</button>` : '<span></span>'}
    ${w.step < 3 ? `<button class="btn pri" data-act="wstep" data-d="1">다음</button>` : `<button class="btn pri" data-act="wmake">준비물 불러오기</button>`}</div>`;
  return `<div class="wiz">${head}<div class="wiz-body">${body}</div>${foot}</div>`;
}
function pkgIcon(k) {
  const d = { full: '<path d="M4 20 L12 6 L20 20z"/><path d="M12 6v14M2 20h20"/>', light: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 10 L12 4 L21 10"/>', day: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 1-8z"/><path d="M6 21h12"/>', picnic: '<path d="M3 18h18M6 18l3-8h6l3 8"/><circle cx="12" cy="6" r="2"/>', indoor: '<path d="M4 11 L12 4 L20 11V20H4z"/><path d="M10 20v-5h4v5"/>' }[k];
  return `<svg class="pk-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}
function chip(on, act, k, n, color, extra) { return `<button class="chip" aria-pressed="${on}" data-act="${act}" data-k="${k}"><span class="ck" style="--c:${color || 'var(--accent)'}">${on ? '✓' : ''}</span>${esc(n)}${extra ? ` <span class="n">${esc(extra)}</span>` : ''}</button>`; }

/* ───────────── 화면: 모임 ───────────── */
const TABS = [['sum', '한눈에'], ['items', '준비물'], ['plan', '인원·일정'], ['notice', '공지·정산']];
function vEvent() {
  const e = S.events[S.cur]; const P = PACKAGES[e.pkg] || PACKAGES.day;
  return `<div class="ev-head">
    <a href="#/" class="back" aria-label="목록으로">←</a>
    <div class="ev-title"><input class="title-in" id="f-title" data-f="title" value="${esc(e.title)}" placeholder="모임 제목" aria-label="모임 제목">
    <p class="sub" id="ev-sub">${esc(P.n)}${e.date ? ' · ' + esc(fmtDate(e.date)) : ''} · ${pplOf(e)}명</p></div>
    <div class="ev-tools"><button class="btn sm" data-act="dup">복사</button><button class="btn sm ghost" data-act="del">삭제</button></div>
  </div>
  <nav class="tabs" role="tablist">${TABS.map(([k, n]) => `<a role="tab" href="#/e/${esc(e.id)}/${k}" aria-selected="${S.tab === k}">${n}</a>`).join('')}</nav>
  <div class="layout ${S.tab === 'sum' || S.tab === 'notice' ? 'wide' : ''}"><section id="pane">${({ sum: tSum, items: tItems, plan: tPlan, notice: tNotice })[S.tab](e)}</section>
  ${S.tab === 'sum' || S.tab === 'notice' ? '' : `<aside class="aside" id="aside">${budgetCard(e)}</aside>`}</div>`;
}
function donut(parts, total, size = 160) {
  const r = 60, C = 2 * Math.PI * r; let off = 0;
  const segs = parts.map(p => { const len = total ? p.v / total * C : 0; const s = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${MOD[p.k].c}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 80 80)"/>`; off += len; return s; }).join('');
  return `<svg class="donut" viewBox="0 0 160 160" width="${size}" height="${size}" role="img" aria-label="준비물 그룹별 예산"><circle r="${r}" cx="80" cy="80" fill="none" stroke="var(--line)" stroke-width="22"/>${segs}<text x="80" y="76" text-anchor="middle" class="d-l">예산</text><text x="80" y="96" text-anchor="middle" class="d-v">${total >= 1e6 ? (total / 1e4).toFixed(0) + '만' : won(total)}</text></svg>`;
}
function budgetCard(e) {
  const c = calc(e); const tot = c.real || 1;
  return `<div class="card budget">
    <div class="b-total"><small>예산 합계${c.actualN ? ` · 실제 금액 ${c.actualN}개 반영` : ''}</small><b data-c="total">${won(c.real)}원</b>${c.real !== c.est ? `<span class="note">처음 예상 ${won(c.est)}원</span>` : ''}</div>
    <div class="stack-bar" aria-hidden="true">${c.byMod.map(x => `<span style="width:${x.v / tot * 100}%;background:${MOD[x.k].c}"></span>`).join('')}</div>
    <div class="kpis"><div><small>1인당 (÷${c.payers}명)</small><b>${won(c.per)}원</b></div><div class="hl"><small>1인 회비</small><b>${won(c.fee)}원</b></div><div><small>모을 회비</small><b>${won(c.collect)}원</b></div><div><small>남는 돈</small><b class="${c.bal < 0 ? 'bad' : 'good'}">${c.bal < 0 ? '−' : ''}${won(Math.abs(c.bal))}원</b></div></div>
    <div class="fee-line"><label>회비 직접 정하기<input class="i" id="f-fee" data-f="fee.manual" value="${esc(has(e.fee.manual) ? won(e.fee.manual) : '')}" inputmode="numeric" placeholder="자동"></label>
    <label>올림 단위<select class="i" data-f="fee.round" data-ch="1">${[100, 1000, 5000, 10000].map(r => `<option value="${r}" ${num(e.fee.round) === r ? 'selected' : ''}>${won(r)}원</option>`).join('')}</select></label></div>
    <ul class="checks"><li><span>구매</span><b>${c.got}/${c.buy.length}</b></li><li><span>짐 챙기기</span><b>${c.packed}/${c.bring.length + c.duty.length}</b></li>${c.noPrice ? `<li class="warn"><span>가격 미입력</span><b>${c.noPrice}개</b></li>` : ''}${c.noWho ? `<li class="warn"><span>담당 미정</span><b>${c.noWho}개</b></li>` : ''}</ul>
  </div>`;
}
function bar() { const e = S.events[S.cur]; const c = calc(e); const b = $('#bar'); b.hidden = false; b.innerHTML = `<div><small>예산 합계</small><b>${won(c.real)}원</b></div><div class="r"><small>1인 회비 (÷${c.payers}명)</small><b>${won(c.fee)}원</b></div>`; }

/* 한눈에 */
function tSum(e) {
  const c = calc(e);
  const missed = c.on.filter(i => OFTEN_MISSED.some(w => i.name.includes(w)));
  const mods = MODULES.filter(m => c.on.some(i => i.mod === m.k));
  const buyRows = mods.map(m => { const its = c.buy.filter(i => i.mod === m.k); if (!its.length) return ''; const sub = its.reduce((a, i) => a + valOf(i), 0);
    return `<tr class="grp-row"><th colspan="4"><span class="dot" style="background:${m.c}"></span>${esc(m.n)}</th><td class="num">${won(sub)}</td></tr>` + its.map(i => `<tr><td>${esc(i.name)}${i.shop ? ` <span class="muted">· ${esc(i.shop)}</span>` : ''}</td><td class="num">${qtyTxt(i.qty)}${esc(i.unit)}</td><td class="num">${num(i.price) ? won(i.price) : '<span class="warn-t">미입력</span>'}</td><td class="st">${esc(i.st || '주문 전')}</td><td class="num">${has(i.actual) ? `<b>${won(i.actual)}</b>` : won(num(i.price) * num(i.qty))}</td></tr>`).join(''); }).join('');
  const bringRows = mods.map(m => { const its = [...c.bring, ...c.duty].filter(i => i.mod === m.k); if (!its.length) return '';
    return `<tr class="grp-row"><th colspan="3"><span class="dot" style="background:${m.c}"></span>${esc(m.n)}</th></tr>` + its.map(i => `<tr><td>${i.packed ? '☑' : '☐'} ${esc(i.name)}${i.kind === 'd' ? ' <span class="chip-s">담당</span>' : ''}</td><td class="num">${qtyTxt(i.qty)}${esc(i.unit)}</td><td>${esc(i.who) || (i.kind === 'd' ? '<span class="warn-t">담당 미정</span>' : '<span class="muted">주최자</span>')}</td></tr>`).join(''); }).join('');
  return `<div class="sum">
  <div class="sum-top">
    <div class="card kpi-card">
      <div class="big"><small>예산 합계</small><b>${won(c.real)}<i>원</i></b>${c.real !== c.est ? `<span class="note">처음 예상 ${won(c.est)}원 · 실제 금액 ${c.actualN}개 반영</span>` : ''}</div>
      <div class="kpis four"><div class="hl"><small>1인 회비</small><b>${won(c.fee)}원</b></div><div><small>1인당 실제</small><b>${won(c.per)}원</b></div><div><small>모을 회비 (${c.payers}명)</small><b>${won(c.collect)}원</b></div><div><small>남는 돈</small><b class="${c.bal < 0 ? 'bad' : 'good'}">${c.bal < 0 ? '−' : ''}${won(Math.abs(c.bal))}원</b></div></div>
      <div class="progress">${prog('구매', c.got, c.buy.length)}${prog('주문', c.ordered, c.buy.length)}${prog('짐 챙기기', c.packed, c.bring.length + c.duty.length)}</div>
      ${c.noPrice || c.noWho ? `<p class="alert">${c.noPrice ? `가격이 없는 살 것 ${c.noPrice}개` : ''}${c.noPrice && c.noWho ? ' · ' : ''}${c.noWho ? `담당자가 정해지지 않은 것 ${c.noWho}개` : ''} — <a href="#/e/${esc(e.id)}/items">준비물에서 채우기</a></p>` : ''}
    </div>
    <div class="card donut-card">${donut(c.byMod, c.real)}
      <ul class="legend">${c.byMod.length ? c.byMod.map(x => `<li><span class="dot" style="background:${MOD[x.k].c}"></span><span>${esc(MOD[x.k].n)}</span><b>${won(x.v)}원</b><i>${Math.round(x.v / (c.real || 1) * 100)}%</i></li>`).join('') : '<li class="muted">살 것을 체크하면 그룹별 비중이 보여요</li>'}</ul></div>
  </div>
  <div class="card facts">${[['날짜', fmtDate(e.date) || '미정'], ['장소', e.place.name || '미정'], ['인원', `${c.ppl}명 (회비 ${c.payers}명)`], ['출발', e.move.mode === 'bus' ? (e.move.depart || e.start || '미정') : '각자 이동'], ['활동', ACTS.filter(a => e.mods[a] === 'on').map(a => MOD[a].n).join(', ') || '없음']].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
  <div class="sum-cols">
    <div class="card tbl-card"><div class="tbl-h"><h3>살 것 · ${c.buy.length}개</h3><b>${won(c.real)}원</b></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>품목</th><th class="num">수량</th><th class="num">단가</th><th>상태</th><th class="num">금액</th></tr></thead><tbody>${buyRows || '<tr><td colspan="5" class="muted">체크한 살 것이 없어요</td></tr>'}</tbody>
      <tfoot><tr><th colspan="4">합계</th><td class="num"><b>${won(c.real)}</b></td></tr></tfoot></table></div></div>
    <div class="stack">
      <div class="card tbl-card"><div class="tbl-h"><h3>챙길 것 · ${c.bring.length + c.duty.length}개</h3><b>${c.packed} 완료</b></div>
        <div class="scroll"><table class="tbl"><thead><tr><th>품목</th><th class="num">수량</th><th>누가</th></tr></thead><tbody>${bringRows || '<tr><td colspan="3" class="muted">없음</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>개인 준비물 <span class="muted">· 공지에 들어가요</span></h3><p class="pills">${c.personal.map(i => `<span>${esc(i.name)}</span>`).join('') || '<span class="muted">없음</span>'}</p></div>
      <div class="card"><h3>출발 전 마지막 확인</h3><p class="hint">현장에서 다시 사러 나가게 만드는 작은 것들</p>
        <ul class="miss">${missed.map(i => { const ok = i.kind === 'b' ? (i.st === '받음' || i.st === '현장 결제') : i.packed; return `<li class="${ok ? 'ok' : ''}"><span>${ok ? '✓' : '·'}</span>${esc(i.name)}</li>`; }).join('') || '<li class="muted">해당 품목 없음</li>'}</ul></div>
    </div>
  </div>
  <div class="print-row"><button class="btn" data-act="print">정리표 인쇄</button></div>
  </div>`;
}
function prog(n, a, b) { const p = b ? Math.round(a / b * 100) : 0; return `<div class="pg"><span>${n}</span><div class="meter"><span style="width:${p}%"></span></div><b>${a}/${b}</b></div>`; }

/* 준비물 */
function tItems(e) {
  const c = calc(e); const q = S.q.trim();
  const shown = MODULES.filter(m => e.mods[m.k] !== 'off');
  const offs = MODULES.filter(m => e.mods[m.k] === 'off');
  const filt = i => visible(e, i) && (S.filter === 'all' || i.kind === S.filter || (S.filter === 'k' && i.kind === 'd')) && (!q || i.name.includes(q));
  return `<div class="toolbar">
    <div class="segs" role="group" aria-label="종류">${[['all', '전체'], ['b', '살 것'], ['k', '챙길 것'], ['p', '개인']].map(([k, n]) => `<button class="seg ${S.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${n}</button>`).join('')}</div>
    <input class="i search" id="q" data-q="1" value="${esc(S.q)}" placeholder="품목 찾기" aria-label="품목 찾기">
  </div>
  <div class="mods">${shown.map(m => {
    const its = e.items.filter(i => i.mod === m.k && filt(i)); if (!its.length && (q || S.filter !== 'all')) return '';
    const all = e.items.filter(i => i.mod === m.k && visible(e, i)); const onN = all.filter(i => i.on).length;
    const sub = c.buy.filter(i => i.mod === m.k).reduce((a, i) => a + valOf(i), 0); const fold = S.fold[m.k];
    return `<section class="card mod">
      <header class="mod-h"><button class="fold" data-act="fold" data-k="${m.k}" aria-expanded="${!fold}"><span class="dot" style="background:${m.c}"></span><h3>${esc(m.n)}</h3><span class="muted">${onN}/${all.length}</span></button>
      <span class="mod-sum" data-c="sub-${m.k}">${sub ? won(sub) + '원' : ''}</span>
      <button class="btn xs ghost" data-act="modoff" data-k="${m.k}" title="이 그룹 끄기">끄기</button></header>
      ${fold ? '' : `${m.k in VARIANTS ? `<div class="var in">${VARIANTS[m.k].map(([v, n]) => `<button class="seg ${e.variants[m.k] === v ? 'on' : ''}" data-act="var" data-k="${m.k}" data-v="${v}">${n}</button>`).join('')}</div>` : ''}
      <div class="rows">${its.filter(i => i.on).map(i => row(i, e)).join('')}${(() => { const off = its.filter(i => !i.on); if (!off.length) return ''; return (S.more[m.k] || q) ? `<div class="off-list">${off.map(i => row(i, e)).join('')}</div>${q ? '' : `<button class="more-off" data-act="more" data-k="${m.k}">선택 품목 접기</button>`}` : `<button class="more-off" data-act="more" data-k="${m.k}">+ 선택 품목 ${off.length}개 보기 <span>${esc(off.slice(0, 3).map(i => i.name).join(', '))}${off.length > 3 ? ' …' : ''}</span></button>`; })()}</div>
      <div class="add"><button class="btn xs ghost" data-act="iadd" data-k="${m.k}">+ 항목 추가</button></div>`}
    </section>`;
  }).join('')}</div>
  ${offs.length ? `<div class="card more"><h3>더 넣을 그룹</h3><div class="chips">${offs.map(m => chip(false, 'modon', m.k, m.n, m.c)).join('')}</div></div>` : ''}`;
}
function row(i, e) {
  if (!i.on) return `<div class="it off"><div class="it-1"><input type="checkbox" class="cb" data-f="items.${i.id}.on" data-ch="1" aria-label="${esc(i.name)} 넣기"><span class="nm-s">${esc(i.name)}${i.note ? ` <small>${esc(i.note)}</small>` : ''}</span><span class="amt muted">${i.kind === 'b' ? (num(i.price) ? won(num(i.price) * num(i.qty)) + '원' : '') : KIND[i.kind]}</span></div></div>`;
  const open = S.open[i.id]; const est = num(i.price) * num(i.qty); const u = String(i.link || '').trim();
  const kindBadge = i.kind === 'b' ? '' : `<span class="kb k-${i.kind}">${KIND[i.kind]}</span>`;
  return `<div class="it ${i.on ? '' : 'off'}">
  <div class="it-1"><input type="checkbox" class="cb" data-f="items.${i.id}.on" data-ch="1" ${i.on ? 'checked' : ''} aria-label="${esc(i.name)} 넣기">
    <input class="nm" id="n-${i.id}" data-f="items.${i.id}.name" value="${esc(i.name)}" aria-label="품목 이름">
    <span class="amt" data-c="amt-${i.id}">${amtHtml(i)}</span></div>
  <div class="it-2">
    <span class="qty"><input class="i q" id="q-${i.id}" data-f="items.${i.id}.qty" value="${esc(qtyTxt(i.qty))}" inputmode="decimal" aria-label="수량"><em>${esc(i.unit || '개')}</em>${i.rule ? `<button class="auto ${i.auto ? 'on' : ''}" data-act="auto" data-id="${i.id}" title="${esc(ruleTxt(i.rule, i.unit))}">${i.auto ? '자동' : '자동으로'}</button>` : ''}</span>
    ${i.kind === 'b' ? `<span class="x">×</span><input class="i pr" id="p-${i.id}" data-f="items.${i.id}.price" value="${num(i.price) ? won(i.price) : ''}" inputmode="numeric" placeholder="단가" aria-label="단가">
      <button class="stc s-${['', '주문함', '받음', '현장 결제'].indexOf(i.st || '')}" data-act="st" data-id="${i.id}" title="누를 때마다 주문 전 → 주문함 → 받음 → 현장 결제">${esc(i.st || '주문 전')}</button>`
      : i.kind === 'p' ? '' : `<input class="i who" id="w-${i.id}" data-f="items.${i.id}.who" value="${esc(i.who)}" placeholder="${i.kind === 'd' ? '누가 준비하나요?' : '누가 (비우면 주최자)'}" aria-label="가져올 사람">
      <button class="stc ${i.packed ? 's-2' : ''}" data-act="pack" data-id="${i.id}">${i.packed ? '✓ 챙김' : '챙기기 전'}</button>`}
    ${kindBadge}${i.shop ? `<span class="kb">${esc(i.shop)}</span>` : ''}
    <button class="btn xs ghost more-b" data-act="det" data-id="${i.id}" aria-expanded="${!!open}">${open ? '접기' : '자세히'}</button>
  </div>
  ${open ? `<div class="det">
    <label class="f wide">구매 링크<span class="linkrow"><input class="i" id="l-${i.id}" data-f="items.${i.id}.link" value="${esc(i.link)}" placeholder="쿠팡·네이버 상품 주소 붙여넣기" inputmode="url">${okUrl(u) ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">열기</a>` : ''}</span></label>
    ${i.kind === 'b' ? `<label class="f">실제 결제 금액 (전체)<input class="i" id="a-${i.id}" data-f="items.${i.id}.actual" value="${has(i.actual) ? won(i.actual) : ''}" inputmode="numeric" placeholder="${est ? won(est) : '금액'}"></label>` : ''}
    <label class="f">구매처<input class="i" id="s-${i.id}" data-f="items.${i.id}.shop" value="${esc(i.shop)}" placeholder="링크를 넣으면 자동"></label>
    <label class="f">종류<select class="i" data-f="items.${i.id}.kind" data-ch="1">${Object.entries(KIND).map(([k, n]) => `<option value="${k}" ${i.kind === k ? 'selected' : ''}>${n}${k === 'd' ? ' (0원)' : ''}</option>`).join('')}</select></label>
    ${i.kind === 'd' ? '' : ''}
    <label class="f">단위<input class="i" id="u-${i.id}" data-f="items.${i.id}.unit" value="${esc(i.unit)}" placeholder="개"></label>
    <label class="f wide">메모<input class="i" id="m-${i.id}" data-f="items.${i.id}.note" value="${esc(i.note)}" placeholder="규격·브랜드·주의사항"></label>
    ${i.rule ? `<p class="hint wide">수량 기준: ${esc(ruleTxt(i.rule, i.unit))} — 인원이 바뀌면 자동으로 다시 계산돼요${i.auto ? '' : ' (지금은 직접 정한 수량)'}</p>` : ''}
    <div class="wide row-end"><button class="btn xs ghost danger" data-act="idel" data-id="${i.id}">이 항목 지우기</button></div></div>` : ''}
  </div>`;
}
function amtHtml(i) {
  if (i.kind === 'd') return `<span class="muted">${esc(i.who || '담당')}</span>`;
  if (i.kind === 'k') return i.packed ? '<span class="good">챙김</span>' : '<span class="muted">0원</span>';
  if (i.kind === 'p') return '<span class="muted">개인</span>';
  const est = num(i.price) * num(i.qty);
  if (has(i.actual)) return `${num(i.actual) !== est && est ? `<s>${won(est)}</s>` : ''}${won(i.actual)}원`;
  return est ? `${won(est)}원` : '<span class="warn-t">가격 입력</span>';
}

/* 인원·일정 */
function tPlan(e) {
  const c = calc(e); const m = e.move; const tt = times(e); const over = m.mode === 'bus' && c.ppl > num(e.cap);
  return `<div class="stack">
  <div class="card"><h3>모임 구성</h3>
    <div class="pkgs mini">${Object.entries(PACKAGES).map(([k, p]) => `<button class="pkg" aria-pressed="${e.pkg === k}" data-act="pkg" data-k="${k}">${pkgIcon(k)}<b>${p.n}</b></button>`).join('')}</div>
    <p class="lbl">활동</p><div class="chips">${ACTS.map(a => chip(e.mods[a] === 'on', 'act', a, MOD[a].n, MOD[a].c)).join('')}</div>
    <p class="hint">패키지를 바꾸면 공통 그룹의 켜짐/끔이 바뀌고, 이미 넣은 항목은 그대로 남아요.</p></div>
  <div class="card"><h3>기본 정보</h3><div class="form">
    <label class="f">날짜<input class="i" type="date" id="f-date" data-f="date" value="${esc(e.date)}"></label>
    <label class="f">대상<input class="i" id="f-target" data-f="target" value="${esc(e.target)}" placeholder="예: 조이코너 교사"></label>
    <label class="f">장소 이름<input class="i" id="f-pn" data-f="place.name" value="${esc(e.place.name)}" placeholder="예: 해미읍성역사캠핑장"></label>
    <label class="f">주소<input class="i" id="f-pa" data-f="place.addr" value="${esc(e.place.addr)}"></label>
    <label class="f wide">지도 링크<input class="i" id="f-pm" data-f="place.map" value="${esc(e.place.map)}" placeholder="https://naver.me/…" inputmode="url"></label>
    <label class="f">이동 방식<select class="i" data-f="move.mode" data-ch="1"><option value="bus" ${m.mode === 'bus' ? 'selected' : ''}>차량 운행</option><option value="self" ${m.mode === 'self' ? 'selected' : ''}>각자 이동</option></select></label>
    ${m.mode === 'bus' ? `<label class="f">차량<input class="i" id="f-mv" data-f="move.vehicle" value="${esc(m.vehicle)}"></label>
    <label class="f">운전자<input class="i" id="f-md" data-f="move.driver" value="${esc(m.driver)}"></label>
    <label class="f">편도 이동 (분)<input class="i" id="f-mt" data-f="move.mins" value="${esc(m.mins)}" inputmode="numeric"></label>
    <label class="f">출발 시각<input class="i" type="time" id="f-dp" data-f="move.depart" value="${esc(m.depart)}"></label>
    <label class="f">집결 안내<input class="i" id="f-mt2" data-f="move.meet" value="${esc(m.meet)}" placeholder="10분 전까지 교육관 주차장"></label>` : ''}
  </div></div>
  <div class="card"><h3>인원 <span class="muted">· 총 <b data-c="ppl">${c.ppl}</b>명, 회비 <b data-c="payers">${c.payers}</b>명</span></h3>
    <div class="ppl">${e.people.map(p => `<div class="prow"><input class="i" id="pn-${p.id}" data-f="people.${p.id}.name" value="${esc(p.name)}" aria-label="그룹 이름">
      <span class="stepper"><button data-act="pc" data-id="${p.id}" data-d="-1" aria-label="한 명 빼기">−</button><input id="pc-${p.id}" data-f="people.${p.id}.count" value="${esc(p.count)}" inputmode="numeric" aria-label="인원"><button data-act="pc" data-id="${p.id}" data-d="1" aria-label="한 명 더하기">+</button></span>
      <label class="pk"><input type="checkbox" data-f="people.${p.id}.pays" data-ch="1" ${p.pays ? 'checked' : ''}>회비 냄</label>
      <button class="btn xs ghost" data-act="pdel" data-id="${p.id}" aria-label="그룹 삭제">✕</button></div>`).join('')}</div>
    <div class="row-btns"><button class="btn sm" data-act="padd">+ 그룹 추가</button>${m.mode === 'bus' ? `<label class="cap">차량 정원<input class="i" id="f-cap" data-f="cap" value="${esc(e.cap)}" inputmode="numeric"></label><span data-c="capw" class="${over ? 'warn-t' : 'muted'}">${over ? `정원보다 ${c.ppl - num(e.cap)}명 많아요` : '정원 안이에요'}</span>` : ''}</div>
    <p class="hint">인원을 바꾸면 ‘자동’ 수량 품목이 함께 다시 계산돼요.</p></div>
  <div class="card"><h3>시간 계획</h3>
    <label class="cap">시작<input class="i" type="time" id="f-start" data-f="start" value="${esc(e.start)}"></label>
    <div class="sch">${e.sched.map((s, k) => `<div class="srow"><span class="tm" data-c="tm-${s.id}">${tt[k][0]}–${tt[k][1]}</span>
      <input class="i" id="sl-${s.id}" data-f="sched.${s.id}.label" value="${esc(s.label)}" aria-label="내용">
      <label class="mins"><input class="i" id="sm-${s.id}" data-f="sched.${s.id}.mins" value="${esc(s.mins)}" inputmode="numeric" aria-label="소요 분">분</label>
      <span class="tools"><button class="btn xs ghost" data-act="sup" data-id="${s.id}" aria-label="위로">↑</button><button class="btn xs ghost" data-act="sdn" data-id="${s.id}" aria-label="아래로">↓</button><button class="btn xs ghost" data-act="sdel" data-id="${s.id}" aria-label="삭제">✕</button></span></div>`).join('')}</div>
    <button class="btn sm" data-act="sadd">+ 순서 추가</button></div>
  <div class="card"><h3>공지 메모</h3><label class="f wide">공지에 덧붙일 말 (입금 안내 등)<textarea class="i" id="f-memo" data-f="memo">${esc(e.memo)}</textarea></label></div>
  </div>`;
}

/* 공지·정산 */
function noticeText(e) {
  const c = calc(e), L = [], s = k => e.secs.includes(k);
  L.push(`■ ${e.title || '모임'}${e.date ? '  ' + fmtDate(e.date) : ''}`); if (e.target) L.push(`대상: ${e.target}`); L.push('');
  if (s('place') && (e.place.name || e.place.addr)) { L.push('[장소]'); if (e.place.name) L.push('· ' + e.place.name); if (e.place.addr) L.push('· ' + e.place.addr); if (e.place.map) L.push('· 지도: ' + e.place.map); L.push(''); }
  if (s('move')) { L.push('[이동]'); if (e.move.mode === 'self') L.push('· 각자 자유롭게 와 주세요'); else { L.push(`· ${e.move.vehicle || '차량'}${e.move.driver ? ` (운전: ${e.move.driver})` : ''}`); if (e.move.mins) L.push(`· 이동 시간: 약 ${e.move.mins}분 (편도)`); if (e.move.depart) L.push(`· 출발: ${e.move.depart}${e.move.meet ? ` (${e.move.meet})` : ''}`); } L.push(''); }
  if (s('people')) { L.push('[인원]'); e.people.forEach(p => L.push(`· ${p.name}: ${num(p.count)}명`)); L.push(`· 총 ${c.ppl}명`, ''); }
  if (s('time') && e.sched.length) { L.push('[시간 계획]'); const tt = times(e); e.sched.forEach((x, k) => L.push(`${tt[k][0]}~${tt[k][1]}  ${x.label}`)); L.push(''); }
  if (s('fee')) L.push(`[회비] 1인 ${won(c.fee)}원`);
  if (s('personal') && c.personal.length) L.push(`[개인 준비물] ${c.personal.map(i => i.name).join(', ')}`);
  const duty = [...c.duty, ...c.bring.filter(i => i.who)];
  if (s('duty') && duty.length) { L.push('', '[담당]'); duty.forEach(i => L.push(`· ${i.name} — ${i.who || '담당자 미정'}`)); }
  if (e.memo) L.push('', e.memo);
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function settleText(e) {
  const c = calc(e), L = [`■ ${e.title || '모임'} 예산·정산${e.date ? ' (' + fmtDate(e.date) + ')' : ''}`, ''];
  MODULES.forEach(m => { const its = c.buy.filter(i => i.mod === m.k); if (!its.length) return; L.push(`[${m.n}] ${won(its.reduce((a, i) => a + valOf(i), 0))}원`); its.forEach(i => L.push(`· ${i.name} ${won(num(i.price))}×${qtyTxt(i.qty)}${has(i.actual) ? ` → 실제 ${won(i.actual)}원` : ` = ${won(num(i.price) * num(i.qty))}원`}${i.shop ? ` (${i.shop})` : ''}`)); L.push(''); });
  L.push(`합계: ${won(c.real)}원`, `회비: 1인 ${won(c.fee)}원 × ${c.payers}명 = ${won(c.collect)}원`, `남는 돈: ${c.bal < 0 ? '−' : ''}${won(Math.abs(c.bal))}원`);
  return L.join('\n');
}
function tNotice(e) {
  return `<div class="two">
  <div class="card"><h3>참석자 공지 <span class="muted">· 카톡용</span></h3>
    <div class="chips sm">${SECS.map(([k, n]) => chip(e.secs.includes(k), 'sec', k, n)).join('')}</div>
    <textarea class="i txt" id="nt" aria-label="공지 문구">${esc(noticeText(e))}</textarea>
    <div class="row-btns"><button class="btn pri" data-act="copy" data-k="nt">공지 복사</button></div></div>
  <div class="card"><h3>예산·정산표 <span class="muted">· 운영자용</span></h3>
    <textarea class="i txt" id="st" aria-label="정산 문구">${esc(settleText(e))}</textarea>
    <div class="row-btns"><button class="btn" data-act="copy" data-k="st">정산표 복사</button><a class="btn" href="#/e/${esc(e.id)}/sum">한눈에 보기 · 인쇄</a></div></div>
  </div>`;
}

/* ───────────── 화면: 통계 ───────────── */
function vStats() {
  const evs = Object.values(S.events).filter(e => e.items).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!evs.length) return `<h1>통계</h1><div class="card empty">모임을 만들면 전체 지출과 품목 통계가 여기에 모여요.</div>`;
  const C = evs.map(e => ({ e, c: calc(e) }));
  const total = C.reduce((a, x) => a + x.c.real, 0), ppl = C.reduce((a, x) => a + x.c.ppl, 0);
  const avgFee = C.length ? C.reduce((a, x) => a + x.c.fee, 0) / C.length : 0;
  const byMod = MODULES.map(m => ({ k: m.k, v: C.reduce((a, x) => a + x.c.buy.filter(i => i.mod === m.k).reduce((s, i) => s + valOf(i), 0), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const maxM = byMod[0] ? byMod[0].v : 1;
  const top = {}; C.forEach(x => x.c.buy.forEach(i => { const k = i.name; top[k] = top[k] || { n: k, v: 0, cnt: 0, mod: i.mod }; top[k].v += valOf(i); top[k].cnt++; }));
  const tops = Object.values(top).sort((a, b) => b.v - a.v).slice(0, 10); const maxT = tops[0] ? tops[0].v : 1;
  const maxE = Math.max(...C.map(x => x.c.real), 1);
  return `<h1>통계</h1><p class="sub">지금까지 준비한 모임 ${evs.length}개를 모았어요. 실제 금액을 넣은 품목은 실제 금액으로 셉니다.</p>
  <div class="kpi-row">${[['모임', evs.length + '개'], ['총 지출', won(total) + '원'], ['연인원', ppl + '명'], ['평균 1인 회비', won(avgFee) + '원']].map(([k, v]) => `<div class="card kpi"><small>${k}</small><b>${v}</b></div>`).join('')}</div>
  <div class="two">
    <div class="card"><h3>모임별 예산</h3><div class="hbars">${C.slice().reverse().map(x => `<a class="hb" href="#/e/${esc(x.e.id)}/sum"><span class="hb-l">${esc(x.e.title || '제목 없음')}<small>${esc(fmtDate(x.e.date) || '날짜 미정')} · ${x.c.ppl}명</small></span><span class="hb-t"><span style="width:${x.c.real / maxE * 100}%"></span></span><b>${won(x.c.real)}원</b></a>`).join('')}</div></div>
    <div class="card"><h3>그룹별 지출</h3><div class="hbars">${byMod.map(x => `<div class="hb"><span class="hb-l"><span class="dot" style="background:${MOD[x.k].c}"></span>${esc(MOD[x.k].n)}</span><span class="hb-t"><span style="width:${x.v / maxM * 100}%;background:${MOD[x.k].c}"></span></span><b>${won(x.v)}원</b></div>`).join('') || '<p class="muted">아직 지출이 없어요</p>'}</div></div>
  </div>
  <div class="card"><h3>돈이 많이 든 품목 TOP 10</h3><div class="hbars">${tops.map((t, k) => `<div class="hb"><span class="hb-l"><i class="rank">${k + 1}</i>${esc(t.n)}<small>${t.cnt}번 구매</small></span><span class="hb-t"><span style="width:${t.v / maxT * 100}%;background:${MOD[t.mod] ? MOD[t.mod].c : 'var(--accent)'}"></span></span><b>${won(t.v)}원</b></div>`).join('') || '<p class="muted">아직 없어요</p>'}</div></div>
  <div class="card"><h3>모임 기록</h3><div class="scroll"><table class="tbl"><thead><tr><th>날짜</th><th>모임</th><th class="num">인원</th><th class="num">예산</th><th class="num">1인 회비</th><th class="num">남는 돈</th></tr></thead>
    <tbody>${C.slice().reverse().map(x => `<tr><td>${esc(fmtDate(x.e.date) || '—')}</td><td><a href="#/e/${esc(x.e.id)}/sum">${esc(x.e.title || '제목 없음')}</a></td><td class="num">${x.c.ppl}</td><td class="num">${won(x.c.real)}</td><td class="num">${won(x.c.fee)}</td><td class="num ${x.c.bal < 0 ? 'bad' : ''}">${x.c.bal < 0 ? '−' : ''}${won(Math.abs(x.c.bal))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="2">합계</th><td class="num">${ppl}</td><td class="num"><b>${won(total)}</b></td><td></td><td></td></tr></tfoot></table></div></div>`;
}

/* ───────────── 화면: 준비물 풀 ───────────── */
function vPool() {
  const rows = poolRows();
  return `<h1>준비물 풀</h1><p class="sub">새 모임을 만들 때 여기서 불러와요. ● 기본 체크 · ○ 선택. 모임에서 고친 단가와 구매 링크는 다음 모임의 기본값이 돼요.</p>
  <div class="card add-pool"><h3>내 품목 추가</h3><div class="form">
    <label class="f">그룹<select class="i" id="np-mod">${MODULES.map(m => `<option value="${m.k}">${esc(m.n)}</option>`).join('')}</select></label>
    <label class="f">품목 이름<input class="i" id="np-name" placeholder="예: 캠핑 웨건"></label>
    <label class="f">종류<select class="i" id="np-kind">${Object.entries(KIND).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
    <label class="f">단가<input class="i" id="np-price" inputmode="numeric" placeholder="0"></label>
    <label class="f">수량 기준<select class="i" id="np-rt"><option value="">1개</option><option value="p">1인당</option><option value="d">몇 명당 1개</option><option value="f">고정 개수</option></select></label>
    <label class="f">숫자<input class="i" id="np-rn" inputmode="decimal" placeholder="예: 3"></label>
    <label class="f">단위<input class="i" id="np-unit" placeholder="개"></label>
    <label class="pk f"><input type="checkbox" id="np-def" checked>기본으로 체크</label>
  </div><div class="row-btns"><button class="btn pri" data-act="npadd">추가</button></div></div>
  ${MODULES.map(m => { const its = rows.filter(r => r[0] === m.k); return `<section class="card pool-mod"><header class="mod-h"><span class="dot" style="background:${m.c}"></span><h3>${esc(m.n)}</h3><span class="muted">${its.length}개 · ${m.g === 'a' ? '활동' : '공통'}</span></header>
    <div class="scroll"><table class="tbl"><thead><tr><th></th><th>품목</th><th>종류</th><th>수량 기준</th><th class="num">단가</th><th>메모</th></tr></thead><tbody>${its.map(r => { const p = S.lib.prices && has(S.lib.prices[r[1]]) ? num(S.lib.prices[r[1]]) : num(r[6]);
      return `<tr><td>${r[2] ? '●' : '○'}</td><td>${esc(r[1])}${r[8] ? ` <span class="kb">${esc((VARIANTS[r[0]] || []).find(v => v[0] === r[8])?.[1] || '')}</span>` : ''}${r[9] ? ' <span class="kb k-d">내 품목</span>' : ''}</td><td>${KIND[r[3]]}</td><td>${esc(ruleTxt(r[4], r[5]))}</td><td class="num">${r[3] === 'b' ? (p ? won(p) : '—') : ''}</td><td class="muted">${esc(r[7])}${r[9] ? ` <button class="link danger" data-act="npdel" data-k="${esc(r[1])}">지우기</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></section>`; }).join('')}`;
}

/* ───────────── 입력 처리 ───────────── */
function cur() { return S.events[S.cur]; }
const NUMS = ['price', 'actual', 'count', 'mins', 'cap', 'manual', 'round', 'qty'];
function setField(t) {
  const e = cur(); if (!e) return; const p = t.dataset.f.split('.'); let v = t.type === 'checkbox' ? t.checked : t.value;
  if (['people', 'items', 'sched'].includes(p[0])) {
    const o = e[p[0]].find(x => x.id === p[1]); if (!o) return; const k = p[2];
    if (NUMS.includes(k)) v = String(v).trim() === '' ? (k === 'actual' ? '' : 0) : num(v);
    if (k === 'qty') o.auto = false;
    o[k] = v;
    if (p[0] === 'items' && k === 'link') { if (!o.shop) { const s = shopOf(v); if (s) { o.shop = s; const si = document.getElementById('s-' + o.id); if (si) si.value = s; } } if (okUrl(v)) { S.lib.links[o.name] = String(v).trim(); saveLib(); } }
    if (p[0] === 'items' && k === 'price' && num(v)) { S.lib.prices[o.name] = num(v); saveLib(); }
    if (p[0] === 'items' && k === 'kind' && v !== 'b') { o.actual = ''; o.st = ''; }
    if (p[0] === 'people' && k === 'count') reQty(e);
  } else if (p.length === 2) { e[p[0]][p[1]] = NUMS.includes(p[1]) ? (String(v).trim() === '' ? '' : num(v)) : v; }
  else e[p[0]] = NUMS.includes(p[0]) ? num(v) : v;
  save(e);
}
function refresh() {
  const e = cur(); if (!e) return; const c = calc(e);
  const a = $('#aside'); if (a) a.innerHTML = budgetCard(e); bar();
  e.items.forEach(i => { const el = document.querySelector(`[data-c="amt-${i.id}"]`); if (el) el.innerHTML = amtHtml(i); if (i.auto) { const q = document.getElementById('q-' + i.id); if (q && document.activeElement !== q) q.value = qtyTxt(i.qty); } });
  MODULES.forEach(m => { const el = document.querySelector(`[data-c="sub-${m.k}"]`); if (el) { const s = c.buy.filter(i => i.mod === m.k).reduce((x, i) => x + valOf(i), 0); el.textContent = s ? won(s) + '원' : ''; } });
  const pp = document.querySelector('[data-c="ppl"]'); if (pp) { pp.textContent = c.ppl; document.querySelector('[data-c="payers"]').textContent = c.payers; }
  const w = document.querySelector('[data-c="capw"]'); if (w) { const over = c.ppl > num(e.cap); w.className = over ? 'warn-t' : 'muted'; w.textContent = over ? `정원보다 ${c.ppl - num(e.cap)}명 많아요` : '정원 안이에요'; }
  if (S.tab === 'plan') { const tt = times(e); e.sched.forEach((s, k) => { const el = document.querySelector(`[data-c="tm-${s.id}"]`); if (el) el.textContent = `${tt[k][0]}–${tt[k][1]}`; }); }
  const sub = $('#ev-sub'); if (sub) sub.textContent = `${(PACKAGES[e.pkg] || PACKAGES.day).n}${e.date ? ' · ' + fmtDate(e.date) : ''} · ${c.ppl}명`;
}
function wizPreview() { if (!S.wiz || S.wiz.step !== 3) return; const c = calc(newEvent(S.wiz)); const s = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; }; s('w-n', c.on.length + '개'); s('w-b', c.buy.length + '개'); s('w-e', won(c.est) + '원'); }

document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.w) { S.wiz[t.dataset.w] = t.dataset.w === 'count' ? num(t.value) : t.value; wizPreview(); return; }
  if (t.dataset.q) { S.q = t.value; const pos = t.selectionStart; $('#pane').innerHTML = tItems(cur()); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (!t.dataset.f || t.dataset.ch) return;
  setField(t); refresh();
});
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.dataset.f) return;
  if (t.dataset.ch) { setField(t); const y = scrollY; render(); scrollTo(0, y); return; }
  if (/\.(price|actual)$|fee\.manual/.test(t.dataset.f) && t.value) t.value = won(num(t.value));
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') modal();
  if (ev.key === 'Enter' && ev.target.matches('.ev.card')) ev.target.click();
});
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, k = b.dataset.k, id = b.dataset.id, e = cur(), w = S.wiz;
  const rerender = () => { const y = scrollY; render(); scrollTo(0, y); };
  switch (a) {
    case 'login': return login();
    case 'acct': return modal(`<h2>계정</h2><p>${esc(S.user.displayName || '')}<br><span class="muted">${esc(S.user.email || '')}</span></p><p class="hint">모임은 이 계정에 저장돼요. 폰과 컴퓨터에서 같은 계정으로 로그인하면 이어서 쓸 수 있어요.</p>
      <div class="row-btns"><button class="btn" data-act="theme">화면 밝기: ${themeName()}</button><button class="btn" data-act="logout">로그아웃</button><button class="btn pri" data-act="mclose">닫기</button></div><p class="note">불멍노트 v${VER}</p>`);
    case 'theme': { const order = ['auto', 'light', 'dark']; const n = order[(order.indexOf(localStorage.getItem(LS_THEME) || 'auto') + 1) % 3]; try { localStorage.setItem(LS_THEME, n); } catch { } applyTheme(); b.textContent = '화면 밝기: ' + themeName(); return; }
    case 'logout': modal(); unsubs.forEach(u => u()); unsubs = []; FB.signOut(FB.auth); return;
    case 'mclose': return modal();
    case 'new': S.wiz = null; return go('new');
    case 'open': S.tab = 'sum'; return go('e/' + id + '/sum');
    case 'wpkg': w.pkg = k; w.acts = [...PACKAGES[k].acts]; return rerender();
    case 'wact': w.acts = w.acts.includes(k) ? w.acts.filter(x => x !== k) : [...w.acts, k]; return rerender();
    case 'wvar': w[k] = b.dataset.v; return rerender();
    case 'wstep': w.step = Math.min(3, Math.max(1, w.step + num(b.dataset.d))); render(); return scrollTo(0, 0);
    case 'wcnt': { w.count = Math.max(1, num(w.count) + num(b.dataset.d)); $('#w-count').value = w.count; return wizPreview(); }
    case 'wmake': { const n = newEvent(w); S.events[n.id] = n; save(n); if (S.mode === 'cloud') flush(n.id); S.wiz = null; S.tab = 'items'; toast(`준비물 ${calc(n).on.length}개를 불러왔어요`); return go('e/' + n.id + '/items'); }
    case 'print': return window.print();
    case 'copy': { const ta = document.getElementById(k); const done = () => toast('복사했어요'); try { navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); document.execCommand('copy'); done(); }); } catch { ta.select(); } return; }
  }
  if (!e) return;
  switch (a) {
    case 'dup': { const s = clone(e); s.id = 'ev-' + Date.now().toString(36) + rid().slice(0, 4); s.title = (s.title || '모임') + ' (복사)'; s.date = ''; s.created = s.updated = Date.now();
      s.items.forEach(i => { i.id = rid(); i.actual = ''; i.st = ''; i.packed = false; }); s.people.forEach(p => p.id = rid()); s.sched.forEach(x => x.id = rid());
      S.events[s.id] = s; save(s); if (S.mode === 'cloud') flush(s.id); toast('복사했어요 · 날짜와 인원만 바꾸세요'); S.tab = 'plan'; return go('e/' + s.id + '/plan'); }
    case 'del': return modal(`<h2>모임을 지울까요?</h2><p>「${esc(e.title || '제목 없는 모임')}」의 준비물·예산이 모두 지워지고 되돌릴 수 없어요.</p><div class="row-btns end"><button class="btn" data-act="mclose">취소</button><button class="btn danger-fill" data-act="mdel">지우기</button></div>`);
    case 'mdel': modal(); removeEvent(e.id); toast('지웠어요'); return go('');
    case 'filter': S.filter = k; return rerender();
    case 'only': S.onlyOn = !S.onlyOn; return rerender();
    case 'fold': S.fold[k] = !S.fold[k]; return rerender();
    case 'det': S.open[id] = !S.open[id]; return rerender();
    case 'more': S.more[k] = !S.more[k]; return rerender();
    case 'st': { const i = e.items.find(x => x.id === id); const L = ['', '주문함', '받음', '현장 결제']; i.st = L[(L.indexOf(i.st || '') + 1) % L.length]; save(e); return rerender(); }
    case 'pack': { const i = e.items.find(x => x.id === id); i.packed = !i.packed; save(e); return rerender(); }
    case 'auto': { const i = e.items.find(x => x.id === id); i.auto = true; reQty(e); save(e); return rerender(); }
    case 'var': e.variants[k] = b.dataset.v; save(e); return rerender();
    case 'modoff': e.mods[k] = 'off'; save(e); toast(`${MOD[k].n} 그룹을 껐어요 · 아래에서 다시 켤 수 있어요`); return rerender();
    case 'modon': e.mods[k] = 'on'; addModItems(e, k); if (ACTS.includes(k)) applyFireLinks(e); save(e); return rerender();
    case 'act': { if (e.mods[k] === 'on') e.mods[k] = 'off'; else { e.mods[k] = 'on'; addModItems(e, k); applyFireLinks(e); } save(e); return rerender(); }
    case 'pkg': { e.pkg = k; const P = PACKAGES[k]; Object.entries(P.mods).forEach(([m, st]) => { const was = e.mods[m]; e.mods[m] = st; if (st !== 'off' && (was === 'off' || !was)) addModItems(e, m); }); save(e); return rerender(); }
    case 'iadd': { const it = { id: rid(), mod: k, name: '', kind: MOD[k].k === 'personal' ? 'p' : 'b', on: true, qty: 1, auto: false, rule: '', unit: '개', price: 0, actual: '', link: '', shop: '', who: '', st: '', packed: false, note: '', v: '' };
      e.items.push(it); S.open[it.id] = true; save(e); rerender(); const n = document.getElementById('n-' + it.id); if (n) n.focus(); return; }
    case 'idel': e.items = e.items.filter(i => i.id !== id); save(e); return rerender();
    case 'pc': { const p = e.people.find(x => x.id === id); p.count = Math.max(0, num(p.count) + num(b.dataset.d)); reQty(e); save(e); $('#pc-' + id).value = p.count; return refresh(); }
    case 'padd': e.people.push({ id: rid(), name: '새 그룹', count: 1, pays: true }); reQty(e); save(e); return rerender();
    case 'pdel': if (e.people.length < 2) return toast('그룹은 하나 이상 있어야 해요'); e.people = e.people.filter(p => p.id !== id); reQty(e); save(e); return rerender();
    case 'sadd': e.sched.push({ id: rid(), label: '', mins: 30 }); save(e); return rerender();
    case 'sdel': e.sched = e.sched.filter(s => s.id !== id); save(e); return rerender();
    case 'sup': case 'sdn': { const i = e.sched.findIndex(s => s.id === id), j = a === 'sup' ? i - 1 : i + 1; if (j < 0 || j >= e.sched.length) return; const t = e.sched.at(i); e.sched.splice(i, 1); e.sched.splice(j, 0, t); save(e); return rerender(); }
    case 'sec': e.secs = e.secs.includes(k) ? e.secs.filter(x => x !== k) : [...e.secs, k]; save(e); return rerender();
  }
});
// 준비물 풀 화면 (모임 밖)
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act="npadd"],[data-act="npdel"]'); if (!b) return;
  if (b.dataset.act === 'npdel') { S.lib.items = S.lib.items.filter(x => x.name !== b.dataset.k); saveLib(); return render(); }
  const name = $('#np-name').value.trim(); if (!name) return toast('품목 이름을 적어 주세요');
  const rt = $('#np-rt').value, rn = num($('#np-rn').value);
  S.lib.items.push({ mod: $('#np-mod').value, name, kind: $('#np-kind').value, price: num($('#np-price').value), rule: rt && rn ? rt + rn : '', unit: $('#np-unit').value.trim() || '개', def: $('#np-def').checked, note: '' });
  saveLib(); toast('준비물 풀에 추가했어요 · 다음 새 모임부터 들어가요'); render();
});
$('#bar').addEventListener('click', () => { const a = $('#aside'); if (a) a.scrollIntoView({ behavior: 'smooth' }); });

/* ───────────── 공통 UI ───────────── */
function modal(h) { const m = $('#modal'); if (!h) { m.classList.remove('on'); return; } $('#modalBody').innerHTML = h; m.classList.add('on'); const f = m.querySelector('.btn'); if (f) f.focus(); }
let tt; function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2400); }
function themeName() { return { auto: '기기 설정', light: '밝게', dark: '어둡게' }[localStorage.getItem(LS_THEME) || 'auto']; }
function applyTheme() { let t = 'auto'; try { t = localStorage.getItem(LS_THEME) || 'auto'; } catch { } if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }
async function login() {
  if (!FB) return;
  const p = new FB.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { await FB.signInWithPopup(FB.auth, p); }
  catch (err) { if (/popup-blocked|operation-not-supported/.test(err.code || '')) FB.signInWithRedirect(FB.auth, p); else if (!/popup-closed|cancelled/.test(err.code || '')) toast('로그인하지 못했어요: ' + (err.code || '')); }
}

/* ───────────── 시작 ───────────── */
applyTheme();
loadLocal();
window.addEventListener('hashchange', route);
route();
initFirebase().then(fb => {
  FB = fb; if (!FB) { sync('이 기기에 저장 중'); render(); return; }
  FB.onAuthStateChanged(FB.auth, u => {
    if (u) { sync('불러오는 중…'); startCloud(u); }
    else { unsubs.forEach(x => x()); unsubs = []; S.user = null; S.mode = 'local'; S.events = {}; loadLocal(); S.ready = true; sync('이 기기에 저장 중'); render(); }
  });
}).catch(err => { console.warn(err); sync('이 기기에 저장 중'); render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
