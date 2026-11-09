(function () {
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const flashBox = document.getElementById('flash');

  function flash(message, type) {
    flashBox.textContent = message;
    flashBox.className = 'flash ' + type;
    flashBox.hidden = false;
    flashBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function api(url, method, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
      body: body ? JSON.stringify(body) : undefined
    });
    let payload = {};
    try { payload = await res.json(); } catch (e) { /* non-JSON response */ }
    if (!res.ok) throw new Error(payload.message || 'Request failed (' + res.status + ').');
    return payload;
  }

  function done(payload, redirect, noReload) {
    const data = payload.data || {};
    if (data.temporaryPassword) {
      flash(payload.message + ' Temporary password (shown once, copy it now): ' + data.temporaryPassword, 'ok');
      return;
    }
    if (noReload) return flash(payload.message, 'ok');
    if (redirect) return (window.location.href = redirect);
    window.location.reload();
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-api]');
    if (!form) return;
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      done(await api(form.dataset.url, form.dataset.method || 'POST', body), form.dataset.redirect);
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.confirm && !window.confirm(btn.dataset.confirm)) return;
    const body = btn.dataset.body ? JSON.parse(btn.dataset.body) : {};
    if (btn.dataset.prompt) {
      const answer = window.prompt(btn.dataset.prompt);
      if (answer === null) return;
      body.reason = answer;
    }
    btn.disabled = true;
    try {
      done(await api(btn.dataset.url, btn.dataset.method || 'POST', body), null, btn.hasAttribute('data-no-reload'));
    } catch (err) {
      flash(err.message, 'error');
      btn.disabled = false;
    }
  });
})();
