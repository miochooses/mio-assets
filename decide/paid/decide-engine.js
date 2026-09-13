// Mio 二択判定エンジン（有料・Node専用）
// -----------------------------------------------------------------------------
// 「迷っている二択」の最終判定＝decide()。GO/HOLD/NO を出す。
// ★このファイルは Node（半手動納品CLI / 回帰テスト）専用で、ブラウザには配信しない。
//   有料の判定ロジック・金額計算・判定文をクライアントへ漏らさないための分離。
//   無料版（発見のみ）は site-build/decide/decide-core.js の discover() を使う。
//
// 設計（Codex監査R1・REVISE を反映した fail-closed 版）:
//  - テンプレのメタデータ・enum検証・入力分類は decide-core.js を再利用（parity担保）。
//  - 選択肢に無い回答・判断critical な unknown は推測せず HOLD（NaN/false-GO を出さない）。
//  - 代表値バンドで「明確に損」と言えるときだけ断定（NO）、純増を保証できない場合は HOLD。
//  - 金額は「目安・概算」と明示し、候補プラン/失う割引/初期費用/更新日等の未評価項目を伝える。
// -----------------------------------------------------------------------------
import { TEMPLATES, FACES, invalidAnswers, routeTheme, classifyInput, listTemplates } from '../decide-core.js';

export { TEMPLATES, routeTheme, classifyInput, listTemplates };

function toYen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }

// 代表値・境界（バンド→円）。lt50/mid150 は上限、gt150 は無限（＝損の断定不可）
const CARD_SPEND_REP = { lt50: 300000, mid150: 1000000, gt150: 2000000 };
const CARD_SPEND_MAX = { lt50: 500000, mid150: 1500000, gt150: Infinity };
const CARD_FEE = { under2000: 2000, mid: 25000, high: 60000 };
const SIM_CUR = { gt7000: 8500, mid: 5500, lt4000: 3000 };
const SIM_TARGET = 3000;   // 保守想定（ahamo 30GB ≒ ¥2,970 相当）。実額はプランで変動
const SIM_MONTHS = 24;
const SUB_FEE = { lt500: 400, mid: 1000, gt1500: 2000 };
const HIKARI_CUR = { gt6000: 6500, mid: 5000, lt4000: 3500 };
const HIKARI_TARGET = 4000;   // 光コラボ/割引後の保守目安（実額はプラン・キャンペーンで変動）
const HIKARI_MONTHS = 24;

function need(qids) { return { done: false, need: qids }; }
function done(r) {
  return {
    done: true,
    result: {
      verdict: r.verdict,
      template_id: r.tpl.id,
      template_title: r.tpl.title,
      chosen: r.chosen,
      headline: r.headline,
      reasons: (r.reasons || []).slice(0, 3),
      drop_reason: r.drop_reason || '',
      blindspot: r.blindspot || '',
      today: r.today || '',
      caution: r.caution || null,
      trace: r.trace || [],
      face: r.face || FACES.normal,
    },
  };
}
function invalidResult(tpl) {
  return done({
    verdict: 'HOLD', tpl,
    chosen: '今日は決めない（入力を確認）',
    headline: '選択肢にない回答があり、判定できません。もう一度選び直してください。',
    reasons: ['入力値が想定の選択肢に含まれていません。推測では判定しません。'],
    drop_reason: '', blindspot: '', today: '', caution: null, face: FACES.troubled,
  });
}

