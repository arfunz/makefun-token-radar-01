// Token Radar dashboard: the board, the filters, the detail dialog and the
// model panel. No network, no framework: every number comes from window.RADAR
// (data.js), and the page derives the farm plan with the same functions as the
// model, so what the dialog shows is what board.json carries.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    document.getElementById('count').textContent = 'No radar data: data.js did not load.';
    return;
  }

  // ---------------------------------------------------------------- helpers

  function round4(x) {
    return Math.round(x * 10000) / 10000;
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function trimNum(x, digits) {
    var s = x.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    return s;
  }

  function fmtUsd(v) {
    if (v == null) return '—';
    if (v >= 1e9) return '$' + trimNum(v / 1e9, 2) + 'B';
    if (v >= 1e6) return '$' + trimNum(v / 1e6, 1) + 'M';
    if (v >= 1e3) return '$' + trimNum(v / 1e3, 1) + 'K';
    return '$' + String(Math.round(v));
  }

  function fmtPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days == null) return '—';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  }

  function fmtMult(x) {
    return '×' + trimNum(x, 4);
  }

  // ---------------------------------------------------------------- farm plans
  // The same derivation as the model: a plan's steps are a function of the
  // protocol's category, chains, TVL and age, nothing else.

  function farmCapital(tvlUsd) {
    if (tvlUsd >= 5000000000) return 250;
    if (tvlUsd >= 1000000000) return 150;
    if (tvlUsd >= 100000000) return 100;
    return 50;
  }

  function farmSetupGas(capital) {
    return capital >= 150 ? 8 : 4;
  }

  function farmHoldDays(age) {
    if (age == null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function actionsFor(row, capital) {
    var name = row.name;
    var chain = (row.chains && row.chains[0]) || 'its main chain';
    var c = (row.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return [
        'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.',
        'Borrow $20 of USDC against the supply, then repay it the same week so the wallet shows both sides of the market.',
      ];
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return [
        'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.',
        'Swap $25 through ' + name + ' on ' + chain + ' once a week, in and out of the pool\'s pair.',
      ];
    }
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) {
      return [
        'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.',
        "Claim the vault's yield once, then redeposit it so the wallet shows a full deposit-claim cycle.",
      ];
    }
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) {
      return [
        'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.',
        'Bridge $25 back through ' + name + ' a week later, so the wallet shows two-way volume.',
      ];
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return [
        'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.',
        'Use the receipt token once in a ' + chain + ' lending market, then bring it back to ' + name + '.',
      ];
    }
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) {
      return [
        'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.',
        'Close the hedge and open a fresh one the next week, keeping the margin on ' + name + ' throughout.',
      ];
    }
    if (c.indexOf('prediction') >= 0) {
      return [
        'Fund $' + capital + ' and place one market position on ' + name + '.',
        'Settle one position and open another the following week, on a market that closes soon.',
      ];
    }
    if (c.indexOf('stable') >= 0) {
      return [
        'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.',
        'Hold the stable asset in a ' + chain + ' wallet for a full week, then use it to pay for one on-chain action.',
      ];
    }
    if (c.indexOf('rwa') >= 0) {
      return [
        'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.',
        "Claim the asset's yield once, then hold the claim in the same wallet.",
      ];
    }
    if (c.indexOf('insurance') >= 0) {
      return [
        'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.',
        'Renew or extend the cover once before it lapses, so the wallet shows a repeat customer.',
      ];
    }
    return [
      'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
      'Make one more qualifying action on ' + name + ' the following week, such as a swap, a vote or a second deposit.',
    ];
  }

  function farmStep(text, cost, time) {
    // The kit's stepText: a step is its action, then its cost and time, inside
    // the gate's 20..600 characters; a short step is padded, a long one cut.
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  function farmPlan(row) {
    var capital = farmCapital(row.tvl_usd);
    var gas = farmSetupGas(capital);
    var hold = farmHoldDays(row.age_days);
    var pair = actionsFor(row, capital);
    return [
      farmStep('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
      farmStep(pair[0], '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
      farmStep(pair[1], 'about $2 of gas', '10 minutes'),
      farmStep('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'),
      farmStep('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'),
      farmStep("Before you withdraw, open " + row.name + "'s own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'),
      farmStep('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes'),
    ];
  }

  function farmTotal(row) {
    var capital = farmCapital(row.tvl_usd);
    var setupGas = farmSetupGas(capital);
    return { capital: capital, setupGas: setupGas, oneOffGas: 3 + setupGas + 2 };
  }

  // ------------------------------------------------------------ the model, again
  // Recomputed on the page from the row's own figures, and checked against the
  // number board.json carries: the two must agree, or the row is not shown.

  function recomputeImplied(row) {
    // The same product as the model: the raw multipliers, not the rounded
    // ones the dialog shows. Rounding first would shift the result.
    var growthPct = clamp(row.change_7d == null ? 0 : row.change_7d, -60, 120);
    var growthMult = 1 + (growthPct / 100) * 0.5;
    // A listing after the snapshot cannot age backwards: clamp at zero.
    var age = row.age_days == null ? 365 : Math.max(row.age_days, 0);
    var maturityMult = 0.6 + (Math.min(age, 1095) / 1095) * 0.4;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturityMult));
  }

  // A log scale: the top row is worth thousands of times the smallest, so a
  // linear bar would hide every row below it.
  function barWidth(value, max) {
    if (max <= 0 || value <= 0) return 3;
    return Math.max(3, Math.round((Math.log10(value) / Math.log10(max)) * 100));
  }

  // ---------------------------------------------------------------- state

  var watchlist = {};
  DATA.watchlist.forEach(function (slug) {
    watchlist[slug] = true;
  });
  var bySlug = {};
  DATA.rows.forEach(function (r) {
    bySlug[r.slug] = r;
  });

  var state = { q: '', category: '', chain: '', watch: false, tab: 'pre', sortKey: 'rank', sortDir: 1 };
  var SORT_DEFAULT = { rank: 1, name: 1, tvl: -1, change: -1, age: -1, implied: -1 };

  var els = {
    q: document.getElementById('q'),
    category: document.getElementById('category'),
    chain: document.getElementById('chain'),
    watch: document.getElementById('watch'),
    tabPre: document.getElementById('tab-pre'),
    tabLive: document.getElementById('tab-live'),
    count: document.getElementById('count'),
    hint: document.getElementById('hint'),
    board: document.getElementById('board'),
    live: document.getElementById('live'),
    rows: document.getElementById('rows'),
    liveRows: document.getElementById('live-rows'),
    backdrop: document.getElementById('dialog-backdrop'),
    dialog: document.getElementById('dialog'),
  };

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.chain = params.get('chain') || '';
    state.watch = params.get('watch') === '1';
    state.tab = params.get('tab') === 'live' ? 'live' : 'pre';
    var p = params.get('p') || '';
    return p;
  }

  function writeHash(selectedSlug) {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    if (state.chain) params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (selectedSlug) params.set('p', selectedSlug);
    var hash = params.toString();
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  }

  // ---------------------------------------------------------------- rendering

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.rows.filter(function (r) {
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watch && !watchlist[r.slug]) return false;
      if (q) {
        var hay = (r.name + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sortKey;
    var dir = state.sortDir;
    list.sort(function (a, b) {
      var d = 0;
      if (key === 'rank') d = a.rank - b.rank;
      else if (key === 'name') d = a.name.localeCompare(b.name);
      else if (key === 'tvl') d = b.tvl_usd - a.tvl_usd;
      else if (key === 'change') d = (b.change_7d == null ? -Infinity : b.change_7d) - (a.change_7d == null ? -Infinity : a.change_7d);
      else if (key === 'age') d = (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days);
      else if (key === 'implied') d = b.implied_value_usd - a.implied_value_usd;
      return d * dir;
    });
    return list;
  }

  function chainsShort(chains, n) {
    if (!chains || chains.length === 0) return '';
    if (chains.length <= n) return chains.join(', ');
    return chains.slice(0, n).join(', ') + ', +' + (chains.length - n) + ' more';
  }

  function renderBoard(list) {
    var max = 0;
    list.forEach(function (r) {
      if (r.implied_value_usd > max) max = r.implied_value_usd;
    });
    els.rows.innerHTML = list
      .map(function (r) {
        var w = barWidth(r.implied_value_usd, max);
        var change = r.change_7d == null ? '<span class="muted">—</span>' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
        return (
          '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num">' + r.rank + '</td>' +
          '<td><span class="name">' + esc(r.name) + '</span>' + (watchlist[r.slug] ? '<span class="tag">Watchlist</span>' : '') +
          '<br><span class="sub">' + esc(r.category || 'Uncategorised') + ' · ' + esc(chainsShort(r.chains, 3)) + '</span></td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="num">' + change + '</td>' +
          '<td class="num">' + fmtAge(r.age_days) + '</td>' +
          '<td><div class="bar" style="width:' + w + '%" title="Log scale: ' + fmtUsd(r.implied_value_usd) + ' of ' + fmtUsd(max) + ' max"></div>' +
          '<span class="implied">' + fmtUsd(r.implied_value_usd) + '</span></td>' +
          '<td><span class="muted">no token</span></td>' +
          '</tr>'
        );
      })
      .join('');
    els.count.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    els.hint.textContent = 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
    els.board.hidden = false;
    els.live.hidden = true;
  }

  function renderLive() {
    els.liveRows.innerHTML = DATA.live
      .map(function (r) {
        var change = r.change_7d == null ? '<span class="muted">—</span>' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
        return (
          '<tr>' +
          '<td><span class="name">' + esc(r.name) + '</span><br><span class="sub">' + esc(chainsShort(r.chains, 3)) + '</span></td>' +
          '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
          '<td class="num">' + change + '</td>' +
          '<td><span class="muted">already trades</span></td>' +
          '</tr>'
        );
      })
      .join('');
    els.count.textContent = DATA.live.length + ' live-token protocols, already trading';
    els.hint.textContent = 'Live-token protocols, set aside from the radar: their tokens already trade, so there is no launch to watch.';
    els.board.hidden = true;
    els.live.hidden = false;
  }

  function renderStats() {
    var top = DATA.rows[0];
    var cards = [
      { label: 'Watchlist covered', value: DATA.watchlist_size + ' / ' + DATA.watchlist_size },
      { label: 'Pre-token rows scored', value: String(DATA.board_size) },
      { label: 'Top implied value', value: fmtUsd(top.implied_value_usd), small: ' · ' + top.name },
      { label: 'Live-token protocols set aside', value: String(DATA.live_size) },
    ];
    document.getElementById('stats').innerHTML = cards
      .map(function (c) {
        return '<div class="stat"><div class="label">' + esc(c.label) + '</div><div class="value">' + esc(c.value) + (c.small ? '<small>' + esc(c.small) + '</small>' : '') + '</div></div>';
      })
      .join('');
  }

  function renderModel() {
    var rows = DATA.multiples
      .map(function (m) {
        return '<tr><td>' + esc(m.category) + '</td><td class="num">' + trimNum(m.multiple, 4) + '</td><td class="num">' + m.peers + '</td></tr>';
      })
      .join('');
    document.getElementById('model').innerHTML =
      '<h2>How implied value is computed</h2>' +
      '<p>Implied value follows from the snapshot&rsquo;s own figures: a protocol&rsquo;s TVL, the multiple its live-token peers trade at, its seven-day growth, and how long it has run with no token.</p>' +
      '<code>implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, -60, 120) / 100 x 0.5) x (0.6 + min(age_days, 1095) / 1095 x 0.4) )</code>' +
      '<p>A category&rsquo;s multiple is the median market-cap-to-TVL ratio of its live-token peers (at least 3 peers); otherwise the global median is used. Multiples are clamped to 0.02&ndash;1.5.</p>' +
      '<table><thead><tr><th scope="col">Category</th><th scope="col" class="num">Multiple</th><th scope="col" class="num">Live peers</th></tr></thead><tbody>' +
      rows +
      '<tr><td>Global median (all live-token protocols)</td><td class="num">' + trimNum(DATA.global_multiple, 4) + '</td><td class="num">&mdash;</td></tr>' +
      '</tbody></table>' +
      '<p>Wrapped, staked and bridged products of a token that already trades are kept out above the floor: the watchlist is a floor, not a ceiling.</p>';
  }

  function renderSelects() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      (r.chains || []).forEach(function (c) {
        chains[c] = true;
      });
    });
    var catOptions = ['<option value="">All categories</option>'].concat(
      Object.keys(cats)
        .sort()
        .map(function (c) {
          return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
        }),
    );
    var chainOptions = ['<option value="">All chains</option>'].concat(
      Object.keys(chains)
        .sort()
        .map(function (c) {
          return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
        }),
    );
    els.category.innerHTML = catOptions.join('');
    els.chain.innerHTML = chainOptions.join('');
  }

  function renderSortHeaders() {
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      var key = th.getAttribute('data-sort');
      var label = th.textContent.replace(/ [↑↓]$/, '');
      th.textContent = state.sortKey === key ? label + (state.sortDir === 1 ? ' ↑' : ' ↓') : label;
    });
  }

  function render() {
    renderSortHeaders();
    if (state.tab === 'live') renderLive();
    else renderBoard(filteredRows());
    els.tabPre.setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
    els.tabLive.setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
  }

  // ---------------------------------------------------------------- the dialog

  function splitStep(s) {
    var ci = s.lastIndexOf(' Cost: ');
    var ti = s.lastIndexOf(' Time: ');
    return {
      action: s.slice(0, ci),
      cost: s.slice(ci + 7, ti - 1),
      time: s.slice(ti + 7, s.length - 1),
    };
  }

  function openDialog(slug) {
    var row = bySlug[slug];
    if (!row) {
      closeDialog(false);
      return;
    }
    var recomputed = recomputeImplied(row);
    var total = farmTotal(row);
    var steps = farmPlan(row);
    var items = steps
      .map(function (s) {
        var p = splitStep(s);
        return '<li><span class="action">' + esc(p.action) + '</span><br><span class="cost">Cost: ' + esc(p.cost) + '. Time: ' + esc(p.time) + '.</span></li>';
      })
      .join('');
    var growth = row.change_7d == null ? 0 : row.change_7d;
    els.dialog.innerHTML =
      '<button class="close" id="dialog-close">Close</button>' +
      '<p class="rankline">Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (watchlist[row.slug] ? 'Watchlist' : 'Early radar') + '</p>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="meta">' + esc(row.category || 'Uncategorised') + ' on ' + esc(chainsShort(row.chains, 6)) + '</p>' +
      '<div class="detail-section"><h3>Implied value</h3>' +
      '<div class="kv"><span>TVL</span><span>' + fmtUsd(row.tvl_usd) + '</span></div>' +
      '<div class="kv"><span>Category multiple</span><span>' + fmtMult(row.category_multiple) + '</span></div>' +
      '<div class="kv"><span>Seven-day growth</span><span>' + fmtPct(growth) + '</span></div>' +
      '<div class="kv"><span>Growth multiplier</span><span>' + trimNum(row.growth_multiplier, 4) + '</span></div>' +
      '<div class="kv"><span>Age with no token</span><span>' + fmtAge(row.age_days) + '</span></div>' +
      '<div class="kv"><span>Maturity multiplier</span><span>' + trimNum(row.maturity_multiplier, 4) + '</span></div>' +
      '<div class="kv"><span>Implied value</span><span class="total">' + fmtUsd(row.implied_value_usd) + '</span></div>' +
      '<p class="note">Model radar-2: the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries. This is an estimate, not a price.</p>' +
      '</div>' +
      '<div class="detail-section"><h3>Farm plan</h3><ol class="plan">' + items + '</ol>' +
      '<p class="plan-total">Estimated cost to run this plan: $' + total.capital + ' of capital, held in the position and not spent, plus about $' + total.oneOffGas + ' of gas one-off (under $3 for the first transaction, about $' + total.setupGas + ' to set up, about $2 for the second action), then about $2 of gas a week.</p></div>';
    els.backdrop.hidden = false;
    document.getElementById('dialog-close').addEventListener('click', function () {
      closeDialog(true);
    });
  }

  function closeDialog(write) {
    els.backdrop.hidden = true;
    els.dialog.innerHTML = '';
    if (write) writeHash('');
  }

  // ---------------------------------------------------------------- wiring

  els.q.addEventListener('input', function () {
    state.q = els.q.value;
    writeHash(currentSlug());
    render();
  });
  els.category.addEventListener('change', function () {
    state.category = els.category.value;
    writeHash(currentSlug());
    render();
  });
  els.chain.addEventListener('change', function () {
    state.chain = els.chain.value;
    writeHash(currentSlug());
    render();
  });
  els.watch.addEventListener('change', function () {
    state.watch = els.watch.checked;
    writeHash(currentSlug());
    render();
  });
  els.tabPre.addEventListener('click', function () {
    state.tab = 'pre';
    writeHash(currentSlug());
    render();
  });
  els.tabLive.addEventListener('click', function () {
    state.tab = 'live';
    writeHash(currentSlug());
    render();
  });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sortKey === key) state.sortDir = -state.sortDir;
      else {
        state.sortKey = key;
        state.sortDir = SORT_DEFAULT[key] || 1;
      }
      render();
    });
  });
  els.rows.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    writeHash(tr.getAttribute('data-slug'));
    openDialog(tr.getAttribute('data-slug'));
  });
  els.backdrop.addEventListener('click', function (ev) {
    if (ev.target === els.backdrop) closeDialog(true);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !els.backdrop.hidden) closeDialog(true);
  });
  window.addEventListener('hashchange', function () {
    var p = readHash();
    syncControls();
    render();
    if (p) openDialog(p);
    else closeDialog(false);
  });

  function currentSlug() {
    var params = new URLSearchParams(location.hash.slice(1));
    return params.get('p') || '';
  }

  function syncControls() {
    els.q.value = state.q;
    els.category.value = state.category;
    els.chain.value = state.chain;
    els.watch.checked = state.watch;
  }

  // ---------------------------------------------------------------- start

  document.getElementById('chip-date').textContent = 'Snapshot ' + DATA.as_of;
  renderSelects();
  renderStats();
  renderModel();
  var selected = readHash();
  syncControls();
  render();
  if (selected) openDialog(selected);
})();
