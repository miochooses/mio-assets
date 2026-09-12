// Mio 発見コア（無料・クライアント配信用）
// -----------------------------------------------------------------------------
// 無料版＝「迷いの正体（題材・判断軸・今の傾き・不足情報）」を見つけるだけ。
// ★最終判定（GO/HOLD/NO・捨てる理由・盲点・今日の一手・金額計算）はここに含めない。
//   有料の判定ロジックはブラウザへ配信しない（automation/mio-decide-engine.mjs＝Node専用）。
// ブラウザ（<script type="module">）と Node（テスト）で動く純ESM。DOM 非依存。
//
// 使い方:
//   import { TEMPLATES, discover, listTemplates, routeTheme, MOYA_CARDS } from './decide-core.js'
//   const step = discover('sim', { q_current:'gt7000' })
//   // step.done===false なら step.ask（次の質問）を提示
//   // step.done===true なら step.result（題材/判断軸/傾き/不足情報）を表示
// -----------------------------------------------------------------------------

// Mio 表情 slug（Mio_expression_PNG_12/manifest.json と一致）
export const FACES = {
  normal: 'normal', thinking: 'thinking', convinced: 'convinced',
  surprised: 'surprised', smirk: 'smirk', troubled: 'troubled',
  crying: 'crying', hurt: 'hurt', angry: 'angry',
  overjoyed: 'overjoyed', laughing: 'laughing', thumbs_up: 'thumbs_up',
};

