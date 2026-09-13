// Mio Decision Deck v3 — カード有料判定（定量・3状態・トレーサブル）※有料側・pass時のみ動的import
// -----------------------------------------------------------------------------
// ★本人の実額で計算する。バンド(粗い範囲)ではなく数値入力を前提。
//   状態を3つに分離：
//     READY_DECISIVE … GO/NO を出せる（十分な実額）
//     READY_BALANCED … 実額はそろったが損益が拮抗（正式なHOLD。閾値を数値で提示）
//     NEEDS_INPUT    … 実額(年会費/利用額/カード等)が不足＝判定不能。HOLDではなく入力途中。
//   汎用文でなく本人の数字を使う。仮定値は利用者が変更できる前提で明示。
//   action_plan は循環禁止（「もう一度Mioで判定」を入れない）。URLは実在 or 理由付き。
// browser/node 両対応の純ESM。
// -----------------------------------------------------------------------------

// 対応カード（有限）。fee/rate はあくまで初期値の目安で、権威は利用者の入力値。
export const CARD_TABLE = {
  jal:     { name:'JALカード（普通）',        url:'https://www.jal.co.jp/jp/ja/jalcard/',            feeHint:2200,  rate:0.01 },
  smcc:    { name:'三井住友カード（ゴールドNL）', url:'https://www.smbc-card.com/nyukai/card/gold-nl.jsp', feeHint:5500,  rate:0.005 },
  amex:    { name:'アメックス・グリーン',        url:'https://www.americanexpress.com/ja-jp/',          feeHint:13200, rate:0.01 },
  rakuten: { name:'楽天カード',               url:'https://www.rakuten-card.co.jp/',                 feeHint:0,     rate:0.01 },
  other:   { name:'その他のカード',            url:null,                                              feeHint:null,  rate:0.01 },
};

const yen = n => (n==null||isNaN(n)) ? '—' : Math.round(n).toLocaleString('ja-JP') + '円';
const pct = r => (Math.round(r*1000)/10) + '%';

// 数値入力の正規化
function num(v){ if(v==null||v==='') return null; const n=Number(String(v).replace(/[^\d.-]/g,'')); return isNaN(n)?null:n; }

