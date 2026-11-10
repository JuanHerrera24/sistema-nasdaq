// Cliente HTTP del frontend: única comunicación con el backend (nunca con la BD directamente)
const API = (() => {
  const BASE = '/api';
  const KEY = 'nasdaq_session';

  // La sesión se guarda en localStorage ("mantener sesión") o solo para esta pestaña
  const session = {
    get() {
      try { return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY)); } catch { return null; }
    },
    set(data, remember) {
      try {
        (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(data));
      } catch { /* almacenamiento bloqueado: la sesión dura hasta recargar */ }
      session.memory = data;
    },
    clear() {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* nada */ }
      session.memory = null;
    },
    memory: null,
  };

  let onUnauthorized = () => {};

  async function request(path, options = {}) {
    const token = (session.get() || session.memory)?.token;
    const res = await fetch(BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized(data.error);
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  return {
    session,
    onUnauthorized: (fn) => { onUnauthorized = fn; },
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (fullName, email, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password }) }),
    me: () => request('/auth/me'),
    dashboard: () => request('/stocks'),
    detail: (symbol, range) => request(`/stocks/${encodeURIComponent(symbol)}?range=${range}`),
    add: (symbol) => request('/stocks', { method: 'POST', body: JSON.stringify({ symbol }) }),
    remove: (symbol) => request(`/stocks/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
    sync: () => request('/sync', { method: 'POST' }),
    simulate: (symbol, amount, date) =>
      request('/simulate', { method: 'POST', body: JSON.stringify({ symbol, amount, date }) }),
  };
})();