// ---------------- CARD（年会費カード：申込 vs 見送り） ----------------
function evalCard(a) {
  const tpl = TEMPLATES.card;
  if (a.q_revolving === undefined) return need(['q_revolving']);
  if (a.q_revolving === 'yes') {
    return done({
      verdict: 'NO', tpl, chosen: '今は申し込まない',
      headline: 'このカードより先に、その借入の返済を優先するのが得です。',
      reasons: [
        'リボ・分割・ローンの金利（一般に年15%前後）は、カード還元（1%前後）を大きく上回るコスト。',
        '年会費を払って特典を追う前に、金利負担を減らす方が家計への効果が大きい。',
      ],
      drop_reason: '「申し込む」を捨てる理由：新規カードは支出を増やしやすく、返済と逆行しやすいから。',
      blindspot: '盲点：カードの損得は還元率で語られがちですが、借入がある場合の最大の負担は金利です。',
      today: '今日やること：残高のある借入の金利をひとつ確認する。',
      caution: '借入・債務整理の個別助言ではありません。金額・条件は各社明細でご確認ください。',
      face: FACES.hurt,
    });
  }
  if (!a.q_fee) return need(['q_fee']);
  if (a.q_fee === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（年会費を確認）',
      headline: '年会費が分からないと、得か損かは出せません。まずそこだけ確認を。',
      reasons: ['判定の分かれ目は「年会費 と もらえる価値」の大小。年会費が未確定だと比べられません。'],
      drop_reason: '', blindspot: '盲点：年会費は初年度無料でも2年目から発生することが多い。「2年目以降いくらか」で判断を。',
      today: '今日やること：公式サイトで「年会費（2年目以降）」を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (!a.q_benefit) return need(['q_benefit']);
  if (!a.q_spend) return need(['q_spend']);
  if (a.q_spend === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（利用額を確認）',
      headline: '年間いくら使うかで、年会費を取り返せるかが変わります。そこだけ確認を。',
      reasons: ['還元は「利用額 × 還元率」。利用額が未確定だと回収できるか出せません。'],
      drop_reason: '', blindspot: '盲点：家賃・税金・公共料金は還元対象外や上限のことが多く、「使った額」と「還元対象額」は別物です。',
      today: '今日やること：直近3ヶ月のカード利用額を見て12倍する。',
      caution: null, face: FACES.troubled,
    });
  }

  const fee = CARD_FEE[a.q_fee];
  const rewardRep = CARD_SPEND_REP[a.q_spend] * 0.01; // 目安（還元1%）
  const rewardMax = CARD_SPEND_MAX[a.q_spend] * 0.01; // バンド上限での還元

  // 特典を使わない かつ バンド上限でも還元 < 年会費 → 明確な赤字 → NO
  if (a.q_benefit === 'no' && rewardMax < fee) {
    return done({
      verdict: 'NO', tpl, chosen: '見送る',
      headline: '見送りでOK。特典を使わないなら、この年会費は還元では取り返せません。',
      reasons: [
        `年間の還元は多く見積もっても約${toYen(rewardMax)}（利用額×1%）で、年会費 ${toYen(fee)} に届きません。`,
        '空港ラウンジ・旅行保険などの特典を使わないなら、年会費は実質コストになります。',
      ],
      drop_reason: '「申し込む」を捨てる理由：この利用額の範囲では、年会費分を還元で回収できないから。',
      blindspot: '盲点：「持っていると信用が上がる/見栄え」は、年数万円の年会費を正当化する理由にはなりにくいです。',
      today: '今日やること：今の無料カードの還元率を確認し、それで足りるか見る。',
      caution: 'Mio標準評価（還元1%・利用額はバンド上限）で計算した目安です。実際の還元率で変わります。',
      face: FACES.troubled,
      trace: [`年間還元（上限） 約${toYen(rewardMax)}`, `年会費 ${toYen(fee)}`],
    });
  }

  // それ以外（特典あり／還元が年会費に届き得る／利用額が大きい）は、
  // 代表値だけでは「現在カードとの差引の純増」を保証できない → HOLD（実額で確定）
  const reasonMsg = a.q_benefit === 'yes'
    ? `特典を使う想定ですが、その価値（使用回数×代替価格）を確認しないと年会費 ${toYen(fee)} を取り返せるか断定できません。`
    : `還元が年会費 ${toYen(fee)} に届く可能性はありますが、今の無料カードの還元を差し引いた「純増」で見ないと得とは言えません。`;
  return done({
    verdict: 'HOLD', tpl, chosen: '今日は決めない（あなたの実額で確定）',
    headline: 'この情報だけでは「申し込む方が得」と断定できません。実額で確定します。',
    reasons: [reasonMsg],
    drop_reason: 'まだどちらとも断定しません（推測でGOは出しません）。',
    blindspot: '盲点：比べるべきは「候補カードの還元＋使う特典 − 年会費 − 今のカードで既に得ている還元」。総額の還元だけ見ると過大評価になります。',
    today: '今日やること：直近のカード利用額（12倍）と、使う特典の去年の回数を1つずつ思い出す。',
    caution: 'Mio標準評価（還元1%）を用いた概算です。最終判定はあなたの実額で行います。',
    face: FACES.thinking,
  });
}

