// Mio Decision Deck v3 — カード有料判定（トレーサブルな詳細結果）※有料側・pass時のみ動的import
// -----------------------------------------------------------------------------
// 監査済み decide()（=最終GO/HOLD/NO・decide-engine）を土台に、利用者の入力へ紐づく
// 詳細理由・捨てる理由・結論が変わる条件・盲点・実現手順・参照情報を付ける。
// ★汎用文をパーソナライズと呼ばない。入力に紐づかない理由は納品しない。
// -----------------------------------------------------------------------------
import { decide } from '../paid/decide-engine.js';

// 回答→（設問・回答・影響・理由）のトレース素材。存在し意味のある回答だけを積む。
const TRACE = {
  q_revolving: {
    yes: { q:'リボ・分割・ローンの残高は？', a:'ある', impact:'年会費カードより、返済を優先すべき状況', reason:'借入金利（年15%前後）は、カード還元（1%前後）を大きく上回るコスト。特典を追う前に金利負担を減らす方が家計への効果が大きいため。' },
    no:  { q:'リボ・分割・ローンの残高は？', a:'ない', impact:'年会費と特典で純粋に損得比較ができる', reason:'高金利の返済がないため、還元・特典と年会費の比較でシンプルに判断できるため。' },
  },
  q_benefit: {
    yes: { q:'年会費の特典を年1回以上使う？', a:'使う', impact:'年会費回収の根拠になりうる', reason:'実際に使う特典は本人の便益として計上できるため。ただし使用回数×代替価格で見積もる必要がある。' },
    no:  { q:'年会費の特典を年1回以上使う？', a:'使わない', impact:'年会費回収の根拠を弱める', reason:'利用予定のない特典は、額面価値があっても本人の便益として計上できないため。' },
  },
  q_fee: {
    under2000:{ q:'年会費は？', a:'〜2千円', impact:'回収ハードルが低い', reason:'年会費が小さいほど、少しの還元・特典で元が取りやすいため。' },
    mid:     { q:'年会費は？', a:'1〜3万円台', impact:'回収に相応の利用額/特典が必要', reason:'中程度の年会費は、還元だけで取り返すには年間利用額がある程度必要なため。' },
    high:    { q:'年会費は？', a:'4万円以上', impact:'回収ハードルが高い', reason:'高額年会費は、ラウンジ・付帯サービスを実際に多用しないと元を取りにくいため。' },
  },
  q_spend: {
    lt50:  { q:'年間利用額は？', a:'〜50万円', impact:'還元での回収額が小さい', reason:'年50万円×1%＝約5千円。年会費が数千円を超えると還元だけでは足りないため。' },
    mid150:{ q:'年間利用額は？', a:'50〜150万円', impact:'中会費なら回収圏内', reason:'年100万円前後×1%＝約1万円。中程度の年会費なら特典と合わせて見合う可能性があるため。' },
    gt150: { q:'年間利用額は？', a:'150万円〜', impact:'還元だけでも回収に近づく', reason:'年150万円超×1%＝1.5万円以上。特典を使えば高会費でも見合いやすいため。' },
  },
  q_free_ok: {
    fine:{ q:'今の無料カードに不満は？', a:'特にない', impact:'乗り換える動機が弱い', reason:'現状で足りているなら、わざわざ年会費を払う必要性が薄いため。' },
    want:{ q:'今の無料カードに不満は？', a:'ある（物足りない）', impact:'上位カードを検討する動機になる', reason:'現状の不満は、年会費に見合う価値があれば解消しうるため。' },
  },
  q_benefit_detail: {
    lounge:   { q:'よく使う特典は？', a:'空港ラウンジ', impact:'年会費回収の具体材料', reason:'ラウンジ利用は1回1,000〜3,000円相当。年間利用回数×単価で年会費と比較できるため。' },
    insurance:{ q:'よく使う特典は？', a:'旅行保険', impact:'代替保険料との比較材料', reason:'付帯保険は、別途加入する保険料の代替として価値換算できるため。' },
    continue: { q:'よく使う特典は？', a:'継続特典', impact:'毎年の固定的な便益', reason:'継続特典（宿泊無料等）は毎年もらえるため、年会費と直接比較しやすいため。' },
    points:   { q:'よく使う特典は？', a:'ポイント優遇', impact:'還元率の上乗せ分', reason:'優遇分の還元率×利用額が、年会費に対する上乗せ便益になるため。' },
    none:     { q:'よく使う特典は？', a:'特にない', impact:'特典側の回収根拠が弱い', reason:'具体的に使う特典がないと、年会費を特典価値で回収する根拠が立たないため。' },
  },
  q_campaign: {
    yes:{ q:'入会キャンペーンで初年度は実質おトク？', a:'上回りそう', impact:'初年度に限り申込みが有利になりうる', reason:'初年度の特典が年会費を上回るなら、初年度だけはプラスに転じるため（2年目以降は別途判断）。' },
    no: { q:'入会キャンペーンで初年度は実質おトク？', a:'そうでもない', impact:'初年度の後押しは弱い', reason:'キャンペーンで年会費を相殺できないなら、初年度から通常の損得計算になるため。' },
  },
};
const TRACE_ORDER = ['q_revolving','q_benefit','q_fee','q_spend','q_benefit_detail','q_campaign','q_free_ok'];

