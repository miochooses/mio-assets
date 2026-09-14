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

export const has = (inp, k) => inp[k] != null && !isNaN(inp[k]) && inp[k] >= 0;

export function decide(inp){
  // ★ハードストップ: 貯蓄 < 生活防衛資金 は、残りを入力しても結論は「待ち」で変わらない。
  // 全項目を待たず早期に確定WAITを返す（架空の上限は出さない＝上限0）。
  if (has(inp,'savings') && has(inp,'living') && inp.savings < inp.living * 6){
    const bufferNeeded = inp.living * 6;
    const monthlyKnown = has(inp,'surplus') && has(inp,'added');
    const monthlyAfter = monthlyKnown ? (inp.surplus - inp.added) : null;
    const postSavings = has(inp,'desired') ? (inp.savings - inp.desired) : null;
    const postBufferGap = postSavings != null ? Math.max(0, bufferNeeded - postSavings) : Math.max(0, bufferNeeded - inp.savings);
    return {
      state:'WAIT', concl:'今は見送り（生活防衛資金が不足＝守りが最優先）', earlyHardStop:true,
      cashCap:0, bufferNeeded, bufferMet:false, withinCash:false, fixedOK: monthlyKnown ? (inp.added <= inp.surplus) : true,
      postSavings, postBufferGap,
      monthlyAfter, shortfall:0, monthlySave: has(inp,'surplus') ? inp.surplus : null, waitMonths:null,
      unmet:[{key:'buffer',met:false}],
      reversalConditions:[`生活防衛資金6か月分（${YEN(bufferNeeded)}円）まで貯蓄を ${YEN(bufferNeeded - inp.savings)}円 増やす`],
      basis:[
        `生活防衛資金の目安 = 生活費月額 ${YEN(inp.living)}円 × 6 = ${YEN(bufferNeeded)}円`,
        `現在の貯蓄 ${YEN(inp.savings)}円 ＜ 防衛資金 ${YEN(bufferNeeded)}円 → 不足 ${YEN(bufferNeeded - inp.savings)}円`,
        `貯蓄が防衛資金を下回るため、他の入力に関わらず結論は「待ち」`,
      ],
      inp
    };
  }
  const missing = DEEP_FIELDS.filter(k => !has(inp,k));
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
  if (d.monthlyAfter != null)
    lines.push(`月次収支は購入後も約 ${YEN(d.monthlyAfter)}円 の${d.monthlyAfter>=0?'黒字':'赤字'}`);
  if (d.postBufferGap > 0 && d.postSavings != null)
    lines.push(`購入直後の貯蓄が ${YEN(d.postSavings)}円 となり、生活防衛資金 ${YEN(d.bufferNeeded)}円 を ${YEN(d.postBufferGap)}円 下回る`);
  else if (d.earlyHardStop)
    lines.push(`現在の貯蓄が生活防衛資金を ${YEN(d.postBufferGap)}円 下回っており、購入で守りがさらに薄くなる`);
  if (!d.withinCash && d.shortfall > 0)
    lines.push(`希望額が上限を ${YEN(d.shortfall)}円 超える`);
  if (!lines.length) lines.push('今の状態では、購入より守りを固める方が有利。');
  return {
    go:{ t:'このまま進む', lines },
    skip:{ t:'整えてから進む', lines:[
      '下の逆転条件を満たしてから購入。安全度を保ったまま、次の機会で動ける。' +
      (d.waitMonths ? ` 毎月 ${YEN(d.monthlySave)}円 の貯蓄なら約 ${d.waitMonths}か月で不足を解消。` : '')
    ] } };
}