// ---------------- SIM（格安SIM乗換 vs 現状） ----------------
function evalSim(a) {
  const tpl = TEMPLATES.sim;
  if (!a.q_current) return need(['q_current']);
  if (a.q_current === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（今の月額を確認）',
      headline: '今いくら払っているか分からないと、乗り換えで得か損か出せません。',
      reasons: ['判定の分かれ目は「今の月額 と 候補プランの月額」。今の金額が未確定だと比べられません。'],
      drop_reason: '', blindspot: '盲点：多くの人は自分のスマホ代（端末代を除く通信料）を正確に知りません。まず現状の確認から。',
      today: '今日やること：マイページで「今月の通信料（端末代を除く）」を見る。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_current === 'lt4000') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（既に安め・実額で確認）',
      headline: 'すでに安めです。使い方しだいで格安SIMがさらに安いこともあり、実額で確認が要ります。',
      reasons: ['今が月4千円未満なら削減幅は小さめですが、使用容量によっては格安プランがさらに安い場合もあります。'],
      drop_reason: '', blindspot: '盲点：安い人ほど乗り換えの効果は小さくなりがち。初期費用・手間と釣り合うかも見てください。',
      today: '今日やること：今の使用GBに合う格安プランの実額を1つ調べて、差額を出す。',
      caution: null, face: FACES.thinking,
    });
  }
  if (!a.q_bundle) return need(['q_bundle']);
  if (a.q_bundle === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（家族割・セット割を確認）',
      headline: '家族割・セット割で失う額が分からないと、乗り換えの損得は確定できません。',
      reasons: ['乗り換えで割引が消えると、月額の差が目減りします。失う額の確認が先です。'],
      drop_reason: '', blindspot: '盲点：セット割は自宅ネット側にも影響することがあり、「スマホだけ」で考えると失敗しがちです。',
      today: '今日やること：明細で家族割・セット割の「1回線あたりの割引額」を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (!a.q_hassle) return need(['q_hassle']);
  if (!a.q_usage) return need(['q_usage']);
  if (a.q_usage === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（使用データ量を確認）',
      headline: 'データ使用量が分からないと、格安SIMで安くなるか逆に割高かを断定できません。',
      reasons: ['格安SIMは容量帯で料金が変わり、大容量では割高になることもあります。使用GBの確認が先です。'],
      drop_reason: '', blindspot: '盲点：「格安SIM＝必ず安い」ではありません。使う容量で有利・不利が変わります。',
      today: '今日やること：先月の使用データ量（GB）を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_usage === 'heavy') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（大容量プランを比較）',
      headline: 'データを多く使う人は、格安SIMだと逆に割高になることがあります。容量別で要確認。',
      reasons: ['20GB超の帯では格安側の料金が上がり、大手のセット割の方が安い逆転もあります。'],
      drop_reason: '', blindspot: '盲点：料金は「使う容量」で決まります。無制限に近い使い方なら大手が有利なことも。',
      today: '今日やること：あなたの使用GBに合う格安プランの実額を1つ調べる。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_bundle === 'yes') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（失う割引を差し引く）',
      headline: '家族割・セット割を使っている場合、失う額を差し引かないと得かどうか確定できません。',
      reasons: ['単純な月額差から、乗り換えで消える割引を引く必要があります。'],
      drop_reason: '', blindspot: '盲点：家族割は「1回線あたり数百円」のことが多いですが、回線数や光セットで合計は大きく変わります。',
      today: '今日やること：明細で家族割・セット割の合計割引額を確認する。',
      caution: null, face: FACES.troubled,
    });
  }

  // bundle=no, light, current in {gt7000, mid} → 乗り換えが有利な可能性が高い（目安・断定はしない）
  const cur = SIM_CUR[a.q_current];
  const save = cur - SIM_TARGET;
  const total = save * SIM_MONTHS;
  const hateHassle = a.q_hassle === 'hate';
  return done({
    verdict: 'GO', tpl, chosen: '乗り換える',
    headline: `乗り換えが有利な可能性が高いです。24ヶ月でおよそ${toYen(total)}の削減が見込めます（目安）。`,
    reasons: [
      `今 月${toYen(cur)}前後 → 格安SIM 月${toYen(SIM_TARGET)}前後（保守目安）で、月${toYen(save)}ほどの差。`,
      '家族割・セット割を使っておらず、大容量でもないため、差額が残りやすい状況です。',
    ],
    drop_reason: '「今のまま」を捨てる理由：毎月の固定費で、使い勝手をほぼ落とさず下げられる余地があるから。',
    blindspot: hateHassle
      ? '盲点：手続きの手間は主に最初の1〜2時間だけ。ただし金額は候補プランで変わるので、実額の確認は必要です。'
      : '盲点：格安SIMは昼の時間帯が遅い等の弱点があります。回線品質と、候補プランの実額を確認しておくと安心です。',
    today: '今日やること：使用GBに合う候補プランの月額を1つ調べ、今の月額との差を出す。',
    caution: `目安です。実際の削減額は候補プランの料金・失う割引・初期費用（事務手数料など）で変わります。確定はあなたの実額で行います。`,
    face: FACES.thumbs_up,
    trace: [`今 月${toYen(cur)}（目安）`, `格安 月${toYen(SIM_TARGET)}（保守目安）`, `24ヶ月 約${toYen(total)}（目安）`],
  });
}

