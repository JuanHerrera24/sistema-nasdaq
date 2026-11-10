// Pantalla de inicio de sesión / registro
const Auth = (() => {
  const DEMO = { email: 'demo@nasdaq.com', password: 'Demo2026' };
  const q = (sel) => document.querySelector(sel);
  let mode = 'login';
  let onLogin = () => {};

  const texts = {
    login: { title: 'Bienvenido de nuevo', subtitle: 'Ingresa tus credenciales para acceder al panel.', submit: 'Ingresar' },
    register: { title: 'Crea tu cuenta', subtitle: 'Regístrate para analizar el NASDAQ con datos reales.', submit: 'Crear cuenta' },
  };

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    document.querySelectorAll('.register-only').forEach((el) => el.classList.toggle('hidden', m !== 'register'));
    document.querySelectorAll('.login-only').forEach((el) => el.classList.toggle('hidden', m !== 'login'));
    q('#authTitle').textContent = texts[m].title;
    q('#authSubtitle').textContent = texts[m].subtitle;
    q('#authSubmit span').textContent = texts[m].submit;
    q('#authPassword').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    showError('');
  }

  function showError(msg) {
    q('#authError').textContent = msg;
    q('#authError').classList.toggle('hidden', !msg);
  }

  async function submit(email, password, fullName) {
    const btn = q('#authSubmit');
    btn.disabled = true;
    showError('');
    try {
      const r = mode === 'register' ? await API.register(fullName, email, password) : await API.login(email, password);
      API.session.set(r, mode === 'register' || q('#remember').checked);
      q('#authForm').reset();
      onLogin(r.user);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function show(message) {
    q('#appView').classList.add('hidden');
    q('#authView').classList.remove('hidden');
    setMode('login');
    if (message) showError(message);
    q('#authEmail').focus();
  }

  function init(callback) {
    onLogin = callback;
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

    q('#togglePwd').addEventListener('click', () => {
      const input = q('#authPassword');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    q('#authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = q('#authEmail').value.trim();
      const password = q('#authPassword').value;
      const name = q('#authName').value.trim();
      if (mode === 'register' && name.length < 3) return showError('Escribe tu nombre completo');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('Escribe un correo electrónico válido');
      if (!password) return showError('Escribe tu contraseña');
      if (mode === 'register' && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
        return showError('La contraseña debe tener mínimo 8 caracteres, con letras y números');
      }
      submit(email, password, name);
    });

    q('#demoBtn').addEventListener('click', () => {
      q('#authEmail').value = DEMO.email;
      q('#authPassword').value = DEMO.password;
      submit(DEMO.email, DEMO.password);
    });
  }

  return { init, show };
})();