// メイン：本人の実額で定量判定。inp は quick+deep の統合回答。
export function cardDecideRich(inp, now){
  const a = inp || {};
  const d = now || new Date();
  const checked_at = d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();

  const card = CARD_TABLE[a.card] || CARD_TABLE.other;
  const card_url = a.card_url || card.url;
  const rate = (card.rate!=null?card.rate:0.01);
  const fee = num(a.fee_yen);
  const spend = num(a.spend_yen);
  const loungeCount = num(a.lounge_count)||0;
  const loungeVal = num(a.lounge_val)||1500;           // 1回当たりの本人評価額（既定・変更可）
  const otherBenefit = num(a.other_benefit_value)||0;
  const campaign = num(a.campaign_value)||0;

  const src = () => ([{ label:'対象カード公式サイトの「年会費・特典・入会キャンペーン条件」', url:card_url||'', note: card_url?'':'カード名を一覧から選べなかった場合は、お手元のカード会社公式でご確認ください' }]);

  // --- リボあり → 迷わずNO（READY_DECISIVE） ---
  if(a.q_revolving==='yes'){
    return {
      state:'READY_DECISIVE', decision:'NO', card:card.name, card_url,
      headline:'先に、その借入の返済を。年会費カードはそのあとです。',
      amount_gap:null,
      key_point:'借入金利（年15%前後）は、カード還元（約'+pct(rate)+'）を大きく上回るコストだからです。',
      reason_trace:[
        { question:'リボ・分割・ローンの残高は？', answer:'ある', impact:'年会費より返済を優先すべき', reason:'たとえば残高30万円なら年利15%で年間約45,000円の利息。カード還元（利用額の約'+pct(rate)+'）では到底埋まらないため。' },
        { question:'いま年会費カードを追加すべきか', answer:'今は保留', impact:'新規カードは判断材料が変わるまで棚上げ', reason:'借入がある状態では、年会費・特典の損得計算より返済の効果が大きく、カード比較は残高ゼロ後に行う方が正確なため。' },
      ],
      discarded_alternatives:[{ option:'今、年会費カードに申し込む', why:'新規カードは支出を増やしやすく、金利負担の返済と逆行するため。' }],
      change_conditions:['リボ・分割・ローンの残高がゼロになったら、年会費と利用額で改めて計算できます。'],
      blind_spots:['カードの損得は還元率で語られがちですが、借入がある間の最大コストは金利です。'],
      action_plan:[
        { order:1, when:'今日', action:'カードの申込みページを閉じる。', url:card_url||'', caution:'「入会特典は今だけ」に押されない。', done_condition:'衝動申込みをしない' },
        { order:2, when:'今日', action:'借入の適用金利（実質年率）と残高を、利用中のカード会社アプリ／明細で確認する。', url:'', caution:'複数あれば金利が高い順に。', done_condition:'金利と残高を把握' },
        { order:3, when:'今週', action:'返済額を上げられるか（繰上返済・一括）を検討し、可能分を返済する。', url:'', caution:'生活防衛資金は残す。', done_condition:'返済計画を1つ決める' },
      ],
      today: 'まず借入の金利を1つ確認する。',
      sources: src(), checked_at, face:'troubled',
    };
  }

  // --- 実額が足りない → NEEDS_INPUT（HOLDではない・入力途中） ---
  const missing=[];
  if(fee==null) missing.push('fee_yen');
  if(spend==null) missing.push('spend_yen');
  if(missing.length){
    return {
      state:'NEEDS_INPUT', decision:null, card:card.name, card_url, missing,
      headline:'あと'+missing.length+'つ分かれば、ここで確定できます。',
      needed: missing.map(k=> k==='fee_yen'
        ? { key:'fee_yen', label:'正確な年会費', hint:'本会員＋家族会員を含む年額（円）', kind:'num', unit:'円' }
        : { key:'spend_yen', label:'年間のカード利用額', hint:'還元対象の年間利用額（円）', kind:'num', unit:'円' }),
      sources: src(), checked_at, face:'thinking',
    };
  }

  // --- 定量計算（READY_*） ---
  const baseReward = Math.round(spend*rate);
  const loungeValue = loungeCount*loungeVal;
  const benefitValue = loungeValue + otherBenefit;
  const net = baseReward + benefitValue - fee;                 // 2年目以降の定常損益（キャンペーン除く）
  const MARGIN = Math.max(3000, Math.round(fee*0.15));
  const spendBreakeven = rate>0 ? Math.round((fee - benefitValue)/rate) : null;   // 利用額の分岐点
  const benefitBreakeven = fee - baseReward;                                       // 特典価値の分岐点

  const numbers = { fee, spend, rate, baseReward, loungeCount, loungeVal, loungeValue, otherBenefit, benefitValue, campaign, net, MARGIN, spendBreakeven, benefitBreakeven };

  let state, decision;
  if(net >= MARGIN){ state='READY_DECISIVE'; decision='GO'; }
  else if(net <= -MARGIN){ state='READY_DECISIVE'; decision='NO'; }
  else { state='READY_BALANCED'; decision='HOLD'; }

  // 本人の数字を使った reason_trace
  const trace=[];
  trace.push({ question:'対象カードと年会費', answer:(a.card&&a.card!=='other'?card.name+'／':'')+yen(fee), impact:'回収すべき固定コスト', reason:'この'+yen(fee)+'を、還元＋実際に使う特典で取り返せるかを見ます。' });
  trace.push({ question:'年間のカード利用額（還元対象）', answer:yen(spend), impact:'基本還元 '+yen(baseReward)+'（'+pct(rate)+'）', reason:yen(spend)+'×'+pct(rate)+'＝約'+yen(baseReward)+'。これが年会費に対する土台の回収額です。' });
  if(benefitValue>0){
    const parts=[]; if(loungeValue>0) parts.push('ラウンジ 年'+loungeCount+'回×'+yen(loungeVal)+'＝'+yen(loungeValue)); if(otherBenefit>0) parts.push('その他特典 '+yen(otherBenefit));
    trace.push({ question:'実際に使う特典の価値', answer:yen(benefitValue), impact:'還元に上乗せできる便益', reason:parts.join(' ／ ')+'。使う回数×本人評価額で計上（推測しない）。' });
  } else {
    trace.push({ question:'実際に使う特典の価値', answer:'0円', impact:'特典側の回収がない', reason:'年1回以上使う特典が無いため、回収は還元'+yen(baseReward)+'のみで見ます。' });
  }
  const totalBenefit = baseReward+benefitValue;
  trace.push({ question:'年間の損益（2年目以降）', answer:(net>=0?'+':'')+yen(net), impact: net>=0?'年会費を上回る':'年会費に届かない', reason:'便益 '+yen(totalBenefit)+' − 年会費 '+yen(fee)+' ＝ '+(net>=0?'+':'')+yen(net)+'/年。'+(campaign>0?'（初年度は入会特典 '+yen(campaign)+' が別途上乗せ）':'') });

  // 数値化した change_conditions
  const change=[];
  if(decision!=='GO'){
    if(spendBreakeven!=null && spendBreakeven>0){ const dv=spendBreakeven-spend; change.push('年間利用額が約'+yen(spendBreakeven)+'を超えると、申込み側に変わります'+(dv>10000?'（今より約'+yen(dv)+'多い利用）':'')+'。'); }
    if(benefitBreakeven>0) change.push('使う特典の価値を年'+yen(benefitBreakeven)+'以上にできれば、申込み側に変わります（今は'+yen(benefitValue)+'）。');
    if(campaign>0 && campaign>=Math.abs(net)) change.push('初年度に限れば、入会特典'+yen(campaign)+'が不足分'+yen(Math.abs(net))+'を上回るため、初年度だけは得になります（2年目以降は上記の条件）。');
  } else {
    if(spendBreakeven!=null) change.push('年間利用額が約'+yen(spendBreakeven)+'を下回ると、見送り側に近づきます。');
    change.push('使う予定の特典を実際に使わないと、'+yen(benefitValue)+'の便益が消え、損益が'+yen(net-benefitValue)+'/年に下がります。');
    change.push('2年目以降に年会費が上がる／特典が改悪されると、結論が変わります。');
  }

  // 最大の決め手（1行）
  const key_point = decision==='GO'
    ? '便益 '+yen(totalBenefit)+' が年会費 '+yen(fee)+' を '+yen(net)+' 上回るためです。'
    : decision==='NO'
      ? '便益 '+yen(totalBenefit)+' が年会費 '+yen(fee)+' に '+yen(Math.abs(net))+' 届かないためです。'
      : '損益が '+ (net>=0?'+':'') + yen(net) + ' と拮抗し、'+(benefitBreakeven>0?'特典を年'+yen(benefitBreakeven)+'使えるか':'利用額を'+yen(spendBreakeven)+'まで伸ばせるか')+'で結論が割れるためです。';

  const headline = decision==='GO'
    ? 'あなたの数字なら、申し込む方が年'+yen(net)+'お得です。'
    : decision==='NO'
      ? 'あなたの数字では、年'+yen(Math.abs(net))+'の持ち出し。今は見送りが得です。'
      : '必要な条件はそろいました。ただし損益が拮抗し、使い方しだいで結論が変わります。';

  // 捨てる理由
  const discarded = decision==='GO'
    ? [{ option:'今の無料カードのまま', why:'年'+yen(net)+'の便益を取りこぼすため（利用額・特典の使い方が続く前提）。' }]
    : decision==='NO'
      ? [{ option:'今、申し込む', why:'年'+yen(Math.abs(net))+'の持ち出しになり、年会費を還元＋特典で回収できないため。' }]
      : [{ option:'今すぐ申し込む', why:'損益が'+(net>=0?'+':'')+yen(net)+'と僅差で、使い方が想定を下回ると赤字化するため。' },
         { option:'完全に諦める', why:'あと'+yen(Math.abs(Math.min(0,net)))+'ほどの差で、特典の使い方しだいでは得になりうるため。' }];

  // 実現手順（循環禁止・実行動作のみ・URL付き）
  let action_plan;
  if(decision==='GO'){
    action_plan=[
      { order:1, when:'今日', action:card.name+'の公式ページで、2年目以降の年会費（本会員＋家族会員）と主要特典を確認する。', url:card_url||'', caution:'初年度無料でも2年目の金額を見る。', done_condition:'2年目の年会費と特典を確認' },
      { order:2, when:'今日', action:'入会キャンペーンの対象経路・達成条件（必要利用額・期間）を確認する。', url:card_url||'', caution:'ポイントサイト経由の可否と達成期限を見落とさない。', done_condition:'達成条件と期限を把握' },
      { order:3, when:'申込み', action:'公式申込みページから手続きする。', url:card_url||'', caution:'年会費区分・付帯サービスの選択を間違えない。', done_condition:'申込みを完了' },
      { order:4, when:'申込み後すぐ', action:'キャンペーン必要利用額の達成期限と、翌年の更新見直し日をカレンダーに登録する。', url:'', caution:'達成前の解約は特典を逃す。', done_condition:'2つの期日を登録' },
    ];
  } else if(decision==='NO'){
    action_plan=[
      { order:1, when:'今日', action:card.name+'の申込みページを閉じる。', url:card_url||'', caution:'「今だけ」の入会特典表示に押されない。', done_condition:'申込みを止める' },
      { order:2, when:'今日', action:'今使っている無料カードで、公共料金・サブスクの支払いをまとめ、還元の取りこぼしを無くす。', url:'', caution:'還元対象外（税・家賃等）は無理に寄せない。', done_condition:'主要な固定費を1枚に集約' },
      { order:3, when:'半年後', action:'年間利用額が約'+yen(spendBreakeven)+'に近づいたら、そのカードを再検討する（再検討日をカレンダー登録）。', url:'', caution:'利用額が伸びない限り結論は同じ。', done_condition:'再検討日を1つ設定' },
    ];
  } else {
    const needNum = benefitBreakeven>0 ? '使う特典の年間価値' : '年間利用額';
    const where = benefitBreakeven>0 ? '手帳やカレンダーで、その特典を実際に使った回数を数える' : 'カード明細の過去12か月から、還元対象の合計利用額を出す';
    action_plan=[
      { order:1, when:'今日', action:where+'。', url:'', caution:'見込みでなく実績で数える。', done_condition:needNum+'の実数を1つ得る' },
      { order:2, when:'今日', action:'得た実数を、この結果画面の入力欄に入れて再計算する（同じ判定として続きます）。', url:'', caution:'推測値のままにしない。', done_condition:'再計算で GO/NO まで到達' },
      { order:3, when:'確定後', action: (net>=0?'申し込む':'見送る')+'側なら、上の'+(net>=0?'申込み':'停止')+'手順に進む。', url:card_url||'', caution:'—', done_condition:'次の一手を実行' },
    ];
  }

  const blind_spots=[
    '「持っているだけで安心」は便益に計上できません。実際に使った回数だけが価値です（今回はラウンジ '+loungeCount+'回で計算）。',
    decision==='GO' ? '初年度の入会特典'+ (campaign>0?'（'+yen(campaign)+'）':'') +'は一度きり。2年目以降は '+(net>=0?'+':'')+yen(net)+'/年で判断してください。'
                     : '年会費は毎年かかる固定費です。1年だけでなく、使い続ける前提で見てください。',
  ];

  return {
    state, decision, card:card.name, card_url,
    headline, amount_gap:net, key_point,
    numbers,
    reason_trace: trace,
    discarded_alternatives: discarded,
    change_conditions: change,
    blind_spots,
    action_plan,
    today: action_plan[0] ? action_plan[0].action : '',
    sources: src(), checked_at,
    assumptions: (loungeCount>0? [{ key:'lounge_val', label:'ラウンジ1回の価値', value:loungeVal, unit:'円', editable:true }] : []),
    face: decision==='GO'?'thumbs_up':decision==='NO'?'troubled':'thinking',
  };
}

// 納品schema検証（回数消費の前提）。READY_DECISIVE/READY_BALANCED かつ必須フィールド具備で true。
export function isDeliverable(r){
  if(!r) return false;
  if(r.state!=='READY_DECISIVE' && r.state!=='READY_BALANCED') return false;
  if(!r.decision || !r.headline || !r.key_point) return false;
  if(!Array.isArray(r.reason_trace) || r.reason_trace.length<2) return false;
  if(!Array.isArray(r.action_plan) || r.action_plan.length<2) return false;
  // 循環手順の禁止（Mioで再判定を実行手順に入れない）
  if(r.action_plan.some(s=>/もう一度.*(判定|Mio)|DEEP ?DIVE/.test(s.action))) return false;
  if(!Array.isArray(r.change_conditions) || r.change_conditions.length<1) return false;
  if(!r.checked_at) return false;
  return true;
}