// ---------------- SUB（サブスク解約 vs 継続） ----------------
function evalSub(a) {
  const tpl = TEMPLATES.sub;
  if (!a.q_used) return need(['q_used']);
  if (a.q_used === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（直近の使用を確認）',
      headline: '使ったか思い出せないなら、まず直近1ヶ月の使用を確認してからにしましょう。',
      reasons: ['「思い出せない」は「使っていない」ではありません。使用実態を確認してから判断します。'],
      drop_reason: '', blindspot: '盲点：使用履歴はアプリの視聴/利用履歴で確認できます。印象より履歴が正確です。',
      today: '今日やること：そのサービスの利用履歴を開いて、直近1ヶ月に使ったか確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (!a.q_alt) return need(['q_alt']);
  if (!a.q_fee) return need(['q_fee']);
  if (!a.q_rejoin) return need(['q_rejoin']);

  const fee = a.q_fee === 'unknown' ? null : SUB_FEE[a.q_fee];
  const yearly = fee === null ? null : fee * 12;

  if (a.q_used === 'yes') {
    // 使っているが高額 かつ 代替あり → 使用価値しだいで見直す余地 → HOLD
    if (a.q_fee === 'gt1500' && a.q_alt === 'yes') {
      return done({
        verdict: 'HOLD', tpl, chosen: '今日は決めない（使用頻度と価値を確認）',
        headline: '使ってはいますが、高額で代替もあるなら、見直す価値があります。頻度と価値の確認を。',
        reasons: ['使用頻度が低いのに高額で、無料/既契約の代替がある場合、続けるのが最適とは限りません。'],
        drop_reason: '', blindspot: '盲点：「たまに使う」高額サービスは、都度課金や代替の方が安いことがあります。',
        today: '今日やること：直近1ヶ月の使用回数を数え、代替で足りるか1つ試す。',
        caution: null, face: FACES.thinking,
      });
    }
    return done({
      verdict: 'NO', tpl, chosen: '続ける',
      headline: '続けてOK。使っているものを、節約のためだけに切るのは損になりやすいです。',
      reasons: [
        '直近1ヶ月で実際に使っている＝あなたの生活に価値を出しています。',
        '使っているサービスを解約すると、満足度が下がる割に浮く額は限定的です。',
      ],
      drop_reason: '「解約する」を捨てる理由：使っているものを切ると、浮くお金より失う便益の方が大きくなりやすいから。',
      blindspot: '盲点：見直しは「使っていないもの」から始めるのが効率的です。',
      today: '今日やること：この件は保留でOK。代わりに使っていない別のサブスクを1つ探す。',
      caution: null, face: FACES.convinced,
    });
  }

  // used === 'no'
  if (a.q_rejoin === 'hard') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は解約しない（一時停止 or 見極め）',
      headline: 'また使う予定があるなら、慌てて解約しなくて大丈夫。停止できるか確認を。',
      reasons: [
        '今は使っていないが、また使う見込みがある場合は、解約を急がない方が安全です。',
        fee ? `月${toYen(fee)}（年${toYen(yearly)}）が家計を大きく圧迫していない前提での判断です。` : '',
      ].filter(Boolean),
      drop_reason: '', blindspot: '盲点：解約と再入会を繰り返すと、キャンペーン価格を失って割高になることがあります。「休会」があるか確認を。',
      today: '今日やること：そのサービスに「一時停止/休会」があるか確認する。',
      caution: null, face: FACES.thinking,
    });
  }
  // used no & rejoin easy → 解約（実額・更新日の注意つき）
  const alt = a.q_alt === 'yes';
  return done({
    verdict: 'GO', tpl, chosen: '解約する',
    headline: yearly ? `解約が妥当です。使っていないなら、年およそ${toYen(yearly)}の見直し余地があります（目安）。` : '解約が妥当です。使っていないものに払い続ける理由は薄いです。',
    reasons: [
      '直近1ヶ月ほぼ使っていない＝今のあなたには価値を出せていません。',
      alt ? '同じことを別の手段で代替できるので、解約しても困りにくい状況です。' : 'いつでも入り直せるので、解約のリスクは小さいです。',
    ],
    drop_reason: '「続ける」を捨てる理由：使っていないサービスの月額は、価値を生まないまま出ていくお金だから。',
    blindspot: '盲点：「また使うかも」で残しがちですが、必要になった時に入り直せば十分なことが多いです。',
    today: '今日やること：解約手続きの入口（設定→サブスクリプション）を開く。',
    caution: '目安です。解約後も更新日まで使えることが多く、年払い済みは返金されない場合があります。実際に浮く額は課金停止のタイミングで変わります。',
    face: FACES.thumbs_up,
    trace: fee ? [`月額 ${toYen(fee)}（目安）`, `年 ${toYen(yearly)}（目安）`] : [],
  });
}

