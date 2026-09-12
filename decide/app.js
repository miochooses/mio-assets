// Mio 二択判定 UIコントローラ（モバイル・静的）
// 判定ロジックは decide-core.js に集約（Web版とNode版で共有）。
import { TEMPLATES, discover, classifyInput, listTemplates, MOYA_CARDS } from '/decide/decide-core.js';

const FACE = s => `/decide/mio/${s}.png`;
const $ = id => document.getElementById(id);

// ---- 最小イベント計測（端末内 + 将来のビーコン用の縫い目。個人情報は送らない） ----
const EVENT_ENDPOINT = null; // バックエンド用意後にURLを入れると集計に飛ばせる
function track(name, data) {
  try {
    const ev = { t: Date.now(), name, ...data };
    const key = 'mio_decide_events';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push(ev);
    localStorage.setItem(key, JSON.stringify(arr.slice(-200)));
    if (EVENT_ENDPOINT && navigator.sendBeacon) {
      navigator.sendBeacon(EVENT_ENDPOINT, JSON.stringify(ev));
    }
  } catch (e) { /* 計測失敗は無視（診断は止めない） */ }
}

// ---- 状態 ----
let tplId = null;      // 選択中テンプレ
let answers = {};      // 回答
let asked = [];        // 表示した質問idの順（戻る用）
let entryMethod = null;// 'chip' | 'text' | 'moya'

// ---- 画面切替 ----
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
  window.scrollTo(0, 0);
  // ファネル各段を別"パス名"へ(CF Web AnalyticsのrequestPathはパス単位=クエリでは分離不可)。UTMはクエリで保持。
  try {
    const path = { 's-home': '/decide/', 's-input': '/decide/input', 's-moya': '/decide/moya', 's-quiz': '/decide/quiz', 's-result': '/decide/result' }[id] || '/decide/';
    history.pushState(null, '', path + (window.__utm ? '?' + window.__utm : ''));
  } catch (e) { }
}

// 例示フレーズ（ゼロ入力でも始められるチップ）
const CHIP_PHRASES = {
  card: 'カードを作るか',
  hikari: '光回線を乗り換えるか',
  sim: '格安SIMに乗り換えるか',
  sub: 'サブスクを解約するか',
};

// ================= ホーム =================
document.querySelectorAll('.entry').forEach(btn => {
  btn.addEventListener('click', () => openEntry(btn.dataset.entry));
});
document.querySelectorAll('[data-go="home"]').forEach(b => b.addEventListener('click', () => show('s-home')));

// ホームのMio表情を軽くローテ（生きてる感）
(function () {
  const faces = ['normal', 'thinking', 'smirk'];
  let i = 0;
  setInterval(() => {
    const el = $('homeFace');
    if (el && $('s-home').classList.contains('on')) {
      i = (i + 1) % faces.length; el.src = FACE(faces[i]);
    }
  }, 2600);
})();

// ================= 入口 =================
function openEntry(kind) {
  if (kind === 'moya') { openMoya(); return; }
  // name / show（テキスト入力）
  const cfg = kind === 'name'
    ? { badge: 'ひとことで伝える', label: '何を迷ってる？ ひとことで。', hint: '例：「アメックスゴールド 作るか」／「ネトフリ 解約」。言葉から題材を探します。', ph: '迷っていることを一言で' }
    : { badge: 'URL・商品名を貼る', label: 'URLか商品名を貼ってください。', hint: '貼った文字の“キーワード”から題材を推定します（ページ本文や画像の中身は読み取りません）。中身の読み取りは有料判定で対応。', ph: 'https://... または 商品名' };
  $('inBadge').textContent = cfg.badge;
  $('inLabel').textContent = cfg.label;
  $('inHint').textContent = cfg.hint;
  $('inText').value = '';
  $('inText').placeholder = cfg.ph;
  renderChips();
  show('s-input');
  setTimeout(() => $('inText').focus(), 120);
}

function renderChips(note) {
  const box = $('inChips');
  box.innerHTML = '';
  if (note) {
    const n = document.createElement('div');
    n.style.cssText = 'flex-basis:100%;font-size:12.5px;color:#fbbf24;font-weight:700;';
    n.textContent = note;
    box.appendChild(n);
  }
  const heading = document.createElement('div');
  heading.style.cssText = 'flex-basis:100%;font-size:12px;color:#6e7b8a;font-weight:700;';
  heading.textContent = note ? '今できるのはこの3つ。タップで開始：' : 'タップして始める：';
  box.appendChild(heading);
  listTemplates().forEach(t => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = CHIP_PHRASES[t.id] || t.title;
    c.addEventListener('click', () => { entryMethod = 'chip'; startTemplate(t.id); });
    box.appendChild(c);
  });
}