// 実行手順は最大3ステップ。追加観点(axis)は既存プランへ「意味で統合」し、単純追加・重複・時期矛盾を作らない。
export function stepsFor(d, axisKey, axisVal){
  const cap = d.cashCap, save = d.monthlySave, wm = d.waitMonths, sf = d.shortfall;
  const targetSavings = (d.inp && d.inp.savings != null && sf != null) ? d.inp.savings + sf : null;
  let s;
  switch(d.state){
    case 'GO':
      s = [
        '今日：上限内であることを最終確認し、維持費・更新費も月額に足して再確認',
        '今週：発注（上限を超える上位グレードには広げない）',
        (axisKey==='upkeep' && axisVal==='no')
          ? '継続：維持費・保険・更新費を月額換算し、毎月余剰に収まるか確認'
          : '継続：購入後の固定費が余剰内に収まっているか毎月モニタ',
      ];
      break;
    case 'REDUCE':
      if (axisKey==='reversible' && axisVal==='low'){
        // 推奨=可逆性を確保して買う
        s = [
          `今日：返品可・中古売却しやすい候補を ${YEN(cap)}円 前後で探す`,
          '今週：返品条件と売却相場を確認し、合わなければ戻せる個体に絞る',
          '購入後：使わない場合の返品/売却の期限をカレンダーに登録',
        ];
      } else if ((axisKey==='reversible' && axisVal==='high') || (axisKey==='postpone' && axisVal==='urgent')){
        // 推奨=上限内へ減額して今買う
        s = [
          `今日：上限 ${YEN(cap)}円 以内の構成に絞って候補を選ぶ（希望額を ${YEN(sf)}円 削る）`,
          '今週：上限内の候補で相見積り・発注',
          '継続：合わなければ売却/返品できる状態を維持',
        ];
      } else {
        // 既定: 待って希望額（時期ラベルを整合）
        s = [
          `今日：希望額を ${YEN(cap)}円 以下へ見直し、候補を比較する`,
          wm ? `${wm}か月：毎月 ${YEN(save)}円 を貯めるか、${YEN(cap)}円 以下への値下がりを待つ`
             : `直近：上限 ${YEN(cap)}円 以内の候補で相見積り`,
          wm ? `${wm}か月後：貯蓄 ${YEN(targetSavings)}円 以上、または希望額 ${YEN(cap)}円 以下で再判定する`
             : `解消後：上限 ${YEN(cap)}円 以内で再判定する`,
        ];
      }
      break;
    case 'WAIT': {
      const gap = Math.max(0, d.bufferNeeded - (d.inp ? d.inp.savings : 0));
      s = [
        `今日：購入ページを閉じ、生活費6か月分（${YEN(d.bufferNeeded)}円）と現在貯蓄 ${YEN(d.inp && d.inp.savings)}円 の差を確認`,
        (axisKey==='reversible' && axisVal==='low')
          ? `毎月：不足 ${YEN(gap)}円 に向け積み増し（可逆性が低いので到達までは購入を保留）`
          : `毎月：不足 ${YEN(gap)}円 に向けた積み増し計画を作る`,
        '防衛資金到達後：もう一度この診断で上限と分岐を出し直す',
      ];
      break;
    }
    default: /* COND_HOLD */
      s = [
        `今日：購入後に増える固定費（月 ${YEN(d.inp && d.inp.added)}円）の実額と内訳（保険/通信/維持）を洗い出す`,
        (axisKey==='postpone' && axisVal==='flex')
          ? `当面：急がないので、固定費を毎月余剰（${YEN(d.inp && d.inp.surplus)}円）以内へ下げてから購入を検討`
          : `今週：固定費増を毎月余剰（${YEN(d.inp && d.inp.surplus)}円）以内に収める代替案を検討`,
        '収まったら：上限内でこの診断を再実行して確定',
      ];
  }
  return s.slice(0, 3);
}

// 観点（本人が気づかない）: borderlineのときだけ1軸。fixtureはコード選択（本番はLunaが候補軸→選択肢化）。
export function selectExtraAxis(inp, d){
  if (!d || d.state === 'NEEDS_INPUT') return null;
  // 非自明な観点=可逆性(売却/返品で戻せるか)。回答で選択肢の順位・推奨が実際に変わる。
  if (d.state === 'REDUCE' || d.state === 'WAIT' || d.state === 'COND_HOLD') return {
    key:'reversible', q:'もし合わなかったら、売却・返品でどれくらい取り戻せますか？',
    opts:[{v:'high',t:'ほぼ戻る（新しめ/人気/返品可）'},{v:'mid',t:'半分くらい'},{v:'low',t:'ほぼ戻らない'}],
    note:'「戻せるか（可逆性）」は、今動くか待つかの順位を変える隠れた判断軸です。' };
  if (d.state === 'GO' && inp.added > 0) return {
    key:'upkeep', q:'維持費・更新費（保険/修理/買い替え）は月額に見込みましたか？',
    opts:[{v:'yes',t:'見込んだ'},{v:'no',t:'まだ'}],
    note:'本体価格より、維持費・更新費が総額を押し上げることがあります。' };
  return null;
}

