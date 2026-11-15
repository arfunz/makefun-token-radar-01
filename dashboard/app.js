// Token launch radar — dashboard renderer. Reads window.RADAR (data.js),
// renders the board, the exclusion audit and the model page. No network:
// every number comes from the snapshot through the fitted radar-3 model.
(function () {
  const D = window.RADAR;
  const rows = D.rows;
  const $ = (id) => document.getElementById(id);

  function fmtMoney(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtInt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtPct(v) {
    if (v === null || v === undefined) return '<span class="flat">—</span>';
    const c = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + c + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return '—';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }
  function fmtX(x) { return x.toFixed(3) + '×'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // Header + method box
  $('asof').textContent = D.meta.as_of;
  const fetched = (D.meta.source.match(/fetched .+/) || [''])[0];
  $('src').textContent = 'DefiLlama protocols · ' + fetched;
  $('st-ranked').textContent = D.audit.ranked;
  $('st-watch').textContent = D.audit.watchlist + '/40';
  $('st-audit').textContent = D.audit.set_aside - D.audit.token_trades;
  $('st-top').textContent = fmtMoney(rows[0].implied_usd);
  const m = D.model;
  $('methodbox').innerHTML =
    '<b>Method radar-3:</b> implied value = 10^' + m.a.toFixed(2) + ' × TVL^' + m.b.toFixed(2) +
    ', fitted on the snapshot’s own ' + m.n_comparables + ' tokened protocols, × category factor (median residual, shrunk by count), ' +
    '× seasoning 0.55 → 1.00 over 730 days with no token, × momentum 1 + 0.5 × 7-day change, ×0.5 when a sibling token trades. ' +
    'Range: the fitted residuals’ P25–P75 band (×' + m.band_low.toFixed(2) + '–×' + m.band_high.toFixed(2) + '). ' +
    'Top value ' + fmtMoney(rows[0].implied_usd) + ' — ' + esc(rows[0].name) + '.';

  // Filters
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  for (const c of cats) $('fcat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
  for (const c of chains) $('fchain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');

  let chip = 'all';
  let sortKey = 'rank';
  let sortDir = 1;
  function filtered() {
    const q = $('q').value.trim().toLowerCase();
    const fc = $('fcat').value;
    const fch = $('fchain').value;
    return rows.filter((r) => {
      if (chip === 'watchlist' && !r.watchlist) return false;
      if (chip === 'early' && r.watchlist) return false;
      if (chip === 'floor' && r.tvl_usd < 50000000) return false;
      if (fc && r.category !== fc) return false;
      if (fch && !r.chains.includes(fch)) return false;
      if (q && !(r.name + ' ' + r.slug + ' ' + r.category + ' ' + r.chains.join(' ')).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function val(r, k) {
    if (k === 'chains') return r.chains.join(', ');
    if (k === 'age_days') return r.age_days === null ? -1 : r.age_days;
    if (k === 'change_7d') return r.change_7d === null ? -999 : r.change_7d;
    return r[k];
  }
  function renderRows() {
    const list = filtered().sort((a, b) => {
      const va = val(a, sortKey), vb = val(b, sortKey);
      if (va < vb) return -sortDir;
      if (va > vb) return sortDir;
      return a.rank - b.rank;
    });
    $('rows').innerHTML = list.map((r) => {
      const ch = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '');
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + '<span class="tag ' + (r.watchlist ? 'w' : 'e') + '">' + (r.watchlist ? 'WATCH' : 'EARLY') + '</span></td>' +
        '<td>' + esc(r.category) + '</td><td>' + esc(ch) + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td><td class="num">' + fmtX(r.comp_x) + '</td>' +
        '<td class="num val">' + fmtMoney(r.implied_usd) + '</td>' +
        '<td class="num">' + fmtMoney(r.low_usd) + '–' + fmtMoney(r.high_usd) + '</td>' +
        '<td class="num">' + fmtMoney(r.slice_per_1k_usd) + '</td>' +
        '<td class="num">$' + r.farm_ticket_usd + '</td></tr>';
    }).join('');
    $('count').textContent = list.length + ' of ' + rows.length + ' rows shown';
  }
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.dataset.slug);
  });
  document.querySelectorAll('#board th').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = k === 'name' || k === 'category' || k === 'chains' ? 1 : -1; }
      renderRows();
    });
  });
  $('q').addEventListener('input', renderRows);
  $('fcat').addEventListener('change', renderRows);
  $('fchain').addEventListener('change', renderRows);
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-chip]');
    if (!b) return;
    chip = b.dataset.chip;
    document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('on', x === b));
    renderRows();
  });

  // Tabs
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    for (const t of ['board', 'audit', 'model']) $('tab-' + t).hidden = t !== b.dataset.tab;
    if (b.dataset.tab === 'model') drawModel();
  });

  // Audit tab
  const A = D.audit;
  $('auditcards').innerHTML =
    '<div><b>' + A.total + '</b><span>protocols tracked</span></div>' +
    '<div><b>' + A.ranked + '</b><span>ranked on the board</span></div>' +
    '<div><b>' + (A.set_aside - A.token_trades) + '</b><span>set aside, no token</span></div>' +
    '<div><b>' + A.token_trades + '</b><span>token already trades</span></div>';
  $('auditrows').innerHTML = A.reasons.map((r) =>
    '<tr><td>' + esc(r.reason) + '</td><td class="num">' + r.count + '</td><td class="num">' +
    (100 * r.count / A.total).toFixed(1) + '%</td></tr>').join('') +
    '<tr><td><b>Ranked on the board</b></td><td class="num"><b>' + A.ranked + '</b></td><td class="num"><b>' +
    (100 * A.ranked / A.total).toFixed(1) + '%</b></td></tr>';

  // Model tab
  $('modelcards').innerHTML =
    '<div><b>10^' + m.a.toFixed(2) + ' × TVL^' + m.b.toFixed(2) + '</b><span>fitted size curve</span></div>' +
    '<div><b>' + m.n_comparables + '</b><span>tokened comparables</span></div>' +
    '<div><b>R² ' + m.r2.toFixed(2) + '</b><span>fit, log10 scale</span></div>' +
    '<div><b>×' + m.band_low.toFixed(2) + '–×' + m.band_high.toFixed(2) + '</b><span>P25–P75 residual band</span></div>';
  $('modeltext').textContent =
    'Every coefficient is fitted at runtime from the snapshot’s own tokened protocols: log10(market cap) = ' +
    m.a.toFixed(2) + ' + ' + m.b.toFixed(2) + ' × log10(TVL) over ' + m.n_comparables +
    ' comparables (R² ' + m.r2.toFixed(2) + ' — token prices vary widely around the size curve, which is why every row carries its P25–P75 range instead of a bare point). ' +
    'The category factor is the median log-residual of the category’s comparables, shrunk toward zero by count and clamped to ±0.40. ' +
    'Seasoning rises from 0.55 at listing to 1.00 after 730 days with no token; momentum is 1 + 0.5 × the 7-day TVL change, clamped to 0.90–1.10; ' +
    'a protocol whose first word matches a tokened sibling is priced at half. No name is special-cased: the same formula scores all 198 rows.';

  const catEntries = Object.entries(m.category_factors).sort((a, b) => b[1] - a[1]);
  $('catrows').innerHTML = catEntries.map(([c, f]) => {
    const x = Math.pow(10, f);
    const eff = x >= 1 ? '+' + Math.round((x - 1) * 100) + '% value' : '−' + Math.round((1 - x) * 100) + '% value';
    return '<tr><td>' + esc(c) + '</td><td class="num">×' + x.toFixed(2) + '</td><td class="num">' + eff + '</td></tr>';
  }).join('');

  let modelDrawn = false;
  function drawModel() {
    if (modelDrawn) return;
    modelDrawn = true;
    // Scatter: log10 TVL (x) against log10 value (y)
    const svg = $('scatter');
    const W = 640, H = 360, L = 56, R = 16, T = 12, B = 34;
    const x0 = 6, x1 = 10.3, y0 = 5, y1 = 10.2;
    const X = (v) => L + ((Math.log10(v) - x0) / (x1 - x0)) * (W - L - R);
    const Y = (v) => T + (1 - (Math.log10(v) - y0) / (y1 - y0)) * (H - T - B);
    let s = '';
    for (let g = 6; g <= 10; g++) {
      const gx = X(Math.pow(10, g));
      s += '<line x1="' + gx + '" y1="' + T + '" x2="' + gx + '" y2="' + (H - B) + '" stroke="#1e3350"/>' +
        '<text x="' + gx + '" y="' + (H - 12) + '" fill="#647e9c" font-size="11" text-anchor="middle">' +
        (g >= 9 ? '$' + Math.pow(10, g - 9) + 'B' : '$' + Math.pow(10, g - 6) + 'M') + '</text>';
    }
    for (let g = 5; g <= 10; g++) {
      const gy = Y(Math.pow(10, g));
      s += '<line x1="' + L + '" y1="' + gy + '" x2="' + (W - R) + '" y2="' + gy + '" stroke="#1e3350"/>' +
        '<text x="' + (L - 6) + '" y="' + (gy + 4) + '" fill="#647e9c" font-size="11" text-anchor="end">' +
        (g >= 9 ? '$' + Math.pow(10, g - 9) + 'B' : '$' + Math.pow(10, g - 6) + 'M') + '</text>';
    }
    const lx1 = X(1e6), lx2 = X(Math.pow(10, 10.3));
    const ly1 = Y(Math.pow(10, m.a + m.b * 6)), ly2 = Y(Math.pow(10, m.a + m.b * 10.3));
    s += '<line x1="' + lx1 + '" y1="' + ly1 + '" x2="' + lx2 + '" y2="' + ly2 + '" stroke="#fbbf24" stroke-width="2"/>';
    for (const [t, v] of D.scatter_tokened) s += '<circle cx="' + X(t).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.4" fill="#5b728f" opacity="0.8"/>';
    for (const [t, v] of D.scatter_estimates) s += '<circle cx="' + X(t).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3" fill="#4cc2ff" opacity="0.9"/>';
    s += '<text x="' + (L + 8) + '" y="' + (T + 14) + '" fill="#8ba3bf" font-size="12">grey: snapshot market caps · blue: radar estimates · gold: fitted curve</text>';
    svg.innerHTML = s;
    // Histogram of implied values (log10)
    const hist = $('hist');
    const vals = rows.map((r) => Math.log10(r.implied_usd));
    const lo = Math.floor(Math.min(...vals) * 10) / 10, hi = Math.ceil(Math.max(...vals) * 10) / 10;
    const bins = 12, bw = (hi - lo) / bins, counts = new Array(bins).fill(0);
    for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / bw))]++;
    const mx = Math.max(...counts);
    let h = '';
    for (let i = 0; i < bins; i++) {
      const bx = 56 + (i * (640 - 72)) / bins, bh = (counts[i] / mx) * 130;
      h += '<rect x="' + (bx + 2).toFixed(1) + '" y="' + (150 - bh).toFixed(1) + '" width="' + ((640 - 72) / bins - 4).toFixed(1) +
        '" height="' + bh.toFixed(1) + '" fill="#38bdf8" rx="2"/>' +
        '<text x="' + (bx + (640 - 72) / bins / 2).toFixed(1) + '" y="168" fill="#647e9c" font-size="10" text-anchor="middle">' +
        fmtMoney(Math.pow(10, lo + i * bw)) + '</text>';
    }
    hist.innerHTML = h;
  }

  // Detail dialog
  const dlg = $('detail');
  function openDetail(slug) {
    const r = rows.find((x) => x.slug === slug);
    if (!r) return;
    $('d-name').textContent = '#' + r.rank + ' ' + r.name;
    $('d-sub').textContent = r.category + ' · ' + r.chains.join(', ') + ' · TVL ' + fmtMoney(r.tvl_usd) +
      ' · 7D ' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' · no token for ' + fmtAge(r.age_days) + ' · ' + (r.watchlist ? 'house watchlist' : 'early find');
    const recomputed = Math.round(r.base_raw_usd * r.category_factor * r.seasoning * r.momentum * r.kin);
    $('d-break').innerHTML =
      '<tr><td>Base curve — 10^' + m.a.toFixed(2) + ' × TVL^' + m.b.toFixed(2) + '</td><td class="num">' + fmtInt(r.base_usd) + '</td></tr>' +
      '<tr><td>Category factor — ' + esc(r.category) + ' (×' + r.category_factor.toFixed(2) + ')</td><td class="num">×' + r.category_factor.toFixed(2) + '</td></tr>' +
      '<tr><td>Seasoning — ' + fmtAge(r.age_days) + ' with no token</td><td class="num">×' + r.seasoning.toFixed(2) + '</td></tr>' +
      '<tr><td>Momentum — 7-day TVL change</td><td class="num">×' + r.momentum.toFixed(2) + '</td></tr>' +
      '<tr><td>Kin — ' + (r.kin === 0.5 ? 'a sibling token already trades (×0.5)' : 'no sibling token trades') + '</td><td class="num">×' + r.kin.toFixed(1) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num val">' + fmtInt(r.implied_usd) + '</td></tr>' +
      '<tr><td>Range — fitted residuals P25–P75 (×' + m.band_low.toFixed(2) + '–×' + m.band_high.toFixed(2) + ')</td><td class="num">' +
      fmtMoney(r.low_usd) + ' – ' + fmtMoney(r.high_usd) + '</td></tr>';
    $('d-recompute').textContent = 'Recomputed from the breakdown above: ' + fmtInt(recomputed) +
      (recomputed === r.implied_usd ? ' — matches board.json exactly.' : ' — differs from board.json by ' + fmtInt(Math.abs(recomputed - r.implied_usd)) + '.');
    $('d-steps').innerHTML = r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('');
    $('d-slice').textContent = 'Slice / $1k: ' + fmtMoney(r.slice_per_1k_usd) +
      ' — what $1,000 staked would hold if depositors got 10% pro rata. Farm ticket setup cost: $' + r.farm_ticket_usd + ' across the 7 steps. Hold 60 days.';
    dlg.showModal();
  }
  $('d-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  renderRows();
})();
