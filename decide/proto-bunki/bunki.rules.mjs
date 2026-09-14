// Mio分岐予報 決定エンジン（fixture・コードで確定・Luna非依存・DOM非依存）。
// node（10ケース検証）と browser（type=module）で同一コードを共有する。
// ★不変条件:
//  (1)希望額>上限ならGO禁止 (2)逆転条件は未達かつ現在値から実行可能なもののみ (3)達成済を未達に出さない
//  (4)結論/未来/逆転条件/手順は同じ計算結果から生成し矛盾しない（固定の危機文を使わない）
//  (5)数値不足時は架空上限を出さない
export const YEN = n => (n==null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('ja-JP');

// QUICK（無料・傾きのみ・最終判定しない）
export function quickMode(ans){
  const score = ans.filter(Boolean).length;
  const fundThin = ans[0] === false;
  if (score >= 3) return { key:'attack', label:'攻めどき', tend:'資金・家計・借入すべて健全。動きやすい局面。' };
  if (fundThin || score <= 1) return { key:'wait', label:'待ちどき', tend:'手元資金が薄い/赤字/借入が重なる。まず守りを固める局面。' };
  return { key:'tune', label:'整えどき', tend:'黒字だが手元資金が薄め、または借入あり。土台を整えれば動ける局面。' };
}

export const DEEP_FIELDS = ['desired','savings','living','surplus','upcoming','added'];
export const FIELD_LABEL = {
  desired:'希望する購入額', savings:'今の使える貯蓄額', living:'生活に必要な月額',
  surplus:'毎月の実質余剰額', upcoming:'半年以内の大型支出予定額', added:'購入後に増える月額費用'
};

export function decide(inp){
  const missing = DEEP_FIELDS.filter(k => inp[k]==null || isNaN(inp[k]) || inp[k] < 0);
  if (missing.length) return { state:'NEEDS_INPUT', missing, need:'算出には追加情報が必要（架空の上限は出しません）' };
  const { desired, savings, living, surplus, upcoming, added } = inp;

  const bufferNeeded = living * 6;                                   // 生活防衛資金の目安
  const cashCap      = Math.max(0, savings - bufferNeeded - upcoming); // 一括で出せる上限
  const bufferMet    = savings >= bufferNeeded;
  const withinCash   = desired <= cashCap;
  const fixedOK      = added <= surplus;

  // 購入(一括)後の実数値。未来説明・手順はこれらから生成する。
  const postSavings   = savings - desired;                          // 購入直後の貯蓄
  const postBufferGap = Math.max(0, bufferNeeded - postSavings);    // 購入後の防衛資金の不足額
  const monthlyAfter  = surplus - added;                            // 購入後の月次収支(黒字/赤字)
  const shortfall     = Math.max(0, desired - cashCap);             // 上限の超過額
  const monthlySave   = surplus;                                    // 購入前に積める月額
  const waitMonths    = (shortfall > 0 && monthlySave > 0) ? Math.ceil(shortfall / monthlySave) : null;

  // 条件(met判定)。逆転条件の表示はこの未達から、現在値で実行可能なものだけを atomic に生成。
  const conds = [
    { key:'buffer', met:bufferMet }, { key:'cash', met:withinCash }, { key:'fixed', met:fixedOK },
  ];
  const unmet = conds.filter(c => !c.met);

  // ★逆転条件: 未達 かつ 現在値から実行可能なものだけ（0円を減らす等の実行不能を除外）
  const reversal = [];
  if (!withinCash) {
    reversal.push({ text:`希望額を上限（${YEN(cashCap)}円）以下に下げる`, feasible: true });
    reversal.push({ text:`貯蓄を ${YEN(shortfall)}円 以上増やす${waitMonths?`（毎月 ${YEN(monthlySave)}円 なら約 ${waitMonths}か月）`:''}`, feasible: monthlySave > 0 });
    reversal.push({ text:`半年内の大型支出（現在 ${YEN(upcoming)}円）を減らす`, feasible: upcoming > 0 });
  }
  if (!bufferMet) {
    reversal.push({ text:`生活防衛資金6か月分（${YEN(bufferNeeded)}円）まで貯蓄を ${YEN(bufferNeeded - savings)}円 増やす`, feasible: true });
  }
  if (!fixedOK) {
    reversal.push({ text:`購入後に増える固定費（現在 月 ${YEN(added)}円）を毎月余剰 ${YEN(surplus)}円 以内に下げる`, feasible: true });
    reversal.push({ text:`毎月余剰を ${YEN(added - surplus)}円 増やす`, feasible: true });
  }
  const reversalConditions = reversal.filter(r => r.feasible).map(r => r.text);

  let state, concl;
  if (bufferMet && withinCash && fixedOK) { state='GO'; concl='進めてよい（上限内・防衛資金維持・固定費も余剰内）'; }
  else if (!bufferMet || cashCap <= 0)    { state='WAIT'; concl='今は見送り（まず生活防衛資金の確保が先）'; }
  else if (!withinCash)                    { state='REDUCE'; concl=`減額すれば可（上限 ${YEN(cashCap)}円 まで下げる）`; }
  else                                     { state='COND_HOLD'; concl='条件付きHOLD（固定費増が毎月余剰を超える）'; }

  const basis = [
    `生活防衛資金の目安 = 生活費月額 ${YEN(living)}円 × 6 = ${YEN(bufferNeeded)}円`,
    `一括で出せる上限 = 貯蓄 ${YEN(savings)}円 − 防衛資金 ${YEN(bufferNeeded)}円 − 半年内の大型支出 ${YEN(upcoming)}円 = ${YEN(cashCap)}円`,
    `希望額 ${YEN(desired)}円 ${withinCash?'≤':'＞'} 上限 ${YEN(cashCap)}円 → ${withinCash?'範囲内':`超過 ${YEN(shortfall)}円`}`,
    `購入後の月次収支 = 毎月余剰 ${YEN(surplus)}円 − 固定費増 ${YEN(added)}円 = ${YEN(monthlyAfter)}円（${monthlyAfter>=0?'黒字':'赤字'}）`,
  ];
  return { state, concl, cashCap, bufferNeeded, bufferMet, withinCash, fixedOK,
    postSavings, postBufferGap, monthlyAfter, shortfall, monthlySave, waitMonths,
    unmet, reversalConditions, basis, inp };
}
export const isGo = s => s === 'GO';

// 未来の分岐（固定文でなく、計算結果から生成）
export function branchesFor(d){
  if (d.state === 'GO') return {
    go:{ t:'このまま進む', lines:[
      `月次収支は購入後も約 ${YEN(d.monthlyAfter)}円 の黒字`,
      `購入後の貯蓄 ${YEN(d.postSavings)}円 は生活防衛資金 ${YEN(d.bufferNeeded)}円 を維持`,
    ] },
    skip:{ t:'見送った場合', lines:['必要な買い物を先送りする分、値・在庫・時期の機会を逃す可能性。'] } };
  const lines = [];
  lines.push(`月次収支は購入後も約 ${YEN(d.monthlyAfter)}円 の${d.monthlyAfter>=0?'黒字':'赤字'}`);
  if (d.postBufferGap > 0)
    lines.push(`購入直後の貯蓄が ${YEN(d.postSavings)}円 となり、生活防衛資金 ${YEN(d.bufferNeeded)}円 を ${YEN(d.postBufferGap)}円 下回る`);
  if (!d.withinCash)
    lines.push(`希望額が上限を ${YEN(d.shortfall)}円 超える`);
  return {
    go:{ t:'このまま進む', lines },
    skip:{ t:'整えてから進む', lines:[
      '下の逆転条件を満たしてから購入。安全度を保ったまま、次の機会で動ける。' +
      (d.waitMonths ? ` 毎月 ${YEN(d.monthlySave)}円 の貯蓄なら約 ${d.waitMonths}か月で不足を解消。` : '')
    ] } };
}

export function stepsFor(d){
  switch(d.state){
    case 'GO': return [
      '今日：上限内であることを最終確認し、維持費・更新費も月額に足して再確認',
      '今週：発注（上限を超える上位グレードには広げない）',
      '継続：購入後の固定費が余剰内に収まっているか毎月モニタ' ];
    case 'REDUCE': return [
      `今日：希望額 ${YEN(d.inp.desired)}円 を上限 ${YEN(d.cashCap)}円 以内へ見直す（差額 ${YEN(d.shortfall)}円）`,
      d.waitMonths
        ? `今週：毎月 ${YEN(d.monthlySave)}円 の貯蓄なら約 ${d.waitMonths}か月で不足 ${YEN(d.shortfall)}円 を解消。上限（${YEN(d.cashCap)}円）以下への値下がりも待機候補`
        : `今週：上限（${YEN(d.cashCap)}円）以内の候補で相見積り`,
      `解消後：上限 ${YEN(d.cashCap)}円 以内でこの診断を再実行して確定` ];
    case 'WAIT': return [
      `今日：購入ページを閉じ、生活費6か月分（${YEN(d.bufferNeeded)}円）と現在貯蓄 ${YEN(d.inp.savings)}円 の差を確認`,
      '今週：貯蓄の積み増し計画（毎月いくら・いつ防衛資金に届くか）を作る',
      '防衛資金到達後：もう一度この診断で上限と分岐を出し直す' ];
    default: /* COND_HOLD */ return [
      `今日：購入後に増える固定費（月 ${YEN(d.inp.added)}円）の実額と内訳（保険/通信/維持）を洗い出す`,
      `今週：固定費増を毎月余剰（${YEN(d.inp.surplus)}円）以内に収める代替案（グレード/プラン変更）を検討`,
      '固定費が余剰内に収まったら、上限内でこの診断を再実行して確定' ];
  }
}

// 観点（本人が気づかない）: borderlineのときだけ1軸。fixtureはコード選択（本番はLunaが候補軸→選択肢化）。
export function selectExtraAxis(inp, d){
  if (!d || d.state === 'NEEDS_INPUT') return null;
  if (d.state === 'REDUCE' || d.state === 'COND_HOLD') return {
    key:'postpone', q:'この買い物、どれくらい先送りできますか？',
    opts:[{v:'urgent',t:'すぐ必要'},{v:'months',t:'数ヶ月ならOK'},{v:'flex',t:'急がない'}],
    note:'先送りできる期間で、待つべきか今動くかが変わります。' };
  if (d.state === 'GO' && inp.added > 0) return {
    key:'upkeep', q:'維持費・更新費（保険/修理/買い替え）は月額に見込みましたか？',
    opts:[{v:'yes',t:'見込んだ'},{v:'no',t:'まだ'}],
    note:'本体価格より、維持費・更新費が総額を押し上げることがあります。' };
  if (d.state === 'WAIT') return {
    key:'reversible', q:'もし今買うとして、売却・返品でどれくらい取り戻せますか？',
    opts:[{v:'high',t:'ほぼ戻る'},{v:'low',t:'ほぼ戻らない'}],
    note:'可逆性が低い買い物ほど、待ちどきに動くリスクが大きくなります。' };
  return null;
}

// 観点の回答を反映。★何を変えたかを affects で明示（verdict/cap/change_condition/action_plan/none）。
// fixtureでは verdict/cap は数値計算が正のため変えない（＝action_planのみ具体化）。
export function foldExtraAxis(d, axisKey, ansVal){
  if (axisKey === 'postpone' && ansVal === 'flex' && d.state !== 'GO'){
    const steps = [];
    if (d.waitMonths) steps.push(`急がないなら、毎月 ${YEN(d.monthlySave)}円 の貯蓄で約 ${d.waitMonths}か月待てば不足 ${YEN(d.shortfall)}円 を埋められる`);
    steps.push(`${d.waitMonths?`${d.waitMonths}か月待つ`:'条件成立を待つ'}か、上限 ${YEN(d.cashCap)}円 以下へ値下がりするまで待つ`);
    steps.push(`${d.waitMonths?`${d.waitMonths}か月後`:'条件成立後'}に同条件で再判定する`);
    return { affects:'action_plan', text:`「急がない」→ 手順に待機期間を具体化（判定・上限・逆転条件は不変）。`, extraSteps: steps };
  }
  if (axisKey === 'postpone' && ansVal === 'urgent' && d.state === 'REDUCE')
    return { affects:'action_plan', text:'「すぐ必要」→ 手順を「上限内へ減額して今回はミニマム構成」に具体化（判定・上限は不変）。',
      extraSteps:[`すぐ必要なら、今回は上限 ${YEN(d.cashCap)}円 以内の構成に絞って購入する`] };
  if (axisKey === 'upkeep' && ansVal === 'no')
    return { affects:'action_plan', text:'「維持費未計上」→ 手順に維持費・更新費の月額計上を追加（判定・上限は不変）。',
      extraSteps:['購入前に維持費・保険・更新費を月額換算し、毎月余剰に収まるか再確認する'] };
  if (axisKey === 'reversible' && ansVal === 'low')
    return { affects:'action_plan', text:'「可逆性が低い」→ 待ちどきの購入は特に慎重に（判定は不変）。',
      extraSteps:['売却/返品で戻りにくいため、防衛資金到達までは購入を保留する'] };
  return { affects:'none', text:null, extraSteps:[] };
}
