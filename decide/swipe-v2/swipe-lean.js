// Mio Decision Deck — 無料スワイプの「傾き」計算（境界維持）
// -----------------------------------------------------------------------------
// ★無料版＝3スワイプで「どちら寄りか(lean)」＋気付き1つ＋判定コードだけを返す。
//   最終GO/HOLD/NO・決め手・盲点・今日の一手・金額計算は一切出さない（有料=Node専用 decide()）。
// ブラウザ(<script type=module>)と Node(テスト)の両方で動く純ESM。DOM非依存。
// 質問文・選択肢の正本は decide-core.js（重複定義しない）。ここは「3枚の二択の組み立て」と
// 「無料の方向づけ」だけを担当する。
// -----------------------------------------------------------------------------
import { TEMPLATES, FACES } from '../decide-core.js';

// テーマごとに「無料で聞く二択3枚」の質問idと、左右の割り当て（valueで指定）。
// left/right は decide-core の options.value を参照（存在検証は下の build で行う）。
const DECK_SPEC = {
  card: {
    order: ['q_revolving', 'q_benefit', 'q_free_ok'],
    sides: {
      q_revolving: { left: 'yes',  right: 'no'   }, // ある(左=注意) / ない(右)
      q_benefit:   { left: 'no',   right: 'yes'  }, // 使わない(左) / 使う(右)
      q_free_ok:   { left: 'fine', right: 'want' }, // 特にない(左) / 物足りない(右)
    },
  },
  sim: {
    order: ['q_bundle', 'q_hassle', 'q_usage'],
    sides: {
      q_bundle: { left: 'yes',   right: 'no'   },  // セット割使ってる(左) / 使ってない(右)
      q_hassle: { left: 'hate',  right: 'ok'   },  // 面倒いや(左) / 平気(右)
      q_usage:  { left: 'heavy', right: 'light'},  // よく使う(左) / そんなに(右)
    },
  },
  sub: {
    order: ['q_used', 'q_alt', 'q_rejoin'],
    sides: {
      q_used:   { left: 'no',   right: 'yes'  },   // 使ってない(左) / 使った(右)
      q_alt:    { left: 'yes',  right: 'no'   },   // 代わりがある(左) / これじゃ困る(右)
      q_rejoin: { left: 'hard', right: 'easy' },   // 入り直しにくい(左) / すぐ入れる(右)
    },
  },
  hikari: {
    order: ['q_cashback', 'q_bundle', 'q_contract'],
    sides: {
      q_cashback: { left: 'active', right: 'ended' }, // まだ割引中(左) / 終わった(右)
      q_bundle:   { left: 'yes',    right: 'no'    }, // セット割使ってる(左) / 使ってない(右)
      q_contract: { left: 'mid',    right: 'soon'  }, // まだ期間中(左) / 更新間近/縛り無(右)
    },
  },
};

// テーマの3枚（プロンプト等は decide-core から解決）。存在しない value は throw（無言でズレない）。
export function buildDeck(theme) {
  const tpl = TEMPLATES[theme];
  const spec = DECK_SPEC[theme];
  if (!tpl || !spec) throw new Error('unknown deck: ' + theme);
  const cards = spec.order.map((id) => {
    const q = tpl.questions.find((x) => x.id === id);
    if (!q) throw new Error(`missing question ${id} in ${theme}`);
    const optOf = (v) => {
      const o = q.options.find((x) => x.value === v);
      if (!o) throw new Error(`missing option ${v} for ${id}`);
      return { value: o.value, label: o.label };
    };
    const s = spec.sides[id];
    const unsure = q.options.find((x) => x.value === 'unknown');
    return {
      id,
      prompt: q.prompt,
      hint: q.hint || '',
      face: q.face || FACES.thinking,
      left: optOf(s.left),
      right: optOf(s.right),
      unsure: unsure ? { value: 'unknown', label: unsure.label } : { value: 'unknown', label: 'わからない' },
    };
  });
  return {
    theme,
    title: tpl.title,
    subtitle: tpl.subtitle,
    choiceA: tpl.choiceA, // 申し込む/乗り換える/解約する
    choiceB: tpl.choiceB, // 見送る/今のまま/続ける
    cards,
  };
}