// ---------------- HIKARI（光回線乗換 vs 現状） ----------------
function evalHikari(a) {
  const tpl = TEMPLATES.hikari;
  if (!a.q_current) return need(['q_current']);
  if (a.q_current === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（今の実質月額を確認）',
      headline: '今いくら払っているか分からないと、乗り換えで得か損か出せません。',
      reasons: ['判定の分かれ目は「今の実質月額 と 候補回線の実質月額」。今の金額が未確定だと比べられません。'],
      drop_reason: '', blindspot: '盲点：割引・キャッシュバックが切れた後の「実質月額」で見ないと、今の負担を過小評価しがちです。',
      today: '今日やること：マイページで「今月の請求額（プロバイダ込み・割引後）」を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_current === 'lt4000') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（既に安め・実額で確認）',
      headline: 'すでに安めです。乗り換えの効果は小さめで、工事費・違約金と釣り合うか実額で確認が要ります。',
      reasons: ['今が月4千円未満なら削減幅は限定的。初期費用や手間を差し引くと逆効果のこともあります。'],
      drop_reason: '', blindspot: '盲点：安い人ほど乗り換え効果は小さく、工事費・事務手数料で目減りしやすい。',
      today: '今日やること：候補回線の「実質月額（キャッシュバック・工事費を月割りで反映）」を1つ調べて差額を出す。',
      caution: null, face: FACES.thinking,
    });
  }
  if (!a.q_cashback) return need(['q_cashback']);
  if (a.q_cashback === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（割引の適用状況を確認）',
      headline: '割引・キャッシュバックが適用中か終了かで、今の実質月額も乗換の損得も変わります。',
      reasons: ['適用中なら今動くと条件を失う恐れ、終了後なら相場より高い可能性。まず状況の確認を。'],
      drop_reason: '', blindspot: '盲点：「開通時のキャッシュバック」は数年で終わり、その後は相場に戻る（＝実質値上げ）ことが多い。',
      today: '今日やること：契約書/マイページで割引・キャッシュバックの「適用終了月」を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_cashback === 'active') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（割引中は急がない）',
      headline: 'まだ割引適用中なら、今すぐ動くと違約金やキャッシュバック条件を失う恐れがあります。',
      reasons: ['割引中の解約は、受け取り前のキャッシュバック失効や違約金で、月額差以上に損をすることがあります。'],
      drop_reason: '', blindspot: '盲点：乗り換えの得は「割引が切れた後」に大きくなります。更新月・割引終了月に合わせるのが安全。',
      today: '今日やること：割引終了月と更新月をカレンダーに入れ、その時期に再検討する。',
      caution: null, face: FACES.thinking,
    });
  }
  if (!a.q_bundle) return need(['q_bundle']);
  if (a.q_bundle === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（失うセット割を確認）',
      headline: 'スマホとのセット割で失う額が分からないと、乗り換えの損得は確定できません。',
      reasons: ['光を乗り換えるとスマホ側のセット割が消えることがあり、月額差が目減りします。失う額の確認が先です。'],
      drop_reason: '', blindspot: '盲点：セット割はスマホ1回線ごと。家族回線が多いほど、乗り換えで失う合計は大きくなります。',
      today: '今日やること：スマホの明細で「光セット割」の1回線あたり割引額と回線数を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_bundle === 'yes') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（失う割引を差し引く）',
      headline: 'セット割を使っている場合、失う割引を差し引かないと得かどうか確定できません。',
      reasons: ['単純な月額差から、乗り換えで消えるスマホ側のセット割（回線数ぶん）を引く必要があります。'],
      drop_reason: '', blindspot: '盲点：光の月額が下がっても、スマホ側の割引消失で家全体では損になることがあります。',
      today: '今日やること：セット割の合計割引額（回線数×割引）を出し、光の月額差と比べる。',
      caution: null, face: FACES.thinking,
    });
  }
  if (!a.q_contract) return need(['q_contract']);
  if (a.q_contract === 'unknown') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（更新月・違約金を確認）',
      headline: '更新月や違約金・工事費の残債が分からないと、乗り換えの初期コストを読めません。',
      reasons: ['期間中の解約は違約金や工事費残債が出ることがあり、月額の削減分を食いつぶす場合があります。'],
      drop_reason: '', blindspot: '盲点：違約金は下がった一方、工事費の分割残債は解約時に一括請求されることがあります。',
      today: '今日やること：マイページで「契約更新月」と「解約時にかかる費用（違約金＋工事費残債）」を確認する。',
      caution: null, face: FACES.troubled,
    });
  }
  if (a.q_contract === 'mid') {
    return done({
      verdict: 'HOLD', tpl, chosen: '今日は決めない（初期コストを回収できるか）',
      headline: 'まだ契約期間中なら、違約金・工事費残債を乗換の削減で回収できるか実額で確認を。',
      reasons: ['期間中の解約コストが大きいと、月額が下がっても回収まで時間がかかり、更新月まで待つ方が得なことがあります。'],
      drop_reason: '', blindspot: '盲点：新規側の「違約金負担キャンペーン」で相殺できる場合もあります。条件（上限・還元方法）を要確認。',
      today: '今日やること：解約コスト ÷ 月額削減額 で「何ヶ月で元が取れるか」を計算する。',
      caution: null, face: FACES.thinking,
    });
  }
  if (!a.q_hassle) return need(['q_hassle']);

  // q_current in {gt6000, mid}, cashback ended, bundle no, contract soon → 乗り換えが有利な可能性が高い（目安）
  const cur = HIKARI_CUR[a.q_current];
  const save = cur - HIKARI_TARGET;
  const total = save * HIKARI_MONTHS;
  const hateHassle = a.q_hassle === 'hate';
  return done({
    verdict: 'GO', tpl, chosen: '乗り換える',
    headline: `乗り換えが有利な可能性が高いです。24ヶ月でおよそ${toYen(total)}の削減が見込めます（目安）。`,
    reasons: [
      `今 月${toYen(cur)}前後 → 乗換後 月${toYen(HIKARI_TARGET)}前後（保守目安）で、月${toYen(save)}ほどの差。`,
      '割引が終了していてセット割も使っておらず、更新月が近い（または縛りなし）ため、初期コストを抑えて動けます。',
    ],
    drop_reason: '「今のまま」を捨てる理由：割引終了後の相場より高い固定費を、使い勝手をほぼ落とさず下げられるから。',
    blindspot: hateHassle
      ? '盲点：工事・切替の手間は主に開通時の一度だけ。ただし工事費・事務手数料と、キャッシュバックの受け取り条件（申請時期）は要確認です。'
      : '盲点：キャッシュバックは「開通〇ヶ月後にメール申請」など受け取り条件が厳しいことが多く、もらい忘れ＝実質値上げです。',
    today: '今日やること：候補回線の「実質月額（キャッシュバック・工事費を月割りで反映）」を1つ調べ、今の月額との差を出す。',
    caution: '目安です。実際の削減額は候補プランの料金・工事費・事務手数料・受け取り条件つきキャッシュバック・失うセット割で変わります。確定はあなたの実額で行います。',
    face: FACES.thumbs_up,
    trace: [`今 月${toYen(cur)}（目安）`, `乗換後 月${toYen(HIKARI_TARGET)}（保守目安）`, `24ヶ月 約${toYen(total)}（目安）`],
  });
}

const EVALUATORS = { card: evalCard, hikari: evalHikari, sim: evalSim, sub: evalSub };

// 適応型ドライバ: 回答の集合から「次に聞く質問」か「最終判定」を返す
export function decide(templateId, answers) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error('unknown template: ' + templateId);
  answers = answers || {};
  // fail-closed: 選択肢に無い回答があれば判定しない
  if (invalidAnswers(templateId, answers).length) return invalidResult(tpl);
  const ev = EVALUATORS[templateId](answers);
  if (ev.done) return { done: true, result: ev.result };
  const nextId = ev.need.find(qid => answers[qid] === undefined) || ev.need[0];
  const q = tpl.questions.find(x => x.id === nextId);
  return { done: false, ask: q, asked: Object.keys(answers).length };
}
