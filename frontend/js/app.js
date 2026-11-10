// Lógica de la interfaz (capa de presentación)
const state = { symbol: null, range: '6mo', charts: {} };

const $ = (sel) => document.querySelector(sel);
const usd = (n) => (n == null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'USD' }));
const fmt = (n, d = 2) => (n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast${isError ? ' error' : ''}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ---------------- Panel general ----------------
async function loadDashboard() {
  try {
    const { stocks, lastSync } = await API.dashboard();
    renderKpis(stocks);
    renderTable(stocks);
    $('#lastSync').textContent = lastSync?.finished_at
      ? `Última sincronización: ${new Date(lastSync.finished_at).toLocaleString('es-ES')} · ${lastSync.symbols_ok} acciones`
      : 'Última sincronización: en curso...';
    if (!state.symbol && stocks.length) selectStock(stocks[0].symbol);
  } catch (err) {
    toast(err.message, true);
  }
}

function renderKpis(stocks) {
  const count = (r) => stocks.filter((s) => s.recommendation === r).length;
  const withChange = stocks.filter((s) => s.changePercent != null);
  const avg = withChange.reduce((a, s) => a + s.changePercent, 0) / (withChange.length || 1);
  const items = [
    ['Acciones seguidas', stocks.length, ''],
    ['Variación promedio hoy', `${avg >= 0 ? '+' : ''}${fmt(avg)}%`, avg >= 0 ? 'up' : 'down'],
    ['Recomendación COMPRAR', count('COMPRAR'), 'up'],
    ['Recomendación MANTENER', count('MANTENER'), ''],
    ['Recomendación VENDER', count('VENDER'), 'down'],
  ];
  $('#kpis').innerHTML = items
    .map(([l, v, c]) => `<div class="kpi"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`)
    .join('');
}

function renderTable(stocks) {
  const tbody = $('#stocksTable tbody');
  if (!stocks.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Sin datos todavía. Pulse "Sincronizar ahora".</td></tr>';
    return;
  }
  tbody.innerHTML = stocks.map((s) => {
    const cls = s.change == null ? '' : s.change >= 0 ? 'up' : 'down';
    const sign = s.change > 0 ? '+' : '';
    return `<tr data-symbol="${esc(s.symbol)}" class="${s.symbol === state.symbol ? 'selected' : ''}">
      <td class="sym">${esc(s.symbol)}</td>
      <td>${esc(s.name)}</td>
      <td class="num">${usd(s.price)}</td>
      <td class="num ${cls}">${s.change == null ? '—' : `${sign}${fmt(s.change)} (${sign}${fmt(s.changePercent)}%)`}</td>
      <td class="num">${fmt(s.rsi14, 1)}</td>
      <td>${s.recommendation ? `<span class="badge ${s.recommendation}">${s.recommendation}</span>` : '—'}</td>
      <td><button class="link-btn" data-remove="${esc(s.symbol)}" title="Dejar de seguir">✕</button></td>
    </tr>`;
  }).join('');
}

// ---------------- Detalle de una acción ----------------
async function selectStock(symbol) {
  state.symbol = symbol;
  document.querySelectorAll('#stocksTable tbody tr').forEach((tr) =>
    tr.classList.toggle('selected', tr.dataset.symbol === symbol));
  try {
    const d = await API.detail(symbol, state.range);
    $('#detail').classList.remove('hidden');
    $('#dTitle').textContent = `${d.symbol} · ${d.name || ''}`;
    const q = d.quote || {};
    $('#dSubtitle').textContent = `${d.exchange || 'NASDAQ'} · ${usd(q.price)} · actualizado ${
      q.marketTime ? new Date(q.marketTime).toLocaleString('es-ES') : '—'}`;
    renderPriceCharts(d.chart);
    renderRecommendation(d.analysis);
    renderScoreChart(d.recommendationHistory);
    if (!$('#simDate').value && d.chart.length) $('#simDate').value = d.chart[0].date;
    $('#simDate').min = d.chart[0]?.date || '';
    $('#simDate').max = d.chart.at(-1)?.date || '';
    $('#simResult').innerHTML = '';
  } catch (err) {
    toast(err.message, true);
  }
}

function makeChart(id, config) {
  state.charts[id]?.destroy();
  state.charts[id] = new Chart(document.getElementById(id), config);
}

function baseOptions() {
  const grid = cssVar('--border');
  const text = cssVar('--muted');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: text, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: text, maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: text }, grid: { color: grid } },
    },
  };
}

