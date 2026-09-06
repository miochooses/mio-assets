/* Mio shared site search. Attaches to #mioq (input) + #miores (results).
   Improvements (Codex P0-3): synonym/alias expansion, title-priority ranking,
   Latin word-boundary matching (so "sim" != "processing"), load-error message. */
(function () {
  var q = document.getElementById('mioq'), res = document.getElementById('miores');
  if (!q || !res) return;
  var idx = null, loadErr = false;

  // Synonym groups: typing any term also matches the others.
  var GROUPS = [
    ['ideco', 'idefo', 'アイデコ', 'イデコ', 'iDeCo'],
    ['nisa', 'ニーサ', 'にーさ', '新nisa', '新ニーサ', 'つみたてnisa'],
    ['sim', '格安sim', 'スマホ', 'スマホ代', '携帯', '携帯料金', 'けいたい', 'キャリア', 'mvno'],
    ['光', '光回線', 'ひかり', 'フレッツ', '光コラボ'],
    ['ふるさと納税', 'ふるさと', 'furusato', '寄付', '返礼品'],
    ['医療費控除', '医療費', 'セルフメディケーション'],
    ['ideco', 'idefo'],
    ['nenkin', '年金', '国民年金', '厚生年金'],
    ['保険', 'ほけん', '生命保険', '医療保険', 'がん保険'],
    ['esim', 'e-sim', 'イーシム', 'ポケットwifi', 'pocket wifi'],
    ['jr pass', 'jrパス', 'ジャパンレールパス', 'japan rail pass', 'rail pass']
  ];
  function synonyms(term) {
    var out = [term];
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].indexOf(term) !== -1) {
        for (var j = 0; j < GROUPS[i].length; j++) if (out.indexOf(GROUPS[i][j]) === -1) out.push(GROUPS[i][j]);
      }
    }
    return out;
  }
  function isAscii(s) { return /^[\x00-\x7f]+$/.test(s); }
  // word-boundary-ish match for ascii tokens; plain substring for JP.
  function hit(hay, term) {
    if (isAscii(term)) {
      try { return new RegExp('(^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(hay); }
      catch (e) { return hay.indexOf(term) >= 0; }
    }
    return hay.indexOf(term) >= 0;
  }
  function esc(s) { return (s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function load(cb) {
    if (idx) return cb();
    fetch('/search-index.json').then(function (r) { return r.json(); })
      .then(function (j) { idx = j; cb(); })
      .catch(function () { loadErr = true; cb(); });
  }
  function render(items) {
    var badge = { saiten: '#39d353', tools: '#39c5cf', en: '#f0883e' };
    if (loadErr) { res.innerHTML = '<div style="padding:14px;color:#f0883e;font-size:13px;">検索を読み込めませんでした。再度お試しください。</div>'; res.style.display = 'block'; return; }
    if (!items.length) { res.innerHTML = '<div style="padding:14px;color:#9fb3c8;font-size:13px;">該当する記事がありません</div>'; res.style.display = 'block'; return; }
    res.innerHTML = items.slice(0, 30).map(function (it) {
      return '<a href="' + it.u + '" style="display:block;padding:12px 14px;border-bottom:1px solid #ffffff0d;text-decoration:none;">'
        + '<span style="font-size:10.5px;font-weight:800;color:' + (badge[it.c] || '#9fb3c8') + ';">' + esc(it.cl) + '</span>'
        + '<div style="font-size:14px;color:#e9eef3;font-weight:700;line-height:1.4;margin-top:2px;">' + esc(it.t) + '</div>'
        + (it.d ? '<div style="font-size:11.5px;color:#9fb3c8;margin-top:2px;line-height:1.5;">' + esc(it.d.slice(0, 84)) + '</div>' : '')
        + '</a>';
    }).join('');
    res.style.display = 'block';
  }
  // JP page prioritizes ja, EN page prioritizes en (based on <html lang>).
  var pageLang = (document.documentElement.getAttribute('lang') || 'ja').slice(0, 2);
  function score(it, terms) {
    var title = (it.t || '').toLowerCase(), desc = (it.d || '').toLowerCase();
    var s = 0;
    for (var i = 0; i < terms.length; i++) {
      var alts = synonyms(terms[i]), tHit = false, dHit = false, prefix = false;
      for (var a = 0; a < alts.length; a++) {
        var alt = alts[a];
        if (hit(title, alt)) { tHit = true; if (title.indexOf(alt) === 0) prefix = true; }
        if (hit(desc, alt)) dHit = true;
      }
      if (!tHit && !dHit) return -1; // every term must match somewhere
      s += tHit ? (prefix ? 100 : 60) : 20;
    }
    // language affinity
    if ((pageLang === 'en' && it.c === 'en') || (pageLang === 'ja' && it.c !== 'en')) s += 8;
    return s;
  }
  function run() {
    var v = (q.value || '').trim().toLowerCase();
    if (v.length < 1) { res.style.display = 'none'; res.innerHTML = ''; return; }
    load(function () {
      if (loadErr || !idx) { render([]); return; }
      var terms = v.split(/\s+/).filter(Boolean);
      var scored = [];
      for (var i = 0; i < idx.length; i++) {
        var sc = score(idx[i], terms);
        if (sc >= 0) scored.push([sc, idx[i]]);
      }
      scored.sort(function (a, b) { return b[0] - a[0]; });
      render(scored.map(function (x) { return x[1]; }));
    });
  }
  q.addEventListener('input', run);
  q.addEventListener('focus', function () { if (q.value) run(); });
  document.addEventListener('click', function (e) { if (!res.contains(e.target) && e.target !== q) { res.style.display = 'none'; } });
})();