// 観点の回答が「何を変えたか」を affects で明示（verdict/cap/change_condition/action_plan/none）。
// ★手順への反映は stepsFor 側で意味統合する（ここでは追加ステップを返さない＝重複を作らない）。
// fixtureでは verdict/cap/change_condition は数値計算が正のため変えず、action_plan のみ具体化する。
export function foldExtraAxis(d, axisKey, ansVal){
  if (axisKey === 'postpone' && ansVal === 'flex' && d.state !== 'GO')
    return { affects:'action_plan', text:'「急がない」→ 手順の待機期間・再判定条件に反映（判定・上限・逆転条件は不変）。' };
  if (axisKey === 'postpone' && ansVal === 'urgent' && d.state === 'REDUCE')
    return { affects:'action_plan', text:'「すぐ必要」→ 手順を「上限内へ減額して今回はミニマム構成」に切替（判定・上限は不変）。' };
  if (axisKey === 'upkeep' && ansVal === 'no')
    return { affects:'action_plan', text:'「維持費未計上」→ 継続の手順に維持費・更新費の月額計上を反映（判定・上限は不変）。' };
  if (axisKey === 'reversible' && ansVal === 'low')
    return { affects:'action_plan', text:'「可逆性が低い」→ 待ちの手順に「到達まで購入保留」を反映（判定は不変）。' };
  return { affects:'none', text:null };
}