// 3回答（{id:value}）→ 無料の傾き。dir は 'A'|'B'|'neutral'（A=choiceA寄り, B=choiceB寄り）。
// ★verdict(GO/HOLD/NO)は返さない。方向づけと気付き1つのみ。
export function leanFree(theme, ans) {
  const tpl = TEMPLATES[theme];
  const a = ans || {};
  let dir = 'neutral';
  let insight = '';

  if (theme === 'card') {
    if (a.q_revolving === 'yes') { dir = 'B'; insight = 'リボ・分割・カードローンがある間は、その金利（年15%前後）を消す方が、カード特典（数%）より先。'; }
    else if (a.q_benefit === 'yes' && a.q_free_ok === 'want') { dir = 'A'; insight = '実際に使う特典があり、今の無料カードにも不満。年会費に見合う可能性が見えています。'; }
    else if (a.q_benefit === 'no') { dir = 'B'; insight = '特典を年1回も使わないなら、年会費を還元だけで取り返すのは難しめ。'; }
    else { dir = 'neutral'; insight = '年会費の額と年間の利用額しだいで、まだ五分。実額が分かると一気に決まります。'; }
  } else if (theme === 'sim') {
    if (a.q_bundle === 'no' && a.q_hassle === 'ok' && a.q_usage === 'light') { dir = 'A'; insight = '守るべきセット割がなく、手間も平気、データも軽い。月額を下げられる余地が大きい形。'; }
    else if (a.q_usage === 'heavy') { dir = 'neutral'; insight = '大容量（月20GB超）だと、格安SIMでかえって割高になることも。使うGB次第で逆転します。'; }
    else if (a.q_bundle === 'yes') { dir = 'neutral'; insight = '家族割・セット割で「失う額」しだい。その割引の実額を引いてから比べる必要があります。'; }
    else if (a.q_hassle === 'hate') { dir = 'B'; insight = '手続きが絶対いやなら、差額が小さいときは動く価値が薄い。差額が大きい時だけ検討。'; }
    else { dir = 'neutral'; insight = '削れる余地はありますが、候補プランと手間しだい。今の実額の確認から。'; }
  } else if (theme === 'sub') {
    if (a.q_used === 'yes') { dir = 'B'; insight = '使っているものを「節約」だけの理由で切ると損になりやすい（高額×代替ありなら見直す価値）。'; }
    else if (a.q_used === 'no' && a.q_alt === 'yes' && a.q_rejoin === 'easy') { dir = 'A'; insight = '使っておらず、代わりもあり、入り直しも簡単。止める妥当性が高い（更新日と返金は要確認）。'; }
    else if (a.q_used === 'unknown') { dir = 'neutral'; insight = '使ったか思い出せないなら、まず直近の利用履歴を1回だけ確認してから。'; }
    else if (a.q_rejoin === 'hard') { dir = 'neutral'; insight = 'また使う予定・入り直しにくいなら、解約より「休会（一時停止）」の余地があります。'; }
    else { dir = 'neutral'; insight = '使用実態と再開のしやすさ次第。年額（月額×12）で見ると判断しやすくなります。'; }
  } else if (theme === 'hikari') {
    if (a.q_cashback === 'ended' && a.q_bundle === 'no' && a.q_contract === 'soon') { dir = 'A'; insight = '割引が終わり、守るセット割もなく、縛りもゆるい。乗り換えで実質月額を下げやすい形。'; }
    else if (a.q_cashback === 'active') { dir = 'neutral'; insight = 'まだ割引適用中。今動くと違約金やキャッシュバック条件を失う恐れ。更新月まで待つ判断も。'; }
    else if (a.q_contract === 'mid') { dir = 'neutral'; insight = 'まだ契約期間中。違約金・工事費の残債しだいで、乗り換えの得が相殺されることがあります。'; }
    else { dir = 'neutral'; insight = '割引終了後の実質月額しだい。工事費・違約金と釣り合うかの確認が要ります。'; }
  } else {
    throw new Error('unknown theme: ' + theme);
  }

  const label = dir === 'A' ? `「${tpl.choiceA}」寄り`
              : dir === 'B' ? `「${tpl.choiceB}」寄り`
              : 'まだ五分';
  const face = dir === 'neutral' ? FACES.thinking : FACES.smirk;
  return { dir, label, insight, face, code: encodeCode(theme, ans) };
}

// 判定コード：THEME-<c1><c2><c3>。各桁 A=左 / B=右 / X=わからない。有料でこの3回答を引き継ぐ継続トークン。
export function encodeCode(theme, ans) {
  const spec = DECK_SPEC[theme];
  const a = ans || {};
  const letters = spec.order.map((id) => {
    const v = a[id];
    if (v === undefined) return '-';
    if (v === 'unknown') return 'X';
    return v === spec.sides[id].left ? 'A' : (v === spec.sides[id].right ? 'B' : '?');
  });
  return theme.toUpperCase() + '-' + letters.join('');
}

export const DECK_ORDER = ['card', 'sim', 'sub', 'hikari'];
