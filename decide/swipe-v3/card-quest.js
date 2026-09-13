// Mio Decision Deck v3 — 質問データ（改行・DEEP DIVE分岐・不足情報選択）※無料側・verdict非出力
// -----------------------------------------------------------------------------
// ★このモジュールは最終判定(GO/HOLD/NO)を持たない。無料側のみ。
//   改行は画面幅任せにせず lines[] で明示（word-break/keep-all併用）。
//   DEEP DIVE の追加質問は「最初の3回答から、判定を変えうる/理由を具体化する/
//   実現手順を決める/不足すると推測になる」情報だけを選ぶ。
// -----------------------------------------------------------------------------

// QUICK(3スワイプ)の表示：意味のまとまりで改行（各行≤18全角・最大2行）。値は swipe-lean が正本。
export const QLINES = {
  card: {
    q_revolving: { lines:['リボや分割払い、','残ってる？'], sub:'カードローン等の残高', L:'ある', R:'ない' },
    q_benefit:   { lines:['年会費の特典、','年1回は使ってる？'], sub:'ラウンジ・旅行保険・継続特典', L:'使わない', R:'使う' },
    q_free_ok:   { lines:['今の無料カードで、','困ってることある？'], sub:'ポイントや特典の物足りなさ', L:'ない', R:'ある' },
  },
  sim: {
    q_bundle: { lines:['家族割やセット割、','使ってる？'], sub:'自宅ネットとのセット割など', L:'使ってる', R:'使ってない' },
    q_hassle: { lines:['乗り換えの手続き、','平気？'], sub:'MNP・SIM差し替え・初期設定', L:'面倒はいや', R:'平気' },
    q_usage:  { lines:['データ、','たくさん使う？'], sub:'月20GB超くらい', L:'たくさん', R:'少なめ' },
  },
  sub: {
    q_used:   { lines:['この1か月、','実際に使った？'], sub:'入ってる安心ではなく実利用', L:'使ってない', R:'使った' },
    q_alt:    { lines:['無料や別契約で、','代わりになる？'], sub:'同じ用途を他で満たせる', L:'代わりある', R:'これが必要' },
    q_rejoin: { lines:['また使うとき、','すぐ入り直せる？'], sub:'多くは即再開できる', L:'入り直しにくい', R:'すぐ入れる' },
  },
  hikari: {
    q_cashback: { lines:['割引や特典期間は、','もう終わった？'], sub:'適用期間の終了／元々なし', L:'まだ割引中', R:'終わった' },
    q_bundle:   { lines:['スマホとのセット割、','使ってる？'], sub:'自宅ネット×スマホ割', L:'使ってる', R:'使ってない' },
    q_contract: { lines:['更新月や違約金は、','確認した？'], sub:'縛り・解約金の有無', L:'まだ期間中', R:'縛りゆるい' },
  },
};

// DEEP DIVE：カードの追加質問（実額）。粗いバンドをやめ、カード特定＋数値入力を取得。why=なぜ聞くか。
export const CARD_DEEP = {
  q_card: {
    kind:'select', lines:['どのカードで、','迷ってる？'],
    why:'公式の年会費・特典・キャンペーンを表示するために使います',
    options:[ {v:'jal',l:'JALカード'}, {v:'smcc',l:'三井住友カード'}, {v:'amex',l:'アメックス'}, {v:'rakuten',l:'楽天カード'}, {v:'other',l:'その他・入力'} ],
  },
  fee_yen: {
    kind:'num', unit:'円', lines:['年会費は、','いくら？'],
    why:'年会費を回収できるか、実額で計算するために使います',
    hint:'本会員＋家族会員の年額', placeholder:'例 11000', allowUnknown:true,
  },
  spend_yen: {
    kind:'num', unit:'円', lines:['1年で、','いくら使う？'],
    why:'還元で年会費を取り返せるか計算するために使います',
    hint:'還元対象の年間利用額', placeholder:'例 800000', allowUnknown:true,
  },
  lounge_count: {
    kind:'num', unit:'回', lines:['空港ラウンジ、','年に何回使う？'],
    why:'特典の価値を、使う回数×本人評価で見積もるために使います',
    hint:'使わなければ 0', placeholder:'例 2',
  },
  campaign_value: {
    kind:'num', unit:'円', lines:['入会特典は、','いくら相当？'],
    why:'初年度だけの損得を分けて計算するために使います',
    hint:'分からなければスキップ', placeholder:'例 5000', optional:true, allowUnknown:true,
  },
};