// -----------------------------------------------------------------------------
// テンプレ1: 年会費カードを申し込むか（申し込む vs 見送る）※行動判定型
// -----------------------------------------------------------------------------
const CARD = {
  id: 'card',
  title: 'このカード、申し込むか見送るか',
  subtitle: '年会費ありのクレジットカード',
  choiceA: '申し込む',
  choiceB: '見送る',
  match: ['カード', 'クレジット', 'ゴールド', 'プラチナ', 'amex', 'アメックス', '年会費', '楽天カード', 'card'],
  questions: [
    { id: 'q_revolving', prompt: 'リボ払い・分割・カードローンの残高、今ある？',
      hint: '金利は年15%前後。カード特典（数%）より先に潰すべき損。',
      face: FACES.thinking,
      options: [
        { value: 'yes', label: 'ある', swipe: 'left' },
        { value: 'no', label: 'ない', swipe: 'right' },
      ] },
    { id: 'q_fee', prompt: 'その年会費、だいたいいくら？',
      hint: '分からなければ「わからない」でOK（そこで一旦止めます）。',
      face: FACES.thinking,
      options: [
        { value: 'under2000', label: '〜2千円くらい' },
        { value: 'mid', label: '1〜3万円台' },
        { value: 'high', label: '4万円以上' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_benefit', prompt: '空港ラウンジ・旅行保険・継続特典…年に1回以上ちゃんと使う?',
      hint: '「持ってると安心」ではなく「実際に使うか」。',
      face: FACES.smirk,
      options: [
        { value: 'yes', label: '使う', swipe: 'right' },
        { value: 'no', label: '使わない/わからない', swipe: 'left' },
      ] },
    { id: 'q_spend', prompt: 'そのカードで年にいくら使いそう？',
      hint: '家賃・税金など還元対象外は除いた「普段の買い物」で。',
      face: FACES.thinking,
      options: [
        { value: 'lt50', label: '〜50万円' },
        { value: 'mid150', label: '50〜150万円' },
        { value: 'gt150', label: '150万円〜' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_free_ok', prompt: '今の無料カードに、不満ある？',
      hint: '不満がないなら、わざわざ年会費を払う理由は薄い。',
      face: FACES.normal,
      options: [
        { value: 'fine', label: '特にない', swipe: 'left' },
        { value: 'want', label: 'ポイント/特典が物足りない', swipe: 'right' },
      ] },
  ],
  // 無料版＝発見のみ（最終判定・金額計算・盲点・今日の一手は出さない）
  discover: {
    ask: ['q_fee', 'q_benefit'],
    result(a) {
      let lean;
      if (a.q_fee === 'unknown' || a.q_fee === undefined) lean = { dir: 'neutral', label: 'まだ五分', note: '年会費がわからないと傾きが出せません。' };
      else if (a.q_benefit === 'yes') lean = { dir: 'A', label: '「申し込む」寄り', note: '使う特典があるほど有利。ただし年間の利用額しだいで逆転します。' };
      else if (a.q_fee === 'high' || a.q_fee === 'mid') lean = { dir: 'B', label: '「見送る」寄り', note: '特典を使わないなら、年会費を還元だけで取り返しにくい。' };
      else lean = { dir: 'neutral', label: 'まだ五分', note: '年会費が小さいので、利用額しだい。' };
      return {
        topic: 'このカードを申し込むか、見送るか',
        type: '行動判定型（申し込む／見送る）',
        axes: ['年会費に見合う「還元＋実際に使う特典」があるか', '今の無料カードで足りていないか'],
        lean,
        needed: ['実際の年会費（2年目以降）', '年間の利用額（還元対象の支払い）', '実際に使う特典と、その年間の使用回数'],
        face: FACES.thinking,
      };
    },
  },
};

// -----------------------------------------------------------------------------
// テンプレ2: 大手キャリアから格安SIMへ乗り換えるか（乗り換える vs 現状維持）※行動判定型
// -----------------------------------------------------------------------------
const SIM = {
  id: 'sim',
  title: '格安SIMに乗り換えるか、今のままか',
  subtitle: 'スマホの通信費',
  choiceA: '乗り換える',
  choiceB: '今のまま',
  match: ['sim', '格安sim', '格安シム', '乗り換え', '乗換', 'ahamo', 'povo', 'linemo', '楽天モバイル', 'キャリア', '通信費', 'スマホ代', '携帯'],
  questions: [
    { id: 'q_current', prompt: '今、スマホ代は月いくら？',
      hint: '端末の分割を除いた「通信料」だけで。',
      face: FACES.thinking,
      options: [
        { value: 'gt7000', label: '7千円くらい〜' },
        { value: 'mid', label: '4〜7千円' },
        { value: 'lt4000', label: '〜4千円' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_bundle', prompt: '家族割・自宅のネットとのセット割を使ってる?',
      hint: '乗り換えるとこの割引が消えることがある（＝失う額）。',
      face: FACES.thinking,
      options: [
        { value: 'yes', label: '使ってる', swipe: 'left' },
        { value: 'no', label: '使ってない', swipe: 'right' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_hassle', prompt: '乗り換えの手続き、どれくらい平気?',
      hint: 'MNP予約・SIM差し替え・初期設定で1〜2時間ほど。',
      face: FACES.smirk,
      options: [
        { value: 'ok', label: '多少なら平気', swipe: 'right' },
        { value: 'hate', label: '面倒は絶対いや', swipe: 'left' },
      ] },
    { id: 'q_usage', prompt: 'データ、たくさん使う?（月20GB超）',
      hint: '大容量が必要だと格安SIMで割高になる場合がある。',
      face: FACES.thinking,
      options: [
        { value: 'heavy', label: 'よく使う(20GB超)', swipe: 'left' },
        { value: 'light', label: 'そんなに使わない', swipe: 'right' },
        { value: 'unknown', label: 'わからない' },
      ] },
  ],
  discover: {
    ask: ['q_current', 'q_bundle'],
    result(a) {
      let lean;
      if (a.q_current === 'unknown' || a.q_current === undefined) lean = { dir: 'neutral', label: 'まだ五分', note: '今の月額がわからないと傾きが出せません。' };
      else if (a.q_bundle === 'unknown' || a.q_bundle === undefined) lean = { dir: 'neutral', label: 'まだ五分', note: '家族割・セット割の有無で変わるため、まだ五分。' };
      else if (a.q_current === 'lt4000') lean = { dir: 'neutral', label: 'まだ五分', note: 'すでに安め。ただし使用量や候補プランしだいで格安が安いことも。' };
      else if (a.q_bundle === 'yes') lean = { dir: 'neutral', label: 'まだ五分', note: '家族割・セット割で失う額しだいで変わります。' };
      else if (a.q_current === 'gt7000') lean = { dir: 'A', label: 'ゆるく「乗り換える」寄り', note: '月額が高めで割引も無いなら差が出やすい（実額で要確認）。' };
      else lean = { dir: 'A', label: 'ゆるく「乗り換える」寄り', note: '削れる余地はあるが、候補プランと手間しだい。' };
      return {
        topic: '格安SIMに乗り換えるか、今のままか',
        type: '行動判定型（乗り換える／今のまま）',
        axes: ['今の月額の高さ', '乗り換えで失う 家族割・セット割・手続きの手間'],
        lean,
        needed: ['実際の月額（端末代を除く通信料）', '家族割・セット割で引かれている実額', '毎月の使用データ量(GB)'],
        face: FACES.thinking,
      };
    },
  },
};

// -----------------------------------------------------------------------------
// テンプレ3: 使っていないサブスクを解約するか（解約する vs 続ける）※行動判定型
// -----------------------------------------------------------------------------
const SUB = {
  id: 'sub',
  title: 'このサブスク、解約するか続けるか',
  subtitle: '月額サービスの見直し',
  choiceA: '解約する',
  choiceB: '続ける',
  match: ['サブスク', 'サブスクリプション', '解約', '月額', 'netflix', 'ネトフリ', 'spotify', 'amazonプライム', 'プライム', 'ジム', '会費', 'subscription'],
  questions: [
    { id: 'q_used', prompt: 'このサービス、直近1ヶ月で使った?',
      hint: '「入ってる安心感」ではなく、実際に開いたか。',
      face: FACES.thinking,
      options: [
        { value: 'yes', label: '使った', swipe: 'right' },
        { value: 'no', label: 'ほぼ使ってない', swipe: 'left' },
        { value: 'unknown', label: '思い出せない' },
      ] },
    { id: 'q_alt', prompt: '同じことが、別の無料/既契約でも代わりになる?',
      hint: '例: 動画が他のサブスクでも見られる、無料枠で足りる 等。',
      face: FACES.smirk,
      options: [
        { value: 'yes', label: '代わりがある', swipe: 'left' },
        { value: 'no', label: 'これじゃないと困る', swipe: 'right' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_fee', prompt: '月額はいくらくらい?',
      hint: '年額に直すと12倍。意外と大きい。',
      face: FACES.thinking,
      options: [
        { value: 'lt500', label: '〜500円' },
        { value: 'mid', label: '500〜1,500円' },
        { value: 'gt1500', label: '1,500円〜' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_rejoin', prompt: 'また使いたくなったら、すぐ入り直せる?',
      hint: 'ほとんどのサブスクはいつでも再開できる（＝解約リスクは低い）。',
      face: FACES.normal,
      options: [
        { value: 'easy', label: 'すぐ入り直せる', swipe: 'right' },
        { value: 'hard', label: '入り直しにくい/また使う予定', swipe: 'left' },
      ] },
  ],
  discover: {
    ask: ['q_used', 'q_rejoin'],
    result(a) {
      let lean;
      if (a.q_used === 'yes') lean = { dir: 'B', label: '「続ける」寄り', note: '使っているものを、節約だけの理由で切ると損になりやすい（高額で代替がある場合は見直す価値あり）。' };
      else if (a.q_used === 'unknown' || a.q_used === undefined) lean = { dir: 'neutral', label: 'まだ五分', note: '使ったか思い出せないなら、まず直近の使用を確認してから。' };
      else if (a.q_rejoin === 'hard') lean = { dir: 'neutral', label: 'まだ五分', note: 'また使う予定なら、一時停止（休会）の余地があります。' };
      else lean = { dir: 'A', label: 'ゆるく「解約」寄り', note: '使っておらず入り直しも簡単なら、止める妥当性が高い（更新日・返金は要確認）。' };
      return {
        topic: 'このサブスクを解約するか、続けるか',
        type: '行動判定型（解約する／続ける）',
        axes: ['直近の使用実態', '払っている額と、再開のしやすさ'],
        lean,
        needed: ['実際の月額（年額換算）', '同じ用途を代替できる手段の有無', '直近3ヶ月の実際の使用回数'],
        face: FACES.thinking,
      };
    },
  },
};

// -----------------------------------------------------------------------------
// テンプレ4: 光回線を乗り換えるか（乗り換える vs 今のまま）※行動判定型
//   記事(hikari-kaisen-norikae / hikari-cashback-wana)からの流入トピックに対応。
//   税・投資・保険と違い高リスク領域でなく、SIMと同型の固定費最適化=¥1,000二択に適合。
// -----------------------------------------------------------------------------
const HIKARI = {
  id: 'hikari',
  title: '光回線を乗り換えるか、今のままか',
  subtitle: '自宅の光回線・ネット料金',
  choiceA: '乗り換える',
  choiceB: '今のまま',
  match: ['光回線', '光コラボ', '光', 'ひかり', 'プロバイダ', 'フレッツ', 'ドコモ光', 'ソフトバンク光', 'auひかり', 'nuro', 'ホームルーター', 'ネット回線', 'hikari'],
  questions: [
    { id: 'q_current', prompt: '今の光回線、月いくら払ってる？',
      hint: 'プロバイダ込み・割引後の実額で。分からなければ「わからない」。',
      face: FACES.thinking,
      options: [
        { value: 'gt6000', label: '6千円くらい〜' },
        { value: 'mid', label: '4〜6千円' },
        { value: 'lt4000', label: '〜4千円' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_cashback', prompt: '今の契約、キャッシュバックや割引の適用期間は終わってる？',
      hint: '割引が切れると相場より高くなりがち。終了後の実額で判断します。',
      face: FACES.smirk,
      options: [
        { value: 'ended', label: '終わった/元々ない', swipe: 'right' },
        { value: 'active', label: 'まだ割引中', swipe: 'left' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_bundle', prompt: 'スマホとのセット割（自宅ネット×スマホ）を使ってる？',
      hint: '乗り換えるとこの割引が消えることがある（＝失う額）。',
      face: FACES.thinking,
      options: [
        { value: 'yes', label: '使ってる', swipe: 'left' },
        { value: 'no', label: '使ってない', swipe: 'right' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_contract', prompt: '更新月・違約金（解約金）は確認した？',
      hint: '期間中の解約は違約金や工事費の残債が出ることがある。',
      face: FACES.thinking,
      options: [
        { value: 'soon', label: 'もうすぐ更新/縛りなし', swipe: 'right' },
        { value: 'mid', label: 'まだ期間中', swipe: 'left' },
        { value: 'unknown', label: 'わからない' },
      ] },
    { id: 'q_hassle', prompt: '開通工事・回線切替の手間、どれくらい平気？',
      hint: '新規回線は工事や事務手数料が発生することがある。',
      face: FACES.smirk,
      options: [
        { value: 'ok', label: '多少なら平気', swipe: 'right' },
        { value: 'hate', label: '面倒は絶対いや', swipe: 'left' },
      ] },
  ],
  discover: {
    ask: ['q_current', 'q_cashback'],
    result(a) {
      let lean;
      if (a.q_current === 'unknown' || a.q_current === undefined) lean = { dir: 'neutral', label: 'まだ五分', note: '今の実質月額がわからないと傾きが出せません。' };
      else if (a.q_cashback === 'unknown' || a.q_cashback === undefined) lean = { dir: 'neutral', label: 'まだ五分', note: '割引・キャッシュバックの適用状況で変わるため、まだ五分。' };
      else if (a.q_current === 'lt4000') lean = { dir: 'neutral', label: 'まだ五分', note: 'すでに安め。候補プランや使い方しだいで差は小さめです。' };
      else if (a.q_cashback === 'active') lean = { dir: 'neutral', label: 'まだ五分', note: 'まだ割引適用中。今動くと違約金やキャッシュバック条件を失う恐れがあり、更新月まで待つ判断もあります。' };
      else if (a.q_current === 'gt6000') lean = { dir: 'A', label: 'ゆるく「乗り換える」寄り', note: '割引が切れて相場より高めなら、乗り換えで下げる余地があります（実額で要確認）。' };
      else lean = { dir: 'A', label: 'ゆるく「乗り換える」寄り', note: '割引終了後の実質月額しだいで差が出ます。工事費・違約金と釣り合うか確認を。' };
      return {
        topic: '光回線を乗り換えるか、今のままか',
        type: '行動判定型（乗り換える／今のまま）',
        axes: ['割引終了後の実質月額の高さ', '乗り換えで発生する 工事費・違約金・失うセット割'],
        lean,
        needed: ['割引/キャッシュバック終了後の実質月額', '更新月と違約金（解約金）・工事費の残債', 'スマホとのセット割で引かれている実額', '新回線の工事費・事務手数料と、受け取り条件つきキャッシュバック'],
        face: FACES.thinking,
      };
    },
  },
};

// 順序に意味あり: 「光 乗り換え」のような重複語入力で SIM(汎用語'乗り換え'を持つ) より
// HIKARI を先に一致させるため、hikari を sim の前に置く。
export const TEMPLATES = { card: CARD, hikari: HIKARI, sim: SIM, sub: SUB };

// -----------------------------------------------------------------------------
// 公開API（発見のみ）
// -----------------------------------------------------------------------------

// テンプレ一覧（発見UIの候補表示用）
export function listTemplates() {
  return Object.values(TEMPLATES).map(t => ({
    id: t.id, title: t.title, subtitle: t.subtitle, choiceA: t.choiceA, choiceB: t.choiceB,
  }));
}

// 各質問の許容enum（options の value 集合）
export function allowedEnum(templateId) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) return {};
  const map = {};
  for (const q of tpl.questions) map[q.id] = q.options.map(o => o.value);
  return map;
}

// 選択肢に無い回答（不正enum）のキー一覧。undefined は未回答として許容。
export function invalidAnswers(templateId, answers) {
  const allow = allowedEnum(templateId);
  answers = answers || {};
  return Object.keys(answers).filter(k => allow[k] && answers[k] !== undefined && !allow[k].includes(answers[k]));
}

// 入力分類: 対象外(高リスク)・比較(A/B)・対応テンプレ・該当なし を区別（テンプレ一致より先に除外を評価）
const HIGH_RISK = ['借入', '借金', 'ローン', 'キャッシング', 'リボ', '債務', '返済', '税', '確定申告', '年末調整', '相続', '贈与', '投資', '資産運用', '株', '投信', 'nisa', 'ideco', 'fx', '為替', '仮想通貨', '暗号資産', '保険', '医療', '病気', '通院', '手術', '薬', 'メンタル', '法律', '弁護士', '離婚', '慰謝料', '自己破産'];
const COMPARE_RX = /どっち|どちら|\bvs\b|ｖｓ|比較/;
function matchTemplate(tpl, t) {
  return tpl.match.some(kw => {
    const k = String(kw).toLowerCase();
    if (/^[a-z0-9]+$/.test(k)) return new RegExp('\\b' + k + '\\b', 'i').test(t); // ASCIIは語境界（simple→sim 誤爆を防ぐ）
    return t.includes(k);
  });
}
export function classifyInput(text) {
  if (!text) return { kind: 'none' };
  const t = String(text).toLowerCase();
  if (HIGH_RISK.some(k => t.includes(k))) return { kind: 'out_of_scope' };   // 投資/借入/税/保険/医療/法律 等
  if (COMPARE_RX.test(t)) return { kind: 'comparison' };                      // A対B（半手動）
  for (const tpl of Object.values(TEMPLATES)) {
    if (matchTemplate(tpl, t)) return { kind: 'template', id: tpl.id };
  }
  return { kind: 'none' };
}

// 発見ルーティング: 対応テンプレなら id、それ以外は null（後方互換）
export function routeTheme(text) {
  const c = classifyInput(text);
  return c.kind === 'template' ? c.id : null;
}

// 無料版の発見ドライバ: 短い質問で「題材・判断軸・傾き・不足情報」を返す（最終判定は出さない）
export function discover(templateId, answers) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error('unknown template: ' + templateId);
  answers = answers || {};
  // fail-closed: 選択肢に無い回答があれば発見も止める（推測しない）
  if (invalidAnswers(templateId, answers).length) {
    return { done: true, result: {
      template_id: templateId, topic: tpl.title, type: tpl.discover.result({}).type,
      axes: [], lean: { dir: 'neutral', label: '判定できません', note: '選択肢にない回答があります。もう一度選び直してください。' },
      needed: [], face: FACES.troubled,
    } };
  }
  const spec = tpl.discover;
  const nextId = spec.ask.find(id => answers[id] === undefined);
  if (nextId) {
    const q = tpl.questions.find(x => x.id === nextId);
    return { done: false, ask: q, asked: Object.keys(answers).length };
  }
  return { done: true, result: { template_id: templateId, ...spec.result(answers) } };
}

// モヤモヤ（感情カード）→ 候補テンプレのマッピング
export const MOYA_CARDS = [
  { id: 'money_leak', label: '毎月なんとなくお金が減る', face: FACES.troubled, suggest: ['sub', 'sim', 'hikari'] },
  { id: 'too_many', label: '選択肢が多すぎて決められない', face: FACES.thinking, suggest: ['card', 'sim'] },
  { id: 'phone_bill', label: 'スマホ代が高い気がする', face: FACES.thinking, suggest: ['sim'] },
  { id: 'net_bill', label: '家のネット・光回線の料金が高い気がする', face: FACES.thinking, suggest: ['hikari'] },
  { id: 'card_tempt', label: 'カードの勧誘に迷っている', face: FACES.smirk, suggest: ['card'] },
  { id: 'unused', label: '使ってないのに払ってる気がする', face: FACES.surprised, suggest: ['sub'] },
];