// ---- 選択肢生成（結論でなく「選べる案」を出す）----
// 各案に merit/loss/condition/mioEval/fit を持たせ、パーソナルな推奨(recommendation)を返す。
// 推奨は state と観点(axis)から決定（コード確定・再現可能）。
export function buildOptions(d, axisKey, axisVal){
  const cap=d.cashCap, desired=d.inp.desired, sf=d.shortfall, wm=d.waitMonths, save=d.monthlySave, gap=d.postBufferGap;
  let options=[], recId, recWhy, changed=null;
  if (d.state==='REDUCE'){
    const A={id:'A',title:`今すぐ ${YEN(desired)}円 で購入`,merit:'希望のまま今すぐ手に入る',
      loss:`購入直後の貯蓄が防衛資金を ${YEN(gap)}円 下回る（守りが薄くなる）`+(axisVal==='low'?'。しかも合わなくても取り戻せない':''),
      condition:'追加資金かリスク許容',mioEval:'条件を崩す（非推奨）',fit:'手元資金が薄いと守りが弱い',
      risk:axisVal==='low'?'合わなくても売却/返品で戻せず、防衛資金割れが固定化':'防衛資金割れで急な出費に弱くなる'};
    const B={id:'B',title:`${YEN(cap)}円 以下へ減額して今買う`,merit:'今買えて、防衛資金も維持できる',
      loss:`希望から ${YEN(sf)}円 分の構成を諦める`,condition:`${YEN(cap)}円 以内の候補があること`,
      mioEval:'条件を崩さず今動ける（有力）',fit:'すぐ必要な人向き',risk:'上位機能を一部諦める'};
    let C;
    if (axisKey==='reversible' && axisVal==='low'){
      C={id:'C',title:'可逆性の高い商品（中古/返品可/売却可）で買う',merit:'合わなくても売却・返品で取り戻せる＝実質リスクを圧縮',
        loss:'選べる個体・モデルが限られる',condition:'返品可、または中古売却相場が安定した商品を選ぶ',
        mioEval:'可逆性が低い今回はこれが有力',fit:'失敗を取り戻せる形にしたい人向き',risk:'相場変動で売却額が想定を下回る'};
      recId='C'; recWhy='合わなければ取り戻せる形にすれば、防衛資金を割るリスクを実質的に下げられるため';
      changed='「今の候補は売却・返品で戻りにくい」→ 選択肢Cを『待つ』から『可逆性を確保して買う』へ差し替え、最上位に。';
    } else if (axisKey==='reversible' && axisVal==='high'){
      C={id:'C',title:`${wm?`${wm}か月`:'少し'}待って ${YEN(desired)}円 で購入`,merit:'希望額のまま・防衛資金も維持',
        loss:`${wm?`${wm}か月`:'しばらく'}待つ（時期・機会）`,condition:`毎月 ${YEN(save)}円 の貯蓄、または値下がり`,
        mioEval:'堅実だが、今回は待つ必要が下がる',fit:'急がない人向き',risk:'待つ間に価格や在庫が動く'};
      recId='B'; recWhy='売却・返品で取り戻せるなら待つ必要が下がり、上限内へ減額して今日動く方が有利なため';
      changed='「合わなければ売却・返品で戻せる」→ 待つ必要が下がり、おすすめを『待つ(C)』から『減額して今買う(B)』へ変更。';
    } else {
      C={id:'C',title:`${wm?`${wm}か月`:'少し'}待って ${YEN(desired)}円 で購入`,merit:'希望額のまま・防衛資金も維持',
        loss:`${wm?`${wm}か月`:'しばらく'}待つ（時期・機会）`,condition:`毎月 ${YEN(save)}円 の貯蓄、または ${YEN(cap)}円 以下への値下がり`,
        mioEval:'最も条件を崩さない（本命）',fit:'急がない人向き',risk:'待つ間に価格や在庫が動く'};
      recId='C'; recWhy=`急がないなら約${wm||1}か月で希望額のまま条件を崩さず買えるため`;
    }
    options=[A,B,C];
    options.forEach(o=>o.recommended=(o.id===recId));
    return { options, recommendation:{id:recId, why:recWhy}, changed };
  }
  if (d.state==='GO'){
    options=[
      {id:'A',title:`今すぐ ${YEN(desired)}円 で購入`,merit:'すぐ手に入り、機会を逃さない',loss:'なし（上限内・防衛資金維持・固定費も余剰内）',condition:'現状の数値が正しいこと',mioEval:'条件を崩さない（おすすめ）',fit:'今の家計なら無理がない'},
      {id:'B',title:'上位グレードに広げる',merit:'満足度が上がる可能性',loss:`上限 ${YEN(cap)}円 を超えると防衛資金や月次を崩す`,condition:`総額を ${YEN(cap)}円 以内に保つ`,mioEval:'上限超過なら非推奨',fit:'こだわりが強い人向け（要注意）'},
      {id:'C',title:'今回は見送る',merit:'資金をさらに厚くできる',loss:'必要な買い物が遅れる',condition:'今すぐ必要でないこと',mioEval:'無理はないが今回は動いてよい',fit:'超保守的な人向け'},
    ]; recId='A'; recWhy='上限内で、防衛資金も毎月の家計も崩さずに買えるため';
  } else if (d.state==='REDUCE'){
    options=[
      {id:'A',title:`今すぐ ${YEN(desired)}円 で購入`,merit:'希望のまま今すぐ手に入る',loss:`購入直後の貯蓄が防衛資金を ${YEN(gap)}円 下回る（守りが薄くなる）`,condition:'追加資金かリスク許容',mioEval:'条件を崩す（非推奨）',fit:'手元資金が薄いと守りが弱くなる'},
      {id:'B',title:`${YEN(cap)}円 以下の候補へ変更`,merit:'今買えて、防衛資金も維持できる',loss:`希望から ${YEN(sf)}円 分の構成を諦める`,condition:`${YEN(cap)}円 以内の候補があること`,mioEval:'条件を崩さず今動ける（有力）',fit:'すぐ必要な人向き'},
      {id:'C',title:`${wm?`${wm}か月`:'少し'}待って ${YEN(desired)}円 で購入`,merit:'希望額のまま・防衛資金も維持',loss:`${wm?`${wm}か月`:'しばらく'}待つ（時期・機会）`,condition:`毎月 ${YEN(save)}円 の貯蓄、または ${YEN(cap)}円 以下への値下がり`,mioEval:'最も条件を崩さない（本命）',fit:'急がない人向き'},
    ];
    if (axisKey==='postpone' && axisVal==='urgent'){ recId='B'; recWhy='すぐ必要なら、上限内へ抑えれば守りを崩さず今日動けるため'; }
    else { recId='C'; recWhy=`急がないなら、約${wm||1}か月で希望額のまま条件を崩さず買えるため`; }
  } else if (d.state==='WAIT'){
    const need=Math.max(0,d.bufferNeeded-(d.inp?d.inp.savings:0));
    options=[
      {id:'A',title:`今すぐ ${YEN(desired)}円 で購入`,merit:'すぐ手に入る',loss:'生活防衛資金を割り、家計の耐性が大きく下がる',condition:'緊急の必要性',mioEval:'今は危険（非推奨）',fit:'現状には合わない'},
      {id:'B',title:'防衛資金を確保してから購入',merit:'守りを保ったまま、あとで安全に買える',loss:'今は買えない',condition:`貯蓄を ${YEN(need)}円 積み増す`,mioEval:'今の本命（おすすめ）',fit:'家計を守りたいあなたに合う'},
      {id:'C',title:'最小限の金額に抑えて購入',merit:'必要最小限は満たせる',loss:'それでも防衛資金は薄いまま',condition:'本当に必要な最小額に絞る',mioEval:'次善（やむを得ない場合）',fit:'どうしても今必要な人向け'},
    ]; recId='B'; recWhy='生活防衛資金が不足しており、まず守りを固めるのが最優先のため';
  } else { // COND_HOLD
    options=[
      {id:'A',title:`今すぐ ${YEN(desired)}円 で購入`,merit:'すぐ手に入る',loss:'購入後の固定費増で毎月赤字化する',condition:'固定費を吸収できる収入増',mioEval:'月次が回らず非推奨',fit:'今の余剰では苦しい'},
      {id:'B',title:'固定費を下げてから購入',merit:'月次を黒字に保てる',loss:'プラン見直しの手間',condition:`固定費増を毎月余剰 ${YEN(d.inp.surplus)}円 以内に`,mioEval:'条件を満たせば可（有力）',fit:'ランニングコストを管理したい人向き'},
      {id:'C',title:'グレードを下げて固定費を抑える',merit:'本体も固定費も軽くなる',loss:'希望構成の一部を諦める',condition:'固定費が小さい構成にする',mioEval:'現実的な次善',fit:'総支出を抑えたい人向き'},
    ]; recId='B'; recWhy='固定費増が毎月余剰を超えるため、先に固定費を余剰内へ収めるのが本命のため';
  }
  options.forEach(o=> o.recommended = (o.id===recId));
  return { options, recommendation:{ id:recId, why:recWhy }, changed };
}