function buildTrace(ans) {
  const out = [];
  for (const id of TRACE_ORDER) {
    const v = ans[id];
    if (v === undefined || v === 'unknown') continue;
    const t = TRACE[id] && TRACE[id][v];
    if (t) out.push({ question: t.q, answer: t.a, impact: t.impact, reason: t.reason });
  }
  return out;
}

function discarded(verdict) {
  if (verdict === 'NO') return [{ option:'今、申し込む', why:'使う予定の特典が少なく、年会費を還元・特典で回収できる見込みが薄いため。今の無料カードで足りている場合はなおさら。' }];
  if (verdict === 'GO') return [{ option:'今の無料カードのままにする', why:'使う特典と利用額から年会費を上回る便益が見込めるため、据え置きは機会損失になりうる。' }];
  return [
    { option:'今すぐ申し込む', why:'年会費か年間利用額が未確定で、今決めると推測になるため。' },
    { option:'完全に諦める', why:'条件次第で見合う可能性が残るため、実額確認までは棚上げが妥当。' },
  ];
}
function changeConditions(verdict) {
  if (verdict === 'NO') return ['年間利用額が150万円を超える','使う特典（ラウンジ等）を年2回以上、実際に使う','初年度の年会費を上回る入会キャンペーンを使える'];
  if (verdict === 'GO') return ['年間利用額が想定を大きく下回る','使う予定だった特典を結局使わない','2年目以降に年会費が上がる／特典が改悪される'];
  return ['実際の2年目以降の年会費が判明する','年間の還元対象利用額が判明する'];
}
function actionPlan(verdict) {
  if (verdict === 'NO') return [
    { order:1, when:'今日', action:'申込みページを閉じ、キャンペーン終了日だけカレンダーに登録する。', caution:'「今だけ」の表示に押されて衝動申込みしない。', done:'衝動申込みをしない状態にする' },
    { order:2, when:'今週', action:'今のカードの年間利用額を、公式アプリ／明細ページで確認する。', caution:'家賃・税金など還元対象外は除いて数える。', done:'過去12か月の利用額を把握する' },
    { order:3, when:'キャンペーン終了7日前', action:'条件が変わっていないか、このMioでもう一度判定する。', caution:'変わっていなければ「見送り」で確定。', done:'再判定を実施する' },
  ];
  if (verdict === 'GO') return [
    { order:1, when:'今日', action:'公式ページで2年目以降の年会費・主要特典の条件を再確認する。', caution:'初年度無料でも、2年目の金額を必ず見る。', done:'年会費と主要特典を確認する' },
    { order:2, when:'今日', action:'入会キャンペーンの対象経路・達成条件（利用額/期間）を確認する。', caution:'ポイント付与の達成期限を見落とさない。', done:'達成条件を把握する' },
    { order:3, when:'申込み', action:'公式申込みページから手続きする（ポイントサイト経由の可否も確認）。', caution:'年会費区分・付帯サービスの選択を間違えない。', done:'申込みを完了する' },
    { order:4, when:'申込み後', action:'利用条件の達成期限と、翌年の更新判断日をカレンダー登録する。', caution:'達成前の解約は特典を逃す。', done:'2つの期日を登録する' },
  ];
  return [
    { order:1, when:'今日', action:'2年目以降の年会費を公式ページで確認する。', caution:'初年度優遇に惑わされない。', done:'年会費を確定する' },
    { order:2, when:'今週', action:'年間の還元対象利用額を明細で確認する。', caution:'還元対象外の支払いは除く。', done:'利用額を把握する' },
    { order:3, when:'そろったら', action:'このMioでもう一度判定（DEEP DIVE）する。', caution:'—', done:'言い切れる状態にする' },
  ];
}

// メイン：カードの詳細判定（トレーサブル）。ans = quick3 + deep。
export function cardDecideRich(ans, now) {
  const a = ans || {};
  const base = decide('card', a);           // {done, result:{verdict, chosen, headline, reasons, drop_reason, blindspot, today, caution, face}}
  const r = (base && base.done && base.result) ? base.result : null;
  const d = now || new Date();
  const checked_at = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  const sources = [{ label:'各カード公式サイトの「年会費・特典・入会キャンペーン条件」', note:'金額・条件は申込み前に必ず公式でご確認ください。' }];

  if (!r) {
    return { done:false, decision:'HOLD', headline:'まだ言い切れません（不足あり）',
      reason_trace: buildTrace(a),
      discarded_alternatives: discarded('HOLD'),
      change_conditions: changeConditions('HOLD'),
      blind_spots: ['不足した項目を推測で埋めると、結論がぶれます。'],
      action_plan: actionPlan('HOLD'), sources, checked_at, face:'thinking' };
  }
  const blind = [];
  if (r.blindspot) blind.push(r.blindspot.replace(/^盲点[:：]?\s*/, ''));
  blind.push('「持っているだけで安心」は便益に計上できません。実際に使う回数だけが価値です。');

  return {
    done: true,
    decision: r.verdict,                    // GO / HOLD / NO
    chosen: r.chosen,
    headline: r.headline || (r.reasons && r.reasons[0]) || '',
    reason_trace: buildTrace(a),
    discarded_alternatives: discarded(r.verdict),
    change_conditions: changeConditions(r.verdict),
    blind_spots: blind,
    action_plan: actionPlan(r.verdict),
    today: r.today || '',
    sources,
    checked_at,
    face: r.face || (r.verdict === 'GO' ? 'thumbs_up' : r.verdict === 'NO' ? 'troubled' : 'thinking'),
  };
}