function renderPriceCharts(rows) {
  const labels = rows.map((r) => r.date);
  const primary = cssVar('--primary');
  makeChart('priceChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Precio de cierre', data: rows.map((r) => r.close), borderColor: primary, backgroundColor: primary + '22', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.1 },
        { label: 'Media 20 días', data: rows.map((r) => r.sma20), borderColor: cssVar('--hold'), pointRadius: 0, borderWidth: 1.5 },
        { label: 'Media 50 días', data: rows.map((r) => r.sma50), borderColor: cssVar('--sell'), pointRadius: 0, borderWidth: 1.5, borderDash: [5, 4] },
      ],
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd(c.parsed.y)}` } },
      },
    },
  });

  const up = cssVar('--up');
  const down = cssVar('--down');
  makeChart('volumeChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Volumen',
        data: rows.map((r) => r.volume),
        backgroundColor: rows.map((r, i) => (i && r.close < rows[i - 1].close ? down : up) + '99'),
      }],
    },
    options: { ...baseOptions(), plugins: { legend: { display: false } }, scales: { ...baseOptions().scales, x: { display: false } } },
  });
}

function renderRecommendation(a) {
  const pos = ((a.score + 100) / 200) * 100;
  $('#recoBox').innerHTML = `
    <span class="badge ${a.recommendation}">${a.recommendation}</span>
    <div style="flex:1">
      <div class="muted small">Puntaje: <b>${fmt(a.score, 0)}</b> (de −100 a +100)</div>
      <div class="score-bar"><div class="marker" style="left:${pos}%"></div></div>
    </div>`;
  $('#reasons').innerHTML = a.reasons.map((r) => `<li>${esc(r)}</li>`).join('');
  const i = a.indicators || {};
  const items = [
    ['Precio', usd(i.price)], ['Media 20 días', usd(i.sma20)], ['Media 50 días', usd(i.sma50)],
    ['RSI (14)', fmt(i.rsi14, 1)], ['Volatilidad anual', i.volatility == null ? '—' : `${fmt(i.volatility)}%`],
    ['Rendimiento histórico', i.return1y == null ? '—' : `${fmt(i.return1y)}%`],
  ];
  $('#indicators').innerHTML = items.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('');
}

function renderScoreChart(history) {
  const rows = [...history].reverse();
  makeChart('scoreChart', {
    type: 'line',
    data: {
      labels: rows.map((r) => new Date(r.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
      datasets: [{ label: 'Puntaje', data: rows.map((r) => r.score), borderColor: cssVar('--primary'), pointRadius: 2, borderWidth: 2, stepped: true }],
    },
    options: {
      ...baseOptions(),
      plugins: { legend: { display: false } },
      scales: { ...baseOptions().scales, y: { ...baseOptions().scales.y, min: -100, max: 100 } },
    },
  });
}

// ---------------- Eventos ----------------
$('#stocksTable tbody').addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    e.stopPropagation();
    if (!confirm(`¿Dejar de seguir ${rm.dataset.remove}?`)) return;
    try {
      await API.remove(rm.dataset.remove);
      if (state.symbol === rm.dataset.remove) { state.symbol = null; $('#detail').classList.add('hidden'); }
      loadDashboard();
    } catch (err) { toast(err.message, true); }
    return;
  }
  const tr = e.target.closest('tr[data-symbol]');
  if (tr) selectStock(tr.dataset.symbol);
});

$('#rangeBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  state.range = btn.dataset.range;
  document.querySelectorAll('#rangeBtns button').forEach((b) => b.classList.toggle('active', b === btn));
  $('#simDate').value = '';
  if (state.symbol) selectStock(state.symbol);
});

$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#addSymbol');
  const symbol = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(symbol)) return toast('Símbolo inválido (1-10 letras/números)', true);
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const r = await API.add(symbol);
    toast(`${r.symbol} agregado: ${usd(r.price)} · ${r.recommendation}`);
    input.value = '';
    await loadDashboard();
    selectStock(r.symbol);
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});

$('#syncBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Sincronizando...';
  try {
    const r = await API.sync();
    toast(r.skipped ? r.message : `Sincronizadas ${r.ok} acciones${r.failed ? `, ${r.failed} con error` : ''}`);
    await loadDashboard();
    if (state.symbol) selectStock(state.symbol);
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
  btn.textContent = 'Sincronizar ahora';
});

$('#simForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await API.simulate(state.symbol, $('#simAmount').value, $('#simDate').value);
    const cls = r.profit >= 0 ? 'up' : 'down';
    $('#simResult').innerHTML = `
      <div><span>Compra (${r.buyDate})</span><b>${usd(r.buyPrice)}</b></div>
      <div><span>Acciones adquiridas</span><b>${fmt(r.shares, 6)}</b></div>
      <div><span>Valor actual (${r.currentDate})</span><b>${usd(r.currentValue)}</b></div>
      <div><span>Ganancia / pérdida</span><b class="${cls}">${usd(r.profit)} (${fmt(r.profitPercent)}%)</b></div>`;
  } catch (err) { toast(err.message, true); }
});

// Refresco automático de la interfaz cada 60 segundos
loadDashboard();
setInterval(loadDashboard, 60_000);
