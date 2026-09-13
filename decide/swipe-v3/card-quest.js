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

// DEEP DIVE：カードの追加質問バンク（スワイプに固執せず選択チップ）。why=なぜ聞くか1行。
export const CARD_DEEP = {
  q_fee: {
    lines:['この年会費は、','いくらくらい？'],
    why:'年会費を回収できるか計算するために使います',
    kind:'chips',
    options:[ {v:'under2000',l:'〜2千円'}, {v:'mid',l:'1〜3万円台'}, {v:'high',l:'4万円以上'}, {v:'unknown',l:'わからない'} ],
  },
  q_spend: {
    lines:['このカードで、','年いくら使う？'],
    why:'還元で年会費を取り返せるか計算するために使います',
    kind:'chips',
    options:[ {v:'lt50',l:'〜50万円'}, {v:'mid150',l:'50〜150万円'}, {v:'gt150',l:'150万円〜'}, {v:'unknown',l:'わからない'} ],
  },
  q_benefit_detail: {
    lines:['よく使う特典は、','どれ？'],
    why:'特典の価値を、あなたの使い方で見積もるために使います',
    kind:'chips',
    options:[ {v:'lounge',l:'空港ラウンジ'}, {v:'insurance',l:'旅行保険'}, {v:'continue',l:'継続特典'}, {v:'points',l:'ポイント優遇'}, {v:'none',l:'特にない'} ],
  },
  q_campaign: {
    lines:['入会キャンペーンで、','初年度は実質おトク？'],
    why:'初年度の年会費を上回る特典があるか確認するために使います',
    kind:'chips',
    options:[ {v:'yes',l:'上回りそう'}, {v:'no',l:'そうでもない'}, {v:'unknown',l:'わからない'} ],
  },
};

// 最初の3回答から「まだ必要な追加質問」を選ぶ（同じ5問を全員には出さない）。最大5。
export function selectDeep(theme, ans) {
  if (theme !== 'card') return []; // 今回はカードのみDEEP実装
  const a = ans || {};
  // リボあり→結論はNOで確定。追加質問で結論は変わらない＝聞かない。
  if (a.q_revolving === 'yes') return [];
  const need = [];
  if (a.q_fee === undefined || a.q_fee === 'unknown') need.push('q_fee');
  if (a.q_spend === undefined || a.q_spend === 'unknown') need.push('q_spend');
  // 特典を使う人には、どの特典か＋キャンペーンで初年度を相殺できるかを聞くと理由が具体化する
  if (a.q_benefit === 'yes') {
    if (a.q_benefit_detail === undefined) need.push('q_benefit_detail');
    if (a.q_campaign === undefined) need.push('q_campaign');
  }
  return need.slice(0, 5);
}

// 回答の十分性：3問だけで安全に言い切れるか（推測でGO/NOを出さないための門）。
export function sufficiency(theme, ans) {
  const a = ans || {};
  if (theme !== 'card') {
    // 他テーマは現状QUICKのみ＝傾きは出せるが最終結論は有料前提で常に「追加余地あり」
    return { ok: true, missing: [] };
  }
  if (a.q_revolving === 'yes') return { ok: true, missing: [] }; // 返済優先でNO確定
  const missing = [];
  if (a.q_fee === undefined || a.q_fee === 'unknown') missing.push('q_fee');
  if (a.q_spend === undefined || a.q_spend === 'unknown') missing.push('q_spend');
  return { ok: missing.length === 0, missing };
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