function submitText() {
  const text = $('inText').value.trim();
  if (!text) return;
  const c = classifyInput(text);
  const head = '「' + text.slice(0, 24) + '」';
  if (c.kind === 'template') { entryMethod = 'text'; track('freetext', { text_len: text.length }); startTemplate(c.id); }
  else if (c.kind === 'comparison') { track('route_blocked', { reason: 'comparison' }); renderChips(head + 'のような“AとBを比べる”相談は、無料版では扱えません（有料の半手動で承ります）。'); }
  else if (c.kind === 'out_of_scope') { track('route_blocked', { reason: 'out_of_scope' }); renderChips(head + 'は投資・借入・税・保険・医療などの領域で、対象外です。'); }
  else { track('route_blocked', { reason: 'none' }); renderChips(head + 'は、今はまだ判定を用意できていません。'); }
}
$('inGo').addEventListener('click', submitText);
$('inText').addEventListener('keydown', e => { if (e.key === 'Enter') submitText(); });

// ================= モヤモヤ =================
function openMoya() {
  const box = $('moyaOpts');
  box.innerHTML = '';
  MOYA_CARDS.forEach(card => {
    const o = document.createElement('button');
    o.className = 'opt';
    o.innerHTML = `<span>${card.label}</span>`;
    o.addEventListener('click', () => pickMoya(card));
    box.appendChild(o);
  });
  show('s-moya');
}
function pickMoya(card) {
  const suggests = card.suggest;
  if (suggests.length === 1) { entryMethod = 'moya'; startTemplate(suggests[0]); return; }
  // 複数候補 → その場で絞る
  const box = $('moyaOpts');
  box.innerHTML = '';
  const q = document.querySelector('#s-moya .qt');
  q.textContent = 'それなら、どっちが近い？';
  suggests.forEach(id => {
    const t = TEMPLATES[id];
    const o = document.createElement('button');
    o.className = 'opt';
    o.innerHTML = `<span>${CHIP_PHRASES[id] || t.title}</span>`;
    o.addEventListener('click', () => { entryMethod = 'moya'; startTemplate(id); });
    box.appendChild(o);
  });
}

// ================= 質問（適応型） =================
function startTemplate(id) {
  tplId = id; answers = {}; asked = [];
  track('start', { template: id, entry: entryMethod });
  show('s-quiz');
  step();
}

function step() {
  const s = discover(tplId, answers);   // 無料版＝発見のみ（最終判定は出さない）
  if (s.done) { renderDiscovery(s.result); return; }
  renderQuestion(s.ask);
}

function renderQuestion(q) {
  if (asked[asked.length - 1] !== q.id) asked.push(q.id);
  $('qTheme').textContent = TEMPLATES[tplId].subtitle + ' の判定';
  $('qFace').src = FACE(q.face || 'thinking');
  $('qText').textContent = q.prompt;
  $('qHint').textContent = q.hint || '';

  // 進捗ドット（発見に使う質問数を上限に）
  const total = TEMPLATES[tplId].discover.ask.length;
  const dots = $('qDots'); dots.innerHTML = '';
  const doneN = Object.keys(answers).length;
  for (let i = 0; i < total; i++) {
    const d = document.createElement('i');
    if (i <= doneN) d.classList.add('on');
    dots.appendChild(d);
  }

  const box = $('qOpts'); box.innerHTML = '';
  q.options.forEach(o => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.innerHTML = `<span>${o.label}</span>` + (o.swipe ? `<span class="sw">${o.swipe === 'right' ? '→ 右スワイプ' : '← 左スワイプ'}</span>` : '');
    b.addEventListener('click', () => answer(q.id, o.value));
    box.appendChild(b);
  });

  // スワイプ（二択でswipe方向がある質問のみ）
  const swipeOpts = q.options.filter(o => o.swipe);
  $('qSwipe').textContent = swipeOpts.length === 2 ? 'カードを左右にスワイプしても選べます' : '';
  setupSwipe(q, swipeOpts);

  $('qBack').style.visibility = (Object.keys(answers).length > 0) ? 'visible' : 'hidden';
}

function answer(qid, value) {
  answers[qid] = value;
  track('answer', { template: tplId, q: qid, v: value, n: Object.keys(answers).length });
  step();
}

$('qBack').addEventListener('click', () => {
  // 直近の回答を取り消す
  const lastAsked = asked[asked.length - 1];
  // 現在表示中の質問は未回答なので、その一つ前の回答を消す
  const answeredKeys = asked.filter(id => answers[id] !== undefined);
  const lastAnswered = answeredKeys[answeredKeys.length - 1];
  if (lastAnswered) {
    delete answers[lastAnswered];
    asked = asked.filter(id => id !== lastAsked || id === lastAnswered);
    // asked の末尾を巻き戻し
    asked = asked.slice(0, asked.indexOf(lastAnswered) + 1);
    asked.pop();
  }
  step();
});

