// Cliente HTTP del frontend: única comunicación con el backend (nunca con la BD directamente)
const API = (() => {
  const BASE = '/api';

  async function request(path, options = {}) {
    const res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  return {
    dashboard: () => request('/stocks'),
    detail: (symbol, range) => request(`/stocks/${encodeURIComponent(symbol)}?range=${range}`),
    add: (symbol) => request('/stocks', { method: 'POST', body: JSON.stringify({ symbol }) }),
    remove: (symbol) => request(`/stocks/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
    sync: () => request('/sync', { method: 'POST' }),
    simulate: (symbol, amount, date) =>
      request('/simulate', { method: 'POST', body: JSON.stringify({ symbol, amount, date }) }),
  };
})();