const has = (a,k)=> a[k]!==undefined && a[k]!==null && a[k]!=='' && a[k]!=='unknown';

// 最初の回答から「結論を変える不足項目だけ」を選ぶ（全員同じ5問は出さない）。最大5。
export function selectDeep(theme, ans) {
  if (theme !== 'card') return [];
  const a = ans || {};
  if (a.q_revolving === 'yes') return []; // 返済優先でNO確定＝追加不要
  const need = [];
  if (!has(a,'card')) need.push('q_card');
  if (!has(a,'fee_yen')) need.push('fee_yen');
  if (!has(a,'spend_yen')) need.push('spend_yen');
  if (a.q_benefit === 'yes') {
    if (!has(a,'lounge_count')) need.push('lounge_count');
    if (!has(a,'campaign_value')) need.push('campaign_value');
  }
  return need.slice(0, 5);
}

// 回答の十分性（定量判定に必要な実額がそろったか）。ok=計算可能。
export function sufficiency(theme, ans) {
  const a = ans || {};
  if (theme !== 'card') return { ok: true, missing: [] };
  if (a.q_revolving === 'yes') return { ok: true, missing: [] };
  const missing = [];
  if (!has(a,'card')) missing.push('q_card');
  if (!has(a,'fee_yen')) missing.push('fee_yen');
  if (!has(a,'spend_yen')) missing.push('spend_yen');
  if (a.q_benefit === 'yes' && !has(a,'lounge_count')) missing.push('lounge_count');
  return { ok: missing.length === 0, missing };
}

// 同一入力＝同一 decision_id（二重消費防止・再読込で同じ結果）。安定ハッシュ。
export function decisionId(theme, ans) {
  const a = ans || {};
  const keys = ['card','q_revolving','q_benefit','q_free_ok','fee_yen','spend_yen','lounge_count','lounge_val','other_benefit_value','campaign_value'];
  const s = theme + '|' + keys.map(k=> k+'='+(a[k]===undefined?'':a[k])).join('&');
  let h = 5381; for (let i=0;i<s.length;i++){ h = ((h<<5)+h) ^ s.charCodeAt(i); h |= 0; }
  return theme + '-' + (h>>>0).toString(36);
}

// DEEP後の「気付き」精緻化（無料・方向づけのみ・verdictは出さない）。
export function refinedInsight(theme, ans) {
  if (theme !== 'card') return null;
  const a = ans || {};
  if (a.q_revolving === 'yes') return 'リボ・分割・ローンの返済が最優先です。金利（年15%前後）は、どんなカード特典よりも大きな固定コストになります。';
  const fee = a.q_fee, spend = a.q_spend, benefit = a.q_benefit;
  if ((fee === 'high' || fee === 'mid') && (spend === 'lt50')) return '年会費に対して年間の利用額が控えめです。還元（1%前後）だけで年会費を取り返すのは難しめ。使う特典の価値がカギになります。';
  if (benefit === 'yes' && (spend === 'gt150')) return '特典を使い、利用額も大きめ。年会費に見合う可能性が高い形です。実際の年会費と特典の使用回数で最終確認します。';
  if (fee === 'under2000') return '年会費が小さいので、使う特典が少しでもあれば見合いやすいゾーンです。';
  return '年会費と年間利用額のバランス次第です。実額がそろえば、はっきり言い切れます。';
}

// checked_at 用（呼び出し側で new Date() を渡してもよい）
export function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}
