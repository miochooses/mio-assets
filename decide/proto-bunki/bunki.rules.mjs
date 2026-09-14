// Mio分岐予報 決定エンジン（fixture・コードで確定・Luna非依存・DOM非依存）。
// node（10ケース検証）と browser（type=module）で同一コードを共有する。
// ★不変条件: (1)希望額>上限ならGO禁止 (2)逆転条件は未達のみ (3)達成済を未達に出さない
//            (4)結論/理由/逆転条件/手順は同一booleanから導出し矛盾しない (5)数値不足時は架空上限を出さない
export const YEN = n => (n==null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('ja-JP');

// QUICK（無料・傾きのみ・最終判定しない）
export function quickMode(ans){ // ans:[bool,bool,bool] true=攻め側
  const score = ans.filter(Boolean).length;
  const fundThin = ans[0] === false;
  if (score >= 3) return { key:'attack', label:'攻めどき', tend:'資金・家計・借入すべて健全。動きやすい局面。' };
  if (fundThin || score <= 1) return { key:'wait', label:'待ちどき', tend:'手元資金が薄い/赤字/借入が重なる。まず守りを固める局面。' };
  return { key:'tune', label:'整えどき', tend:'黒字だが手元資金が薄め、または借入あり。土台を整えれば動ける局面。' };
}

// DEEP（有料・数値から上限と判定をコードで確定）
export const DEEP_FIELDS = ['desired','savings','living','surplus','upcoming','added'];
export const FIELD_LABEL = {
  desired:'希望する購入額', savings:'今の使える貯蓄額', living:'生活に必要な月額',
  surplus:'毎月の実質余剰額', upcoming:'半年以内の大型支出予定額', added:'購入後に増える月額費用'
};

export function decide(inp){
  const missing = DEEP_FIELDS.filter(k => inp[k]==null || isNaN(inp[k]) || inp[k] < 0);
  if (missing.length) return { state:'NEEDS_INPUT', missing, need:'算出には追加情報が必要（架空の上限は出しません）' };
  const { desired, savings, living, surplus, upcoming, added } = inp;
  const bufferNeeded = living * 6;                                  // 生活防衛資金の目安
  const cashCap = Math.max(0, savings - bufferNeeded - upcoming);   // 一括で出せる上限
  const bufferMet = savings >= bufferNeeded;
  const withinCash = desired <= cashCap;
  const fixedOK = added <= surplus;

  const conds = [
    { key:'buffer', met:bufferMet, label:'生活防衛資金6か月分の確保',
      unmet:`生活防衛資金6か月分（${YEN(bufferNeeded)}円）を確保する（現在の貯蓄 ${YEN(savings)}円）` },
    { key:'cash', met:withinCash, label:'希望額が上限以内',
      unmet: cashCap > 0
        ? `希望額を上限（${YEN(cashCap)}円）以内にする、または貯蓄を ${YEN(Math.max(0, desired - cashCap))}円 増やす／半年内の大型支出を減らす`
        : `貯蓄が「防衛資金＋半年内支出」に届いていない。まず貯蓄を積む（上限が0円超になるまで）` },
    { key:'fixed', met:fixedOK, label:'固定費増が毎月余剰以内',
      unmet:`購入後に増える固定費を毎月余剰（${YEN(surplus)}円）以内にする（現在 月 ${YEN(added)}円）` },
  ];
  const unmet = conds.filter(c => !c.met);          // ★未達のみ（達成済は含めない）

  let state, concl;
  if (bufferMet && withinCash && fixedOK) { state='GO'; concl='進めてよい（上限内・防衛資金維持・固定費も余剰内）'; }
  else if (!bufferMet || cashCap <= 0)    { state='WAIT'; concl='今は見送り（まず生活防衛資金の確保が先）'; }
  else if (!withinCash)                    { state='REDUCE'; concl=`減額すれば可（上限 ${YEN(cashCap)}円 まで下げる）`; }
  else                                     { state='COND_HOLD'; concl='条件付きHOLD（固定費増が毎月余剰を超える）'; }

  const basis = [
    `生活防衛資金の目安 = 生活費月額 ${YEN(living)}円 × 6 = ${YEN(bufferNeeded)}円`,
    `一括で出せる上限 = 貯蓄 ${YEN(savings)}円 − 防衛資金 ${YEN(bufferNeeded)}円 − 半年内の大型支出 ${YEN(upcoming)}円 = ${YEN(cashCap)}円`,
    `希望額 ${YEN(desired)}円 ${withinCash?'≤':'＞'} 上限 ${YEN(cashCap)}円 → ${withinCash?'範囲内':'超過'}`,
    `固定費増 月 ${YEN(added)}円 ${fixedOK?'≤':'＞'} 毎月余剰 ${YEN(surplus)}円 → ${fixedOK?'許容内':'余剰超過'}`,
  ];
  return { state, concl, cashCap, bufferNeeded, bufferMet, withinCash, fixedOK, unmet, basis, inp };
}
export const isGo = s => s === 'GO';

// 状態別テキスト（結論/分岐/手順を同一stateから導出＝矛盾しない）
export function branchesFor(d){
  if (d.state === 'GO') return {
    go:{ t:'このまま進む', body:'上限内・防衛資金を保ったまま購入。固定費も余剰内で、家計の安全度を崩さない。' },
    skip:{ t:'見送った場合', body:'必要な買い物を先送りする分、機会（値・在庫・時期）を逃す可能性。' } };
  return {
    go:{ t:'このまま無理に進む', body:'短期の満足は上がるが、防衛資金の取り崩し／毎月赤字で、守りが必要な局面に選択肢が減る。' },
    skip:{ t:'整えてから進む', body:'下の逆転条件を満たしてから購入。安全度を保ったまま、次の機会で動ける。' } };
}
export function stepsFor(d){
  switch(d.state){
    case 'GO': return [
      '今日：上限内であることを最終確認し、発注前に維持費・更新費も月額に足して再確認',
      '今週：発注（上限を超える上位グレードには広げない）',
      '継続：購入後の固定費が余剰内に収まっているか毎月モニタ' ];
    case 'REDUCE': return [
      `今日：希望額 ${YEN(d.inp.desired)}円 を上限 ${YEN(d.cashCap)}円 以内へ見直す（グレード/型落ち/構成で調整）`,
      '今週：上限内の候補で相見積り。差額を貯蓄・半年内支出の余裕に回す',
      `条件成立後：上限（${YEN(d.cashCap)}円）以内でこの診断を再実行して確定` ];
    case 'WAIT': return [
      '今日：購入ページを閉じ、生活費6か月分の金額を実際に計算する',
      '今週：貯蓄の積み増し計画（毎月いくら・いつ防衛資金に届くか）を作る',
      '防衛資金到達後：もう一度この診断で上限と分岐を出し直す' ];
    default: /* COND_HOLD */ return [
      `今日：購入後に増える固定費（月 ${YEN(d.inp.added)}円）の実額と内訳（保険/通信/維持）を洗い出す`,
      `今週：固定費増を毎月余剰（${YEN(d.inp.surplus)}円）以内に収める代替案（グレード/プラン変更）を検討`,
      '固定費が余剰内に収まったら、上限内でこの診断を再実行して確定' ];
  }
}

// 観点（本人が気づかない）: 既知数値で決まらない/borderlineのときだけ1軸。
// fixtureはコード選択（本番はLunaが候補軸を出し選択肢化）。
export function selectExtraAxis(inp, d){
  if (!d || d.state === 'NEEDS_INPUT') return null;
  if (d.state === 'REDUCE' || d.state === 'COND_HOLD') return {
    key:'postpone', q:'この買い物、どれくらい先送りできますか？',
    opts:[{v:'urgent',t:'すぐ必要'},{v:'months',t:'数ヶ月ならOK'},{v:'flex',t:'急がない'}],
    note:'先送りできる期間は、値引き待ち・条件成立待ちの余地に直結します。' };
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
export function foldExtraAxis(d, axisKey, ansVal){
  if (axisKey==='postpone' && ansVal==='flex' && d.state!=='GO')
    return '急ぎでないなら、逆転条件が整うまで待つ方が有利（先送り可能）。';
  if (axisKey==='postpone' && ansVal==='urgent' && d.state==='REDUCE')
    return 'すぐ必要なら、上限内へ減額して今回はミニマム構成に留めるのが現実的。';
  if (axisKey==='upkeep' && ansVal==='no')
    return '維持費・更新費を月額に足すと固定費の余裕が想定より小さくなる点に注意。';
  if (axisKey==='reversible' && ansVal==='low')
    return '可逆性が低いので、待ちどきでの購入は特に慎重に。';
  return null;
}