// ---- 段階的評価（暫定判定）: 部分入力から「今分かること」を返す。最終結論ではない。----
// 情報充足度は質問数でなく「判定に必要な軸が揃ったか」で計算する。
export function assess(inp){
  const h = k => has(inp, k);
  const axes = [
    { key:'buffer',    label:'生活防衛資金の判定', ok: h('savings') && h('living') },
    { key:'direction', label:'上限に対する方向',   ok: h('savings') && h('living') && h('desired') },
    { key:'cap',       label:'正確な上限額',        ok: h('savings') && h('living') && h('upcoming') },
    { key:'monthly',   label:'購入後の月次維持',    ok: h('surplus') && h('added') },
  ];
  const sufficiency = Math.round(100 * axes.filter(a => a.ok).length / axes.length);
  const canFinalize = h('desired') && h('savings') && h('living') && h('upcoming') && h('surplus') && h('added');

  // ハードストップ（早期確定）: 貯蓄 < 防衛資金 → 残りに関わらず「待ち」
  let hardStop = null;
  if (h('savings') && h('living') && inp.savings < inp.living * 6){
    hardStop = { state:'WAIT',
      reason:`貯蓄 ${YEN(inp.savings)}円 が生活防衛資金 ${YEN(inp.living*6)}円 を下回るため、残りを入力しても結論は「待ち」で変わりません。` };
  }

  const known = [], unknown = [], couldChange = [], nextReveals = [];
  let direction = null, directionReason = null;
  if (h('savings') && h('living')){
    const buf = inp.living * 6, prelimCap = Math.max(0, inp.savings - buf); // 上限の上振れ値(半年内支出を引く前)
    known.push(`生活防衛資金の目安は ${YEN(buf)}円`);
    if (inp.savings >= buf) known.push(`生活防衛資金は確保できている（貯蓄 ${YEN(inp.savings)}円）`);
    else known.push(`生活防衛資金を ${YEN(buf - inp.savings)}円 下回っている`);
    if (h('desired')){
      if (inp.savings < buf){ direction = '待ち寄り'; directionReason = '生活防衛資金が不足しており、まず守りを固める局面のため'; }
      else if (inp.desired > prelimCap){ direction = '減額寄り';
        directionReason = `希望額 ${YEN(inp.desired)}円 が暫定の上限（最大 ${YEN(prelimCap)}円）を超えているため`;
        known.push(`希望額 ${YEN(inp.desired)}円 は上限（最大でも ${YEN(prelimCap)}円）を超える`); }
      else { direction = '上限内の可能性';
        directionReason = `希望額が暫定の上限 ${YEN(prelimCap)}円 に収まっているため（半年内支出で下がる可能性）`;
        known.push(`希望額 ${YEN(inp.desired)}円 は暫定上限 ${YEN(prelimCap)}円 の範囲内（半年内支出でさらに下がり得る）`); }
    }
  }
  if (!h('upcoming')){
    unknown.push('半年以内の大型支出（未入力）');
    couldChange.push('半年内支出が大きいほど上限が下がり、「上限内」→「減額」に変わり得る');
    nextReveals.push('正確な買える上限額');
  }
  if (!h('surplus') || !h('added')){
    unknown.push('毎月の余剰／購入後の固定費増（未入力）');
    couldChange.push('固定費増が毎月余剰を超えると「条件付きHOLD」になり得る');
    nextReveals.push('購入後の月次維持可否（黒字か赤字か）');
  }
  if (canFinalize) nextReveals.push('確定結論・計算根拠・逆転条件・実行手順');

  return { sufficiency, canFinalize, hardStop, direction, directionReason, known, unknown, couldChange, nextReveals, axes };
}