// スワイプ処理（pointer captureは使わない＝オプションのタップを飲み込まない）
let swipeState = null;
let justSwiped = false;
(function attachClickGuard() {
  // スワイプ確定直後の合成clickだけを抑制（タップは通す）
  $('qCard').addEventListener('click', e => {
    if (justSwiped) { justSwiped = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
})();
function setupSwipe(q, swipeOpts) {
  const card = $('qCard');
  card.style.transform = '';
  card.style.opacity = '1';
  card.onpointerdown = null; card.onpointermove = null; card.onpointerup = null;
  if (swipeOpts.length !== 2) return;
  const rightOpt = swipeOpts.find(o => o.swipe === 'right');
  const leftOpt = swipeOpts.find(o => o.swipe === 'left');
  card.onpointerdown = e => { swipeState = { x0: e.clientX, moved: false }; };
  card.onpointermove = e => {
    if (!swipeState) return;
    const dx = e.clientX - swipeState.x0;
    if (Math.abs(dx) > 6) swipeState.moved = true;
    if (!swipeState.moved) return;
    card.style.transform = `translateX(${dx * 0.6}px) rotate(${dx * 0.02}deg)`;
    card.style.opacity = String(Math.max(0.5, 1 - Math.abs(dx) / 400));
  };
  card.onpointerup = e => {
    if (!swipeState) return;
    const dx = e.clientX - swipeState.x0;
    const moved = swipeState.moved;
    swipeState = null;
    const th = 70;
    if (moved && dx > th && rightOpt) { justSwiped = true; flyOut(card, 1, () => answer(q.id, rightOpt.value)); }
    else if (moved && dx < -th && leftOpt) { justSwiped = true; flyOut(card, -1, () => answer(q.id, leftOpt.value)); }
    else { card.style.transform = ''; card.style.opacity = '1'; } // タップ or 弱い動き → clickに任せる
  };
}
function flyOut(card, dir, cb) {
  card.style.transition = 'transform .22s ease, opacity .22s ease';
  card.style.transform = `translateX(${dir * 500}px) rotate(${dir * 12}deg)`;
  card.style.opacity = '0';
  setTimeout(() => { card.style.transition = ''; cb(); }, 200);
}

// ================= 発見の結果（無料版＝題材・判断軸・傾き・不足情報。最終判定は出さない） =================
function renderDiscovery(r) {
  track('discover_complete', { template: r.template_id, lean: r.lean.dir, taps: Object.keys(answers).length, entry: entryMethod });
  $('rFace').src = FACE(r.face || 'thinking');
  $('rTopic').textContent = 'あなたの題材：' + r.topic;
  $('rType').textContent = r.type;

  $('rLean').textContent = r.lean.label;
  $('rLean').className = 'leanval lean-' + r.lean.dir;
  $('rLeanNote').textContent = r.lean.note;

  const axes = $('rAxes'); axes.innerHTML = '';
  r.axes.forEach(x => { const li = document.createElement('li'); li.textContent = x; axes.appendChild(li); });
  const needed = $('rNeeded'); needed.innerHTML = '';
  r.needed.forEach(x => { const li = document.createElement('li'); li.textContent = x; needed.appendChild(li); });

  show('s-result');
}
$('againBtn').addEventListener('click', () => show('s-home'));

// 流入UTM(動画/記事別)を捕捉→保持＆ココナラCTAへ伝播(流入元を識別)
(function () {
  const p = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => { if (p.get(k)) keep.set(k, p.get(k)); });
  window.__utm = keep.toString();
  const b = $('paidBtn');
  if (b) {
    try {
      const u = new URL(b.href);
      u.searchParams.set('utm_source', keep.get('utm_source') || 'mio_decide');
      u.searchParams.set('utm_medium', 'paid_cta');
      u.searchParams.set('utm_campaign', keep.get('utm_campaign') || 'nitaku');
      if (keep.get('utm_content')) u.searchParams.set('utm_content', keep.get('utm_content'));
      b.href = u.toString();
    } catch (e) { }
  }
})();
$('paidBtn').addEventListener('click', () => {
  track('paid_click', { from: tplId });
  // 購入CTAクリックを別"パス名"のpageviewとしてCF Web Analyticsへ(sendBeaconで遷移直前でも欠損しない)。/decide/go-coconala の件数=CTAクリック数。
  try { history.pushState(null, '', '/decide/go-coconala' + (window.__utm ? '?' + window.__utm : '')); } catch (e) { }
});

// 初期表示
show('s-home');
